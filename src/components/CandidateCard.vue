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
        'group relative block w-full max-w-full overflow-hidden rounded-2xl border text-left transition-all duration-300',
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

    <!-- Mobile keeps the rank badge and artwork on one row, with the score
         compacted under the artwork so the name column keeps usable width. -->
    <div class="relative flex items-start gap-2.5 p-3 sm:items-center sm:gap-4 sm:p-3.5">
      <div class="relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-border/60 bg-background/50 sm:mt-0 sm:size-9">
        <Trophy v-if="rank === 1" class="size-3.5 text-accent sm:size-4" />
        <span v-else class="font-mono text-xs text-muted-foreground sm:text-sm">{{ rank }}</span>
      </div>

      <div class="shrink-0">
        <div
          class="relative size-14 rounded-xl border border-border/50 sm:size-20"
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
        <!-- score moves here on small screens -->
        <div class="mt-1 text-center sm:hidden">
          <span class="font-mono text-xs font-semibold" :style="{ color: accent.solid }">
            {{ Math.round(props.candidate.confidence * 100) }}%
          </span>
        </div>
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-baseline gap-1.5">
          <span class="min-w-0 truncate text-base font-semibold tracking-tight sm:text-lg">{{ pokemon.name }}</span>
          <span class="shrink-0 font-mono text-[11px] text-muted-foreground sm:text-xs">#{{ pokemon.id }}</span>
        </div>
        <p class="truncate text-[11px] text-muted-foreground sm:text-xs">{{ pokemon.nameEn }} · {{ pokemon.category }}</p>

        <div class="mt-1 flex flex-wrap items-center gap-1 sm:mt-1.5 sm:gap-1.5">
          <Badge v-for="t in pokemon.types" :key="t" :type="t" solid>{{ t }}</Badge>
          <span
            v-if="props.candidate.reranked"
            class="inline-flex items-center gap-1 text-[10px] text-accent sm:text-[11px]"
            title="已由大模型精排"
          >
            <Sparkles class="size-3 shrink-0" />精排
          </span>
        </div>

        <p v-if="props.candidate.reasons.length" class="mt-1 truncate text-[11px] text-foreground/60 sm:mt-1.5 sm:text-xs">
          {{ props.candidate.reasons.slice(0, 2).join(' · ') }}
        </p>
      </div>

      <div class="hidden shrink-0 text-right sm:block">
        <div class="font-mono text-sm font-semibold" :style="{ color: accent.solid }">
          {{ Math.round(props.candidate.confidence * 100) }}%
        </div>
        <div class="text-[10px] uppercase tracking-wider text-muted-foreground">相似度</div>
      </div>
    </div>
  </button>
</template>
