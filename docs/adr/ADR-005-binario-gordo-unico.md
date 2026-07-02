# ADR-005: Binario gordo único — todas las máquinas traen el backend completo

- **Estado:** ✅ Aceptada
- **Fecha:** 2026-07-01

## Contexto

Con roles caja/encargado (ADR-001, ADR-004) surge la pregunta de empaquetado: ¿un solo artefacto que incluye todo, o dos (caja liviana + encargado completo)? La intuición dice "no da que todas las cajas carguen el backend entero"; hay que examinarla.

## Decisión

**Un único binario "gordo": todas las instalaciones incluyen el backend completo (monolito + DB embebida).** En las cajas está **dormido**: no corre, no consume RAM ni CPU — solo disco (unos cientos de MB, irrelevante en cualquier PC de kiosco).

## Alternativas descartadas

- **Dos artefactos (caja liviana + encargado completo):** ahorra disco y descarga por caja, pero cuesta: dos pipelines de build, dos canales de update, matriz de compatibilidad interna caja-vs-encargado por versión, y el failover pasa de "un clic" a "descargá 300MB e instalá" — **justo en el momento en que quizás no hay internet**. El único beneficio real (bandwidth) ya lo resuelve mejor otro mecanismo: el encargado baja el update una vez y lo reparte por LAN (ADR-007).

## Consecuencias

- **Failover con un clic, incluso offline:** si la caja-encargado muere, cualquier caja se promueve a encargado al instante porque ya tiene todo el código. Este es el argumento decisor — el momento de la promoción es exactamente el momento en que no se puede depender de una descarga.
- Un solo build, un solo canal de updates, una sola matriz de versiones.
- Soporte trivial: toda la flota corre el mismo artefacto; todo bug es reproducible.
- El instalable pesa más de lo estrictamente necesario para una caja. Costo asumido y pagado una sola vez por máquina.

## Cuándo reconsiderar

Solo ante un salto de **plataforma** (ej.: caja en tablet Android): ahí el artefacto nuevo se justifica por plataforma, no por rol, y este ADR no se invalida — la regla "por rol jamás se separa" sigue vigente dentro de cada plataforma.
