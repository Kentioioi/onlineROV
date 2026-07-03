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
      // Registration happens explicitly in main.tsx (virtual:pwa-register)
      // so it can attach a periodic update check - no injected script too.
      injectRegister: false,
      manifest: {
        name: 'SEA ROV Inspector',
        short_name: 'ROV Inspector',
        description: 'Inspeksjonsrapporter for ROV-inspeksjoner av oppdrettsanlegg',
        theme_color: '#0b2540',
        background_color: '#0b2540',
        display: 'standalone',
        start_url: '/',
        lang: 'nb',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell (JS/CSS/HTML) is precached for zero-network launch.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        navigateFallback: '/index.html',
        // Without this, the service worker's SPA-fallback intercepts EVERY
        // full-page navigation - including a plain <a href="/api/..."> click
        // - and serves the cached app shell instead of letting the request
        // reach the network, which looks exactly like "clicking download
        // just takes me back to the start page". API routes are never SPA
        // pages, so they must never hit navigateFallback.
        navigateFallbackDenylist: [/^\/api\//],
        // API GET responses are a safety-net cache only - the real offline
        // data layer is IndexedDB (src/offline/db.ts), not this HTTP cache.
        // networkTimeoutSeconds 10, not 3: on a satellite/boat link with
        // consistent >3s latency, a 3s cutoff meant EVERY list load fell
        // back to the cached copy - the list was perpetually one refresh
        // behind while looking fresh, so a just-synced report seemed to
        // have vanished (inviting duplicate re-entry). 10s tolerates slow
        // links; genuinely-offline requests still fail fast to cache.
        runtimeCaching: [
          {
            urlPattern: /\/api\/field-options/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-field-options',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/reports(\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-reports-list',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Without cacheableResponse, CacheFirst's default behavior caches
            // ANY response - including a 401/404/500 from a transient blip on
            // the very first load of a newly-uploaded photo. That failure then
            // gets served for up to 30 days: the thumbnail looks permanently
            // broken even though a plain retry would have worked immediately.
            urlPattern: /\/api\/images\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'api-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // Shown in Innstillinger so it's always possible to tell which build a
  // device is actually running (PWA updates lag behind deploys).
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
