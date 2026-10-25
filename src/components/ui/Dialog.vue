<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    description?: string
    class?: string
  }>(),
  { title: '', description: '', class: '' },
)

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

function close() {
  emit('update:open', false)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

// Lock body scroll and bind Esc while open.
watch(
  () => props.open,
  (open) => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div v-if="props.open" class="fixed inset-0 z-90 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="close" />

        <Transition
          appear
          enter-active-class="transition duration-250 ease-out"
          enter-from-class="translate-y-4 scale-97 opacity-0"
        >
          <div
            role="dialog"
            aria-modal="true"
            :class="
              cn(
                'relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl',
                props.class,
              )
            "
          >
            <div class="flex items-start justify-between gap-4 border-b border-border/70 px-6 py-4">
              <div class="space-y-1">
                <h2 v-if="props.title" class="text-base font-semibold tracking-tight">{{ props.title }}</h2>
                <p v-if="props.description" class="text-xs text-muted-foreground">{{ props.description }}</p>
              </div>
              <button
                type="button"
                class="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                aria-label="关闭"
                @click="close"
              >
                <X class="size-4" />
              </button>
            </div>

            <div class="max-h-[70vh] overflow-y-auto px-6 py-5">
              <slot />
            </div>

            <div v-if="$slots.footer" class="border-t border-border/70 px-6 py-4">
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
