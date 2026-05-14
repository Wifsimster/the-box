import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { readFileSync } from 'fs'

// Read version from root package.json (single source of truth)
// Fallback to environment variable for Docker builds, then local package.json
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

// Defence-in-depth: a production build with VITE_USE_MOCK_API=true would
// ship mock services to users. The runtime guard already short-circuits
// when the flag is anything other than 'true', but failing the build is
// loud enough that the mistake can't slip into a release tag.
if (process.env.NODE_ENV === 'production' && process.env.VITE_USE_MOCK_API === 'true') {
  throw new Error(
    'Refusing to build a production bundle with VITE_USE_MOCK_API=true. ' +
    'Unset the env var or build with NODE_ENV=development.'
  )
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['logo.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,ico,png,webp,woff,woff2}'],
      },
      manifest: {
        id: '/',
        name: 'The Box — Daily Video Game Guessing Challenge',
        short_name: 'The Box',
        description:
          'Identify video games from screenshots. New daily challenge, live leaderboards, achievements.',
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
            name: 'Défi du jour',
            short_name: 'Jouer',
            description: 'Lancer le défi quotidien',
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
        ws: true, // Enable WebSocket proxying for Socket.io
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying
      },
    },
  },
})
