import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/jvplanner/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      injectManifest: {
        injectionPoint: undefined
      },
      manifest: {
        name: 'JV Planner',
        short_name: 'JVPlanner',
        theme_color: '#0c1714',
        background_color: '#0c1714',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/jvplanner/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/jvplanner/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/jvplanner/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
        ]
      }
    })
  ]
})