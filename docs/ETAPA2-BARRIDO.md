# Etapa 2 — Barrido de limpieza módulo por módulo

> **Objetivo:** que cualquier junior entienda el código a nivel arquitectura e ingeniería.
> Bajo acoplamiento, alta cohesión, cero código muerto, comentarios que digan la verdad.
> **Método:** un módulo por sesión, con CI verde al final de cada uno. Nada de big-bang.
>
> Estado al 2026-07-20. La Etapa 1 (baja Fútbol 5 + fixes de clientes) ya está commiteada
> en `feat/etapa1-limpieza-baja-futbol5`.

## Diagnóstico inicial (medido, no intuido)

| Frente | Hallazgo | Gravedad |
|---|---|---|
| ESLint frontend | **42 warnings, 0 errores** en 22 archivos | Media — la mayoría son reglas nuevas de React 19 |
| `console.log` sueltos | **0** (solo el logger sancionado de `lib/utils.js`) | ✅ limpio |
| Dependencias muertas | `mercadopago` (SDK Node, 0 imports) — **ya eliminada** | ✅ resuelto |
| Backend `@Value` en campos | 21 usos en 10 clases (inyección legacy; la regla ArchUnit los tolera "por ahora") | Baja — deuda declarada |
| Backend tests | 174 verdes, ArchUnit vigila los límites de módulos | ✅ sano |

### Los 42 warnings de ESLint, por regla

| Regla | Cant. | Qué significa | Riesgo real |
|---|---|---|---|
| `react-hooks/set-state-in-effect` | 22 | setState sincrónico dentro de un effect → renders en cascada | El más importante: revisar caso por caso (algunos son inicializaciones legítimas, otros son doble-render evitable) |
| `react-hooks/exhaustive-deps` | 9 | dependencias faltantes/sobrantes en hooks | Puede esconder bugs de datos viejos |
| `react-hooks/immutability` | 5 | mutación de valores que React asume inmutables | Revisar |
| `react-hooks/refs` | 2 | escribir `ref.current` durante el render (patrón "latest ref" en `CardCheckout`) | Bajo, pero conviene mover a `useEffect` |
| `react-refresh/only-export-components` | 4 | archivos que exportan componente + otra cosa (rompe HMR fino) | Cosmético |

Archivos afectados (22): `CardCheckout`, `ForceUpdateOverlay`, `UpdateIndicator`,
`AuthContext`, `ThemeContext`, `ToastContext`, `useDashboardController`, `useDataLoader`,
`AccessPage`, `KioskCash/Customers/Dashboard/Fiscal/Inventory/Products/Suppliers`,
`LobbyPage`, `MissionControlPage`, `PaymentsPage`, `PlaceholderPages`, `PosPage`, `SettingsPage`.

## Plan del barrido (orden y criterio)

Cada módulo se limpia en una sesión propia, con este checklist:
1. **Código muerto afuera** (métodos sin llamadores, imports sin uso, ramas imposibles).
2. **Comentarios que dicen la verdad** (ni fantasmas ni obviedades; el "por qué", no el "qué").
3. **Nombres nivel junior** (si hay que explicarlo en el chat, el nombre está mal).
4. **Tests obsoletos afuera junto con su código**; los vigentes se mantienen verdes.
5. **Warnings de lint del módulo a cero** (caso por caso, sin silenciar a ciegas).

| # | Módulo | Alcance | Notas |
|---|---|---|---|
| ✅ 2.1 | `frontend/src/lib` + `hooks` + `contexts` | **HECHA (2026-07-27)** | 3 archivos muertos afuera (`useDataLoader`, `useFilteredData`, `themeManager`), fix de captura de `logout` en AuthContext, regla react-refresh apagada para contexts (patrón idiomático), lint del scope en 0 |
| 2.2 | `frontend` componentes compartidos | `components/` | CardCheckout (refs), Update*/ForceUpdate (setState-in-effect) |
| 2.3 | `frontend` páginas gym | Members/Payments/Classes/Access/Retention/Reports | + warnings de AccessPage/PaymentsPage |
| 2.4 | `frontend` páginas kiosco | POS + 8 páginas Kiosk* | El grueso de los warnings (7 archivos) |
| 2.5 | `backend/core` | El módulo más grande y crítico | Migrar los 21 `@Value` a constructor donde tenga sentido; después endurecer la regla ArchUnit |
| 2.6 | `backend/gym` + `kiosk` + `fiscal` | Verticales | Ya salieron bastante limpios del diagnóstico |
| 2.7 | Raíz y build | `electron-builder.yml` (excludes muertos: `api/`, `vercel.json`), scripts, docs | Micro |

## Ya hecho

**2026-07-20 (diagnóstico):**
- [x] Diagnóstico completo (lint, console.log, depcheck, @Value).
- [x] `mercadopago` (SDK Node sin uso) desinstalado — build verificado.
- [x] Este mapa.

**2026-07-27 (tanda 2.1 — lib/hooks/contexts):**
- [x] Código muerto: `hooks/useDataLoader.js`, `hooks/useFilteredData.js` (solo el barrel
      los re-exportaba) y `lib/themeManager.js` (white-label sin ningún importador) — afuera.
- [x] `AuthContext`: `logout` declarado antes del effect que lo registra como handler
      (el listener capturaba una referencia sin inicializar del primer render).
- [x] `react-refresh/only-export-components` apagada SOLO para `src/contexts/**` con
      justificación en la config (Provider + hook juntos = patrón idiomático de React).
- [x] Verificado que `lib/api.js` NO es legacy: sus 3 endpoints existen en `BillingController`.
- [x] Scan de exports muertos en lib/hooks: cero hallazgos restantes.
- [x] Lint del scope: 6 warnings → **0**. Build + boot en preview verificados.

## Reglas del juego (no cambian)

- Migraciones Flyway: **jamás** tocar una aplicada. Solo hacia adelante.
- Un vertical nunca importa de otro; `core` no depende de nadie (ArchUnit lo vigila).
- Sin verde en CI no hay merge.
- "Limpio no es el proyecto que se limpia, es el que no se puede ensuciar":
  cada limpieza que se pueda convertir en regla automática (lint/ArchUnit), se convierte.
