import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // 自动更新 Service Worker
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ForgotYet - 忘却备忘录',
        short_name: 'ForgotYet',
        description: '你的 AI 记忆胶囊',
        theme_color: '#fafaf9', // Tailwind 的 stone-50 背景色
        background_color: '#fafaf9',
        display: 'standalone', // 🚀 关键：隐藏浏览器的地址栏，伪装成原生 App
        orientation: 'portrait', // 锁定竖屏
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  // 关键改动 1: 设置基础路径，对应 Nginx 的 location /forgotyet/
  base: '/forgotyet/', 
  
  server: {
    host: '0.0.0.0',
    proxy: {
      // 关键改动 2: 本地开发也用新前缀，保持统一
      '/fy-api': {
        target: 'http://localhost:8078', // 这里填你本地后端端口，通常是 8078
        changeOrigin: true,
      }
    }
  }
})