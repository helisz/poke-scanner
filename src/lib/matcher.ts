/**
 * Deterministic local matcher (stage B).
 *
 * Projects the model's description of a photo and every species' dataset prose
 * onto the same concept vocabulary, then scores the overlap.
 *
 * Concepts are weighted by inverse frequency across the 1025 species: "毛" (fur)
 * appears on hundreds of entries so it barely counts, while "尾长约为身高的两倍"
 * style details or "猫科" are rare and therefore informative. This is what stops
 * the ranking from collapsing into "all Electric types score the same".
 *
 * No network, no randomness: identical traits always produce an identical ranking,
 * and every point awarded is traceable to a human-readable reason.
 */
import type { Candidate, Pokemon, ScoreBreakdown, SubjectTraits } from '@/lib/types'
import { POKEMON } from '@/data'
import {
  CONCEPTS,
  conceptLabel,
  conceptsIn,
  conceptsInChinese,
  CONCEPT_TYPE,
  normalizeType,
  scrub,
} from '@/lib/lexicon'

const WEIGHTS = {
  name: 60,
  animal: 26,
  type: 14,
  anatomy: 22,
  shape: 12,
  color: 9,
  category: 10,
  text: 8,
} as const

/** Concept buckets, so anatomy matches can outweigh a passing colour mention. */
const ANIMAL_CONCEPTS = new Set([
  'cat', 'dog', 'fox', 'rodent', 'rabbit', 'bird', 'owl', 'fish', 'snake', 'lizard', 'turtle',
  'frog', 'insect', 'bee', 'butterfly', 'spider', 'crab', 'whale', 'bear', 'monkey', 'horse',
  'bovine', 'deer', 'elephant', 'pig', 'dragon', 'plant', 'mushroom', 'flower', 'humanoid',
  'ghost', 'machine',
])

const ANATOMY_CONCEPTS = new Set([
  'ears', 'big_ears', 'tail', 'long_tail', 'wing', 'horn', 'claw', 'fang', 'whiskers', 'fur',
  'fluffy', 'mane', 'scales', 'shell', 'beak', 'big_eyes', 'blue_eyes', 'stripes', 'spots',
  'spikes', 'fin', 'tentacle', 'cheeks',
])

const SHAPE_CONCEPTS = new Set(['quadruped', 'bipedal', 'round', 'slender', 'small_body', 'floating'])

const COLOR_CONCEPTS = new Set([
  'yellow', 'red', 'blue', 'green', 'black', 'white', 'grey', 'brown', 'pink', 'purple',
  'orange', 'cream', 'gold',
])

const ELEMENT_CONCEPTS = new Set([
  'fire', 'water', 'ice', 'electricity', 'leaf', 'psychic', 'poison', 'metal', 'sand', 'stone',
  'sound', 'light', 'shadow',
])

interface Prepared {
  pokemon: Pokemon
  types: Set<string>
  concepts: Set<string>
  categoryAnimal: string
  haystack: string
  names: Set<string>
}

/** Precompiled once at module load — scoring 1025 species must stay instant. */
const PREPARED: Prepared[] = POKEMON.map((pokemon) => {
  const prose = `${pokemon.profile} ${pokemon.description} ${pokemon.category} ${pokemon.types.join('')} ${pokemon.color}`
  return {
    pokemon,
    types: new Set(pokemon.types.map((t) => normalizeType(t) ?? t)),
    concepts: conceptsInChinese(prose),
    categoryAnimal: pokemon.category.replace(/宝可梦$/, ''),
    haystack: `${pokemon.name} ${pokemon.nameEn} ${pokemon.profile} ${pokemon.description} ${pokemon.category} ${pokemon.color}`.toLowerCase(),
    names: new Set([pokemon.name, pokemon.nameEn.toLowerCase(), pokemon.nameJa]),
  }
})

/** Document frequency per concept, computed from the dataset itself. */
const CONCEPT_DF: Record<string, number> = (() => {
  const df: Record<string, number> = {}
  for (const p of PREPARED) {
    for (const c of p.concepts) df[c] = (df[c] ?? 0) + 1
  }
  return df
})()

const TOTAL_DOCS = PREPARED.length

/**
 * IDF in [0.15, 1]. A concept found in 40% of species is close to worthless;
 * one found in 1% is a strong identifier.
 */
function conceptWeight(id: string): number {
  const df = CONCEPT_DF[id] ?? 0
  if (df <= 0) return 0.6
  const idf = Math.log((TOTAL_DOCS + 1) / (df + 1)) / Math.log(TOTAL_DOCS + 1)
  return Math.max(0.15, Math.min(1, idf))
}

function tokensOf(traits: SubjectTraits): string[] {
  return [
    traits.subject,
    traits.animalFamily,
    ...traits.bodyFeatures,
    ...traits.elements,
    ...traits.shapeKeywords,
    ...traits.colors,
    traits.note,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0)
}

/** Normalises loose model output into the canonical shape the scorer expects. */
export function normalizeTraits(input: Partial<SubjectTraits>): SubjectTraits {
  const types = Array.from(
    new Set(
      (input.types ?? [])
        .map((t) => normalizeType(String(t)))
        .filter((t): t is string => !!t),
    ),
  )

  const asArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []

  return {
    subject: String(input.subject ?? '').trim(),
    isPokemon: input.isPokemon !== false,
    pokemonGuess: String(input.pokemonGuess ?? '').trim(),
    animalFamily: String(input.animalFamily ?? '').trim(),
    colors: asArray(input.colors).slice(0, 8),
    bodyFeatures: asArray(input.bodyFeatures).slice(0, 12),
    elements: asArray(input.elements).slice(0, 10),
    types,
    shapeKeywords: asArray(input.shapeKeywords).slice(0, 10),
    confidence: typeof input.confidence === 'number' && Number.isFinite(input.confidence)
      ? Math.max(0, Math.min(1, input.confidence))
      : 0.5,
    note: String(input.note ?? '').trim(),
  }
}

/** Concept set describing the photo, plus types inferred from those concepts. */
export interface TraitSignature {
  concepts: Set<string>
  /**
   * Concepts from the model's structured fields only (colours, body features,
   * elements, shape). Free-text narration mentions background scenery ("standing
   * in grass") which would otherwise surface as leaf/water noise in the UI.
   */
  structured: Set<string>
  types: Set<string>
  animal: Set<string>
  anatomy: Set<string>
  shape: Set<string>
  colors: Set<string>
  elements: Set<string>
  tokens: string[]
}

export function signatureOf(raw: Partial<SubjectTraits>): TraitSignature {
  const traits = normalizeTraits(raw)
  const tokens = tokensOf(traits)

  // One pass over every fragment, so "large pointed ears" is read as a phrase
  // (matching "big ears") instead of being shredded into "large" + "pointed".
  const structured = new Set<string>()
  const structuredFields = [
    ...traits.colors,
    ...traits.bodyFeatures,
    ...traits.elements,
    ...traits.shapeKeywords,
    traits.animalFamily,
  ]
  for (const t of structuredFields) for (const c of conceptsIn(t)) structured.add(c)

  const concepts = new Set<string>(structured)
  for (const t of tokens) for (const c of conceptsIn(t)) concepts.add(c)
  // the narration sentence is useful evidence for scoring, but is not shown
  for (const c of conceptsIn(traits.subject)) concepts.add(c)

  const pick = (bucket: Set<string>) => new Set([...concepts].filter((c) => bucket.has(c)))

  const types = new Set(traits.types)
  // Types the model omitted can be inferred from element concepts, but never
  // invent a type when the model gave none and there are no element hints.
  if (!types.size) {
    for (const c of concepts) {
      const t = CONCEPT_TYPE[c]
      if (t) types.add(t)
    }
  }

  return {
    concepts,
    structured,
    types,
    animal: pick(ANIMAL_CONCEPTS),
    anatomy: pick(ANATOMY_CONCEPTS),
    shape: pick(SHAPE_CONCEPTS),
    colors: pick(COLOR_CONCEPTS),
    elements: pick(ELEMENT_CONCEPTS),
    tokens,
  }
}

/** Weighted overlap of two concept sets, normalised by the query's weight. */
function overlapScore(query: Set<string>, target: Set<string>): { score: number; hits: string[] } {
  if (!query.size) return { score: 0, hits: [] }
  let total = 0
  let gained = 0
  const hits: string[] = []
  for (const c of query) {
    const w = conceptWeight(c)
    total += w
    if (target.has(c)) {
      gained += w
      hits.push(c)
    }
  }
  return { score: total > 0 ? gained / total : 0, hits }
}

function scoreName(p: Prepared, traits: SubjectTraits): number {
  const guess = traits.pokemonGuess.trim().toLowerCase()
  if (!guess) return 0
  if (p.names.has(guess)) return 1

  for (const name of p.names) {
    if (name.length >= 2 && (guess.includes(name) || name.includes(guess))) return 0.8
  }
  const en = p.pokemon.nameEn.toLowerCase()
  if (en.length >= 4 && guess.length >= 4 && (en.startsWith(guess) || guess.startsWith(en))) return 0.45
  return 0
}

function scoreCategory(p: Prepared, sig: TraitSignature): number {
  if (!p.categoryAnimal) return 0
  for (const c of sig.animal) {
    const forms = CONCEPTS[c]?.forms ?? []
    if (forms.some((f) => p.categoryAnimal.includes(f))) return 1
  }
  for (const token of sig.tokens) {
    if (token.length >= 2 && p.categoryAnimal.includes(token)) return 0.8
  }
  return 0
}

/** Raw prose overlap — deliberately small weight, used to break near-ties. */
function scoreText(p: Prepared, sig: TraitSignature): number {
  let hits = 0
  for (const token of sig.tokens) {
    const t = token.toLowerCase().trim()
    if (t.length < 2) continue
    if (p.haystack.includes(t)) hits++
  }
  return Math.min(1, hits * 0.14)
}

export interface ScoredOptions {
  limit?: number
  /** Set false for a cheap pure-type pass (used when the model call fails). */
  includeText?: boolean
}

export function scoreCandidates(rawTraits: Partial<SubjectTraits>, options: ScoredOptions = {}): Candidate[] {
  const traits = normalizeTraits(rawTraits)
  const sig = signatureOf(traits)
  const includeText = options.includeText !== false

  const scored = PREPARED.map((p) => {
    const reasons: string[] = []

    const name = scoreName(p, traits)
    if (name >= 1) reasons.push(`识别到「${p.pokemon.name}」`)
    else if (name >= 0.8) reasons.push(`接近「${p.pokemon.name}」`)

    const animalHit = overlapScore(sig.animal, p.concepts)
    if (animalHit.hits.length) reasons.push(`外形类似${animalHit.hits.slice(0, 2).map(conceptLabel).join('／')}`)

    const anatomyHit = overlapScore(sig.anatomy, p.concepts)
    if (anatomyHit.hits.length >= 2) {
      reasons.push(`特征相符：${anatomyHit.hits.slice(0, 3).map(conceptLabel).join('、')}`)
    }

    const shapeHit = overlapScore(sig.shape, p.concepts)
    const colorHit = overlapScore(sig.colors, p.concepts)
    const elementHit = overlapScore(sig.elements, p.concepts)

    let typeHit = 0
    if (sig.types.size) {
      const matched = [...p.types].filter((t) => sig.types.has(t))
      typeHit = matched.length / Math.min(p.types.size, sig.types.size || 1)
      if (matched.length) reasons.push(`${matched.join('·')}属性契合`)
    }
    // Elemental cues ("flames", "leaves") are evidence for the type even when
    // the model named no type at all, so fold them in rather than discard them.
    if (elementHit.hits.length) {
      const match = overlapScore(sig.elements, p.concepts)
      typeHit = Math.max(typeHit, match.score * 0.8)
      const implied = elementHit.hits.filter((c) => !reasons.some((r) => r.includes(conceptLabel(c))))
      if (implied.length) reasons.push(`带有${implied.slice(0, 2).map(conceptLabel).join('、')}特征`)
    }

    const category = scoreCategory(p, sig)
    if (category > 0 && !animalHit.hits.length) reasons.push(`分类为${p.pokemon.category}`)

    const text = includeText ? scoreText(p, sig) : 0

    const breakdown: ScoreBreakdown = {
      name,
      animal: animalHit.score,
      type: Math.min(1, typeHit),
      anatomy: anatomyHit.score,
      shape: shapeHit.score,
      color: colorHit.score,
      category,
      text,
    }

    let score = 0
    for (const [key, weight] of Object.entries(WEIGHTS) as Array<[keyof ScoreBreakdown, number]>) {
      score += breakdown[key] * weight
    }
    // Earlier generations act only as a tiebreaker: a recognisable icon is a
    // far likelier intent than an obscure gen-9 form.
    score += Math.max(0, (9 - p.pokemon.gen) * 0.06)

    return { pokemon: p.pokemon, score, reasons: [...new Set(reasons)].slice(0, 4), breakdown }
  })

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.pokemon.id.localeCompare(b.pokemon.id) // stable, deterministic
  })

  const top = scored.slice(0, options.limit ?? 24)
  const best = top[0]?.score ?? 0

  return top.map((c) => ({
    pokemon: c.pokemon,
    score: c.score,
    // Relative to the best hit, so a flat distribution reads as weak across
    // the board rather than presenting the first of many equals as certain.
    confidence: best > 0 ? Math.pow(c.score / best, 2.2) : 0,
    reasons: c.reasons,
    breakdown: c.breakdown,
  }))
}

/** Whole-scan confidence, driving the "this may not be a Pokémon" banner. */
export function resultConfidence(traits: SubjectTraits, candidates: Candidate[]): number {
  if (!candidates.length) return 0
  const top = candidates[0]
  const gap = candidates.length > 1 ? top.score - candidates[1].score : top.score
  const separation = Math.min(1, gap / 12)
  const strength = Math.min(1, top.score / 34)
  const model = Math.max(0, Math.min(1, traits.confidence))

  let score = 0.4 * strength + 0.3 * separation + 0.3 * model
  // A subject the model says is not a Pokémon should never present as certain.
  if (!traits.isPokemon) score *= 0.55
  return Math.max(0, Math.min(1, score))
}

/**
 * Human-readable tags for the "what the model saw" panel.
 * Uses only the structured fields, so background scenery mentioned in the
 * narration sentence never appears as a claim about the subject.
 */
export function describeTraits(raw: Partial<SubjectTraits>): string[] {
  const sig = signatureOf(raw)
  if (!sig.structured.size) return [...sig.concepts].slice(0, 10).map(conceptLabel)
  return [...sig.structured].slice(0, 10).map(conceptLabel)
}

export { scrub }
