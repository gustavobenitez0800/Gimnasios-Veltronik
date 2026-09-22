# ADR-015: Un solo libro de ingresos, y cada peso en exactamente un cierre de caja

- **Estado:** ✅ Aceptada
- **Fecha:** 2026-09-22
- **Cambia en parte:** [ADR-014](ADR-014-el-historial-importado-es-historia.md) (el balance de la caja ahora incluye el historial, marcado)

## Contexto

El 22/09 el dueño de un gimnasio recién migrado miró el "Balance de ingresos" de la caja: el año decía $283.000. El tablero, para el mismo gimnasio, decía millones. Ninguno estaba "mal" según su propia regla, y ese era el problema. Al revisar de dónde sale la plata en todo el sistema aparecieron **cinco cuentas distintas de "cuánto entró"** y una regla de cierre que **perdía plata sin que nadie se enterara**:

| Pantalla | Cómo contaba |
|---|---|
| Tablero | cobros `paid`, con el historial importado, sin las ventas de la caja |
| Balance de la caja | la cuenta del cajón: sin el historial, sin tarjeta en la pantalla |
| Pagos | sumaba en el navegador, con `parseFloat`, lo que tenía cargado |
| Excel del contador | el balance de la caja, más lo suyo |
| Resumen del dueño | su propia consulta, sin tope de fecha |

El cierre contaba "los cobros con fecha dentro de su período" (`>= desde` y `<= hasta`). Con eso:

- un cobro cargado **después** del cierre con la fecha de antes (o a las 00:00, que es lo que guardaba el modal de Pagos) caía en un período ya cerrado y **no lo contaba ningún cierre**;
- un pendiente que se marcaba pagado días después, lo mismo;
- un cobro de ayer al que hoy se le corregía el monto o se borraba: el cierre de ayer quedaba con el número viejo y **la diferencia no entraba en ningún lado**;
- un cobro justo en el borde entre dos cierres **se contaba en los dos**.

## Decisión

### 1. Un solo libro de ingresos (`LibroDeIngresos`)

Una consulta, contada en la base, que responde "¿cuánta plata entró entre dos fechas?" **por forma de pago y por origen**, y las dos cuentas suman el mismo total:

- **Cuotas**: cobros hechos en Veltronik, cobrados.
- **Historial**: cobros importados del sistema anterior (suman, marcados aparte).
- **Otros ingresos**: ventas y demás ingresos anotados en la caja. Es el lugar de la cantina.
- ❌ **No son ingreso**: pendientes, anulados, y los **aportes y retiros del dueño** (mueven el cajón, pero la plata ya era suya).

La usan el tablero, Pagos, el balance y el Excel de la caja, y el resumen del dueño. `UnSoloNumeroIntegrationTest` siembra un mes con todo lo que existe y exige que las cinco pantallas digan lo mismo, peso por peso.

### 2. El balance de la caja es el libro; el cierre es el cajón

Son dos preguntas distintas y ahora cada una tiene su cuenta:

- **"¿Cuánta plata entró este mes?"**: el balance. Es el libro, con el historial **incluido y marcado** (decisión del dueño, 22/09).
- **"¿Qué tiene que haber en el cajón?"**: el cierre. Sin el historial (esa plata la cobró el otro sistema, ADR-014).

### 3. Cada peso en exactamente un cierre: el sello (V88)

Cada cobro y cada movimiento de caja lleva el **sello del cierre que lo contó** (`cierre_id`, `sellado_at`, y lo que contó: `sellado_monto`, `sellado_metodo`). Un cierre toma lo cobrado que **no tiene sello**, sin mirar si la fecha cae en "su" período; solo pide que haya pasado antes del momento del cierre: `LEAST(alta, fecha) <= hasta`. Así:

- lo cargado tarde, lo pendiente que se paga y lo de las 00:00 lo toma el próximo cierre;
- el cierre de anoche hecho sin internet que sube a la mañana **no** se lleva los cobros de la mañana (tienen alta y fecha posteriores), y sí los de anoche que subieron tarde;
- **lo corregido después de cerrado** entra en el cierre siguiente como **corrección**, a la vista y con su detalle (`caja_cierre_ajuste`), y se re-sella con el valor nuevo. El cierre viejo no se reescribe;
- lo sin sellar con fecha de hace **más de 30 días** es carga histórica (los cobros de un cuaderno pasados al sistema): se sella sin cierre y no entra al cajón de hoy.

Leer y sellar ven las mismas filas: el cierre toma un candado por gimnasio y bloquea lo que lee (`FOR UPDATE`). Si no puede sellar todo lo que leyó, no se guarda. `CadaPesoEnUnSoloCierreIntegrationTest` corre 120 operaciones al azar (cobros, cobros tardíos, correcciones, anulaciones, cierres) y exige que **la suma de todos los cierres más el período abierto sea la plata que entró**.

### 4. Un cobro no se borra: se anula

`status = 'cancelled'` más quién, cuándo y por qué. Queda en la lista tachado, deja de sumar en todas partes, y si ya estaba cerrado el próximo cierre lo descuenta. Si fue el cobro que le corrió el vencimiento al socio, el vencimiento vuelve a donde estaba. El DELETE de los escritorios viejos ahora anula. Deshacer una importación sigue borrando (es historia que nunca pasó por una caja).

### 5. La plata se escribe de una sola manera

La forma de pago se normaliza **en la entidad** al guardar (`MetodoDePago`: CASH, TRANSFER, MERCADOPAGO, CARD, OTHER), el estado en minúscula, y la base lo exige con CHECK, junto con monto mayor a cero. El libro compara exacto.

## Alternativas descartadas

### Seguir contando por fecha y bloquear las fechas de días cerrados

Obligaría a rechazar el cobro que se cargó tarde, que es plata que está en el cajón. La recepcionista no lo cargaría nunca, o le pondría la fecha de hoy y mentiría la fecha.

### Reabrir el cierre viejo cuando se corrige un cobro

Un cierre es lo que se vio ese día y lo que se decidió retirar con eso. Reescribirlo dejaría el retiro de ese día apoyado en un número que ya no dice lo mismo, y el fondo de mañana encadenado a otro. La corrección entra hoy, que es cuando pasó.

### Sumar en cada pantalla, pero "con cuidado"

Es lo que había. Cada pantalla nueva era una sexta cuenta.

## Consecuencias

- ⚠️ **Toda pantalla nueva que diga "cuánto entró" pregunta al libro.** Nunca una consulta propia sobre `gym_payment`.
- ⚠️ **La cantina escribe en el libro y en el sello**, no por un camino propio (ver la nota de la memoria del 22/09).
- ⚠️ **Los campos del sello los escribe solo el cierre** (`insertable/updatable = false` en la entidad). Si JPA pudiera escribirlos, una edición en otra pestaña pisaría el sello con el valor viejo y el cobro entraría dos veces.
- El primer cierre después de la V88 puede traer "cobros con fecha de días anteriores": son los que la regla vieja nunca contó. La pantalla los muestra con su día.
- Los aportes y retiros del dueño ya no cuentan como ingreso ni gasto en el Excel; van en su propio renglón.

## Cuándo reconsiderar

- Si aparece un segundo terminal que cierra caja de forma independiente (hoy es uno solo por gimnasio, ver el núcleo local).
- Si la ventana de 30 días de la carga histórica deja afuera plata real de algún gimnasio (se vería como "cobros de hace más de 30 días" en el log del cierre).
