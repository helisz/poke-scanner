/**
 * Client-side image preprocessing.
 *
 * Vision models bill by pixel area, and a 12 MP phone photo carries no extra
 * signal over a 1024 px one. Downscaling before upload cuts cost and latency;
 * a small square thumbnail is kept separately for the exported card's inset.
 */

export interface PreparedImage {
  /** Resized JPEG data URL sent to the model. */
  dataUrl: string
  /** Small square data URL used inside the exported card. */
  thumbnail: string
  width: number
  height: number
  /** Original file size in bytes, for the UI. */
  bytes: number
  fileName: string
}

const MAX_EDGE = 1024
const THUMB_EDGE = 320
const QUALITY = 0.85
const MAX_BYTES = 20 * 1024 * 1024

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片无法解析，请换一张试试。'))
    img.src = src
  })
}

function context2d(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 Canvas。')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return ctx
}

/** Downscale to fit `maxEdge`, compositing onto white so alpha never turns black. */
function resizeToDataUrl(img: HTMLImageElement, maxEdge: number, quality: number): string {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = context2d(w, h)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.canvas.toDataURL('image/jpeg', quality)
}

/** Centre-cropped square, used for the card's "scanned" thumbnail. */
function squareThumbnail(img: HTMLImageElement, edge: number): string {
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  const sx = (img.naturalWidth - side) / 2
  const sy = (img.naturalHeight - side) / 2
  const ctx = context2d(edge, edge)
  ctx.drawImage(img, sx, sy, side, side, 0, 0, edge, edge)
  return ctx.canvas.toDataURL('image/jpeg', 0.82)
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取文件失败。'))
    reader.readAsDataURL(file)
  })
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件（jpg / png / webp）。')
  if (file.size > MAX_BYTES) throw new Error('图片超过 20MB，请压缩后再试。')

  const original = await readFileAsDataUrl(file)
  const img = await loadImage(original)
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('图片尺寸无效。')

  return {
    dataUrl: resizeToDataUrl(img, MAX_EDGE, QUALITY),
    thumbnail: squareThumbnail(img, THUMB_EDGE),
    width: img.naturalWidth,
    height: img.naturalHeight,
    bytes: file.size,
    fileName: file.name,
  }
}

/** Accepts a pasted/data-URL source as well, for drag-drop and clipboard flows. */
export async function prepareImageFromDataUrl(dataUrl: string, fileName = 'pasted.png'): Promise<PreparedImage> {
  const img = await loadImage(dataUrl)
  return {
    dataUrl: resizeToDataUrl(img, MAX_EDGE, QUALITY),
    thumbnail: squareThumbnail(img, THUMB_EDGE),
    width: img.naturalWidth,
    height: img.naturalHeight,
    bytes: Math.round((dataUrl.length * 3) / 4),
    fileName,
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
