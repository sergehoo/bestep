import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
    // Défaut : false, pour ne pas publier le code source dans les artefacts.
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
          : process.env.VITE_BUILD_SOURCEMAP === 'hidden'
            ? 'hidden'
            : false,
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
