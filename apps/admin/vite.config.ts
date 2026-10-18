import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Em produção o admin é servido pela API em /admin/; em desenvolvimento roda na raiz do seu próprio servidor.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/admin/' : '/',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
}))
