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
    <div class="flex flex-col items-center gap-6 px-8 py-16 text-center sm:py-24">
      <div class="relative">
        <div class="absolute inset-0 animate-ping rounded-2xl bg-primary/15" />
        <div class="relative grid size-20 place-items-center rounded-2xl border border-border bg-secondary/70">
          <ImagePlus class="size-9 text-primary" />
        </div>
      </div>

      <div class="space-y-2">
        <p class="text-xl font-semibold tracking-tight">拖入图片，或点击选择</p>
        <p class="text-sm text-muted-foreground">
          支持 JPG / PNG / WebP，也可以直接 <kbd class="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-xs">⌘V</kbd> 粘贴截图
        </p>
      </div>

      <Button size="lg" variant="default" @click.stop="pick">
        <Upload class="size-4" />
        选择图片
      </Button>

      <div class="flex items-center gap-2 text-xs text-muted-foreground/70">
        <ScanLine class="size-3.5" />
        图片在本地压缩后才会发送，最大 20MB
      </div>
    </div>

    <input ref="inputRef" type="file" accept="image/*" class="sr-only" @change="onChange" />
  </div>
</template>
