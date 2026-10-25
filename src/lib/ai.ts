/**
 * AI layer.
 *
 * The app talks to whatever endpoint the user configures. Two request shapes are
 * supported because "use my own base URL" in practice means one of:
 *   - an OpenAI-compatible proxy  -> POST {base}/chat/completions
 *   - a Google Gemini endpoint    -> POST {base}/models/{model}:generateContent
 * The shape is auto-detected from the URL, with an explicit override available.
 *
 * Stage A: describe the photo as structured attributes. The model is explicitly
 *          NOT asked to pick a Pokémon — that would invite hallucinated names.
 * Stage C: re-rank the local top-N and write a one-line reason per candidate.
 */
import type { Candidate, SubjectTraits } from '@/lib/types'

export type ProviderKind = 'openai' | 'gemini'

export interface AiConfig {
  baseUrl: string
  apiKey: string
  model: string
  provider: ProviderKind | 'auto'
}

const STORAGE_KEY = 'poke-scanner.ai-config'

export function defaultConfig(): AiConfig {
  const env = import.meta.env
  return {
    baseUrl: (env.VITE_AI_BASE_URL as string) || '',
    apiKey: (env.VITE_AI_API_KEY as string) || '',
    model: (env.VITE_AI_MODEL as string) || 'gpt-4o-mini',
    provider: ((env.VITE_AI_PROVIDER as string) || 'auto') as AiConfig['provider'],
  }
}

/**
 * Config resolution order: explicit settings saved by the user, then env defaults.
 * API keys are kept in localStorage only — this is a client-side app talking to
 * the user's own proxy, so there is no server to hold a secret.
 */
export function loadConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiConfig>
      const base = defaultConfig()
      return {
        baseUrl: parsed.baseUrl || base.baseUrl,
        apiKey: parsed.apiKey || base.apiKey,
        model: parsed.model || base.model,
        provider: (parsed.provider as AiConfig['provider']) || base.provider,
      }
    }
  } catch {
    // corrupted storage: fall through to defaults
  }
  return defaultConfig()
}

export function saveConfig(config: AiConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function isConfigured(config: AiConfig): boolean {
  return Boolean(config.baseUrl.trim() && config.model.trim())
}

export function resolveProvider(config: AiConfig): ProviderKind {
  if (config.provider !== 'auto') return config.provider
  const url = config.baseUrl.toLowerCase()
  if (url.includes('generativelanguage') || url.includes(':generatecontent') || url.includes('gemini')) {
    return 'gemini'
  }
  return 'openai'
}

function endpointFor(config: AiConfig, provider: ProviderKind): string {
  const base = config.baseUrl.trim().replace(/\/+$/, '')
  if (provider === 'gemini') {
    // Allow either "…/v1beta" or a full "…:generateContent" URL.
    if (/:generatecontent$/i.test(base)) return base
    const hasVersion = /\/v\d+(alpha|beta)?\d*$/i.test(base)
    return `${base}${hasVersion ? '' : '/v1beta'}/models/${config.model}:generateContent`
  }
  if (/\/chat\/completions$/i.test(base)) return base
  return `${base}/chat/completions`
}

export class AiError extends Error {
  constructor(message: string, readonly status?: number, readonly detail?: string) {
    super(message)
    this.name = 'AiError'
  }
}

interface ChatMessage {
  role: 'system' | 'user'
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
}

/** Single low-level call; both stages funnel through here. */
async function callModel(config: AiConfig, messages: ChatMessage[], maxTokens: number): Promise<string> {
  const provider = resolveProvider(config)
  const url = endpointFor(config, provider)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey.trim()) {
    if (provider === 'gemini') headers['x-goog-api-key'] = config.apiKey.trim()
    else headers.Authorization = `Bearer ${config.apiKey.trim()}`
  }

  let body: unknown
  if (provider === 'gemini') {
    const system = messages.filter((m) => m.role === 'system').map((m) => String(m.content)).join('\n')
    const parts = messages
      .filter((m) => m.role === 'user')
      .flatMap((m) => {
        if (typeof m.content === 'string') return [{ text: m.content }]
        return m.content.map((part) =>
          part.type === 'text'
            ? { text: part.text }
            : { inline_data: { mime_type: 'image/jpeg', data: part.image_url.url.split(',')[1] ?? '' } },
        )
      })
    body = {
      ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
    }
  } else {
    body = { model: config.model, messages, max_tokens: maxTokens, temperature: 0.2 }
  }

  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AiError('请求超时（60 秒）。请检查网络或代理是否可用。')
    }
    throw new AiError(
      '无法连接到接口。请确认 Base URL 可访问，且允许浏览器跨域（CORS）请求。',
      0,
      err instanceof Error ? err.message : String(err),
    )
  }
  clearTimeout(timer)

  const text = await res.text()
  if (!res.ok) {
    throw new AiError(
      `接口返回 ${res.status}。${res.status === 401 ? 'API Key 可能无效。' : res.status === 404 ? '请检查 Base URL 与模型名。' : ''}`,
      res.status,
      text.slice(0, 600),
    )
  }

  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new AiError('接口返回了非 JSON 内容。', res.status, text.slice(0, 400))
  }

  const content =
    provider === 'gemini'
      ? json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? ''
      : json?.choices?.[0]?.message?.content ?? ''

  if (!content) {
    const blocked = provider === 'gemini' ? json?.promptFeedback?.blockReason : json?.choices?.[0]?.finish_reason
    throw new AiError('模型没有返回内容。' + (blocked ? `（${blocked}）` : ''), res.status, text.slice(0, 400))
  }
  return String(content)
}

/** Pulls the first JSON object/array out of a reply that may contain prose or fences. */
function extractJson(raw: string): unknown {
  const text = raw.replace(/```(?:json)?/gi, '').trim()
  const start = text.search(/[[{]/)
  if (start < 0) throw new AiError('模型未返回 JSON。', undefined, raw.slice(0, 300))
  const open = text[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          throw new AiError('无法解析模型返回的 JSON。', undefined, text.slice(start, start + 400))
        }
      }
    }
  }
  throw new AiError('模型返回的 JSON 不完整。', undefined, raw.slice(0, 300))
}

const DESCRIBE_SYSTEM = `You analyse photographs for a Pokémon similarity matcher.

Describe ONLY what is visibly present. Do not invent details. Do not decide which
Pokémon it is unless it is unmistakably one.

Return a single JSON object with exactly these keys:
{
  "subject": "one sentence describing the main subject and pose",
  "isPokemon": true | false,
  "pokemonGuess": "official English name if it is unmistakably a specific Pokémon, else empty string",
  "animalFamily": "cat | dog | fox | rodent | rabbit | bird | fish | snake | lizard | turtle | frog | insect | bear | monkey | horse | deer | dragon | plant | humanoid | object | human | other",
  "colors": ["dominant body colours, lowercase English, max 4"],
  "bodyFeatures": ["visible anatomy: ears, tail, wings, claws, fur, horns... lowercase English, max 6"],
  "elements": ["elemental or thematic cues: fire, water, electricity, leaf, ice, psychic, metal, sand... max 4"],
  "types": ["infer up to 2 Pokémon types from English list: normal, fire, water, grass, electric, ice, fighting, poison, ground, flying, psychic, bug, rock, ghost, dragon, dark, steel, fairy"],
  "shapeKeywords": ["posture and silhouette: quadruped, bipedal, round, slender, small body, floating... max 4"],
  "confidence": 0.0,
  "note": "one short sentence on how Pokémon-like the subject is"
}

"confidence" is your certainty that this description is accurate, 0 to 1.
Reply with the JSON object only.`

export interface DescribeOptions {
  /** data: URL of the (already resized) image. */
  imageDataUrl: string
  config: AiConfig
  hint?: string
}

/** Stage A: photo -> structured traits. */
export async function describeImage({ imageDataUrl, config, hint }: DescribeOptions): Promise<SubjectTraits> {
  const messages: ChatMessage[] = [
    { role: 'system', content: DESCRIBE_SYSTEM },
    {
      role: 'user',
      content: [
        { type: 'text', text: hint ? `Extra context from the user: ${hint}` : 'Describe this image.' },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ]

  const raw = await callModel(config, messages, 900)
  const parsed = extractJson(raw) as Record<string, unknown>

  const arr = (v: unknown, max: number): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : []

  return {
    subject: String(parsed.subject ?? '').slice(0, 300),
    isPokemon: parsed.isPokemon !== false,
    pokemonGuess: String(parsed.pokemonGuess ?? '').slice(0, 40),
    animalFamily: String(parsed.animalFamily ?? '').slice(0, 40),
    colors: arr(parsed.colors, 4),
    bodyFeatures: arr(parsed.bodyFeatures, 6),
    elements: arr(parsed.elements, 4),
    types: arr(parsed.types, 2),
    shapeKeywords: arr(parsed.shapeKeywords, 4),
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    note: String(parsed.note ?? '').slice(0, 200),
  }
}

export interface RankedPick {
  id: string
  reason: string
}

const RERANK_SYSTEM = `You are refining the output of an image-based Pokémon matcher.

You receive a description of a photo and a numbered list of real Pokémon
candidates that a text-similarity scorer already shortlisted. Your job is to
judge which candidates actually LOOK most like the photo's subject.

Rules:
- Only choose from the given candidates, identified by their id.
- Rank by visual resemblance to the described subject, not by popularity.
- If the subject clearly is not a Pokémon, still return the three closest, and
  say so honestly in each reason.
- Reasons must be under 20 Chinese characters and reference concrete visual
  evidence (colour, ears, tail, body shape...).

Return a JSON array of exactly 3 objects, best first:
[{ "id": "0025", "reason": "黄毛长耳，腮部有红斑" }]`

/** Stage C: LLM re-ranks the local shortlist. Best-effort: failures are non-fatal. */
export async function rerankCandidates(
  traits: SubjectTraits,
  shortlist: Candidate[],
  config: AiConfig,
): Promise<RankedPick[]> {
  const list = shortlist
    .slice(0, 18)
    .map((c) => {
      const p = c.pokemon
      return `- id=${p.id} 名称=${p.name} 类型=${p.types.join('·')} 分类=${p.category} 颜色=${p.color} 外形=${p.profile.slice(0, 90)}`
    })
    .join('\n')

  const subject = [
    `描述：${traits.subject}`,
    `动物类别：${traits.animalFamily}`,
    `颜色：${traits.colors.join('、')}`,
    `身体特征：${traits.bodyFeatures.join('、')}`,
    `元素线索：${traits.elements.join('、')}`,
    `形态：${traits.shapeKeywords.join('、')}`,
    traits.isPokemon ? '' : '注意：该图片可能并不是宝可梦。',
  ]
    .filter(Boolean)
    .join('\n')

  const raw = await callModel(
    config,
    [
      { role: 'system', content: RERANK_SYSTEM },
      { role: 'user', content: `${subject}\n\n候选列表：\n${list}` },
    ],
    500,
  )

  const parsed = extractJson(raw)
  if (!Array.isArray(parsed)) throw new AiError('重排结果格式不正确。')

  const valid = new Set(shortlist.map((c) => c.pokemon.id))
  return parsed
    .map((item) => {
      const rec = item as Record<string, unknown>
      return { id: String(rec.id ?? '').padStart(4, '0'), reason: String(rec.reason ?? '').trim() }
    })
    .filter((p) => valid.has(p.id))
    .slice(0, 3)
}
