import type { Pokemon } from '@/lib/types'
import raw from '@/data/pokemon.json'

export const POKEMON: Pokemon[] = raw as Pokemon[]

const byId = new Map<string, Pokemon>()
for (const p of POKEMON) byId.set(p.id, p)

export function getPokemon(id: string): Pokemon | undefined {
  return byId.get(id)
}

export function artworkUrl(p: Pokemon): string {
  return `${import.meta.env.BASE_URL}pokemon/${p.id}.png`
}

export const POKEMON_COUNT = POKEMON.length

export const STAT_MAX = 255
export const STAT_TOTAL_MAX = 720

export const STAT_LABELS: Array<{ key: keyof Pokemon['stats']; label: string }> = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: '攻击' },
  { key: 'defense', label: '防御' },
  { key: 'spAttack', label: '特攻' },
  { key: 'spDefense', label: '特防' },
  { key: 'speed', label: '速度' },
]

export function statTotal(p: Pokemon): number {
  const s = p.stats
  return s.hp + s.attack + s.defense + s.spAttack + s.spDefense + s.speed
}
