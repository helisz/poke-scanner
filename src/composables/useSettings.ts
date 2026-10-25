import { computed, ref } from 'vue'
import { type AiConfig, defaultConfig, isConfigured, loadConfig, saveConfig } from '@/lib/ai'

/** Single shared settings store — no Pinia needed for one object. */
const config = ref<AiConfig>(loadConfig())

export function useSettings() {
  const configured = computed(() => isConfigured(config.value))

  function update(next: AiConfig) {
    config.value = { ...next }
    saveConfig(config.value)
  }

  function reset() {
    config.value = defaultConfig()
    saveConfig(config.value)
  }

  return { config, configured, update, reset }
}
