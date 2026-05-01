import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  base: '/weekly/',
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 3003,
    open: true,
    proxy: {
      '/api': {
        target: 'https://www.moodway.top',
        changeOrigin: true,
        secure: true
      },
      '/weeklyProxy': {
        target: 'https://www.moodway.top',
        changeOrigin: true,
        secure: true
      }
    }
  }
})
