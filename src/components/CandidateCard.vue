<script setup lang="ts">
import { computed } from 'vue'
import { Sparkles, Trophy } from 'lucide-vue-next'
import type { Candidate } from '@/lib/types'
import { artworkUrl } from '@/data'
import { typeGradient, typeTheme } from '@/lib/pokemon-types'
import { cn } from '@/lib/utils'
import Badge from '@/components/ui/Badge.vue'

const props = withDefaults(
  defineProps<{ candidate: Candidate; rank: number; selected?: boolean }>(),
  { selected: false },
)
const emit = defineEmits<{ select: [candidate: Candidate] }>()

const pokemon = computed(() => props.candidate.pokemon)
const accent = computed(() => typeTheme(pokemon.value.types[0]))
const gradient = computed(() => typeGradient(pokemon.value.types))
</script>

<template>
  <button
    type="button"
    :class="
      cn(
        'group relative w-full overflow-hidden rounded-2xl border text-left transition-all duration-300',
        props.selected
          ? 'border-primary/70 ring-2 ring-primary/40 shadow-xl shadow-primary/10'
          : 'border-border/70 hover:border-border hover:bg-secondary/25',
      )
    "
    @click="emit('select', props.candidate)"
  >
    <!-- type-coloured wash -->
    <div
      class="absolute inset-0 opacity-[0.13] transition-opacity duration-300 group-hover:opacity-[0.22]"
      :style="{ background: gradient }"
    />

    <div class="relative flex items-center gap-4 p-3.5">
      <div class="relative grid size-9 shrink-0 place-items-center rounded-lg border border-border/60 bg-background/50">
        <Trophy v-if="rank === 1" class="size-4 text-accent" />
        <span v-else class="font-mono text-sm text-muted-foreground">{{ rank }}</span>
      </div>

      <div
        class="relative size-20 shrink-0 rounded-xl border border-border/50"
        :style="{ backgroundColor: `${accent.solid}1f` }"
      >
        <img
          :src="artworkUrl(pokemon)"
          :alt="pokemon.name"
          class="size-full object-contain p-1 transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          draggable="false"
        />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <span class="truncate text-lg font-semibold tracking-tight">{{ pokemon.name }}</span>
          <span class="font-mono text-xs text-muted-foreground">#{{ pokemon.id }}</span>
        </div>
        <p class="truncate text-xs text-muted-foreground">{{ pokemon.nameEn }} · {{ pokemon.category }}</p>

        <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge v-for="t in pokemon.types" :key="t" :type="t" solid>{{ t }}</Badge>
          <span
            v-if="props.candidate.reranked"
            class="inline-flex items-center gap-1 text-[11px] text-accent"
            title="已由大模型精排"
          >
            <Sparkles class="size-3" />精排
          </span>
        </div>

        <p v-if="props.candidate.reasons.length" class="mt-1.5 truncate text-xs text-foreground/60">
          {{ props.candidate.reasons.slice(0, 2).join(' · ') }}
        </p>
      </div>

      <div class="shrink-0 text-right">
        <div class="font-mono text-sm font-semibold" :style="{ color: accent.solid }">
          {{ Math.round(props.candidate.confidence * 100) }}%
        </div>
        <div class="text-[10px] uppercase tracking-wider text-muted-foreground">相似度</div>
      </div>
    </div>
  </button>
</template>
