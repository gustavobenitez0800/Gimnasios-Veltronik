# Normalización del esquema — auditoría y plan

> Estado: **primera tanda ejecutada** (migraciones V67→V73 + `EsquemaInvariantesTest`).
> Fecha: 2026-09-12. Base auditada: las 62 migraciones V1→V66 aplicadas sobre una
> PostgreSQL 16 virgen.

---

## Cómo se hizo la auditoría

No se leyó el SQL para deducir el esquema: se **levantó la base**. Se corrieron las 62
migraciones de punta a punta sobre una PostgreSQL embebida y se volcó el catálogo real
(`pg_class`, `pg_attribute`, `pg_constraint`, `pg_indexes`, `pg_policy`). Todo lo que sigue
sale de ahí, no de una lectura.

Esto importa porque el esquema de Veltronik tiene ocho años de migraciones encima —
unificaciones (V6), separaciones (V10), verticales dados de baja (V40→V43), reconciliaciones
de deriva (V16, V29) — y lo que las migraciones *dicen* línea por línea no es evidente. Lo
que la base *es* después de correrlas, sí.

El resultado de la auditoría: **22 tablas vivas, 4 tablas muertas, y nueve problemas.**

---

## Lo que se encontró

### 🔴 1. Producción y las migraciones no decían lo mismo (RLS)

El hallazgo más grave, y no es de normalización: es de seguridad.

El 2026-09-06 se cerró el agujero de RLS —la clave `anon` de Supabase viaja horneada en el
bundle del instalable y llegaba a leer todo `public`— **pero se cerró a mano en el panel de
Supabase**. En el repositorio no había una sola línea de RLS: las 62 migraciones crean 22
tablas y ninguna lo prendía.

El costo no es teórico y tiene fecha: el día que la base se reconstruya desde las
migraciones —una restauración, una réplica, un staging, la base de un cliente nuevo— **nace
con el agujero abierto**, sin que nadie haya tocado nada y sin un error que lo delate.

Es exactamente la lección que ya había dejado el outage del kiosco: *el esquema de
producción tiene que estar 100% en las migraciones*.

**Cerrado en V68**, con verificación previa de que no rompe nada: el frontend usa
`supabase.` **solo para auth** (cero `.from(...)` contra tablas, revisado en `frontend/src`
y `landing/`), y el backend entra con su propia conexión Postgres como dueño de las tablas,
que no pasa por RLS.

### 🔴 2. Dos ortografías para el mismo estado — ya costó plata mal contada

`gym_payments.status` y `payment_method` son VARCHAR libres sin restricción, y juntaron
varias formas de escribir lo mismo. Hoy **seis lugares del código se defienden** con
`LOWER()`, `UPPER()`, `equalsIgnoreCase` y `.toLowerCase()`.

Ya se rompió dos veces, y las dos están documentadas en el propio código:

1. **La suma de cobros estaba mal.** La entidad nacía con `"PAID"` y el frontend guardaba
   `"paid"`; la consulta que sumaba con `=` exacto contaba la mitad.
2. **Mercado Pago desaparecía del arqueo.** `payment_method` acepta tres formas del mismo
   medio (`MERCADOPAGO`, `MERCADO_PAGO`, `MP`) y el `switch` de `CajaService` miraba una:
   las otras dos caían en `default -> otros`. El gimnasio que cobraba por MP no encontraba
   esa plata en el cierre.

Los dos se arreglaron **donde se leía**. Nunca se arregló el dato, así que la causa seguía
entera: cada consulta nueva volvía a empezar con la misma trampa. Y el `DEFAULT 'PAID'` de
la V10 seguía enchufado, contradiciendo a la aplicación que escribe `"paid"`.

**Cerrado en V72**: el dato queda con una sola ortografía y el default deja de contradecir
a la aplicación.

### 🟡 3. Cuatro tablas muertas con datos personales adentro

`gym_member`, `member_payment`, `member_subscription` y `membership_plan` son del modelo
original (V1/V2). El modelo se reemplazó en dos pasos y desde entonces **nadie las nombra**:
cero referencias en backend, cero en frontend, cero entidades JPA.

Pero `gym_member` guarda nombre, apellido, DNI, email y teléfono de socios reales: datos
personales sin dueño, sin uso y sin política de retención. La peor combinación — el riesgo
de tenerlos sin el beneficio de usarlos. Y ocupaban el nombre bueno: `gym_member`
(singular, que es hacia donde hay que ir) estaba tomado por un cadáver.

**Cerrado en V67.** La migración **se niega a borrar lo que no puede probar que está en
otro lado**: verifica fila por fila que cada id viejo exista hoy en `gym_members` /
`gym_payments`, exige que las dos sin destino estén vacías, y si algo no cierra **aborta sin
borrar nada** y dice qué encontró.

> **Se descartó archivarlas en un esquema `legacy`.** La purga de cuenta (V50) mira solo
> `public`: con las tablas afuera, sus FK a `tenant` seguirían vivas pero fuera de su
> alcance, y borrar un negocio pasaría a fallar. Además, borrar la cuenta es una promesa al
> cliente — guardarle el padrón en un esquema escondido es incumplirla en silencio.

### 🟡 4. El modelo mentía sobre `created_at` / `updated_at`

`BaseEntity` declara las dos columnas `nullable = false`. **Ocho tablas las tenían
nullable.**

El build no lo delataba: `ddl-auto=validate` compara **tipos, no nulabilidad**. La mentira
podía quedarse para siempre sin ponerse roja.

Y `created_at` no es decoración: es la línea de tiempo con la que se ordena, con índices
montados encima (`ix_pago_ajuste_tenant_fecha`). Una fila con `created_at` nulo cae en un
lugar indefinido de ese orden — en un historial de quién editó un cobro, es una fila que se
esconde.

**Cerrado en V70.** El relleno **no estampa `NOW()`**: usa la fecha de negocio que ya está
en cada fila y que sí es cierta (`payment_date`, `fecha`, `hasta`, `booking_date`…), porque
lo fácil habría sido mentir de nuevo, más prolijo — dejando cobros de 2025 diciendo que se
crearon hoy.

### 🟡 5. La plata se guardaba de tres formas

Mismo concepto, tres tipos, según qué migración creó la columna: `NUMERIC(10,2)`,
`NUMERIC(12,2)` y `NUMERIC(14,2)`. Y no solo entre tablas: **dentro de `caja_cierre`
convivían dos** — `esperado_efectivo` es (12,2) y `egresos_efectivo` es (14,2), en la misma
fila, sumando la misma caja.

**Esto no era un bug**: la aritmética `numeric` de Postgres no pierde precisión al mezclar
escalas y nadie está cerca de los topes. Lo que arregla es que cada columna nueva dejaba de
ser una decisión a tomar de cero, con una regla que no se puede aplicar mal.

**Cerrado en V69**: todo importe es `NUMERIC(14,2)`.

### 🟡 6. Nueve referencias sin FK — de las que solo dos había que atar

Nueve columnas que son el id de otra fila y no tienen FK. La reacción sana es "ponéselas a
todas", y **habría sido un error**. Se revisaron una por una:

| Columna | Decisión |
|---|---|
| `caja_movimiento.sesion_id` | ✅ FK — la asigna el servidor desde una fila que ya existe |
| `caja_sesion.cierre_id` | ✅ FK — ídem |
| **`gym_payment_ajuste.payment_id`** | ⛔ **NO** — ver abajo |
| `access_log.scanner_id` | ⛔ No es una fila de esta base: es el id que se genera el teléfono |
| `origin_device_id` / `performed_by_cashier_id` (14 tablas) | ⛔ Son firmas: sobreviven a la baja de quien firmó |
| `device_registry.*` (3) | ⛔ Un equipo vive entre negocios; la purga lo suelta, no lo borra |

**La trampa era `gym_payment_ajuste.payment_id`**: es `NOT NULL`, se llama `payment_id` y
apunta a `gym_payments`. Ponerle FK **habría roto borrar un cobro**, que es de lo más usado
del mostrador — porque el ajuste de tipo `BORRADO` es el acta de defunción del cobro, y
`GymPaymentService` anota primero y borra la fila después. Con `CASCADE` sería peor: borrar
el cobro se llevaría puesto el registro de que alguien lo borró.

**Cerrado en V71**, que ata las dos que van y **deja escrito en la base misma** (`COMMENT ON
COLUMN`) por qué las otras siete no. El comentario viaja con la columna: el próximo que
piense "acá falta una FK" encuentra la respuesta donde le nació la duda.

### 🟡 7. Cinco FK sin índice — dos de ellas con un índice que *parece* servir

Las encontró `EsquemaInvariantesTest` la primera vez que corrió. Dos son la trampa fina:

```
idx_access_denied_socio  ON access_denied (tenant_id, member_id, occurred_at DESC)
ix_gym_members_plan      ON gym_members   (tenant_id, plan_id)
```

Los dos son perfectos para la consulta que los motivó, pero **la columna de la FK va
segunda**. Postgres solo entra a un índice compuesto por su primera columna: para responder
"¿alguien apunta a este socio?" no lo usa, recorre la tabla entera. Se paga en la purga de
cuenta (V50), que recorre las tablas hasta diez veces.

**Cerrado en V71.**

### 🟢 8. Una bandera de baja lógica con dos nombres

Cinco tablas la llaman `is_active`; `checkin_point` la llama `active`. La prueba de que
molesta está en la consulta que resuelve cada escaneo de QR, dos renglones pegados:

```sql
AND cp.active   = true
AND t.is_active = true
```

**Cerrado en V73.** Seguro con clientes instalados: el nombre de la columna no viaja al
cliente (Jackson serializa por el nombre de la propiedad Java), `checkin_point` no se
devuelve como entidad cruda, y la única consulta SQL que la nombra se actualizó en el mismo
commit.

### 🟢 9. Columnas sin uso, ahora marcadas

`gym_members.user_id` la agregó la V29 para un "socio con cuenta propia" que nunca se
construyó: **ningún código la escribe ni la lee**. Queda marcada con `COMMENT` como
candidata a borrarse, para que la próxima limpieza no tenga que volver a investigarlo.

Marcadas también, para distinguir "esto sobró" de "esto se dejó a propósito":
`gym_members.classes_remaining` y `gym_plans.duration_days`, las dos congeladas por decisión
explícita (ADR-013).

---

## La pieza que evita que esto vuelva a pasar

`backend/src/test/java/com/veltronik/v2/support/EsquemaInvariantesTest.java`

Una regla que vive en un comentario de una migración de 2026 no la va a leer el que agregue
una tabla en 2027. Y el día que se la saltee **no se va a poner nada en rojo**: la base
simplemente vuelve a tener dos opiniones sobre cada cosa, de a una columna por vez.

El test corre sobre la misma base virgen que `ApplicationBootTest` y verifica cinco
invariantes:

1. **Ninguna tabla de `public` sin RLS.** El más importante: es lo único que separa la clave
   `anon` —que está en el bundle del instalable— de los datos de todos los gimnasios.
2. **Ninguna tabla dada de baja vuelve.**
3. **Todo importe es `NUMERIC(14,2)`.** Busca por nombre de columna, así agarra la que
   alguien agregue mañana sin leer la V69.
4. **`created_at` / `updated_at` nunca nullable.** Lo que `ddl-auto=validate` no mira.
5. **Toda FK de una columna tiene índice del lado hijo.**

Cada falla nombra la tabla, la columna y la migración que estableció la regla.

---

## Lo que NO se hizo, y por qué

Hay una restricción que manda sobre todo lo que queda: **hay clientes con la 2.6.31
instalada en su mostrador, y no se los puede actualizar de prepo.** El backend deploya solo
al pushear `main`; el escritorio se actualiza cuando electron-updater lo alcanza. Entre los
dos momentos hay una ventana en la que el backend nuevo atiende clientes viejos.

Eso parte lo que queda en dos grupos, y la línea **no es "renombrar es peligroso"** sino
**"¿cambia el JSON que ve el cliente?"**:

- El espejo local del escritorio guarda **DTOs en camelCase**, no columnas. Los nombres de
  la base están aislados del cliente por la capa de mappers.
- La única excepción es **`caja_cierre`**, que `CajaController` devuelve como entidad cruda
  en tres endpoints. Sus nombres de columna **sí** son contrato con el cliente.

### Tanda 2 — no cambian el contrato JSON (se pueden hacer ya)

| Qué | Por qué |
|---|---|
| `gym_members` → `gym_member`, `gym_payments` → `gym_payment`, `gym_plans` → `gym_plan`, `subscriptions` → `subscription` | Tres convenciones de plural/singular conviven. La V67 liberó el nombre `gym_member`. |
| Unificar prefijos de índice (`idx_`, `ix_`, `ux_`, `uq_` → dos) y nombres de constraint (hoy mitad explícitos, mitad default de Postgres) | |
| Borrar `gym_members.user_id` | Ya está marcada. |

### Tanda 3 — cambian el contrato JSON (van con una versión del cliente)

| Qué | Por qué importa |
|---|---|
| **`gym_members.birth_date` es `text`** | El modelo original la tenía `date` y la reescritura perdió el tipo. Hoy, para buscar cumpleaños, `GymMemberRepository` hace `SUBSTRING(m.birth_date FROM 6 FOR 5)`: string-slicing sobre una columna sin validar, que falla en silencio con cualquier formato raro. |
| **`gym_members.attendance_days` es `text` con un JSON adentro** (`'[]'`) | Viola 1NF y ni siquiera es `jsonb`: no se puede consultar. |
| **`gym_class.start_time` / `end_time` son `varchar(10)`** | Nada impide `"25:99"`. |
| **`caja_cierre.esperado_*`: grupo repetitivo** | Cinco columnas, una por medio de pago, es la dimensión "medio de pago" aplanada. Agregar QR o débito = `ALTER TABLE` + entidad + DTO + frontend. Y `declarado_digital` vuelve a juntar cuatro, así que el arqueo **no puede decir cuál de los digitales falló**. Debería ser una tabla hija. |
| **CHECK en `status` / `payment_method` / `metodo`** | El vocabulario ya quedó escrito en V72. El CHECK va con la versión que garantice que el cliente no manda otra cosa: cerrarlo antes cambia un número mal contado por **un cobro que no entra en el mostrador**. |

### Tanda 4 — la grande: `timestamp` → `timestamptz`

Las 22 tablas guardan **`timestamp without time zone`**, en un negocio que ya se quemó dos
veces con esto (el bug server-UTC vs dominio-AR, y el test que fallaba solo entre 00:00 y
00:59). Hoy la corrección depende de que la JVM esté fijada a hora argentina: es decir, **de
una variable de entorno del deploy, no del dato**.

Eso ya mordió en Cajita, en la misma máquina: un JRE 17.0.12 daba −04 y un 17.0.19 daba −03,
porque la tzdata viaja adentro del JRE. Si la zona de la JVM alguna vez está mal, **todos los
instantes guardados se corren en silencio**, sin un error.

Es la más valiosa de las que quedan y la de mayor radio de impacto: toca las 22 tablas,
todas las entidades y toda la lógica de fechas. Merece su propio ADR y su propia rama.

---

## Migraciones de esta tanda

| | |
|---|---|
| `V67__Sacar_Las_Tablas_Muertas.sql` | Las 4 tablas del modelo original, con guardas que abortan si no puede probar que los datos están en otro lado |
| `V68__Rls_En_Las_Migraciones.sql` | RLS en las 22 tablas + revocar `anon`/`authenticated` (no-op en prod, donde ya está) |
| `V69__La_Plata_Habla_Un_Solo_Idioma.sql` | Todo importe a `NUMERIC(14,2)` |
| `V70__Las_Marcas_De_Tiempo_Dejan_De_Mentir.sql` | `created_at`/`updated_at` NOT NULL, rellenadas con la fecha de negocio de cada fila |
| `V71__Las_Referencias_Sueltas.sql` | 2 FK nuevas, 7 índices, y por escrito las 7 referencias que **no** hay que atar |
| `V72__Los_Estados_Dejan_De_Tener_Dos_Ortografias.sql` | Una ortografía por estado + CHECK donde el escritor es un enum de Java |
| `V73__Un_Solo_Nombre_Para_La_Baja_Logica.sql` | `checkin_point.active` → `is_active` |

## Antes de aplicar en producción

1. **Backup / punto de restauración en Supabase.** La V67 borra tablas. Tiene guardas, pero
   el backup es lo que hace que una sorpresa sea reversible.
2. **Mirar el resultado de las guardas de la V67.** Si aborta, no borró nada: el mensaje
   dice exactamente cuántas filas quedaron sin equivalente. Eso es información, no un
   fracaso — quiere decir que hay datos que solo viven ahí y hay que decidirlos a mano.
3. **Confirmar que RLS ya está prendido en prod** (debería: se cerró el 6/9). Si por algún
   motivo no lo estuviera, la V68 lo prende — y ahí sí conviene verificar a mano que el rol
   con el que entra el backend es dueño de las tablas.
