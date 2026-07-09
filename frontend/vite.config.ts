import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // R8.3 — PWA : offline shell + auto-update
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Best Épargne',
        short_name: 'Best Épargne',
        description:
          "Plateforme d'apprentissage — investissement, épargne et finance.",
        theme_color: '#0284c7',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'fr',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Précache les assets du build
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Runtime cache : les appels API JSON restent network-first
        // pour éviter de servir des données périmées côté user.
        runtimeCaching: [
          {
            urlPattern: /^\/api\/public\/(courses|categories)\/?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'be-api-public',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 5, // 5 min
              },
              networkTimeoutSeconds: 4,
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'be-images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 jours
              },
            },
          },
        ],
        // Ne pas mettre en cache l'app-shell si la requête est authentifiée
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/admin\//],
      },
      devOptions: {
        enabled: false, // Désactivé en dev pour ne pas polluer le HMR
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Dev : proxy vers le backend Django pour éviter les problèmes CORS locaux.
      // En prod, VITE_API_URL pointe vers le domaine backend directement.
      '/api': {
        target: process.env.VITE_DEV_API_PROXY || 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    // R25 — Sourcemaps configurables :
    //   'hidden'  → générées mais non référencées dans les bundles (Sentry upload)
    //   true/false → classique
    // Défaut : 'hidden' pour la prod, 'true' pour dev/preview local.
    sourcemap:
      (process.env.VITE_BUILD_SOURCEMAP as
        | 'hidden'
        | 'inline'
        | 'true'
        | 'false'
        | undefined) === 'false'
        ? false
        : process.env.VITE_BUILD_SOURCEMAP === 'true'
          ? true
          : 'hidden',
    // Empêche l'inline des petits assets (favorise le HTTP cache).
    assetsInlineLimit: 4096,
    // cssMinify: 'lightningcss' est disponible si vous ajoutez la dep. Par
    // défaut on utilise esbuild (déjà installé) — largement suffisant.
    cssMinify: 'esbuild',
    reportCompressedSize: false, // gain de temps CI
    chunkSizeWarningLimit: 1000, // 1 Mo par chunk
    rollupOptions: {
      output: {
        // Chunk splitting pour réduire la taille du bundle initial.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query': ['@tanstack/react-query'],
          'forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
          'charts': ['recharts'],
          'motion': ['framer-motion'],
          'editor': ['@tiptap/react', '@tiptap/starter-kit'],
        },
      },
    },
  },
});
