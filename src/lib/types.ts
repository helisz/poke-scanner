export interface PokemonStats {
  hp: number
  attack: number
  defense: number
  spAttack: number
  spDefense: number
  speed: number
}

export interface Pokemon {
  id: string
  name: string
  nameEn: string
  nameJa: string
  gen: number
  types: string[]
  category: string
  color: string
  height: string
  weight: string
  abilities: string[]
  stats: PokemonStats
  description: string
  profile: string
  image: string
}

/** Structured description of the photo, produced by stage A of the pipeline. */
export interface SubjectTraits {
  /** What the picture actually contains, in the user's natural language. */
  subject: string
  /** True when the subject is (or clearly resembles) a Pokémon. */
  isPokemon: boolean
  /** Species name the model named directly, if any. */
  pokemonGuess: string
  animalFamily: string
  colors: string[]
  bodyFeatures: string[]
  elements: string[]
  types: string[]
  shapeKeywords: string[]
  confidence: number
  note: string
}

export interface ScoreBreakdown {
  /** Direct name recognition by the model. */
  name: number
  /** Animal-family concept overlap. */
  animal: number
  /** Type overlap. */
  type: number
  /** Anatomy/feature concept overlap. */
  anatomy: number
  /** Posture and shape concept overlap. */
  shape: number
  /** Colour concept overlap. */
  color: number
  /** Dataset category ("鼠宝可梦") agreement. */
  category: number
  /** Raw prose overlap; a tiebreaker only. */
  text: number
}

export interface Candidate {
  pokemon: Pokemon
  score: number
  /** 0..1, relative to the best candidate in the same result set. */
  confidence: number
  reasons: string[]
  breakdown: ScoreBreakdown
  /** Reranked by the model rather than the local scorer. */
  reranked?: boolean
}

export interface ScanResult {
  traits: SubjectTraits
  candidates: Candidate[]
  reranked: boolean
  thumbnail: string
  elapsedMs: number
}
