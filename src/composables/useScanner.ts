/**
 * Scan pipeline orchestration.
 *
 *   upload -> prepareImage -> stage A (describe) -> stage B (local score) -> stage C (rerank)
 *
 * Design choices that matter:
 *  - Stage C failure is never fatal: the local ranking is already useful, so a
 *    rerank error downgrades the result instead of breaking the scan.
 *  - Stage A failure IS fatal: without a description there is nothing to match.
 *  - Progress is exposed per stage so the UI can show real work, not a spinner.
 */
import { computed, ref } from 'vue'
import type { Candidate, SubjectTraits } from '@/lib/types'
import { describeImage, isConfigured, rerankCandidates, type AiConfig } from '@/lib/ai'
import { resultConfidence, scoreCandidates } from '@/lib/matcher'
import { getPokemon } from '@/data'
import { prepareImage, type PreparedImage } from '@/lib/image'

export type ScanStage = 'idle' | 'preparing' | 'describing' | 'matching' | 'reranking' | 'done' | 'error'

export interface ScanError {
  title: string
  message: string
  detail?: string
}

const EMPTY_BREAKDOWN = { name: 0, animal: 0, type: 0, anatomy: 0, shape: 0, color: 0, category: 0, text: 0 }

export function useScanner() {
  const stage = ref<ScanStage>('idle')
  const error = ref<ScanError | null>(null)
  const image = ref<PreparedImage | null>(null)
  const traits = ref<SubjectTraits | null>(null)
  const candidates = ref<Candidate[]>([])
  const selected = ref<Candidate | null>(null)
  const reranked = ref(false)
  const rerankWarning = ref<string | null>(null)
  const elapsedMs = ref(0)
  const confidence = ref(0)

  const busy = computed(() => ['preparing', 'describing', 'matching', 'reranking'].includes(stage.value))
  const hasResult = computed(() => stage.value === 'done' && candidates.value.length > 0)
  const uncertain = computed(() => hasResult.value && confidence.value < 0.45)

  const stageLabel = computed(() => {
    switch (stage.value) {
      case 'preparing': return '正在处理图片…'
      case 'describing': return '正在识别画面主体…'
      case 'matching': return '正在比对图鉴数据…'
      case 'reranking': return '正在精排候选…'
      case 'done': return '识别完成'
      default: return ''
    }
  })

  function reset() {
    stage.value = 'idle'
    error.value = null
    image.value = null
    traits.value = null
    candidates.value = []
    selected.value = null
    reranked.value = false
    rerankWarning.value = null
    elapsedMs.value = 0
    confidence.value = 0
  }

  function fail(title: string, message: string, detail?: string) {
    stage.value = 'error'
    error.value = { title, message, detail }
  }

  async function loadImage(file: File) {
    reset()
    stage.value = 'preparing'
    try {
      image.value = await prepareImage(file)
      stage.value = 'idle'
    } catch (err) {
      fail('图片处理失败', err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  /** Rebuilds the ordering from the model's picks, keeping local data intact. */
  function applyRerank(local: Candidate[], picks: Array<{ id: string; reason: string }>): Candidate[] {
    const byId = new Map(local.map((c) => [c.pokemon.id, c]))
    const top: Candidate[] = []
    for (const pick of picks) {
      const existing = byId.get(pick.id)
      if (existing) {
        top.push({ ...existing, reasons: pick.reason ? [pick.reason, ...existing.reasons] : existing.reasons, reranked: true })
        continue
      }
      const pk = getPokemon(pick.id)
      if (pk) {
        top.push({
          pokemon: pk,
          score: 0,
          confidence: 0,
          reasons: pick.reason ? [pick.reason] : [],
          breakdown: { ...EMPTY_BREAKDOWN },
          reranked: true,
        })
      }
    }
    const seen = new Set(top.map((c) => c.pokemon.id))
    return [...top, ...local.filter((c) => !seen.has(c.pokemon.id))]
  }

  async function run(config: AiConfig, hint?: string) {
    if (!image.value) return fail('还没有图片', '请先上传一张图片。')
    if (!isConfigured(config)) return fail('尚未配置接口', '请先在设置中填写 Base URL、API Key 与模型名称。')

    const startedAt = performance.now()
    error.value = null
    rerankWarning.value = null
    reranked.value = false
    candidates.value = []
    selected.value = null

    // ---- stage A: vision describe ---------------------------------------
    stage.value = 'describing'
    try {
      traits.value = await describeImage({ imageDataUrl: image.value.dataUrl, config, hint })
    } catch (err) {
      return fail('识别失败', err instanceof Error ? err.message : String(err), (err as { detail?: string }).detail)
    }

    // ---- stage B: local deterministic scoring ---------------------------
    stage.value = 'matching'
    // Yield once so the progress UI paints before the 1025-species loop.
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    const local = scoreCandidates(traits.value, { limit: 24 })
    if (!local.length) return fail('没有匹配结果', '无法在本地图鉴中找到候选，请换一张图片试试。')

    // ---- stage C: LLM rerank (best effort) ------------------------------
    stage.value = 'reranking'
    let final = local
    try {
      const picks = await rerankCandidates(traits.value, local.slice(0, 18), config)
      if (picks.length >= 2) {
        final = applyRerank(local, picks)
        reranked.value = true
      } else {
        rerankWarning.value = '精排未返回足够候选，已使用本地排序结果。'
      }
    } catch (err) {
      rerankWarning.value = `精排失败，已使用本地排序结果（${err instanceof Error ? err.message : String(err)}）`
    }

    candidates.value = final
    confidence.value = resultConfidence(traits.value, final)
    elapsedMs.value = Math.round(performance.now() - startedAt)
    stage.value = 'done'
  }

  function select(candidate: Candidate) {
    selected.value = candidate
  }

  return {
    stage, error, image, traits, candidates, selected,
    reranked, rerankWarning, elapsedMs, confidence,
    busy, hasResult, uncertain, stageLabel,
    reset, loadImage, run, select, fail,
  }
}
