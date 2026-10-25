<script setup lang="ts">
import { CircleAlert, CheckCircle2, Info, X } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import { cn } from '@/lib/utils'

const { toasts, dismiss } = useToast()
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-0 z-100 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6">
    <TransitionGroup
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-y-3 opacity-0"
      leave-active-class="transition duration-200 ease-in"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="
          cn(
            'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-md',
            toast.kind === 'success' && 'border-emerald-500/30 bg-emerald-500/12 text-emerald-100',
            toast.kind === 'error' && 'border-destructive/40 bg-destructive/15 text-red-100',
            toast.kind === 'info' && 'border-border bg-secondary/85 text-foreground',
          )
        "
      >
        <CheckCircle2 v-if="toast.kind === 'success'" class="mt-0.5 size-4 shrink-0" />
        <CircleAlert v-else-if="toast.kind === 'error'" class="mt-0.5 size-4 shrink-0" />
        <Info v-else class="mt-0.5 size-4 shrink-0" />
        <span class="flex-1 leading-relaxed">{{ toast.message }}</span>
        <button
          type="button"
          class="shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"
          aria-label="关闭"
          @click="dismiss(toast.id)"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
