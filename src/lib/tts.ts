/**
 * Text-to-speech for the scan-result announcement.
 *
 * Two engines behind one entry point:
 *   - `cloud`  reuses the endpoint the user already configured — OpenAI-compatible
 *              `POST {base}/audio/speech`, or Gemini `generateContent` with the
 *              AUDIO modality. Better and consistent voice, but many proxies only
 *              whitelist `/chat/completions`, so a failure here must never leave
 *              the app silent.
 *   - `browser` uses `window.speechSynthesis`: free, offline, always present.
 *
 * Every vendor quirk lives in this module on purpose:
 *   - iOS/Safari refuses speech until a user gesture has "unlocked" the audio
 *     session, so `unlockBrowserSpeech()` must be called from a click handler.
 *   - `getVoices()` fills in asynchronously; we re-read it on every call.
 *   - Gemini TTS returns raw 16-bit PCM, not a container, so it needs a WAV
 *     header before an <audio> element can play it.
 */
import { AiError, resolveProvider, type AiConfig, type VoiceConfig } from '@/lib/ai'

const REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_GEMINI_SAMPLE_RATE = 24_000

export interface SpeakOutcome {
  /** True when audio actually reached the speakers. */
  played: boolean
  used: 'cloud' | 'browser' | 'none'
  /** Set when the cloud engine failed and the browser voice covered for it. */
  fallbackReason?: string
}

// ---- playback state (module-level: only one announcement at a time) --------

let currentAudio: HTMLAudioElement | null = null
let currentObjectUrl: string | null = null
let cancelPlayback: (() => void) | null = null

// ---- browser speech synthesis ---------------------------------------------

export function isBrowserSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function'
  )
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1
  return Math.min(2, Math.max(0.5, rate))
}

/** Prefers an offline zh-CN voice, then any Chinese voice. */
function pickChineseVoice(): SpeechSynthesisVoice | undefined {
  if (!isBrowserSpeechSupported()) return undefined
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((v) => /^zh[-_]?cn/i.test(v.lang) && v.localService) ??
    voices.find((v) => /^zh[-_]?cn/i.test(v.lang)) ??
    voices.find((v) => /^zh/i.test(v.lang))
  )
}

/**
 * Must be called synchronously inside a user gesture (the 开始识别 / 试听 click).
 * Without it, iOS and Safari silently drop the first real utterance.
 */
export function unlockBrowserSpeech(): void {
  if (!isBrowserSpeechSupported()) return
  const utterance = new SpeechSynthesisUtterance(' ')
  utterance.volume = 0
  utterance.lang = 'zh-CN'
  window.speechSynthesis.speak(utterance)
}

export function speakWithBrowser(text: string, voice: VoiceConfig): Promise<void> {
  if (!isBrowserSpeechSupported()) {
    return Promise.reject(new Error('当前浏览器不支持语音合成。'))
  }
  return new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = clampRate(voice.rate)
    utterance.pitch = 1
    utterance.volume = 1
    const picked = pickChineseVoice()
    if (picked) utterance.voice = picked

    // Resolve/reject exactly once: some engines fire both `end` and `error`.
    let settled = false
    const settle = (err?: Error) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve()
    }

    utterance.onend = () => settle()
    utterance.onerror = (event) =>
      settle(new Error(`语音合成失败（${event.error || 'unknown'}）。`))

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  })
}

// ---- cloud synthesis -------------------------------------------------------

/** Strips a chat path so the TTS route can be appended to the bare base. */
function baseRoot(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/:generatecontent$/i, '')
}

function ttsEndpoint(config: AiConfig): string {
  const base = baseRoot(config.baseUrl)
  if (resolveProvider(config) === 'gemini') {
    const hasVersion = /\/v\d+(alpha|beta)?\d*$/i.test(base)
    return `${base}${hasVersion ? '' : '/v1beta'}/models/${config.voice.model}:generateContent`
  }
  return `${base}/audio/speech`
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Wraps headerless 16-bit mono PCM in a RIFF/WAVE container. */
function pcm16ToWav(pcm: Uint8Array, sampleRate: number): Blob {
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + pcm.byteLength, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // format: PCM
  view.setUint16(22, 1, true) // channels: mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeAscii(36, 'data')
  writeAscii(36, 'data')
  view.setUint32(40, pcm.byteLength, true)

  // `pcm` comes from a fresh Uint8Array over a plain ArrayBuffer, so its buffer
  // covers exactly the payload and can be handed to Blob without copying.
  return new Blob([header, pcm.buffer as ArrayBuffer], { type: 'audio/wav' })
}

interface GeminiInlineAudio {
  data?: string
  mimeType?: string
  mime_type?: string
}

/** Gemini returns inline PCM base64, so it needs decoding plus a WAV header. */
function geminiAudioToBlob(json: unknown, raw: string): Blob {
  const parts = (json as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: GeminiInlineAudio }> } }> })
    ?.candidates?.[0]?.content?.parts
  const inline = Array.isArray(parts) ? parts.find((p) => Boolean(p.inlineData?.data))?.inlineData : undefined

  if (!inline?.data) {
    const blocked = (json as { promptFeedback?: { blockReason?: string } })?.promptFeedback?.blockReason
    throw new AiError(
      '语音模型没有返回音频。' + (blocked ? `（${blocked}）` : ''),
      undefined,
      raw.slice(0, 300),
    )
  }

  const mime = String(inline.mimeType ?? inline.mime_type ?? '')
  const bytes = base64ToBytes(inline.data)

  // Some Gemini voices already come back containerised; only bare PCM needs wrapping.
  if (/wav|mp3|mpeg|ogg/i.test(mime)) {
    return new Blob([bytes.buffer as ArrayBuffer], { type: mime })
  }
  const parsedRate = Number(/rate=(\d+)/i.exec(mime)?.[1])
  const sampleRate =
    Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : DEFAULT_GEMINI_SAMPLE_RATE
  return pcm16ToWav(bytes, sampleRate)
}

/**
 * Gateway-level failures (502/503/504) are usually transient: the upstream
 * provider is briefly unavailable or the proxy is restarting. One short retry
 * turns a silent fallback into a cloud voice most of the time.
 */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 2
const RETRY_DELAY_MS = 700

function isRetryable(err: unknown): boolean {
  if (!(err instanceof AiError)) return false
  // status 0 is a transport failure: retry once before giving up.
  if (err.status === 0) return true
  return typeof err.status === 'number' && RETRYABLE_STATUS.has(err.status)
}

/** Condenses a gateway error body into something worth showing a user. */
function summarizeDetail(detail: string): string {
  const trimmed = detail.trim()
  if (!trimmed) return ''
  // Proxies commonly return HTML error pages; strip tags before truncating.
  const text = /<[a-z][\s\S]*>/i.test(trimmed)
    ? trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : trimmed
  try {
    const json = JSON.parse(text) as Record<string, unknown>
    const err = json.error
    if (typeof err === 'string') return err.slice(0, 160)
    if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
      return String((err as { message: string }).message).slice(0, 160)
    }
    if (typeof json.message === 'string') return json.message.slice(0, 160)
    if (typeof json.detail === 'string') return json.detail.slice(0, 160)
  } catch {
    // not JSON: fall through to the raw text
  }
  return text.slice(0, 160)
}

/** Explains what the status number actually means for this feature. */
function statusHint(status: number): string {
  switch (status) {
    case 401: return 'API Key 可能无效。'
    case 403: return '密钥无权调用语音接口。'
    case 404: return '代理可能未开放语音接口。'
    case 413: return '播报文本过长。'
    case 429: return '请求过于频繁或额度已用尽。'
    case 502: return '代理无法连接上游服务。'
    case 503: return '上游语音服务暂时不可用。'
    case 504: return '上游语音服务响应超时。'
    default: return ''
  }
}

/**
 * Retries transient failures, then rethrows the last error so the caller can
 * still fall back to the browser voice.
 */
async function synthesizeCloud(text: string, config: AiConfig): Promise<Blob> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await synthesizeCloudOnce(text, config)
    } catch (err) {
      lastError = err
      if (attempt === MAX_ATTEMPTS || !isRetryable(err)) break
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    }
  }
  throw lastError
}

async function synthesizeCloudOnce(text: string, config: AiConfig): Promise<Blob> {
  const provider = resolveProvider(config)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = config.apiKey.trim()
  if (key) {
    if (provider === 'gemini') headers['x-goog-api-key'] = key
    else headers.Authorization = `Bearer ${key}`
  }

  const voiceName = config.voice.voice.trim()
  const body =
    provider === 'gemini'
      ? {
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' } },
            },
          },
        }
      : {
          model: config.voice.model,
          voice: voiceName || 'alloy',
          input: text,
          response_format: 'mp3',
        }

  let res: Response
  try {
    res = await fetch(ttsEndpoint(config), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AiError('语音请求超时。')
    }
    throw new AiError(
      '无法连接语音接口。',
      0,
      err instanceof Error ? err.message : String(err),
    )
  }
  clearTimeout(timer)

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const summary = summarizeDetail(detail)
    // The snippet goes into the message itself, not just `detail`: the caller
    // only forwards `err.message` to the UI, so anything kept solely in
    // `detail` would never reach the person debugging the 503.
    throw new AiError(
      `语音接口返回 ${res.status}。${statusHint(res.status)}${summary ? `服务端说明：${summary}` : ''}`,
      res.status,
      detail.slice(0, 600),
    )
  }

  const contentType = res.headers.get('content-type') ?? ''
  // A JSON body means Gemini, or a 200-wrapped proxy error. Either way, parse it.
  if (provider === 'gemini' || contentType.includes('json')) {
    const raw = await res.text()
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      throw new AiError('语音接口返回了非 JSON 内容。', res.status, raw.slice(0, 300))
    }
    return geminiAudioToBlob(json, raw)
  }

  return res.blob()
}

// ---- playback --------------------------------------------------------------

/** Cancels whatever is currently speaking (cloud audio or browser utterance). */
export function stopSpeaking(): void {
  if (typeof window === 'undefined') return

  cancelPlayback?.()
  cancelPlayback = null

  if (currentAudio) {
    currentAudio.pause()
    currentAudio.removeAttribute('src')
    currentAudio = null
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
  if (isBrowserSpeechSupported()) window.speechSynthesis.cancel()
}

function playBlob(blob: Blob): Promise<void> {
  stopSpeaking()

  return new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio()
    audio.src = url
    audio.preload = 'auto'

    currentAudio = audio
    currentObjectUrl = url

    let settled = false
    const cleanup = () => {
      if (currentObjectUrl === url) {
        URL.revokeObjectURL(url)
        currentObjectUrl = null
      }
      if (currentAudio === audio) currentAudio = null
      cancelPlayback = null
    }

    // A cancelled announcement resolves quietly: the caller asked for it.
    cancelPlayback = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    audio.onended = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    audio.onerror = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new AiError('音频播放失败，可能是不受支持的音频格式。'))
    }

    void audio.play().catch((err: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(
        new AiError(
          '浏览器拦截了音频播放。',
          undefined,
          err instanceof Error ? err.message : String(err),
        ),
      )
    })
  })
}

// ---- public entry point ----------------------------------------------------

/**
 * Speaks `text` using whichever engine the config selects.
 *
 * Cloud failures fall through to the browser voice rather than staying silent —
 * the announcement is the whole point of the feature.
 */
export async function speak(text: string, config: AiConfig): Promise<SpeakOutcome> {
  const trimmed = text.trim()
  if (!trimmed) return { played: false, used: 'none' }

  const engine = config.voice.engine
  if (engine === 'off') return { played: false, used: 'none' }

  if (engine === 'cloud') {
    try {
      const blob = await synthesizeCloud(trimmed, config)
      await playBlob(blob)
      return { played: true, used: 'cloud' }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      if (!isBrowserSpeechSupported()) return { played: false, used: 'none', fallbackReason: reason }
      try {
        await speakWithBrowser(trimmed, config.voice)
        return { played: true, used: 'browser', fallbackReason: reason }
      } catch {
        return { played: false, used: 'none', fallbackReason: reason }
      }
    }
  }

  if (!isBrowserSpeechSupported()) return { played: false, used: 'none' }
  try {
    await speakWithBrowser(trimmed, config.voice)
    return { played: true, used: 'browser' }
  } catch (err) {
    return {
      played: false,
      used: 'none',
      fallbackReason: err instanceof Error ? err.message : String(err),
    }
  }
}
