import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist_electron', 'release']),
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
      // Reglas nuevas (react-hooks v6+) sobre patrones de efectos: son consejos de
      // performance/estilo, no bugs. Quedan como warning para verlas sin romper el lint
      // (refactorizarlas en una app en producción es un cambio de comportamiento aparte).
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
])
