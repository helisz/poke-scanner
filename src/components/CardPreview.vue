<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Download, Hand, Loader2, Maximize2, X } from 'lucide-vue-next'
import type { Candidate } from '@/lib/types'
import { downloadCard, renderCardToDataUrl, type CardInput } from '@/lib/exportCard'
import Button from '@/components/ui/Button.vue'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ candidate: Candidate; thumbnail: string; confidence: number }>()

const imageUrl = ref('')
const rendering = ref(true)
const saving = ref(false)
const zoomed = ref(false)
const toast = useToast()

/**
 * Touch-first devices get an explicit long-press instruction; a mouse user would
 * read "长按保存" as broken advice, so the hint is gated rather than always shown.
 *
 * Both signals are checked: `pointer: coarse` is the accurate one but some
 * Android WebViews mis-report `pointer: fine`, so a phone-width viewport also
 * qualifies. Width alone would be wrong on a narrow desktop window, hence the
 * OR rather than a single condition.
 */
const isTouch = ref(false)

function detectTouch() {
  const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  isTouch.value = coarse || window.innerWidth < 640
}

onMounted(() => {
  detectTouch()
  window.addEventListener('resize', detectTouch)
})

const fileName = computed(
  () => `pokedex-${props.candidate.pokemon.id}-${props.candidate.pokemon.name}.png`,
)

/**
 * Rendered as a `<img>` with a `data:` source rather than a `<canvas>`.
 * A canvas has no long-press "save image" action on mobile; an image does, and
 * a data URL survives that save sheet on iOS Safari and Android Chrome alike.
 */
function input(): CardInput {
  return {
    pokemon: props.candidate.pokemon,
    thumbnail: props.thumbnail,
    confidence: props.confidence,
    reasons: props.candidate.reasons,
  }
}

async function draw() {
  rendering.value = true
  try {
    imageUrl.value = await renderCardToDataUrl(input())
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

function lockScroll(locked: boolean) {
  document.body.style.overflow = locked ? 'hidden' : ''
}

watch(zoomed, (open) => lockScroll(open))

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') zoomed.value = false
}

watch(zoomed, (open) => {
  if (open) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})

watch(() => props.candidate.pokemon.id, draw)
watch(() => props.confidence, draw)

draw()

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', detectTouch)
  lockScroll(false)
})
</script>

<template>
  <div class="space-y-3">
    <div class="relative overflow-hidden rounded-2xl border border-border/70 bg-black/40 shadow-2xl">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="`${props.candidate.pokemon.name} 图鉴卡片`"
        class="block h-auto w-full touch-manipulation select-auto"
        draggable="false"
      />
      <div v-else class="aspect-[4/5] w-full" />

      <!-- tap to open full screen -->
      <button
        v-if="imageUrl"
        type="button"
        class="absolute right-2 top-2 grid size-9 place-items-center rounded-full border border-white/20 bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/75"
        aria-label="全屏查看"
        @click="zoomed = true"
      >
        <Maximize2 class="size-4" />
      </button>

      <div v-if="rendering" class="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm">
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 class="size-4 animate-spin" />
          正在生成卡片…
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Button :disabled="saving || rendering" size="lg" class="flex-1" @click="save">
        <Loader2 v-if="saving" class="size-4 animate-spin" />
        <Download v-else class="size-4" />
        {{ saving ? '正在导出…' : '下载图鉴卡片' }}
      </Button>
      <Button v-if="imageUrl" variant="outline" size="lg" @click="zoomed = true">
        <Maximize2 class="size-4" />
        全屏
      </Button>
    </div>

    <!-- Touch devices only: long-press is meaningless with a mouse. -->
    <p
      v-if="isTouch"
      class="flex items-start gap-1.5 rounded-lg border border-accent/25 bg-accent/8 px-3 py-2 text-[11px] leading-relaxed text-foreground/80"
    >
      <Hand class="mt-0.5 size-3.5 shrink-0 text-accent" />
      <span>
        <strong class="font-semibold text-foreground">长按上方卡片图片</strong>即可保存到相册；也可以点「下载图鉴卡片」。
      </span>
    </p>
  </div>

  <!-- full-screen viewer -->
  <Teleport to="body">
    <div
      v-if="zoomed && imageUrl"
      class="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="图鉴卡片全屏预览"
    >
      <div class="flex items-center justify-between gap-3 px-3 pt-3 pb-2">
        <p class="truncate text-xs font-medium text-white/70">{{ fileName }}</p>
        <button
          type="button"
          class="grid size-9 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
          aria-label="关闭"
          @click="zoomed = false"
        >
          <X class="size-4" />
        </button>
      </div>

      <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2">
        <img
          :src="imageUrl"
          :alt="`${props.candidate.pokemon.name} 图鉴卡片`"
          class="max-h-full w-auto max-w-full select-auto rounded-lg"
          draggable="false"
        />
      </div>

      <div class="space-y-2 px-3 pt-2 pb-4">
        <p v-if="isTouch" class="text-center text-[11px] leading-relaxed text-white/60">
          长按图片可直接保存到相册
        </p>
        <Button :disabled="saving" size="lg" class="w-full" @click="save">
          <Loader2 v-if="saving" class="size-4 animate-spin" />
          <Download v-else class="size-4" />
          {{ saving ? '正在导出…' : '保存图片' }}
        </Button>
      </div>
    </div>
  </Teleport>
</template>
