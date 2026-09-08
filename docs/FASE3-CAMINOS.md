# Fase 3 — El mapa de los caminos que tocan plata

**Fecha:** 2026-09-07 · **Estado:** decidido, sin construir

Este documento existe por una lección de la fase 2: **cinco arreglos quedaron a mitad de camino** porque la regla nueva se enganchó donde uno estaba mirando y no en todos los caminos que la usan. Las cinco veces los tests estaban en verde y las encontró el dueño mirando la pantalla.

Con accesos eso cuesta una visita mal contada. Con plata cuesta plata. Así que acá se enumeran **todos** los caminos primero, y recién después se escribe código.

Decisión de firma: ver [ADR-012](adr/ADR-012-firma-declarada-sin-conexion.md).

---

## Las decisiones tomadas

| | Decisión | Consecuencia |
|---|---|---|
| **1** | **Alta de socio y cobro en el mismo acto, sin internet: SÍ** | El orden de la cola tiene que cruzar tipos: el alta sube antes que el cobro a ese socio |
| **2** | **Anular un movimiento sin conexión: NO** | Es una corrección, puede esperar a que haya internet |
| **3** | **El cierre calcula el número COMPLETO** | Sale gratis del orden estricto — ver abajo, no hace falta aritmética nueva en el servidor |

---

## Los cinco caminos

| # | Camino | Endpoint | Qué escribe | **Qué MÁS cambia** | Offline |
|---|---|---|---|---|---|
| 1 | Cobrar cuota | `POST /gym/payments` | fila en `gym_payments` | corre `membershipEnd` **y reactiva al socio** | **cola** |
| 2 | Alta de socio | `POST /gym/members` | fila en `gym_members` | — | **cola** |
| 3 | Egreso / movimiento | `POST /gym/caja/movimientos-de-caja` | movimiento de caja | el arqueo del día | **cola** |
| 4 | Anular movimiento | `POST .../{id}/anular` | marca anulado | el arqueo | **no** (decisión 2) |
| 5 | Cierre de caja | `POST /gym/caja/cierre` | el cierre | **define el fondo de mañana** | **cola** |

Y las **lecturas** que el mostrador necesita para dibujarse: `abierto`, `estado`, `movimientos`, `balance`. Hoy sin conexión fallan todas — mismo síntoma que el *"Cargando…"* eterno que apareció en la fase 2.

---

## Lo que se descubrió leyendo el código, y cambia el plan

### 🔴 Un cobro duplicado no duplica una venta: REGALA UN MES

`aplicarPeriodoDelPlan` arranca el período **donde termina la cobertura vigente del socio**, no en "hoy". Está bien pensado —el que paga el 25 teniendo cuota hasta el 30 no pierde esos cinco días—, pero significa que **la segunda copia arranca donde terminó la primera**: el socio se lleva 30 días gratis y el ingreso del día queda contado dos veces.

Es el mismo patrón que en accesos ("un reintento no duplica, **invierte**"): el daño real no es la fila de más, es el efecto lateral.

### ⭐ La pieza más difícil ya está construida

`AssignableUuidGenerator` (Fase 0, ADR-003) **respeta un id pre-asignado**. O sea que el terminal puede generar el UUID del socio nuevo localmente y encolar el cobro de ese socio detrás del alta **sin remapear nada**. Ese era el problema más feo de la decisión 1 y tiene el cimiento puesto desde hace meses.

⚠️ **Pero su propia documentación avisa de la trampa:** `save()` con id no nulo hace **merge** (SELECT previo), así que **el id solo no rechaza un duplicado — lo pisa**. Y peor: al pasar de nuevo por el servicio, **el efecto lateral se ejecuta otra vez** (la cobertura se extiende de nuevo). El id no alcanza.

### ⚠️ El cierre lo calcula el SERVIDOR, no el cliente

`CajaService.cerrar` computa con `contar(desde, hasta)` del lado del servidor. **No se puede implementar la decisión 3 mandándole totales desde el terminal.**

⭐ **Y no hace falta:** si el cierre viaja en la misma cola y el orden es estricto, **los cobros llegan antes que el cierre**. Cuando el cierre se ejecuta, `contar()` ya los ve. El número completo sale solo, calculado donde corresponde. La decisión 3 no necesita aritmética nueva: necesita que el cierre esté en la misma cola.

---

## Lo que se deriva de las decisiones

### A · La cola deja de ser "de accesos" y pasa a ser UNA cola

Hoy `cola_accesos` tiene forma de acceso y `client_ref` de clave primaria. Con la decisión 1, el orden tiene que valer **entre tipos distintos** (alta → cobro), y eso solo se garantiza si todo está en **la misma tabla**: `(client_ref, tipo, payload, ocurrido_en, …)`.

Es una migración de la base local. La regla de orden estricto que ya existe la cubre entera — pero solo si hay una sola cola.

### B · Todo lo encolado viaja con su MOMENTO REAL

Ya vale para accesos. Con la decisión 3 pasa a ser **obligatorio para el cierre**, y es el requisito que casi se nos pasa:

> `cerrar` usa `hasta = LocalDateTime.now()` **del servidor**. Si el cierre se hace a las 22:00 sin internet y sube a las 09:00 del día siguiente, sin momento propio barrería **las ventas de la mañana siguiente** dentro del cierre de ayer.

Lo mismo para los cobros: si no llevan su momento, caen fuera del período que el cierre ya contó y descuadran los dos días.

### C · La idempotencia va en la BASE, no en el código

Copiar el patrón de la V54 tal cual: **`client_ref` + índice único parcial por tenant** en `gym_payments` y en los movimientos de caja. Y del lado del servicio, el patrón que ya funciona en `registerScan`:

> **antes de tocar nada**, si ese `client_ref` ya está guardado, devolver el que está y no ejecutar ningún efecto lateral.

Sin ese "antes de tocar nada", el merge del id vuelve a extender la cobertura.

### D · El cierre local muestra un número, el servidor calcula otro

Para que la persona pueda cerrar sin internet, la pantalla tiene que **mostrarle el número completo** — y eso obliga a calcularlo también en el terminal. Son **dos cuentas de la misma plata**, que es exactamente el patrón que en este proyecto salió mal todas las veces (⚠️ *toda cuenta de fechas copiada estaba mal en alguna copia*).

Mitigación, copiando lo que ya funcionó con los días del socio: **el terminal manda lo que mostró, el servidor calcula lo suyo, y si difieren queda registrado.** No se corrige solo; se hace ruido. Es la misma idea que `compararConElServidor`.

### E · Firma, según ADR-012

Cada uno de los cinco caminos guarda **quién** y **con qué nivel de firma**: verificada / declarada / sin identificar.

---

## Las reglas que no se pueden violar

Se escriben ahora y se prueban **todas juntas**, como se hizo con las visitas (`InvariantesDeVisitasIntegrationTest`), y **contra Postgres de verdad** — los bugs de esta familia siempre fueron *qué consulta se usa*, y un mock repite justo lo que uno ya creía.

1. **Un reintento no duplica una venta ni extiende la cobertura dos veces.**
2. **El orden de llegada no cambia ningún total.** Ni el del día, ni el del cierre.
3. **Un alta siempre sube antes que el cobro a ese socio.**
4. **Un cierre nunca cuenta plata de otro día**, llegue cuando llegue.
5. **La caja nunca se frena** por no poder identificar a nadie ni por tener cola pendiente.
6. **Ningún total se muestra como si fuera completo cuando no lo es.**

---

## Los bordes que quedan abiertos

Se dejan escritos porque son reales, no porque estén resueltos.

- **Un encolado que el servidor rechaza definitivamente, después de que un cierre ya lo contó.** El cierre contó plata que el servidor nunca va a tener. No puede descartarse en silencio: tiene que aparecer en algún lado.
- **Un alta reintentada pisa ediciones posteriores.** Como `save()` hace merge, si alguien editó ese socio después, el reintento lo devuelve al estado viejo. Con un solo terminal es improbable, pero no imposible.
- **Anular un movimiento que todavía no subió.** La decisión 2 lo saca de la cola, pero queda la pregunta de qué ve la pantalla si alguien intenta anular algo que está encolado.

---

## Orden de construcción propuesto

1. ✅ **La migración**: `client_ref` + índice único en `gym_payments` y movimientos de caja. Nada funciona sin esto.
2. ✅ **La cola general** (una tabla, con tipo) y la migración de la de accesos.
3. ✅ **Cobro offline**, que es el camino más usado y el que valida el diseño entero.
4. ✅ **Alta + cobro en el mismo acto** (la decisión 1, el caso del orden cruzado).
5. ✅ **Egresos.**
6. ⬜ **Cierre de caja**, último: depende de que todo lo anterior tenga su momento real.

### Lo que dejó el paso 5, y le sirve al 6

- **`MomentoDeclarado`** — la regla de *"el reloj del terminal se acota, no se cree"* (futuro → ahora; más de 36 h de atraso → el límite) salió de adentro de `AccessLogService`, donde era privada, y ahora es de los dos. El cierre va a necesitar exactamente la misma, y era la cuarta cuenta de fechas a punto de duplicarse en este proyecto.
- **⛔ Pero NO sirve para una fecha que elige una persona.** El portal deja cargar un pago hecho la semana pasada; acotarlo a 36 horas lo convertiría en uno de anteayer sin avisarle a nadie. Por eso `paymentDate` **no** pasa por ahí, y queda anotado que ese camino sigue sin acotar.
- **Un agujero que no estaba en el plan**: la lista de movimientos existe, según su propio endpoint, *"para no cargar dos veces el mismo gasto"* — y sin conexión aparecía **vacía**. Anotar un gasto y no verlo lleva derecho a cargarlo de nuevo, y ahí el faltante lo inventa el sistema. Los pendientes ahora van en la misma lista, marcados, y **sin botón de anular** (decisión 2: no se anula lo que del otro lado todavía no existe).
- **`registrar` tiene dos firmas.** La vieja —sin sello ni momento— sigue siendo la del camino con internet, donde los pone el servidor. Lo encolado usa la nueva.
