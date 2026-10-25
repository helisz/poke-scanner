/**
 * Visual identity per Pokémon type (Chinese names, as used by the dataset).
 * Used for badges, gradients and the exported card theme.
 */
export interface TypeTheme {
  solid: string
  from: string
  to: string
  /** Foreground colour that stays readable on `solid`. */
  on: string
}

export const TYPE_THEME: Record<string, TypeTheme> = {
  一般: { solid: '#9fa19f', from: '#b3b3a3', to: '#6d6d5a', on: '#111310' },
  格斗: { solid: '#c03028', from: '#e0503a', to: '#8a1f18', on: '#fff5f2' },
  飞行: { solid: '#8fa8dd', from: '#a3b8f0', to: '#6d7fc4', on: '#101528' },
  毒: { solid: '#9f5cba', from: '#c07ad8', to: '#6d3a85', on: '#fdf3ff' },
  地面: { solid: '#c9a961', from: '#e0c078', to: '#9a7b3a', on: '#241a08' },
  岩石: { solid: '#b8a038', from: '#cfb554', to: '#8a7620', on: '#221b02' },
  虫: { solid: '#8fb820', from: '#a8d130', to: '#6b8c14', on: '#131a02' },
  幽灵: { solid: '#6b5b9b', from: '#8a78bd', to: '#4a3d70', on: '#f3f0ff' },
  钢: { solid: '#8e8e9e', from: '#b0b0c0', to: '#66667a', on: '#0d0d14' },
  火: { solid: '#e8622c', from: '#f98a3c', to: '#c33f13', on: '#fff6f0' },
  水: { solid: '#3f87e0', from: '#5fa8f5', to: '#2464b8', on: '#f0f7ff' },
  草: { solid: '#4fae4a', from: '#6fd268', to: '#2f8030', on: '#f2fff1' },
  电: { solid: '#e8c22c', from: '#ffdb4d', to: '#c99a0c', on: '#241d00' },
  超能力: { solid: '#e05a86', from: '#f57ca4', to: '#b8335f', on: '#fff0f5' },
  冰: { solid: '#63c8d4', from: '#8fe3ea', to: '#3d9aa8', on: '#04181a' },
  龙: { solid: '#6a4bd6', from: '#8b6cf0', to: '#4a2fa8', on: '#f4f0ff' },
  恶: { solid: '#5a4a44', from: '#7a645c', to: '#3a2e2a', on: '#fdf6f3' },
  妖精: { solid: '#e08fc0', from: '#f5add6', to: '#b86298', on: '#2a0a1c' },
}

const FALLBACK: TypeTheme = { solid: '#8fa8dd', from: '#a3b8f0', to: '#6d7fc4', on: '#101528' }

export function typeTheme(type?: string): TypeTheme {
  return (type && TYPE_THEME[type]) || FALLBACK
}

/** Ambient gradient derived from a species' primary/secondary type. */
export function typeGradient(types: string[]): string {
  const a = typeTheme(types[0])
  const b = typeTheme(types[1] ?? types[0])
  return `linear-gradient(135deg, ${a.from}, ${a.to} 55%, ${b.to})`
}
