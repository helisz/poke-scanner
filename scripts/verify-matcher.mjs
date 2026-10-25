/**
 * Sanity harness for the local matcher (stage B).
 * Runs realistic stage-A outputs through scoreCandidates and prints top-3.
 * Usage: node scripts/verify-matcher.mjs
 */
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })

try {
  const { scoreCandidates, resultConfidence } = await server.ssrLoadModule('/src/lib/matcher.ts')

  const cases = [
    {
      label: 'AI Pikachu photo (input/images.jpeg)',
      traits: {
        subject: 'a fluffy yellow creature with long ears and red cheeks',
        isPokemon: true,
        pokemonGuess: 'Pikachu',
        animalFamily: 'rodent',
        colors: ['yellow', 'black', 'red'],
        bodyFeatures: ['long ears', 'red cheeks', 'lightning bolt tail', 'small body'],
        elements: ['electricity', 'sparks'],
        types: ['electric'],
        shapeKeywords: ['round', 'cute'],
        confidence: 0.97,
        note: 'clearly a photorealistic Pikachu',
      },
    },
    {
      label: 'Eevee artwork (input/images2.jpeg)',
      traits: {
        subject: 'small brown fox-like creature with big ears and fluffy cream collar',
        isPokemon: true,
        pokemonGuess: '',
        animalFamily: 'fox',
        colors: ['brown', 'cream'],
        bodyFeatures: ['large pointed ears', 'fluffy collar', 'bushy tail', 'big eyes', 'four legs'],
        elements: [],
        types: ['一般'],
        shapeKeywords: ['quadruped', 'cute'],
        confidence: 0.6,
        note: 'fox-like quadruped, no elemental features',
      },
    },
    {
      label: 'Mew artwork (input/1513.png)',
      traits: {
        subject: 'small pink feline creature floating with long thin tail',
        isPokemon: true,
        pokemonGuess: '',
        animalFamily: 'cat',
        colors: ['pink'],
        bodyFeatures: ['long thin tail', 'large blue eyes', 'small feline body', 'floating'],
        elements: ['psychic aura'],
        types: ['超能力'],
        shapeKeywords: ['bipedal', 'smooth'],
        confidence: 0.55,
        note: 'pink psychic feline',
      },
    },
    {
      label: 'Real tabby cat photo (input/Cat_November_2010-1a.jpg4.webp)',
      traits: {
        subject: 'a brown tabby cat sitting on a wall',
        isPokemon: false,
        pokemonGuess: '',
        animalFamily: 'cat',
        colors: ['brown', 'black', 'tan'],
        bodyFeatures: ['striped fur', 'pointed ears', 'four legs', 'whiskers', 'green eyes'],
        elements: [],
        types: ['一般'],
        shapeKeywords: ['quadruped', 'furry'],
        confidence: 0.2,
        note: 'ordinary domestic cat, not a Pokémon',
      },
    },
  ]

  let failures = 0
  for (const c of cases) {
    const candidates = scoreCandidates(c.traits, { limit: 6 })
    const conf = resultConfidence(c.traits, candidates)
    console.log(`\n── ${c.label}`)
    console.log(`   confidence ${(conf * 100).toFixed(0)}%`)
    candidates.slice(0, 3).forEach((cand, i) => {
      console.log(
        `   ${i + 1}. ${cand.pokemon.name} ${cand.pokemon.id} [${cand.pokemon.types.join('·')}]  ` +
          `score=${cand.score.toFixed(1)} conf=${(cand.confidence * 100).toFixed(0)}%  ${cand.reasons.join(' / ')}`,
      )
    })
  }

  // --- assertions -------------------------------------------------------
  const check = (label, ok, detail) => {
    if (!ok) {
      failures++
      console.log(`\n✗ ${label} — ${detail}`)
    } else {
      console.log(`\n✓ ${label}`)
    }
  }

  const pikachu = scoreCandidates(cases[0].traits, { limit: 5 })
  check('Pikachu ranks #1 for AI Pikachu photo', pikachu[0].pokemon.name === '皮卡丘', `got ${pikachu[0].pokemon.name}`)

  const eevee = scoreCandidates(cases[1].traits, { limit: 5 })
  const eeveeRank = eevee.findIndex((c) => c.pokemon.name === '伊布')
  check('Eevee is in top-3 for Eevee artwork', eeveeRank >= 0 && eeveeRank < 3, `rank ${eeveeRank + 1}: ${eevee.map((c) => c.pokemon.name).join(', ')}`)

  const mew = scoreCandidates(cases[2].traits, { limit: 5 })
  const mewRank = mew.findIndex((c) => c.pokemon.name === '梦幻')
  check('Mew is in top-3 for Mew artwork', mewRank >= 0 && mewRank < 3, `rank ${mewRank + 1}: ${mew.map((c) => c.pokemon.name).join(', ')}`)

  // the cat must not look confident: low aggregate confidence, and cat-themed mons
  const cat = scoreCandidates(cases[3].traits, { limit: 5 })
  const catConf = resultConfidence(cases[3].traits, cat)
  check(
    'Real cat photo yields low aggregate confidence',
    catConf < 0.5,
    `confidence ${(catConf * 100).toFixed(0)}%`,
  )
  const catNames = cat.slice(0, 3).map((c) => c.pokemon.name)
  check(
    'Cat photo suggests feline Pokémon',
    catNames.some((n) => ['喵喵', '向尾喵', '猫老大', '小猫怪', '扒手猫', '妙喵', '火斑喵'].includes(n)),
    `top3: ${catNames.join(', ')}`,
  )

  const detA = JSON.stringify(scoreCandidates(cases[1].traits, { limit: 5 }).map((c) => c.pokemon.id))
  const detB = JSON.stringify(scoreCandidates(cases[1].traits, { limit: 5 }).map((c) => c.pokemon.id))
  check('Matcher is deterministic', detA === detB, 'ordering changed between runs')

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exitCode = failures === 0 ? 0 : 1
} finally {
  await server.close()
}
