<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import type { AiConfig, ProviderKind } from '@/lib/ai'
import { resolveProvider } from '@/lib/ai'
import { useSettings } from '@/composables/useSettings'
import Dialog from '@/components/ui/Dialog.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { config, update, reset } = useSettings()
const draft = ref<AiConfig>({ ...config.value })
const showKey = ref(false)

watch(
  () => props.open,
  (open) => {
    if (open) draft.value = { ...config.value }
  },
)

const detected = computed<ProviderKind>(() => resolveProvider(draft.value))
const options: Array<{ value: AiConfig['provider']; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
]

function save() {
  update(draft.value)
  emit('update:open', false)
}

function restore() {
  reset()
  draft.value = { ...config.value }
}

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
