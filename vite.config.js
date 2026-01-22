import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // 允许局域网访问（方便手机测试）
    proxy: {
      '/api': {
        target: 'http://localhost:8078',
        changeOrigin: true,
      }
    }
  }
})