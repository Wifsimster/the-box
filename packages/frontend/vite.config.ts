import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { readFileSync } from 'fs'
import { scopeKoeCss } from './src/lib/koeCssScope'

const getAppVersion = () => {
  if (process.env.VITE_APP_VERSION) {
    return process.env.VITE_APP_VERSION
  }
  const rootPackageJsonPath = path.resolve(__dirname, '../../package.json')
  const packageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'))
  return packageJson.version
}

const appVersion = getAppVersion()
const buildTime = new Date().toISOString()

if (process.env.NODE_ENV === 'production' && process.env.VITE_USE_MOCK_API === 'true') {
  throw new Error(
    'Refusing to build a production bundle with VITE_USE_MOCK_API=true. ' +
    'Unset the env var or build with NODE_ENV=development.'
  )
}

export default defineConfig({
  plugins: [
    {
      name: 'the-box:scope-koe-css',
      enforce: 'pre',
      transform(code, id) {
        if (!/[\\/]@wifsimster[\\/]koe[\\/]dist[\\/]style\.css(\?|$)/.test(id)) return null
        return { code: scopeKoeCss(code), map: null }
      },
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['logo.svg', 'logo-open.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,ico,png,webp,woff,woff2}'],
      },
      manifest: {
        id: '/',
        name: 'The Box — le jeu quotidien du screenshot',
        short_name: 'The Box',
        description: 'Une capture. Un jeu à deviner.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0a0f',
        theme_color: '#0a0a0f',
        lang: 'fr',
        dir: 'ltr',
        prefer_related_applications: false,
        categories: ['games', 'entertainment'],
        launch_handler: {
          client_mode: 'navigate-existing',
        },
        shortcuts: [
          {
            name: 'La boîte du jour',
            short_name: 'Ouvrir',
            description: 'Ouvrir la boîte du jour',
            url: '/fr/play',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Classement',
            short_name: 'Classement',
            description: 'Voir le classement quotidien et mensuel',
            url: '/fr/leaderboard',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
