import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { snippetsApiPlugin } from './scripts/vite-plugin-snippets.mjs'

// `base` can be overridden for sub-path deploys (e.g. GitHub Pages: VITE_BASE=/repo-name/).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [vue(), snippetsApiPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
