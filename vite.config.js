import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use relative paths so assets work in both:
  // - Electron (file:// protocol, loads dist/index.html)
  // - GitHub Pages (https://user.github.io/repo/)
  // - Vercel (https://domain.vercel.app/)
  base: './',
})
