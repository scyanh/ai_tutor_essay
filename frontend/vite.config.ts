import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:8080',
          changeOrigin: true,
          // El backend (ADK) rechaza orígenes que no estén en ALLOW_ORIGINS; el proxy actúa como mismo origen
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => req.removeHeader('origin'))
          },
        },
      },
    },
  }
})
