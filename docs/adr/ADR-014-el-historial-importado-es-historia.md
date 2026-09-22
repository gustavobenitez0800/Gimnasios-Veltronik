# ADR-014: El historial de caja importado suma en los ingresos, pero no cubre a nadie ni entra a la caja

- **Estado:** ✅ Aceptada · el **balance** de la caja cambió en [ADR-015](ADR-015-un-libro-de-ingresos-y-cada-peso-en-un-cierre.md): ahora incluye el historial, marcado. El cierre sigue sin contarlo.
- **Fecha:** 2026-09-21

## Contexto

Un gimnasio que migra desde otro sistema (el primero que lo pidió venía de ControlFit) trae meses de cobros, y el dueño quiere ver en el panel sus ingresos **desde enero**: "Ingresos del mes", el gráfico mensual y la predicción. Sin esa historia la predicción no tiene de dónde sacar tendencia y el gráfico empieza el día que se instaló Veltronik.

Cargar esos cobros **por el camino normal no se puede**, por dos efectos del cobro que son correctos cuando alguien paga hoy y dañinos sobre historia:

1. **Cobrar corre el vencimiento y reactiva al socio** (`GymPaymentService.aplicarCobertura`). El 31/08 cargar pagos viejos de AccesoGym revivió ex-socios y corrió fechas que no había que correr; hubo que compararlas una por una contra el origen.
2. **El cierre de caja cuenta desde el último cierre**, y el primero de un gimnasio mira **30 días para atrás**. La última semana del sistema anterior habría entrado al primer cierre como plata del día, y el balance del mes habría dicho que el cajón tenía millones.

## Decisión

**Un cobro importado es HISTORIA.** Se marca con `gym_payment.import_id` (V86) y a partir de esa marca:

| | ¿Lo cuenta? | Dónde se garantiza |
|---|---|---|
| Ingresos (panel, predicción, resumen del dueño, Pagos) | ✅ Sí | Las consultas de ingresos no filtran: es un cobro `paid` más |
| Vencimiento y estado del socio | ❌ No | Se escribe sin pasar por `GymPaymentService`, **sin período** (CHECK `ck_gym_payment_importado_sin_periodo`), y editarlo no le aplica uno |
| Cierre de caja, balance, lista de cobros de la caja | ❌ No | `CajaService.pasoPorEsteCajon` |
| "Pagó y figura vencido" / corregir cobertura | ❌ No | `findCoverageGaps` y `findPaidUntil` filtran `import_id IS NULL` |
| "Ya cobra por Veltronik" del importador de socios | ❌ No | `conCobros` filtra `import_id IS NULL`: el archivo del padrón sigue mandando sobre la fecha |

- **Los gastos** del historial van a `caja_movimiento` como EGRESO, también marcados: se ven, no son ingresos, y no entran al arqueo.
- **Quién pagó** se decide solo por **DNI**, con la misma vara que el check-in. Los ex-socios, los que no tienen DNI y los pases por día entran **sin socio**, con el nombre (y el DNI si lo hay) en la nota. No se dan de alta como socios de baja: inflarían el padrón con fichas que nadie va a mirar, y la plata cuenta igual.
- **Idempotente**: cada fila tiene una clave (fecha, hora, monto, nombre y cuántas iguales vinieron antes en el archivo) con índice único. El mismo archivo dos veces no duplica; el mismo export una semana después trae solo lo nuevo.
- **Sin doble conteo**: si el mismo socio ya pagó el mismo monto el mismo día **en Veltronik**, la fila del archivo no se importa.
- Mismo patrón que el importador de socios: vista previa (con los totales **mes por mes**, que son los que va a mostrar el panel) → todo o nada → deshacer la última, candado por gimnasio, solo dueño y administrador.

## Alternativas descartadas

### Cargar los cobros por la API normal y corregir los vencimientos después

Es lo que se hizo el 31/08. Funciona si se compara socio por socio contra el origen al terminar, y ese paso de corrección es exactamente el que se olvida o sale a medias. Y no resuelve la caja.

### Una tabla aparte para los ingresos históricos

El panel, la predicción, el resumen del dueño y la pantalla de Pagos leen `gym_payment`. Una tabla aparte obligaba a sumar dos fuentes en cada uno de esos lugares, y la primera consulta nueva que se olvidara de la segunda tabla mostraría ingresos sin la historia. Con una marca en la misma tabla, el que se olvida de filtrar **cuenta de más en la caja** — por eso la caja filtra en un solo lugar y la base prohíbe que un importado tenga período.

### Dar de alta a los ex-socios como socios de baja

Ata cada cobro a una ficha, pero suma cientos de socios al padrón (y al gráfico de estados) que el dueño no cargó y no va a mirar. Si uno vuelve, se le da de alta; deshacer y reimportar le ata su historia.

## Consecuencias

- El panel muestra el año completo: el gráfico se estira hasta 12 meses cuando hay cobros más viejos que seis (un gimnasio nuevo sigue viendo seis).
- ⚠️ **Los ingresos del panel incluyen historia; la caja no.** En el mes de la migración, "Ingresos del mes" y el balance de la caja van a decir números distintos, y está bien: uno es el negocio, el otro es el cajón de Veltronik.
- ⚠️ **Toda consulta nueva que lea `gym_payment` para cobertura o caja tiene que filtrar `import_id IS NULL`.** La base cubre la cobertura (sin período no hay cobertura), pero la caja depende del código.
- Un cobro importado se puede editar o borrar desde Pagos. Si se edita, deshacer la importación queda bloqueado (se perdería la corrección).
