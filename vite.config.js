import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // Bundle principal ~740 kB; evita ruido en CI sin ocultar problemas graves
    chunkSizeWarningLimit: 900,
  },
  // Use relative paths so assets work in both:
  // - Electron (file:// protocol, loads dist/index.html)
  // - GitHub Pages (https://user.github.io/repo/)
  // - Vercel (https://domain.vercel.app/)
  base: './',
})
