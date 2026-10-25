import { ref } from 'vue'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}

/** Minimal shared toast queue — replaces the sonner dependency for one use case. */
const toasts = ref<Toast[]>([])
let nextId = 1

function push(kind: Toast['kind'], message: string, duration = 4000) {
  const id = nextId++
  toasts.value = [...toasts.value, { id, kind, message }]
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, duration)
}

export function useToast() {
  return {
    toasts,
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message, 6000),
    info: (message: string) => push('info', message),
    dismiss: (id: number) => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    },
  }
}
