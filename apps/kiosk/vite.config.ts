import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Em dev o service worker atrapalha o HMR; vale só no build/preview.
      devOptions: { enabled: false },
      manifest: {
        name: 'Burger Lab Totem',
        short_name: 'Totem',
        description: 'Autoatendimento Burger Lab',
        lang: 'pt-BR',
        display: 'fullscreen',
        orientation: 'portrait',
        background_color: '#fff8ef',
        theme_color: '#e8461e',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // Guarda o app shell; as chamadas /api e o socket nunca vão para o cache do SW
        // (o cardápio offline é uma cópia local controlada pelo app, ver lib/offline.ts).
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
        globPatterns: ['**/*.{js,css,html,svg,png}'],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  preview: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
})
