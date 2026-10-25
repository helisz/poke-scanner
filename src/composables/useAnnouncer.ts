/**
 * Speaks the scan result once it lands.
 *
 * The announcer is a pure consumer of scanner state: it watches `stage` cross
 * into `done` and never touches the pipeline. Three behaviours matter:
 *
 *  - **Cancellation.** Starting a new scan, resetting, or unmounting stops any
 *    in-flight speech immediately. Audio that outlives its result is worse than
 *    no audio at all.
 *  - **Dedupe.** Re-renders and HMR must not repeat the sentence. The result
 *    signature is cleared as soon as the stage leaves `done`, so a genuine
 *    re-scan of the same photo still speaks.
 *  - **Silence is a bug.** Every failure path is surfaced through `warning`
 *    instead of being swallowed, because the user asked to hear the result.
 */
import { ref, watch, type Ref } from 'vue'
import type { AiConfig } from '@/lib/ai'
import type { Candidate } from '@/lib/types'
import type { ScanStage } from '@/composables/useScanner'
import { composeAnnouncement } from '@/lib/announce'
import { speak, stopSpeaking } from '@/lib/tts'

interface AnnouncerOptions {
  stage: Ref<ScanStage>
  candidates: Ref<Candidate[]>
  uncertain: Ref<boolean>
  config: Ref<AiConfig>
}

export function useAnnouncer(options: AnnouncerOptions) {
  /** Mirrored into an `aria-live` region, so it must always hold current text. */
  const text = ref('')
  const speaking = ref(false)
  /** Non-fatal problem, e.g. the proxy has no audio route and we fell back. */
  const warning = ref<string | null>(null)

  let lastSignature = ''
  // Guards against a stale `await` resuming after a newer scan took over.
  let token = 0

  function cancel() {
    token++
    stopSpeaking()
    speaking.value = false
  }

  async function announce(force = false) {
    const config = options.config.value
    const composed = composeAnnouncement(options.candidates.value, {
      uncertain: options.uncertain.value,
    })

    // The live region always reflects the result, even with voice switched off:
    // assistive tech should hear the outcome regardless of the audio preference.
    text.value = composed.text

    if (config.voice.engine === 'off') return
    if (!composed.text) return
    if (!force && composed.signature === lastSignature) return

    lastSignature = composed.signature
    const current = ++token
    speaking.value = true
    warning.value = null

    try {
      const outcome = await speak(composed.text, config)
      if (current !== token) return // a newer scan superseded this one
      if (outcome.fallbackReason) warning.value = outcome.fallbackReason
      else if (!outcome.played) warning.value = '未能播放语音。'
    } catch (err) {
      if (current !== token) return
      warning.value = err instanceof Error ? err.message : String(err)
    } finally {
      if (current === token) speaking.value = false
    }
  }

  /** Manual re-read, e.g. a speaker button on the results header. */
  function replay() {
    cancel()
    void announce(true)
  }

  watch(
    () => options.stage.value,
    (stage) => {
      if (stage === 'done') {
        void announce()
        return
      }
      // Leaving `done` means the result on screen is gone: stop talking and let
      // the next scan announce again even if it lands on the same signature.
      lastSignature = ''
      cancel()
    },
  )

  return { text, speaking, warning, announce, replay, cancel }
}
