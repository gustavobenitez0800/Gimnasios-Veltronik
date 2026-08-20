import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist-desktop', 'dist_electron', 'release']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Inyectada por Vite (define) con la versión del package.json.
        __APP_VERSION__: 'readonly',
        // Inyectada por Vite (define): true solo en el build de escritorio (Fase 4).
        __IS_DESKTOP__: 'readonly',
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Regla estándar del template de Vite+React: sin el plugin eslint-plugin-react
      // (jsx-uses-vars), todo componente usado SOLO en JSX figura como "no usado".
      // Ignorar identificadores que empiezan en mayúscula (componentes/constantes)
      // elimina esos falsos positivos y deja los positivos reales (minúscula).
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      // Higiene Fase 0 (docs/ARCHITECTURE.md §Reglas innegociables): nada de console.log
      // suelto en producción — el debug pasa por el logger condicional de lib/utils.js
      // (gateado por CONFIG.DEBUG). warn/error quedan permitidos: reportan problemas reales.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // ─── set-state-in-effect: APAGADA a conciencia (etapa 2.4, 2026-07-27) ───
      // La regla no distingue un setState sincrónico de uno que ocurre DESPUÉS de un await,
      // que es lo único que hay acá (traer datos al montar). Comprobado con dos casos mínimos:
      //
      //   useEffect(() => { load(); }, [load]);        // load = async, setState post-await → LA MARCA
      //   useEffect(() => { (async () => { … })(); });  // el MISMO código, inline           → no la marca
      //
      // Mismo comportamiento en runtime, misma cantidad de renders; solo cambia la sintaxis.
      // Se auditaron los 15 avisos uno por uno antes de apagarla: 11 eran de esa forma, y los
      // 4 sincrónicos de verdad se corrigieron (estado inicial lazy en PosPage) o son
      // deliberados (el spinner del reintento en KioskDashboard, el flujo de PaymentCallback).
      // El patrón vive en UN lugar, `hooks/useLoadOnMount.js`: si algún día hay que revisarlo,
      // se revisa ahí y no en trece páginas.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
  // Los contexts exportan Provider + hook useX + el Context juntos: es el patrón
  // idiomático de React (un archivo por contexto). La regla solo protege la
  // granularidad del Fast Refresh en dev; acá es un falso positivo permanente.
  {
    files: ['src/contexts/**/*.{js,jsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
