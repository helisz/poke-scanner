import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Bind to all interfaces so phones on the same Wi-Fi can reach the dev server.
  // `localhost`-only binding is the default and is unreachable from other devices.
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Vite blocks unknown Host headers by default. LAN IPs are always allowed;
    // add `.local` so mDNS names (`<hostname>.local`) work from a phone too,
    // while keeping DNS-rebinding protection for arbitrary domains.
    allowedHosts: ['.local'],
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: ['.local'],
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // The 1025-entry dataset is the bulk of the JS payload. Splitting it out
        // lets the shell paint before the dex index has been parsed.
        manualChunks(id) {
          if (id.includes('src/data/pokemon.json')) return 'pokedex-data'
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
})
