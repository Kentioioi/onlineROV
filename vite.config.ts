import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'SEA ROV Inspector',
        short_name: 'ROV Inspector',
        description: 'Inspeksjonsrapporter for ROV-inspeksjoner av oppdrettsanlegg',
        theme_color: '#0b2540',
        background_color: '#0b2540',
        display: 'standalone',
        start_url: '/',
        // Placeholder icon (reuses the scaffold favicon) until real SEA ROV
        // branded PWA icons are supplied - swap before shipping to users.
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // App shell (JS/CSS/HTML) is precached for zero-network launch.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        navigateFallback: '/index.html',
        // API GET responses are a safety-net cache only - the real offline
        // data layer is IndexedDB (src/offline/db.ts), not this HTTP cache.
        runtimeCaching: [
          {
            urlPattern: /\/api\/field-options/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-field-options', networkTimeoutSeconds: 3, expiration: { maxEntries: 20 } },
          },
          {
            urlPattern: /\/api\/reports(\?.*)?$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-reports-list', networkTimeoutSeconds: 3, expiration: { maxEntries: 20 } },
          },
          {
            urlPattern: /\/api\/images\//,
            handler: 'CacheFirst',
            options: { cacheName: 'api-images', expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
