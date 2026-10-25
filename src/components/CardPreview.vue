<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { Download, Loader2 } from 'lucide-vue-next'
import type { Candidate } from '@/lib/types'
import { downloadCard, renderCard, type CardInput } from '@/lib/exportCard'
import Button from '@/components/ui/Button.vue'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ candidate: Candidate; thumbnail: string; confidence: number }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const rendering = ref(true)
const saving = ref(false)
const toast = useToast()

function input(): CardInput {
  return {
    pokemon: props.candidate.pokemon,
    thumbnail: props.thumbnail,
    confidence: props.confidence,
    reasons: props.candidate.reasons,
  }
}

async function draw() {
  if (!canvasRef.value) return
  rendering.value = true
  try {
    await renderCard(canvasRef.value, input())
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '卡片渲染失败')
  } finally {
    rendering.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await downloadCard(input())
    toast.success(`已下载 ${props.candidate.pokemon.name} 的图鉴卡片`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '下载失败')
  } finally {
    saving.value = false
  }
}

onMounted(draw)
watch(() => props.candidate.pokemon.id, draw)
onBeforeUnmount(() => {
  // release the backing store of a large canvas
  const c = canvasRef.value
  if (c) {
    c.width = 0
    c.height = 0
  }
})
</script>

<template>
  <div class="space-y-4">
    <div class="relative overflow-hidden rounded-2xl border border-border/70 bg-black/40 shadow-2xl">
      <canvas ref="canvasRef" class="block h-auto w-full" />

      <div v-if="rendering" class="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm">
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 class="size-4 animate-spin" />
          正在生成卡片…
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <Button :disabled="saving || rendering" size="lg" class="flex-1" @click="save">
        <Loader2 v-if="saving" class="size-4 animate-spin" />
        <Download v-else class="size-4" />
        {{ saving ? '正在导出…' : '下载图鉴卡片' }}
      </Button>
      <p class="text-xs text-muted-foreground">1080 × 1350 PNG</p>
    </div>
  </div>
</template>
