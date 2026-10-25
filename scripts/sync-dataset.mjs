#!/usr/bin/env node
/**
 * Builds the offline dataset used by the app.
 *
 *   1. reads the national dex list (id / zh name / types / generation)
 *   2. reads every data/pokemon/*.json entry and flattens the fields the UI needs
 *   3. downloads one official artwork PNG per species into public/pokemon/<id>.png
 *   4. writes src/data/pokemon.json
 *
 * Source: https://github.com/42arch/pokemon-dataset-zh
 * Usage:  npm run sync:data
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OWNER = '42arch'
const REPO = 'pokemon-dataset-zh'
const BRANCH = 'main'
const API = `https://api.github.com/repos/${OWNER}/${REPO}`
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_IMG = path.join(ROOT, 'public', 'pokemon')
const OUT_DATA = path.join(ROOT, 'src', 'data', 'pokemon.json')

const CONCURRENCY = 12
const TOKEN = process.env.GITHUB_TOKEN
const AUTH = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}

async function getJSON(url, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'poke-scanner-sync', Accept: 'application/vnd.github+json', ...AUTH },
      })
      if (res.status === 403 || res.status === 429) {
        const wait = 2000 * (attempt + 1)
        console.warn(`  rate limited, waiting ${wait}ms`)
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
      return await res.json()
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
}

async function getBuffer(url, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'poke-scanner-sync' } })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
  }
}

async function pool(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  let done = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
      done++
      if (done % 50 === 0 || done === items.length) {
        process.stdout.write(`\r  ${done}/${items.length}`)
      }
    }
  })
  await Promise.all(runners)
  process.stdout.write('\n')
  return results
}

/** Splits a raw profile line into short sentences we can search against. */
function firstSentences(text, count = 2, maxChars = 180) {
  if (!text) return ''
  const clean = String(text).replace(/\s+/g, ' ').trim()
  const parts = clean.split(/(?<=[。！？.!?])/).map((s) => s.trim()).filter(Boolean)
  let out = ''
  for (let i = 0; i < Math.min(parts.length, count); i++) {
    if ((out + parts[i]).length > maxChars) break
    out += parts[i]
  }
  return out || clean.slice(0, maxChars)
}

function toNumber(value) {
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Picks the base-form official artwork for a species.
 * Filenames look like `0003-妙蛙花.png`, but forms add suffixes
 * (`0003-妙蛙花-超级妙蛙花.png`), so an exact match is always preferred.
 */
function pickOfficialImage(id, nameZh, officialFiles) {
  const exact = `${id}-${nameZh}.png`
  if (officialFiles.has(exact)) return exact

  const candidates = [...officialFiles].filter(
    (f) => f.startsWith(`${id}-${nameZh}-`) || f.startsWith(`${id}-`),
  )
  if (!candidates.length) return null
  // shortest name == fewest form modifiers == closest to the default artwork
  return candidates.sort((a, b) => a.length - b.length)[0]
}

async function main() {
  console.log('› fetching repository file tree')
  const tree = await getJSON(`${API}/git/trees/${BRANCH}?recursive=1`)
  const blobs = tree.tree.filter((n) => n.type === 'blob').map((n) => n.path)

  const pokemonFiles = blobs.filter((p) => p.startsWith('data/pokemon/') && p.endsWith('.json'))
  const officialFiles = new Set(
    blobs
      .filter((p) => p.startsWith('data/images/official/'))
      .map((p) => path.basename(p).normalize('NFC')),
  )
  console.log(`  ${pokemonFiles.length} pokemon files, ${officialFiles.size} official images`)

  console.log('› fetching national dex index')
  const national = await getJSON(`${RAW}/data/pokedex/national.json`)
  const nationalById = new Map()
  for (const entry of national) {
    const id = String(entry.id).padStart(4, '0')
    if (!nationalById.has(id)) nationalById.set(id, entry)
  }

  console.log('› fetching per-species detail')
  const details = await pool(pokemonFiles, CONCURRENCY, async (file) => {
    try {
      const data = await getJSON(`${RAW}/${file.split('/').map(encodeURIComponent).join('/')}`)
      return { file, data }
    } catch (err) {
      console.warn(`\n  ! failed ${file}: ${err.message}`)
      return { file, data: null }
    }
  })

  const pokemon = []
  for (const { file, data } of details) {
    if (!data) continue
    const id = String(data.pokedex_id ?? path.basename(file).slice(0, 4)).padStart(4, '0')
    const nationalEntry = nationalById.get(id)
    const form = data.forms?.[0] ?? {}
    const statsRow = data.stats?.[0]?.data ?? {}
    const image = pickOfficialImage(id, data.name_zh, officialFiles)
    if (!image) continue

    pokemon.push({
      id,
      name: data.name_zh,
      nameEn: data.name_en ?? '',
      nameJa: data.name_ja ?? '',
      gen: nationalEntry?.gen ?? 0,
      types: form.types?.length ? form.types : (nationalEntry?.types ?? []),
      category: form.category ?? '',
      color: form.color ?? '',
      height: form.height ?? '',
      weight: form.weight ?? '',
      abilities: (form.abilities ?? []).map((a) => a.name).filter(Boolean),
      stats: {
        hp: toNumber(statsRow.hp),
        attack: toNumber(statsRow.attack),
        defense: toNumber(statsRow.defense),
        spAttack: toNumber(statsRow.sp_attack),
        spDefense: toNumber(statsRow.sp_defense),
        speed: toNumber(statsRow.speed),
      },
      description: firstSentences(data.description, 1, 120),
      // `profile` is the physical-appearance paragraph: the most useful text
      // signal for matching a photo against a species.
      profile: firstSentences(data.profile, 3, 260),
      image,
    })
  }

  pokemon.sort((a, b) => a.id.localeCompare(b.id))
  console.log(`› resolved ${pokemon.length} species`)

  await mkdir(OUT_IMG, { recursive: true })
  await mkdir(path.dirname(OUT_DATA), { recursive: true })

  console.log('› downloading official artwork')
  let skipped = 0
  await pool(pokemon, CONCURRENCY, async (p) => {
    const target = path.join(OUT_IMG, `${p.id}.png`)
    if (existsSync(target)) {
      skipped++
      return
    }
    const url = `${RAW}/data/images/official/${p.image.split('/').map(encodeURIComponent).join('/')}`
    const buf = await getBuffer(url)
    await writeFile(target, buf)
  })
  if (skipped) console.log(`  (${skipped} images already cached)`)

  // sanity: fill in any pre-existing ids not present in the mirror
  await writeFile(OUT_DATA, JSON.stringify(pokemon, null, 0), 'utf8')

  const meta = {
    source: `https://github.com/${OWNER}/${REPO}`,
    syncedAt: new Date().toISOString(),
    count: pokemon.length,
  }
  await writeFile(path.join(path.dirname(OUT_DATA), 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')

  const stat = await readFile(OUT_DATA)
  console.log(`✓ wrote ${path.relative(ROOT, OUT_DATA)} (${(stat.length / 1024).toFixed(0)} KB)`)
}

main().catch((err) => {
  console.error('\nsync failed:', err)
  process.exit(1)
})
