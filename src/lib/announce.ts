/**
 * Builds the spoken summary of a scan result.
 *
 * Kept pure (no DOM, no speech APIs) for two reasons:
 *   - the same string feeds `aria-live`, so screen-reader users and users with
 *     sound on receive identical wording;
 *   - it can be asserted in tests without a real audio device.
 *
 * Wording rules:
 *   - names only — never scores, percentages or type lists. `confidence` is
 *     relative to the current result set, so reading it aloud would sound
 *     authoritative while being mathematically soft.
 *   - adapt to the candidate count: a rerank failure can leave fewer than three,
 *     and "备选：undefined" must never be spoken.
 *   - dedupe names, because a rerank can reorder without guaranteeing uniqueness.
 */
import type { Candidate } from '@/lib/types'

/** Spoken text is capped so a long result set never turns into a monologue. */
const MAX_SPOKEN_CHARS = 120

export interface Announcement {
  /** What to speak and what to mirror into the live region. */
  text: string
  /** Stable identity of the result set, used to suppress duplicate playback. */
  signature: string
}

/**
 * Short pause between names. A full stop gives TTS engines a natural beat,
 * whereas the list separator alone tends to run the names together.
 */
const SEPARATOR = '、'

/** Strips trailing punctuation so names can be concatenated cleanly. */
function cleanName(name: string): string {
  return name.trim().replace(/[。．.、，,；;！!？?]+$/g, '')
}

/**
 * Orders candidate names: preferred first, then the next two distinct ones.
 * Returns fewer entries when the result set is short.
 */
export function announcementNames(candidates: Candidate[], limit = 3): string[] {
  const names: string[] = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    const name = cleanName(candidate.pokemon.name)
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
    if (names.length >= limit) break
  }

  return names
}

/**
 * Composes the announcement.
 *
 * @param candidates ordered best-first, as produced by the scanner
 * @param uncertain  true when the overall match confidence is low
 */
export function composeAnnouncement(candidates: Candidate[], options: { uncertain?: boolean } = {}): Announcement {
  const names = announcementNames(candidates)
  const signature = candidates.map((c) => c.pokemon.id).join(',')

  if (!names.length) {
    return { text: '', signature }
  }

  const [preferred, ...alternates] = names

  let text: string
  if (alternates.length === 0) {
    // Only one candidate survived: do not imply a shortlist that is not there.
    text = `最相似的是${preferred}。`
  } else {
    text = `首选${preferred}。备选${alternates.join(SEPARATOR)}。`
  }

  if (options.uncertain) {
    // Prefix rather than suffix: users stop listening once they hear a name.
    text = `匹配度偏低，仅供参考。${text}`
  }

  if (text.length > MAX_SPOKEN_CHARS) {
    text = `${text.slice(0, MAX_SPOKEN_CHARS).replace(/[，,、]$/, '')}。`
  }

  return { text, signature }
}
