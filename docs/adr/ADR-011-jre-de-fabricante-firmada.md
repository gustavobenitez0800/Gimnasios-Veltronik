# ADR-011: JRE de fabricante firmada (Microsoft OpenJDK) en lugar de jlink

- **Estado:** ✅ Aceptada
- **Fecha:** 2026-07-05
- **Reemplaza parcialmente:** el punto "JRE jlink" de [ADR-009](ADR-009-runtime-local-embebido.md)

## Contexto

En la **prueba de campo del 2026-07-05** (la primera vez que el cerebro embebido corrió en
una máquina real fuera de tests), Windows **Smart App Control / WDAC bloqueó la JRE
recortada de jlink** con *"Una directiva de Control de aplicaciones bloqueó este archivo"*
(`nio.dll`). La causa: **jlink genera un runtime SIN firmas Authenticode** — los binarios
resultantes son artefactos nuevos, sin firma ni reputación, exactamente lo que las
políticas modernas de Windows bloquean.

La salida "de libro" es firmar el instalable completo con un certificado de code signing,
pero **no hay presupuesto para eso ahora**. Y dos datos empíricos cambian el problema:

1. **Los clientes actuales ya corren la app Electron SIN firmar** (v2.6.4) sin problemas —
   sus máquinas no bloquean el .exe sin firma. El único riesgo NUEVO era la JRE.
2. En la máquina exacta donde jlink fue bloqueado, **el Java instalado de Microsoft
   (firmado) corrió perfecto** — fue el workaround de la prueba de campo.

## Decisión

**Empaquetar el Microsoft OpenJDK 17 oficial (firmado con Authenticode por Microsoft)**
en lugar del runtime de jlink:

- `build-tools/build-backend.ps1` descarga el zip oficial (alias estable
  `aka.ms/download-jdk/microsoft-jdk-17-windows-x64.zip`, cacheado en LOCALAPPDATA),
  lo recorta de contenido **no ejecutable** (`jmods/`, `lib/src.zip`, `include/` —
  ~120MB menos, sin tocar un solo binario firmado) y lo deja como `resources/backend/jre`.
- **Verificación dura en el build:** `Get-AuthenticodeSignature` sobre `jre\bin\java.exe`
  debe dar `Valid` o el build muere — la garantía de que jamás vuelve a viajar un runtime
  sin firma.
- Elección de Microsoft sobre Temurin: ambos vienen firmados, pero el de Microsoft está
  **probado empíricamente en la máquina que bloqueó a jlink** (evidencia > teoría).

**Costo asumido:** la JRE pasa de ~47MB (jlink) a ~140MB (JDK recortado). El instalable
crece ~60-80MB comprimido. Es el precio de distribuir GRATIS sin certificado — y el
blockmap de electron-updater mantiene los updates incrementales.

## Alternativas descartadas

- **jlink + certificado de code signing:** la solución "correcta" (runtime chico Y
  firmado por nosotros), pero cuesta plata (cert clásico US$100-400/año; Azure Trusted
  Signing ~US$10/mes). Queda como optimización futura — ver "Cuándo reconsiderar".
- **Temurin JRE (Adoptium):** más chica (~130MB) y firmada por Eclipse; opción B válida,
  pero no probada en la máquina afectada. Si Microsoft diera problemas, es el fallback.
- **Exigir Java instalado en la PC del cliente:** mata el onboarding self-service
  (descartado ya en ADR-009).

## Consecuencias

- El local-first se puede **distribuir a clientes reales sin pagar un certificado**,
  en las mismas máquinas donde hoy ya corre la app sin firmar.
- El runbook de prueba (`docs/PROBAR-LOCAL-FIRST.md`) vuelve a usar `.\jre\bin\java.exe`
  sin workarounds.
- El build descarga ~180MB la primera vez (después queda cacheado; en CI se baja por
  release, ~1-2 min en el runner).

## Cuándo reconsiderar

Cuando haya presupuesto para firma de código (Azure Trusted Signing ~US$10/mes es el
camino barato): firmar el instalable completo permite volver a jlink (~47MB) firmando el
runtime en el pipeline, y de paso elimina el aviso de SmartScreen del instalador. Hasta
entonces, la JRE de fabricante es estrictamente mejor que cualquier alternativa gratis.
