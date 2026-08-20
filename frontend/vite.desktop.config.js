import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config.js'

// ============================================
// VELTRONIK — BUILD DE LA APP DE ESCRITORIO (Fase 4)
// ============================================
// El escritorio NO lleva las pantallas de cuenta ni de cobro (planes, checkout,
// registro, onboarding, Mission Control). Todo eso vive en el portal web; la app manda
// al navegador del sistema cuando hace falta.
//
// POR QUÉ UN ENTRY POINT APARTE Y NO UN `if (IS_DESKTOP)` EN LAS RUTAS
// Un condicional ESCONDE la ruta pero no la saca del instalador: el `import PlansPage`
// sigue siendo estático, así que Rollup mete igual la página, CardCheckout y el SDK de
// Mercado Pago. Terminaríamos enviando código de tarjetas a 200 máquinas ajenas para
// que nunca se dibuje. Lo que no se importa, no se empaqueta: por eso el escritorio
// entra por `index.desktop.html` → `main.desktop.jsx` → `routes/DesktopRoutes.jsx`,
// que sencillamente no nombra esas páginas.
//
// El criterio de aceptación es objetivo y está en el script `check:desktop-bundle`:
//   grep -ri "mercadopago" dist-desktop/  →  tiene que dar CERO.
export default mergeConfig(base, defineConfig({
  define: {
    __IS_DESKTOP__: JSON.stringify(true),
  },
  build: {
    // Carpeta propia: el instalador empaqueta ESTA (ver electron-builder.yml), y
    // `dist/` queda intacta para Vercel. Nunca se pisan.
    outDir: 'dist-desktop',
    rollupOptions: {
      input: 'index.desktop.html',
    },
  },
}))
