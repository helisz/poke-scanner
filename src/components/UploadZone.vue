<script setup lang="ts">
import { ref } from 'vue'
import { ImagePlus, ScanLine, Upload } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button.vue'

const props = withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ file: [file: File] }>()

const dragging = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

function pick() {
  if (props.disabled) return
  inputRef.value?.click()
}

function onChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('file', file)
  // reset so re-picking the same file still fires a change event
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  if (props.disabled) return
  const file = event.dataTransfer?.files?.[0]
  if (file) emit('file', file)
}

function onPaste(event: ClipboardEvent) {
  if (props.disabled) return
  const item = Array.from(event.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
  const file = item?.getAsFile()
  if (file) emit('file', file)
}
</script>

<template>
  <div
    :class="
      cn(
        'relative overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-300',
        dragging ? 'border-accent bg-accent/10 scale-[1.01]' : 'border-border/80 hover:border-primary/50 hover:bg-secondary/20',
        props.disabled && 'pointer-events-none opacity-60',
      )
    "
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
    @paste="onPaste"
    tabindex="0"
    role="button"
    aria-label="上传图片"
    @click="pick"
    @keydown.enter.prevent="pick"
    @keydown.space.prevent="pick"
  >
    <div class="flex flex-col items-center gap-5 px-5 py-12 text-center sm:gap-6 sm:px-8 sm:py-24">
      <div class="relative">
        <div class="absolute inset-0 animate-ping rounded-2xl bg-primary/15" />
        <div class="relative grid size-16 place-items-center rounded-2xl border border-border bg-secondary/70 sm:size-20">
          <ImagePlus class="size-7 text-primary sm:size-9" />
        </div>
      </div>

      <div class="space-y-2">
        <p class="text-lg font-semibold tracking-tight sm:text-xl">拖入图片，或点击选择</p>
        <p class="text-[13px] text-muted-foreground sm:text-sm">
          支持 JPG / PNG / WebP<span class="hidden sm:inline">，也可以直接 <kbd class="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-xs">⌘V</kbd> 粘贴截图</span>
        </p>
      </div>

      <Button size="lg" variant="default" class="w-full max-w-56" @click.stop="pick">
        <Upload class="size-4" />
        选择图片
      </Button>

      <div class="flex items-center gap-2 text-center text-[11px] text-muted-foreground/70 sm:text-xs">
        <ScanLine class="size-3.5 shrink-0" />
        图片在本地压缩后才会发送，最大 20MB
      </div>
    </div>

    <!-- `capture` is intentionally omitted: on a phone we want the photo library
         picker, not an immediate camera launch. -->
    <input ref="inputRef" type="file" accept="image/*" class="sr-only" @change="onChange" />
  </div>
</template>
