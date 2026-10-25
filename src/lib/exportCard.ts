/**
 * Pokédex card renderer.
 *
 * Implemented with Canvas 2D rather than DOM capture (html-to-image) on purpose:
 *  - the exported text is real drawn text, so no webfont need be embedded
 *    (capturing DOM with a CJK font silently produces blank glyphs in Safari)
 *  - same-origin artwork avoids canvas tainting, so toBlob() always succeeds
 *  - the output is pixel-identical across browsers and zoom levels
 *
 * Output: 1080 x 1350 PNG (4:5), sized for social feeds.
 */
import type { Candidate, Pokemon } from '@/lib/types'
import { STAT_LABELS, statTotal } from '@/data'
import { typeTheme } from '@/lib/pokemon-types'

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350

const FONT_STACK = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif'

export interface CardInput {
  pokemon: Pokemon
  /** Small square photo of the original subject. */
  thumbnail: string
  /** 0..1 whole-scan confidence. */
  confidence: number
  /** Reasons the matcher produced, shown as evidence chips. */
  reasons: string[]
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
}

/** Wraps Chinese/Latin mixed text to a pixel width, returning drawn line count. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    const candidate = line + ch
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = ch
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Truncates with an ellipsis so descriptions never overflow the card. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1)
  return `${out}…`
}

function drawBackground(ctx: CanvasRenderingContext2D, types: string[]) {
  const a = typeTheme(types[0])
  const b = typeTheme(types[1] ?? types[0])

  const grad = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT)
  grad.addColorStop(0, a.from)
  grad.addColorStop(0.5, a.to)
  grad.addColorStop(1, b.to)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  // darken towards the bottom so the stats block stays legible on bright types
  const shade = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT)
  shade.addColorStop(0, 'rgba(8,10,18,0.35)')
  shade.addColorStop(0.42, 'rgba(8,10,18,0.62)')
  shade.addColorStop(1, 'rgba(6,8,14,0.94)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  // diagonal hatch, the "scanner" texture
  ctx.save()
  ctx.globalAlpha = 0.06
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  for (let i = -CARD_HEIGHT; i < CARD_WIDTH; i += 26) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + CARD_HEIGHT, CARD_HEIGHT)
    ctx.stroke()
  }
  ctx.restore()

  // corner glow
  const glow = ctx.createRadialGradient(CARD_WIDTH * 0.5, 470, 40, CARD_WIDTH * 0.5, 470, 480)
  glow.addColorStop(0, `${a.solid}66`)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, CARD_WIDTH, 900)
}

function drawFrame(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.24)'
  ctx.lineWidth = 3
  roundRect(ctx, 34, 34, CARD_WIDTH - 68, CARD_HEIGHT - 68, 46)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255,255,255,0.09)'
  ctx.lineWidth = 1.5
  roundRect(ctx, 48, 48, CARD_WIDTH - 96, CARD_HEIGHT - 96, 38)
  ctx.stroke()
  ctx.restore()
}

/** The lens-and-light housing that makes it read as hardware, not a poster. */
function drawLens(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(112, 112, 26, 0, Math.PI * 2)
  ctx.fillStyle = accent
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(112, 112, 11, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fill()

  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(170 + i * 26, 112, 7, 0, Math.PI * 2)
    ctx.fillStyle = i === 0 ? '#ff6b5a' : i === 1 ? '#ffd166' : '#61d17c'
    ctx.fill()
  }
  ctx.restore()
}

function drawTypeBadge(
  ctx: CanvasRenderingContext2D,
  label: string,
  right: number,
  y: number,
): number {
  ctx.font = `600 26px ${FONT_STACK}`
  const paddingX = 22
  const width = ctx.measureText(label).width + paddingX * 2
  const x = right - width
  const theme = typeTheme(label)

  roundRect(ctx, x, y, width, 44, 22)
  ctx.fillStyle = theme.solid
  ctx.fill()

  ctx.fillStyle = theme.on
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(label, x + paddingX, y + 23)
  return x - 12
}

function drawStats(ctx: CanvasRenderingContext2D, pokemon: Pokemon, top: number) {
  const labelX = 118
  const valueX = 250
  const barX = 300
  const barWidth = 660
  const barHeight = 16
  const rowGap = 44

  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  STAT_LABELS.forEach((stat, index) => {
    const y = top + index * rowGap
    const value = pokemon.stats[stat.key]

    ctx.font = `500 24px ${FONT_STACK}`
    ctx.fillStyle = 'rgba(255,255,255,0.62)'
    ctx.fillText(stat.label, labelX, y)

    ctx.font = `700 26px ${FONT_STACK}`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'right'
    ctx.fillText(String(value), valueX, y)
    ctx.textAlign = 'left'

    // track
    roundRect(ctx, barX, y - barHeight / 2, barWidth, barHeight, barHeight / 2)
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.fill()

    // fill — 180 is a practical ceiling for a readable bar without dead space
    const ratio = Math.max(0.04, Math.min(1, value / 180))
    const theme = typeTheme(pokemon.types[0])
    const grad = ctx.createLinearGradient(barX, 0, barX + barWidth * ratio, 0)
    grad.addColorStop(0, theme.from)
    grad.addColorStop(1, theme.solid)
    roundRect(ctx, barX, y - barHeight / 2, barWidth * ratio, barHeight, barHeight / 2)
    ctx.fillStyle = grad
    ctx.fill()
  })
  ctx.restore()
}

function drawThumbnail(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 8
  roundRect(ctx, x, y, size, size, 20)
  ctx.fillStyle = 'rgba(12,14,22,0.85)'
  ctx.fill()
  ctx.restore()

  if (img) {
    ctx.save()
    roundRect(ctx, x, y, size, size, 20)
    ctx.clip()
    ctx.drawImage(img, x, y, size, size)
    ctx.restore()
  }

  ctx.save()
  roundRect(ctx, x, y, size, size, 20)
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.stroke()

  ctx.font = `600 17px ${FONT_STACK}`
  ctx.fillStyle = 'rgba(255,255,255,0.82)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('扫描原图', x + size / 2, y + size - 20)
  ctx.restore()
}

/** Draws the full card. Exported separately so the Dialog can preview it. */
export async function renderCard(canvas: HTMLCanvasElement, input: CardInput): Promise<void> {
  const { pokemon } = input
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 Canvas。')

  const accent = typeTheme(pokemon.types[0])

  // Load both images up front; a missing artwork must not abort the export.
  const [art, thumb] = await Promise.all([
    loadImage(`${import.meta.env.BASE_URL}pokemon/${pokemon.id}.png`).catch(() => null),
    loadImage(input.thumbnail).catch(() => null),
  ])

  drawBackground(ctx, pokemon.types)
  drawFrame(ctx)
  drawLens(ctx, accent.solid)

  // ---- header -----------------------------------------------------------
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = `700 22px ${FONT_STACK}`
  ctx.fillStyle = 'rgba(255,255,255,0.62)'
  // Clear of the lens (112) and its status dots (ending at ~229).
  ctx.fillText('POKÉDEX  /  SCAN RESULT', 258, 104)

  ctx.font = `700 44px ${FONT_STACK}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`No.${pokemon.id}`, 258, 148)

  // type badges, right aligned
  let badgeRight = CARD_WIDTH - 82
  for (const t of [...pokemon.types].reverse()) {
    badgeRight = drawTypeBadge(ctx, t, badgeRight, 92)
  }

  // ---- artwork ----------------------------------------------------------
  const artBox = { x: 240, y: 196, w: 600, h: 460 }
  ctx.save()
  ctx.beginPath()
  ctx.arc(artBox.x + artBox.w / 2, artBox.y + artBox.h / 2 + 20, 250, 0, Math.PI * 2)
  const disc = ctx.createRadialGradient(
    artBox.x + artBox.w / 2, artBox.y + artBox.h / 2,
    30,
    artBox.x + artBox.w / 2, artBox.y + artBox.h / 2,
    250,
  )
  disc.addColorStop(0, 'rgba(255,255,255,0.20)')
  disc.addColorStop(1, 'rgba(255,255,255,0.02)')
  ctx.fillStyle = disc
  ctx.fill()
  ctx.restore()

  if (art) {
    const scale = Math.min(artBox.w / art.naturalWidth, artBox.h / art.naturalHeight)
    const w = art.naturalWidth * scale
    const h = art.naturalHeight * scale
    ctx.drawImage(art, artBox.x + (artBox.w - w) / 2, artBox.y + (artBox.h - h) / 2, w, h)
  }

  drawThumbnail(ctx, thumb, CARD_WIDTH - 260, 196, 178)

  // ---- names ------------------------------------------------------------
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 84px ${FONT_STACK}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(pokemon.name, 84, 742)

  ctx.font = `500 30px ${FONT_STACK}`
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.fillText(`${pokemon.nameEn}  ·  ${pokemon.nameJa}`, 86, 792)

  // ---- meta strip -------------------------------------------------------
  ctx.font = `500 24px ${FONT_STACK}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  const meta = `${pokemon.category}   身高 ${pokemon.height}   体重 ${pokemon.weight}   第 ${pokemon.gen} 世代`
  ctx.fillText(fitText(ctx, meta, CARD_WIDTH - 170), 86, 838)

  // divider
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(84, 872)
  ctx.lineTo(CARD_WIDTH - 84, 872)
  ctx.stroke()

  // ---- stats ------------------------------------------------------------
  drawStats(ctx, pokemon, 920)

  // total
  ctx.font = `600 22px ${FONT_STACK}`
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.textAlign = 'left'
  ctx.fillText('种族值合计', 118, 1196)
  ctx.font = `700 30px ${FONT_STACK}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(String(statTotal(pokemon)), 250, 1196)

  // ---- description ------------------------------------------------------
  // Vertical budget is exact: stat-total baseline is 1196 and the footer sits at
  // 1292. Two 21px lines at 1226/1252 leave a 24px gutter above the footer.
  ctx.font = `400 21px ${FONT_STACK}`
  ctx.fillStyle = 'rgba(255,255,255,0.66)'
  const descWidth = CARD_WIDTH - 200
  const full = pokemon.profile || pokemon.description
  const wrapped = wrapText(ctx, full, descWidth)
  const shown = wrapped.slice(0, 2)
  // Mark truncation so a clipped sentence does not read as broken data.
  if (wrapped.length > shown.length) {
    shown[shown.length - 1] = fitText(ctx, `${shown[shown.length - 1]}…`, descWidth)
  }
  shown.forEach((line, i) => {
    ctx.fillText(fitText(ctx, line, descWidth), 118, 1226 + i * 26)
  })

  // ---- footer -----------------------------------------------------------
  ctx.textAlign = 'right'
  ctx.font = `600 18px ${FONT_STACK}`
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fillText(
    `相似度 ${Math.round(input.confidence * 100)}%   ·   poke-scanner`,
    CARD_WIDTH - 84,
    CARD_HEIGHT - 58,
  )

  ctx.textAlign = 'left'
  ctx.font = `400 15px ${FONT_STACK}`
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.fillText('数据来源：52poke 宝可梦图鉴 · 非官方作品', 84, CARD_HEIGHT - 58)
}

export async function renderCardToBlob(input: CardInput): Promise<Blob> {
  const canvas = document.createElement('canvas')
  await renderCard(canvas, input)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('生成图片失败。'))
    }, 'image/png')
  })
}

export async function downloadCard(input: CardInput): Promise<void> {
  const blob = await renderCardToBlob(input)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `pokedex-${input.pokemon.id}-${input.pokemon.name}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
  // give the browser a moment to start the download before revoking
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function candidateToCardInput(candidate: Candidate, thumbnail: string, confidence: number): CardInput {
  return {
    pokemon: candidate.pokemon,
    thumbnail,
    confidence,
    reasons: candidate.reasons,
  }
}
