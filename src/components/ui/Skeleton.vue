<script setup lang="ts">
defineProps<{ class?: string }>()
</script>

<template>
  <div :class="['animate-pulse rounded-lg bg-secondary/70', $props.class]" />
</template>
