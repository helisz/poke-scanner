<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { typeTheme } from '@/lib/pokemon-types'

const props = withDefaults(
  defineProps<{
    /** Pokémon type name; when given the badge is tinted by that type. */
    type?: string
    class?: string
    /** Renders with the type's solid colour as background. */
    solid?: boolean
  }>(),
  { type: undefined, class: '', solid: false },
)

const style = computed(() => {
  if (!props.type) return undefined
  const t = typeTheme(props.type)
  return props.solid
    ? { backgroundColor: t.solid, color: t.on, borderColor: 'transparent' }
    : { color: t.solid, borderColor: `${t.solid}66`, backgroundColor: `${t.solid}1a` }
})
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide',
        !props.type && 'border-border bg-secondary/70 text-secondary-foreground',
        props.class,
      )
    "
    :style="style"
  >
    <slot />
  </span>
</template>
