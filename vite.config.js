import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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