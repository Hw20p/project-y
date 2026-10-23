import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Project-X(5173)와 같이 띄워도 부딪치지 않게 다른 포트를 쓴다.
    port: 5174,
  },
})
