<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    modelValue?: string | number
    class?: string
    type?: string
    placeholder?: string
    autocomplete?: string
    id?: string
  }>(),
  { modelValue: '', class: '', type: 'text', placeholder: '', autocomplete: 'off', id: undefined },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const classes = computed(() =>
  cn(
    'h-10 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm text-foreground shadow-inner shadow-black/10 outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-50',
    props.class,
  ),
)

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <input
    :id="props.id"
    :class="classes"
    :type="props.type"
    :value="props.modelValue"
    :placeholder="props.placeholder"
    :autocomplete="props.autocomplete"
    spellcheck="false"
    @input="onInput"
  />
</template>
