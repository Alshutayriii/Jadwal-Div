import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['fonts/Cairo-Variable.ttf', 'icon-180.png'],
      manifest: {
        name: 'جدول المدرسة Pro',
        short_name: 'جدول المدرسة',
        description: 'إدارة الجداول الدراسية العربية دون إنترنت',
        lang: 'ar',
        dir: 'rtl',
        start_url: './',
        display: 'standalone',
        background_color: '#f5f6fa',
        theme_color: '#4338ca',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ttf,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
