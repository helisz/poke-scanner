<script setup lang="ts">
import { computed, ref } from 'vue'
import { CircleAlert, RotateCcw, Settings2, Sparkles, RefreshCw, Trash2, CircleHelp, ChevronDown } from 'lucide-vue-next'
import { POKEMON_COUNT } from '@/data'
import { useScanner } from '@/composables/useScanner'
import { useSettings } from '@/composables/useSettings'
import { describeTraits } from '@/lib/matcher'
import UploadZone from '@/components/UploadZone.vue'
import CandidateCard from '@/components/CandidateCard.vue'
import CardPreview from '@/components/CardPreview.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import Toaster from '@/components/Toaster.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'

const scanner = useScanner()
const { config, configured } = useSettings()
const toast = useToast()

const settingsOpen = ref(false)
const hint = ref('')

const {
  stage, error, image, traits, candidates, selected,
  reranked, rerankWarning, elapsedMs, confidence,
  busy, hasResult, uncertain, stageLabel,
} = scanner

const detectedTags = computed(() => (traits.value ? describeTraits(traits.value) : []))
const topThree = computed(() => candidates.value.slice(0, 3))
const moreCandidates = computed(() => candidates.value.slice(3, 12))

async function onFile(file: File) {
  try {
    await scanner.loadImage(file)
    if (!configured.value) {
      settingsOpen.value = true
      toast.info('请先填写接口信息，然后开始识别。')
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '图片处理失败')
  }
}

async function startScan() {
  if (!configured.value) {
    settingsOpen.value = true
    return
  }
  await scanner.run(config.value, hint.value.trim() || undefined)
  if (stage.value === 'error' && error.value) {
    toast.error(error.value.message)
  }
}

function restart() {
  scanner.reset()
  hint.value = ''
}

function pick(candidate: Parameters<typeof scanner.select>[0]) {
  scanner.select(candidate)
}
</script>

<template>
  <!-- `overflow-x-clip` guarantees no child can create a horizontal scrollbar;
       on iOS a single overflowing node makes the whole page pannable. -->
  <div class="app-bg relative min-h-dvh overflow-x-clip">
    <div
      class="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-5 sm:px-8 sm:py-6"
      style="padding-left: max(1rem, env(safe-area-inset-left)); padding-right: max(1rem, env(safe-area-inset-right))"
    >
      <!-- ---------------- header ---------------- -->
      <header class="flex items-center justify-between gap-3 pb-6 sm:pb-8">
        <div class="flex min-w-0 items-center gap-2.5">
          <div class="relative grid size-9 shrink-0 place-items-center rounded-full bg-primary shadow-lg shadow-primary/30 sm:size-11">
            <div class="absolute inset-x-1.5 top-1/2 h-[3px] -translate-y-1/2 bg-background" />
            <div class="relative size-3.5 rounded-full border-[3px] border-background bg-foreground" />
          </div>
          <div class="min-w-0">
            <h1 class="truncate text-base font-bold tracking-tight sm:text-lg">Poké Scanner</h1>
            <!-- <p class="truncate text-[10px] text-muted-foreground sm:text-[11px]">图片 → 主体识别 → 图鉴卡片</p> -->
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <Badge class="hidden sm:inline-flex">{{ POKEMON_COUNT }} 条图鉴</Badge>
          <!-- The label is visually hidden on mobile, so the button needs an
               explicit accessible name to stay reachable by role/name. -->
          <Button
            variant="outline"
            size="sm"
            class="shrink-0"
            aria-label="设置"
            @click="settingsOpen = true"
          >
            <Settings2 class="size-4" />
            <span class="hidden sm:inline" aria-hidden="true">设置</span>
          </Button>
        </div>
      </header>

      <!-- ---------------- main ---------------- -->
      <main class="min-w-0 flex-1">
        <!-- step 1: upload -->
        <section v-if="!image" class="mx-auto w-full max-w-3xl animate-fade-up">
          <div class="mb-6 space-y-2.5 text-center sm:mb-8 sm:space-y-3">
            <h2 class="text-balance text-2xl font-bold tracking-tight sm:text-4xl">
              上传图片，看看它像哪只宝可梦，并生成图鉴
            </h2>
            <!-- <p class="mx-auto max-w-xl text-pretty text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
              大模型先读取画面主体的颜色、轮廓与特征，再与 {{ POKEMON_COUNT }} 条中文图鉴数据比对，
              给出最相似的三只候选，并为选中的那只生成可下载的图鉴卡片。
            </p> -->
          </div>
          <UploadZone @file="onFile" />
        </section>

        <!-- step 2: preview + scan -->
        <section v-else class="w-full min-w-0 animate-fade-up space-y-5 sm:space-y-6">
          <!-- error banner -->
          <div
            v-if="error"
            class="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3 sm:gap-3 sm:p-4"
          >
            <CircleAlert class="mt-0.5 size-5 shrink-0 text-destructive" />
            <div class="min-w-0 flex-1 space-y-1">
              <p class="break-words text-sm font-semibold">{{ error.title }}</p>
              <p class="break-words text-[13px] text-foreground/80 sm:text-sm">{{ error.message }}</p>
              <details v-if="error.detail" class="pt-1">
                <summary class="cursor-pointer text-xs text-muted-foreground">技术细节</summary>
                <pre class="mt-1 max-h-40 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/40 p-2 font-mono text-[11px] text-muted-foreground">{{ error.detail }}</pre>
              </details>
            </div>
            <Button variant="ghost" size="sm" class="shrink-0" @click="settingsOpen = true">检查设置</Button>
          </div>

          <div class="grid min-w-0 items-start gap-5 sm:gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <!-- left: uploaded image -->
            <div class="min-w-0 space-y-3.5">
              <div class="relative mx-auto w-full max-w-[min(100%,20rem)] overflow-hidden rounded-2xl border border-border/70 bg-black/30 sm:max-w-none">
                <img :src="image.thumbnail" alt="已上传的图片" class="aspect-square w-full object-cover" />
                <div v-if="busy" class="scan-sweep" />
                <div
                  v-if="busy"
                  class="absolute inset-0 grid place-items-center bg-background/25 backdrop-blur-[1px]"
                >
                  <span class="rounded-full bg-background/80 px-3 py-1.5 text-xs font-medium">{{ stageLabel }}</span>
                </div>
              </div>

              <div v-if="!hasResult" class="space-y-2">
                <label for="hint" class="text-xs font-medium text-muted-foreground">补充说明（可选）</label>
                <textarea
                  id="hint"
                  v-model="hint"
                  rows="2"
                  placeholder="例如：右边那只黄色的、有耳朵的小动物"
                  class="w-full resize-none rounded-lg border border-input bg-background/60 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div class="flex gap-2">
                <Button v-if="!hasResult" class="min-w-0 flex-1" size="lg" :disabled="busy" @click="startScan">
                  <Sparkles class="size-4 shrink-0" />
                  <span class="truncate">{{ busy ? '识别中…' : '开始识别' }}</span>
                </Button>
                <Button v-else variant="outline" size="lg" class="min-w-0" @click="restart">
                  <RotateCcw class="size-4 shrink-0" />
                  <span class="truncate">换一张</span>
                </Button>
                <Button v-if="hasResult" variant="ghost" size="icon" class="shrink-0" title="重新识别" @click="startScan">
                  <RefreshCw class="size-4" />
                </Button>
              </div>

              <!-- detected traits: collapsed by default so the photo and the
                   primary action stay above the fold on a phone -->
              <details v-if="traits" class="group rounded-xl border border-border/60 bg-secondary/25">
                <summary
                  class="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden"
                >
                  <span class="min-w-0 truncate">模型读到的画面</span>
                  <ChevronDown class="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div class="space-y-2 px-3.5 pb-3.5">
                  <p class="text-xs leading-relaxed text-foreground/80">{{ traits.subject }}</p>
                  <div class="flex flex-wrap gap-1">
                    <Badge v-for="tag in detectedTags" :key="tag">{{ tag }}</Badge>
                  </div>
                  <p v-if="!traits.isPokemon" class="flex items-center gap-1.5 text-[11px] text-accent">
                    <CircleHelp class="size-3 shrink-0" />
                    模型判断这不是宝可梦，结果仅供参考
                  </p>
                </div>
              </details>
            </div>

            <!-- right: results -->
            <div class="min-w-0 space-y-4 sm:space-y-5">
              <!-- busy skeleton -->
              <div v-if="busy && !hasResult" class="space-y-3">
                <Skeleton v-for="i in 3" :key="i" class="h-24 w-full sm:h-28" />
              </div>

              <!-- results -->
              <template v-else-if="hasResult">
                <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <div class="flex min-w-0 items-center gap-2">
                    <h3 class="truncate text-[15px] font-semibold sm:text-base">最相似的候选</h3>
                    <Badge v-if="reranked" class="shrink-0">大模型已精排</Badge>
                  </div>
                  <p class="font-mono text-[11px] text-muted-foreground">
                    {{ (confidence * 100).toFixed(0) }}% 置信度 · {{ elapsedMs }}ms
                  </p>
                </div>

                <div
                  v-if="uncertain"
                  class="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/8 p-3 text-xs leading-relaxed"
                >
                  <CircleHelp class="mt-0.5 size-4 shrink-0 text-accent" />
                  <span class="min-w-0 text-foreground/80">
                    匹配度偏低，画面主体可能并不是宝可梦。下面的结果只是最接近的参考。
                  </span>
                </div>

                <p v-if="rerankWarning" class="text-[11px] text-muted-foreground">{{ rerankWarning }}</p>

                <div class="space-y-2.5">
                  <CandidateCard
                    v-for="(c, i) in topThree"
                    :key="c.pokemon.id"
                    :candidate="c"
                    :rank="i + 1"
                    :selected="selected?.pokemon.id === c.pokemon.id"
                    @select="pick"
                  />
                </div>

                <details v-if="moreCandidates.length" class="group">
                  <summary class="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    其他候选（{{ moreCandidates.length }}）
                  </summary>
                  <div class="mt-2.5 space-y-2">
                    <CandidateCard
                      v-for="(c, i) in moreCandidates"
                      :key="c.pokemon.id"
                      :candidate="c"
                      :rank="i + 4"
                      :selected="selected?.pokemon.id === c.pokemon.id"
                      @select="pick"
                    />
                  </div>
                </details>

                <!-- card preview once a candidate is chosen -->
                <div v-if="selected" class="min-w-0 space-y-3 border-t border-border/60 pt-4 sm:pt-5">
                  <div class="flex items-center justify-between gap-2">
                    <h3 class="truncate text-[15px] font-semibold sm:text-base">图鉴卡片</h3>
                    <Badge :type="selected.pokemon.types[0]" solid class="shrink-0">{{ selected.pokemon.name }}</Badge>
                  </div>
                  <CardPreview
                    :candidate="selected"
                    :thumbnail="image.thumbnail"
                    :confidence="selected.confidence"
                  />
                </div>
              </template>

              <!-- idle hint -->
              <div
                v-else
                class="grid min-h-40 place-items-center rounded-2xl border border-dashed border-border/60 text-center sm:min-h-56"
              >
                <div class="space-y-1.5 px-5">
                  <p class="text-sm text-muted-foreground">点击「开始识别」查看匹配结果</p>
                  <p class="text-xs text-muted-foreground/70">识别通常需要 3–10 秒</p>
                </div>
              </div>
            </div>
          </div>

          <div class="pt-1">
            <Button variant="ghost" size="sm" class="text-muted-foreground" @click="restart">
              <Trash2 class="size-3.5 shrink-0" />
              清除并重新上传
            </Button>
          </div>
        </section>
      </main>

      <footer class="mt-10 border-t border-border/50 pt-4 pb-2 sm:mt-12 sm:pt-5">
        <p class="text-[10px] leading-relaxed text-muted-foreground/70 sm:text-[11px]">
          图鉴数据来自
          <a
            href="https://github.com/42arch/pokemon-dataset-zh"
            target="_blank"
            rel="noreferrer"
            class="break-words underline decoration-border hover:text-foreground"
          >pokemon-dataset-zh</a>
          （整理自 52poke）。本项目为非官方粉丝作品，宝可梦相关名称与形象版权归任天堂 / GAME FREAK / The Pokémon Company 所有。
        </p>
      </footer>
    </div>

    <SettingsDialog v-model:open="settingsOpen" />
    <Toaster />
  </div>
</template>

