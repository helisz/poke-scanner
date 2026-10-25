<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Eye, EyeOff, Loader2, Play } from 'lucide-vue-next'
import type { AiConfig, ProviderKind, VoiceEngine } from '@/lib/ai'
import { resolveProvider } from '@/lib/ai'
import { useSettings } from '@/composables/useSettings'
import { isBrowserSpeechSupported, speak, stopSpeaking, unlockBrowserSpeech } from '@/lib/tts'
import Dialog from '@/components/ui/Dialog.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { config, update, reset } = useSettings()
const draft = ref<AiConfig>({ ...config.value, voice: { ...config.value.voice } })
const showKey = ref(false)

const previewing = ref(false)
const previewNote = ref<string | null>(null)

// `voice` is a nested object, so a shallow spread would let edits mutate the
// live config before the user saves. Clone it explicitly.
watch(
  () => props.open,
  (open) => {
    if (open) {
      draft.value = { ...config.value, voice: { ...config.value.voice } }
      previewNote.value = null
    }
  },
)

const detected = computed<ProviderKind>(() => resolveProvider(draft.value))
const options: Array<{ value: AiConfig['provider']; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
]

const voiceOptions: Array<{ value: VoiceEngine; label: string }> = [
  { value: 'cloud', label: '云端语音' },
  { value: 'browser', label: '系统语音' },
  { value: 'off', label: '关闭' },
]

const browserSpeechAvailable = computed(() => isBrowserSpeechSupported())
const usesGemini = computed(() => detected.value === 'gemini')

/**
 * Previews with the *saved* endpoint but the *draft* voice settings, so the
 * user hears the voice they are about to pick. This click is also the user
 * gesture iOS/Safari require before any speech will play.
 */
async function preview() {
  previewNote.value = null
  unlockBrowserSpeech()

  previewing.value = true
  try {
    const sample = '首选皮卡丘。备选雷丘、帕奇利兹。'
    const engine = draft.value.voice.engine === 'off' ? 'browser' : draft.value.voice.engine
    const outcome = await speak(sample, { ...config.value, voice: { ...draft.value.voice, engine } })
    if (outcome.fallbackReason) {
      previewNote.value = `云端语音不可用，已回落到系统语音（${outcome.fallbackReason}）`
    } else if (!outcome.played) {
      previewNote.value = '没有可用的语音引擎。'
    }
  } catch (err) {
    previewNote.value = err instanceof Error ? err.message : String(err)
  } finally {
    previewing.value = false
  }
}

function save() {
  update(draft.value)
  emit('update:open', false)
}

function restore() {
  reset()
  draft.value = { ...config.value, voice: { ...config.value.voice } }
}

onBeforeUnmount(() => stopSpeaking())

function onDialogOpen(value: boolean) {
  emit('update:open', value)
}
</script>

<template>
  <Dialog
    :open="props.open"
    title="接口设置"
    description="识别请求直接发送到你自己的代理地址，密钥仅保存在本机浏览器。"
    @update:open="onDialogOpen"
  >
    <div class="space-y-5">
      <div class="space-y-2">
        <label for="base-url" class="text-xs font-medium text-muted-foreground">Base URL</label>
        <Input id="base-url" v-model="draft.baseUrl" type="url" placeholder="https://your-proxy.example.com/v1" />
        <p class="text-[11px] leading-relaxed text-muted-foreground/80">
          OpenAI 兼容地址会自动补 <code class="rounded bg-secondary px-1 font-mono">/chat/completions</code>；
          Gemini 会自动补 <code class="rounded bg-secondary px-1 font-mono">/models/…:generateContent</code>。
        </p>
      </div>

      <div class="space-y-2">
        <label for="api-key" class="text-xs font-medium text-muted-foreground">API Key</label>
        <div class="relative">
          <Input
            id="api-key"
            v-model="draft.apiKey"
            :type="showKey ? 'text' : 'password'"
            placeholder="sk-… 或代理方要求的令牌"
            class="pr-10"
          />
          <button
            type="button"
            class="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
            :aria-label="showKey ? '隐藏密钥' : '显示密钥'"
            @click="showKey = !showKey"
          >
            <EyeOff v-if="showKey" class="size-4" />
            <Eye v-else class="size-4" />
          </button>
        </div>
      </div>

      <div class="space-y-2">
        <label for="model" class="text-xs font-medium text-muted-foreground">模型名称</label>
        <Input id="model" v-model="draft.model" placeholder="gpt-4o-mini / gemini-2.0-flash" />
      </div>

      <div class="space-y-2">
        <span class="text-xs font-medium text-muted-foreground">接口类型</span>
        <div class="flex gap-1.5">
          <button
            v-for="opt in options"
            :key="opt.value"
            type="button"
            :class="
              cn(
                'flex-1 rounded-lg border px-3 py-2 text-xs transition',
                draft.provider === opt.value
                  ? 'border-primary/60 bg-primary/12 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary/60',
              )
            "
            @click="draft.provider = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
        <p class="text-[11px] text-muted-foreground/80">当前实际使用：{{ detected }}</p>
      </div>

      <!-- ---------------- voice announcement ---------------- -->
      <div class="space-y-3 border-t border-border/60 pt-4">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-muted-foreground">结果语音播报</span>
          <Button
            variant="outline"
            size="sm"
            class="shrink-0"
            :disabled="previewing"
            @click="preview"
          >
            <Loader2 v-if="previewing" class="size-3.5 animate-spin" />
            <Play v-else class="size-3.5" />
            {{ previewing ? '播放中' : '试听' }}
          </Button>
        </div>

        <div class="flex gap-1.5">
          <button
            v-for="opt in voiceOptions"
            :key="opt.value"
            type="button"
            :class="
              cn(
                'flex-1 rounded-lg border px-3 py-2 text-xs transition',
                draft.voice.engine === opt.value
                  ? 'border-primary/60 bg-primary/12 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary/60',
              )
            "
            @click="draft.voice.engine = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>

        <div v-if="draft.voice.engine === 'cloud'" class="space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <div class="space-y-1.5">
              <label for="tts-model" class="text-[11px] text-muted-foreground">语音模型</label>
              <Input id="tts-model" v-model="draft.voice.model" placeholder="tts-1" />
            </div>
            <div class="space-y-1.5">
              <label for="tts-voice" class="text-[11px] text-muted-foreground">音色</label>
              <Input
                id="tts-voice"
                v-model="draft.voice.voice"
                :placeholder="usesGemini ? 'Kore' : 'alloy'"
              />
            </div>
          </div>
          <p class="text-[11px] leading-relaxed text-muted-foreground/80">
            使用上面的 Base URL 与 API Key 调用
            <code class="rounded bg-secondary px-1 font-mono">{{ usesGemini ? ':generateContent' : '/audio/speech' }}</code>。
            代理若未开放该接口，会自动回落到系统语音。
          </p>
        </div>

        <div v-else-if="draft.voice.engine === 'browser'" class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <label for="tts-rate" class="text-[11px] text-muted-foreground">语速 {{ draft.voice.rate.toFixed(1) }}×</label>
          </div>
          <input
            id="tts-rate"
            v-model.number="draft.voice.rate"
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            class="w-full accent-primary"
          />
          <p class="text-[11px] leading-relaxed text-muted-foreground/80">
            使用设备自带的语音合成，无需联网。
            <span v-if="!browserSpeechAvailable" class="text-destructive">当前浏览器不支持语音合成。</span>
          </p>
        </div>

        <p v-else class="text-[11px] leading-relaxed text-muted-foreground/80">
          识别结果不会再朗读，屏幕阅读器仍会收到文字摘要。
        </p>

        <p v-if="previewNote" class="break-words text-[11px] text-accent">{{ previewNote }}</p>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" @click="restore">恢复默认</Button>
        <div class="flex gap-2">
          <Button variant="outline" @click="emit('update:open', false)">取消</Button>
          <Button @click="save">保存</Button>
        </div>
      </div>
    </template>
  </Dialog>
</template>
