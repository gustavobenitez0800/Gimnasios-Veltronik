# Normalización del esquema — auditoría y plan

> Estado: **normalización completa** (migraciones V67→V79 + `EsquemaInvariantesTest`).
> Fecha: 2026-09-12. Base auditada: las 62 migraciones V1→V66 aplicadas sobre una
> PostgreSQL 16 virgen. Suite: 420 tests en verde.
>
> **Resultado: 22 tablas, todas en singular, todas con RLS, todo importe en `NUMERIC(14,2)`,
> cada índice y constraint bajo una sola convención, y seis invariantes que lo sostienen
> desde el build.**

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

### 🔴 3. Cuatro tablas muertas — y 114 socios que solo viven en una de ellas

`gym_member`, `member_payment`, `member_subscription` y `membership_plan` son del modelo
original (V1/V2). El modelo se reemplazó en dos pasos y desde entonces **nadie las nombra**:
cero referencias en backend, cero en frontend, cero entidades JPA.

La V67 iba a borrar las cuatro, verificando antes que el dato estuviera en otro lado. **En
producción esa verificación falló, y por eso existe este apartado:**

```
ERROR: V67 ABORTADA: hay datos que solo viven en las tablas viejas.
Detail: socios sin equivalente en gym_members: 114 | pagos sin equivalente: 0
        | filas en membership_plan: 0 | filas en member_subscription: 0
Hint:   No se borró nada.
```

Se los revisó, y no son fantasmas:

| | |
|---|---|
| De negocios que ya no existen | **0** |
| De negocios **que siguen vivos** | **114** |
| Con el mismo DNI ya en el padrón actual | **1** (o sea: 113 no están) |
| Rango de alta | 2026-01-23 → 2026-05-27 |

Son **114 personas de clientes activos**, con nombre, DNI, email y teléfono, dadas de alta
mientras `gym_member` era la tabla viva, que se perdieron en algún punto del camino V6 →
V10. Sin la guarda, este deploy las borraba en silencio: el padrón seguía andando igual y
nadie se enteraba hasta que alguien preguntara por una de ellas.

**Cómo se resolvió, en dos pasos y con una decisión de por medio:**

1. La **V67** borró las tres que sí estaban probadas (`member_payment` con 0 huérfanos, las
   otras dos vacías) y dejó `gym_member` intacta, porque una migración de limpieza no puede
   decidir sola sobre 114 personas.
2. Se puso el caso completo sobre la mesa —con los números de arriba y las dos salidas
   posibles, recuperarlos al padrón o darlos de baja— y **la decisión del dueño fue
   explícita: se borran.** La **V74** la ejecuta.

Vale dejar escrito lo que se sabe sobre qué son esos 114, porque respalda la decisión: el
borrado de socio es **duro** (`GymMemberService` → `repository.delete(member)`) y
`gym_member` es una foto congelada en el momento del cutover, así que **todo lo que se borró
de `gym_members` después sigue ahí**. Que 113 de 114 no tengan el DNI en el padrón actual
encaja con "los borraron a propósito" mucho mejor que con "se perdieron". Y si alguno fue
borrado a pedido de la persona, conservar la copia era un pasivo, no un activo.

> **Se descartó archivarlas en un esquema `legacy`.** La purga de cuenta (V50) mira solo
> `public`: con las tablas afuera, sus FK a `tenant` seguirían vivas pero fuera de su
> alcance, y borrar un negocio pasaría a fallar.

Efecto secundario que importa: al irse la vieja `gym_member`, **quedó libre el nombre bueno**
—singular— y la V75 lo pudo usar para el padrón de verdad.

> **Se descartó archivarlas en un esquema `legacy`.** La purga de cuenta (V50) mira solo
> `public`: con las tablas afuera, sus FK a `tenant` seguirían vivas pero fuera de su
> alcance, y borrar un negocio pasaría a fallar. Además, borrar la cuenta es una promesa al
> cliente — guardarle el padrón en un esquema escondido es incumplirla en silencio. Que
> `gym_member` se quede en `public` es justamente lo que la mantiene alcanzada por la purga.

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

### 🟢 9. Columnas sin uso

`gym_member.user_id` la agregó la V29 para un "socio con cuenta propia" que nunca se
construyó: **ningún código la escribe ni la lee**. Y `classes_remaining` quedó del cupo de
clases, dado de baja el 2026-09-02 (ADR-013).

La V71 las marcó con `COMMENT` en vez de borrarlas —para que la próxima limpieza no tuviera
que volver a investigarlas— y la **V76** las borró. Diez días de gracia alcanzaron: el
comportamiento nuevo ya estaba en manos de los clientes y `MemberAccessPolicyTest` había
probado que el dato viejo no cambiaba ninguna decisión.

Borrar `classes_remaining` además **cierra la puerta**: mientras la columna existiera,
alguien podía volver a colgarle lógica sin saber que el cupo se dio de baja por decisión del
dueño.

**`gym_plan.duration_days` NO se borró**, y la diferencia es la regla de toda esta tanda:
sigue viva en el contrato con el cliente —`PaymentsPage.jsx` la lee para escribir "1 mes" o
"15 días" en la pantalla de cobro— así que sale con la versión del escritorio que deje de
mirarla.

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

## La línea que decidió qué se podía tocar

Hay una restricción que mandó sobre todo: **hay clientes con la 2.6.31 instalada en su
mostrador, y no se los puede actualizar de prepo.** El backend deploya solo al pushear
`main`; el escritorio se actualiza cuando electron-updater lo alcanza. Entre los dos
momentos hay una ventana en la que el backend nuevo atiende clientes viejos.

La línea **no fue "renombrar es peligroso"** sino **"¿cambia el JSON que ve el cliente?"**:

- El espejo local del escritorio guarda **DTOs en camelCase**, no columnas. Los nombres de
  la base están aislados del cliente por la capa de mappers. Por eso se pudieron renombrar
  cuatro tablas y ~110 índices y constraints sin tocar nada del contrato.
- Jackson serializa por el nombre de la **propiedad Java**, no el de la columna: cambiar
  `@Column(name = ...)` deja el JSON idéntico.
- Los cambios de TIPO se hicieron dejando el **DTO en `String`** y convirtiendo en un solo
  punto controlado. `birth_date` pasó a `date` y `attendance_days` a `jsonb` sin que el
  JSON cambie un byte.
- La única tabla cuyos nombres de columna **sí** son contrato es **`caja_cierre`**, que
  `CajaController` devuelve como entidad cruda en tres endpoints. No se tocó.

### Lo que queda, y por qué

| Qué | Por qué no se hizo |
|---|---|
| **`caja_cierre.esperado_*`: grupo repetitivo** (cinco columnas, una por medio de pago) | Es la única violación de 1NF que queda, y es real: agregar QR o débito hoy es `ALTER TABLE` + entidad + DTO + frontend, y `declarado_digital` junta cuatro medios así que el arqueo **no puede decir cuál de los digitales falló**. Pero `caja_cierre` es la única entidad que viaja cruda al cliente: partirla en una tabla hija cambia el JSON del cierre de caja. Va con una versión del escritorio. |
| **`gym_class.start_time` / `end_time` son `varchar(10)`** | Nada impide `"25:99"`. Se puede arreglar con el mismo patrón que `birth_date` (DTO en String, conversión en el mapper), pero el módulo de clases es secundario y no justificaba sumar riesgo en la misma tanda. |
| **`gym_plan.duration_days`** | Reemplazada por `cobertura_cantidad` + `cobertura_unidad` (V65, ADR-013), pero **sigue viva en el contrato**: `PaymentsPage.jsx` la lee para escribir "1 mes" o "15 días" en la pantalla de cobro. |
| **CHECK validados en `status` / `payment_method` / `metodo`** | Están puestos pero `NOT VALID`: aplican a toda fila nueva y no revisan las viejas. Promover con `VALIDATE CONSTRAINT` cuando el log del deploy confirme que el pasado está limpio. |

### La grande que queda: `timestamp` → `timestamptz`

Las 22 tablas guardan **`timestamp without time zone`**, en un negocio que ya se quemó dos
veces con esto (el bug server-UTC vs dominio-AR, y el test que fallaba solo entre 00:00 y
00:59). Hoy la corrección depende de que la JVM esté fijada a hora argentina: **de una
variable de entorno del deploy, no del dato**.

Eso ya mordió en Cajita, en la misma máquina: un JRE 17.0.12 daba −04 y un 17.0.19 daba
−03, porque la tzdata viaja adentro del JRE. Si la zona de la JVM alguna vez está mal,
**todos los instantes guardados se corren en silencio**, sin un error.

Es la más valiosa de las que quedan y la de mayor radio de impacto: toca las 22 tablas,
todas las entidades y toda la lógica de fechas. Merece su propio ADR y su propia rama.

---

## Migraciones

| | |
|---|---|
| `V67__Sacar_Las_Tablas_Muertas.sql` | 3 tablas del modelo original, con guardas que abortan si no puede probar que los datos están en otro lado |
| `V68__Rls_En_Las_Migraciones.sql` | RLS en todas las tablas + revocar `anon`/`authenticated` (no-op en prod, donde ya está) |
| `V69__La_Plata_Habla_Un_Solo_Idioma.sql` | Todo importe a `NUMERIC(14,2)` |
| `V70__Las_Marcas_De_Tiempo_Dejan_De_Mentir.sql` | `created_at`/`updated_at` NOT NULL, rellenadas con la fecha de negocio de cada fila |
| `V71__Las_Referencias_Sueltas.sql` | 2 FK nuevas, 7 índices, y por escrito las 7 referencias que **no** hay que atar |
| `V72__Los_Estados_Dejan_De_Tener_Dos_Ortografias.sql` | Una ortografía por estado + CHECK `NOT VALID` donde el escritor es un enum de Java |
| `V73__Un_Solo_Nombre_Para_La_Baja_Logica.sql` | `checkin_point.active` → `is_active` |
| `V74__Los_114_Socios_Y_La_Ultima_Tabla_Muerta.sql` | `gym_member` (la vieja) sale con sus 114 socios, por decisión explícita del dueño |
| `V75__Una_Fila_Es_Una_Cosa_En_Singular.sql` | `gym_members`→`gym_member`, `gym_payments`→`gym_payment`, `gym_plans`→`gym_plan`, `subscriptions`→`subscription` |
| `V76__Las_Columnas_Que_No_Usa_Nadie.sql` | Fuera `user_id` y `classes_remaining` |
| `V77__Un_Solo_Criterio_Para_Los_Nombres.sql` | ~110 índices y constraints bajo `pk_`/`fk_`/`ux_`/`ix_`/`ck_`, y un índice duplicado que se pagaba en cada cobro |
| `V78__La_Fecha_De_Nacimiento_Es_Una_Fecha.sql` | `birth_date` de `text` a `date` — se acabó buscar cumpleaños recortando un string |
| `V79__Los_Dias_Que_Viene_El_Socio_Son_Una_Lista.sql` | `attendance_days` de `text` a `jsonb`, validado y consultable |
---

## Lo que pasó en el primer deploy (2026-09-12) — y qué dejó como lección

El primer push a `main` **falló el deploy**, y conviene dejar escrito cómo, porque salió
mejor de lo que suena.

**Qué pasó.** Flyway arrancó, llegó a la V67 y su guarda abortó con los 114 socios. Spring
Boot no levantó, el contenedor nunca escuchó en el puerto y Cloud Run **nunca enrutó tráfico
a la revisión nueva**: siguió sirviendo la anterior. Los clientes no se enteraron.

**El estado en el que quedó la base: intacto.** El log lo dice —`Current version of schema
"public": 66`— y la razón es que PostgreSQL tiene DDL transaccional: Flyway corre cada
migración en una transacción y el `RAISE` de la guarda hizo rollback de todo, incluida la
fila del historial. Ni una tabla borrada, ni una columna tocada, sin estado a medias.

**Las tres lecciones:**

1. **La guarda pagó su costo el primer día.** Una migración que verifica antes de borrar
   convirtió una pérdida silenciosa de 114 registros en un deploy caído con un mensaje que
   decía exactamente qué pasaba. Un deploy caído se arregla.
2. **Un deploy fallido bloquea todos los siguientes.** Mientras `main` tuvo la V67 rota,
   *cualquier* cambio del backend fallaba igual. Una migración que no puede pasar no es solo
   su propio problema: es un freno de mano en el pipeline.
3. **"El escritor es un enum, así que el dato está limpio" es un razonamiento falso**, y casi
   causa el segundo deploy caído. Ver abajo.

### El CHECK que iba a voltear el siguiente deploy

La primera versión de la V72 agregaba los `CHECK` a secas, razonando que el único escritor
posible es un enum de Java y por lo tanto no puede haber un valor inesperado. **Está mal: el
enum restringe lo que se escribe de ahora en más, no lo que ya está guardado.**

El caso que lo delata es `tenant.business_type`. Hoy `BusinessType` tiene un solo valor,
`GYM`. Pero el proyecto tuvo cuatro verticales —SALON, KIOSCO, COURTS— y las V40-V42
borraron sus **tablas**, no sus filas de `tenant`. Un negocio viejo con
`business_type = 'KIOSCO'` es invisible para la aplicación (Hibernate ni siquiera puede
leerlo) pero está en la tabla, y un CHECK a secas lo encuentra y voltea el arranque.

Corregido: las seis restricciones van **`NOT VALID`**, que aplica la regla a toda fila nueva
o modificada y no revisa las viejas. Y la migración **cuenta** las filas que no cumplen y
deja el número en el log del deploy, para que "no frenar nada" no se convierta en no
enterarse nunca. Si todas dan 0, se promueven cuando se quiera:

```sql
ALTER TABLE <tabla> VALIDATE CONSTRAINT <constraint>;
```

---

## Antes de aplicar en producción

1. **Backup / punto de restauración en Supabase.** La V67 y la V74 borran tablas, y la V74
   borra 114 filas con datos de socios **a propósito y sin vuelta atrás**. El backup es lo
   que hace que una sorpresa siga siendo reversible.
2. **Mirar el resultado de las guardas de la V67.** Si aborta, no borró nada: el mensaje
   dice exactamente cuántas filas quedaron sin equivalente. Eso es información, no un
   fracaso — quiere decir que hay datos que solo viven ahí y hay que decidirlos a mano.
   (Es exactamente lo que pasó el 12/9 y lo que destapó los 114.)
3. **Leer los `NOTICE`/`WARNING` del log del deploy**, que son el informe de esta tanda:
   - **V72** — si el pasado está limpio o cuántas filas viejas no cumplen cada CHECK nuevo.
     Si dice limpio, se pueden promover las seis con `VALIDATE CONSTRAINT`.
   - **V78** — cuántas fechas de nacimiento no eran fechas y quedaron en NULL.
   - **V79** — cuántos `attendance_days` no eran arrays JSON válidos.
4. **Confirmar que RLS ya está prendido en prod** (debería: se cerró el 6/9). Si por algún
   motivo no lo estuviera, la V68 lo prende — y ahí sí conviene verificar a mano que el rol
   con el que entra el backend es dueño de las tablas.

> Si alguna vez un deploy deja una migración a medias y Flyway se queja de un estado fallido
> (no pasó acá, gracias al DDL transaccional de PostgreSQL), el destrabe es
> `flyway repair` — **nunca** renumerar ni editar una migración ya aplicada.

---

## ⚠️ Una trampa que dejó este trabajo: `gym_member` significa dos cosas

Es lo único de toda la tanda que puede confundir a alguien que lea esto más adelante, así
que va por escrito:

| Cuándo | Qué es `gym_member` |
|---|---|
| **Hasta la V74** | La tabla del modelo original (V1/V2), sin uso en el código, con los 114 socios adentro |
| **Desde la V75** | **El padrón vivo** — es `gym_members` renombrado en singular, que recién pudo tomar el nombre cuando la V74 lo liberó |

Por eso `EsquemaInvariantesTest` lista **`gym_members`** (plural, el nombre viejo) entre las
tablas que no pueden volver, y **no** `gym_member`. Agregar `gym_member` a esa lista haría
fallar el build contra la tabla más importante del sistema.

Lo mismo vale al leer una migración vieja: en la V6 o la V10, `gym_member` es la tabla
muerta; de la V75 en adelante, es el padrón.
