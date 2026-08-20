import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// Config del build WEB (el portal, lo que deploya Vercel). El build de ESCRITORIO
// hereda de acá y pisa lo justo: ver vite.desktop.config.js.
//
// Por qué un config aparte y no `vite build --mode desktop`: cambiar el modo hace que
// Vite deje de cargar `.env.production` (pasa a buscar `.env.desktop`), y ese archivo
// existe. El build de escritorio se quedaría sin las VITE_* de producción sin que nada
// avise. `--config` no toca el modo.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // ¿Este bundle es el de la app de escritorio? Lo decide el BUILD, no el runtime.
    // Ojo con no confundirlo con "¿corre dentro de Electron?" (window.electronAPI):
    // son cosas distintas — el bundle web abierto en Electron sigue siendo el web.
    __IS_DESKTOP__: JSON.stringify(false),
  },
  build: {
    // Bundle principal ~740 kB; evita ruido en CI sin ocultar problemas graves
    chunkSizeWarningLimit: 900,
  },
  // Use relative paths so assets work in both:
  // - Electron (file:// protocol, loads dist-desktop/index.desktop.html)
  // - GitHub Pages (https://user.github.io/repo/)
  // - Vercel (https://domain.vercel.app/)
  base: './',
})
