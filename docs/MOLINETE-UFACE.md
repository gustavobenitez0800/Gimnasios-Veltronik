# Molinete facial UFACE — cómo hablarle y cómo se integra

Equipo: **UFACE5** (Uniubi). Documento de referencia: *Device HTTP API V5.1.15*, carpeta
`API(http)` del Drive del proveedor. Todo lo de acá está leído del documento, no inferido.

Herramienta para probarlo sin escribir código: [`scripts/molinete.mjs`](../scripts/molinete.mjs).

## Estado al 2026-09-03 — anda de punta a punta

El equipo real, probado: `192.168.100.54`, serie **`E03C1CB7BBE61830`**, firmware
**`OS-V500.2105`**, nombre interno `K52`. Se cargó una persona, el equipo le sacó la foto él
mismo, la reconoció y **el aviso llegó**.

Cosas del equipo real que el documento no dice:

- ⚠️ **Venía con la clave de fábrica `123456`.** Cualquiera en el wifi puede borrarle todas las
  caras con un solo pedido. Hay que cambiarla antes de producción.
- ✅ **Es unidad de exportación**: `getInternalStaff` y `getAntiPassback` contestan, y el alta
  trae `qrCodePermission`.
- ⚠️ **Dispara un aviso por reconocimiento, no uno por persona**: parado enfrente, mandó 6
  avisos en 15 segundos. Quien lo reciba tiene que amortiguar (mismo problema que la guarda de
  "no repetir" del cartel de entrada).
- El aviso llega **dos veces en el mismo pedido**: como query string y como JSON en el cuerpo.
- `languageType` informa siempre `zh_CN` y `timeZone` siempre vacío, aunque la pantalla esté en
  inglés; `setTimeZone` rechaza todos los formatos. **No importa**: el `time` del aviso son
  milisegundos de época, y la hora local del equipo está bien (se ve en el nombre de la foto).
- La foto del momento queda dentro del equipo, servida por **FTP en el puerto 10005**
  (`ftp://IP:10005/record/IdentifyRecords/...`).

Aviso real recibido:

```json
{ "personId": "PRUEBA1", "deviceKey": "E03C1CB7BBE61830", "type": "face_0",
  "aliveType": "1", "time": "1788472566659", "identifyType": "1",
  "path": "ftp://192.168.100.54:10005/record/IdentifyRecords//2026-09-03/18/185606_642_PRUEBA1_rgb.jpg" }
```

## Qué es el equipo

Un **servidor HTTP en la red local**: `http://IP:8090/`, cuerpos `x-www-form-urlencoded`.

- **Decide solo.** Guarda las fotos adentro y reconoce sin preguntarle a nadie. Nuestro trabajo
  es mantenerle la lista al día, no contestarle en milisegundos.
- **Encola sus eventos sin internet** y los reenvía cuando vuelve la conexión. Esa mitad del
  problema offline no hay que construirla.
- ⚠️ **Un solo programa por equipo** ("do not call interfaces of the same device in other client
  server at the same time"). El molinete tiene un único dueño: ni el backend ni la web le hablan
  directo.
- ⚠️ Cada request, **5 MB como máximo** (importa al subir fotos).

## La clave

El equipo **sale de fábrica sin clave**. La primera llamada es `POST /setPassWord` con
`oldPass` y `newPass` **iguales**; desde ahí, todas las llamadas llevan `pass`.

`GET /getDeviceKey` **no pide clave** y devuelve el número de serie: es el primer contacto, y
es lo que identifica al equipo del lado de Veltronik (viene en cada aviso como `deviceKey`).

## Alta y baja de socios

`POST /person/create` con `person` como JSON. En equipos de exportación —los nuestros— el
campo `id` es **obligatorio**: ahí va el id del socio (sólo números y letras).

**Vencido → `facePermission: 1`. Paga → `facePermission: 2`.** Es un campo, no un alta: la
persona y su foto quedan en el equipo.

> ⛔ **No usar `/person/permissionsCreate` ni `/person/permissionTime`.** El campo de vigencia
> **borra al socio**, no lo bloquea: *"the personnel will be deleted within 5 seconds when the
> personnel permission time expires"*, con foto y todo. En un gimnasio la gente se vence y
> vuelve todo el tiempo; habría que re-enrolar cara por cara.

**La foto la saca el equipo** (`POST /face/takeImg`, sección 4.8). Por esa vía la cara nunca
pasa por Veltronik: guardamos sólo "el socio X es la persona X en el equipo Y". Resuelve de
raíz lo del dato biométrico (Ley 25.326, dato sensible).

## El aviso de entrada

`POST /setIdentifyCallBack` con `callbackUrl`. Desde ahí el equipo **POSTea un JSON** por cada
reconocimiento:

| campo | qué es |
|---|---|
| `personId` | el `id` que le dimos al dar de alta → el socio |
| `deviceKey` | número de serie del equipo → la sucursal |
| `time` | milisegundos |
| `type` | `face_0` reconocido y **dentro** de período · `face_1` reconocido y **fuera** · `face_2` desconocido |
| `aliveType` | detección de vida: `1` pasó, `2` falló (anti-foto) |
| `path` | la foto que sacó en el momento, dentro del equipo |

`face_1` no es un error: **es un socio a llamar.**

La URL admite una dirección de internet, y el equipo reenvía lo que no pudo entregar.

## Lo que ya trae y nos sirve

- `GET /device/getInternalStaff` — **quién está adentro**, contado por el equipo. Es el módulo
  `/adentro` sin inventar nada.
- `POST /device/setAntiPassback` — antipassback.
- `qrCode` + `qrCodePermission` en el alta: **el QR que Veltronik ya emite se puede leer en el
  molinete**, sin hardware extra.
- `POST /device/openDoorControl` — pulso de apertura remoto (probar el relé, o abrir desde el
  mostrador).
- `GET /device/information` — firmware, cuántas personas tiene cargadas, su hora y su IP.

## Cómo se frena a un socio vencido

**Con el horario, no apagándole la cara.** Las dos cosas cierran la puerta, pero apagar
`facePermission` convierte al socio en un desconocido: el aviso llega sin nombre y el mostrador
se entera de que "alguien" quiso entrar, que es justo el dato que no sirve.

Con `POST /person/createPasstime` y una ventana cerrada (`00:00:00,00:00:01`) el equipo lo
reconoce igual. Probado contra el equipo real: **la pantalla dice el nombre y "not in passing
time"**, y el aviso llega así:

```json
{ "personId": "PRUEBA1", "type": "face_1", "passTimeType": "2", "aliveType": "1", "path": "" }
```

`face_1` no es un error: es un socio a llamar. Cuando paga, se le abre la ventana entera
(`00:00:00,23:59:59`) y vuelve a pasar. Es un pedido, no un alta.

## Lo que ya está construido (2026-09-03)

Del lado del backend, la mitad que **recibe**:

| | |
|---|---|
| Recibe el aviso | `POST /api/public/molinete/{token}` — público, sin sesión |
| Lo procesa | `MolineteService` |
| Entradas | van a `access_log` con `access_method = FACIAL` |
| Rechazos | van a `access_denied` (tabla nueva, V62) |
| Migración | `V62__Molinete_Facial.sql` |

Decisiones que quedaron grabadas en el código, cada una con su porqué:

- **El token va en la RUTA**, no en la query: el equipo pega sus propios parámetros a la URL
  que le configuramos y en la query quedaría a merced de cómo los concatene. Es el mismo token
  del punto de acceso que usa el cartel del QR.
- **La puerta se aparea sola** con el serial del primer equipo que avisa, y después no acepta
  otro. El serial no es secreto: ancla al token, no lo reemplaza.
- **Amortiguación de la ráfaga**: la ventana de "mismo gesto" pasó a depender del método —15 s
  para el QR (el dedo tembloroso), **180 s para el molinete** (la cámara dispara mientras haya
  una cara enfrente), y **cero para el mostrador**, donde una persona apretando un botón es
  siempre deliberada.
- **Idempotencia sin número de evento**: el equipo reenvía lo que no pudo entregar y no le pone
  id. Se deriva un UUID fijo de `deviceKey + time` y se usa como `client_ref`, que ya tiene
  índice único. Sin eso, un reenvío no duplica: **invierte**, porque la dirección se deduce del
  estado.
- **Los rechazos no son visitas** y por eso no viven en `access_log`. Si vivieran ahí, toda
  cuenta de asistencia tendría que acordarse de filtrarlos.

30 tests nuevos, incluidos 6 de integración contra Postgres que corren **los avisos reales que
mandó el equipo** —la ráfaga de 6 en 16 segundos incluida— y verifican que terminen siendo una
sola visita.

## La sincronización: cómo entran los socios al equipo

La otra mitad. Vive en el **escritorio** y no en la nube porque el equipo está detrás del
router del gimnasio, y porque el fabricante avisa que **un solo programa puede manejarlo**.

```
Ajustes → Molinete            el dueño pone IP y clave (son de ESA computadora)
       ↓
GET /api/gym/molinete/padron  [{id, nombre, permitido}] — el veredicto viene resuelto
       ↓
electron/molinete.cjs         lo traduce a pedidos LAN
       ↓
el equipo
```

| | |
|---|---|
| Endpoint del padrón | `GET /api/gym/molinete/padron` — gateado por `CONTROL_DE_ACCESO` |
| Puente LAN | `frontend/electron/molinete.cjs` |
| Pantalla | `components/MolineteSettings.jsx` (Ajustes, solo escritorio) |
| Foto del socio | botón de cámara en la fila del socio (`useMolinete`) |

**El veredicto lo calcula el backend**, con la misma `MemberAccessPolicy` que usan el mostrador
y el QR. El escritorio recibe un sí o un no y lo aplica: una segunda cuenta de fechas allá
terminaría desincronizada de la de acá el día que cambie cualquiera de las dos. Pasan el que
está al día, el que está en gracia y **el que no tiene fecha cargada** —eso es un dato que
falta, no una deuda—; quedan afuera el vencido y el dado de baja.

Tres cuidados del lado del escritorio, cada uno con su test:

- **El espejo.** El equipo sabe decir a quién tiene cargado, pero no en qué ventana horaria
  quedó cada uno sin preguntárselo de a uno. Se guarda un espejo local de lo último aplicado,
  así una sincronización normal son **cero pedidos** en vez de 385. Es una caché, no la verdad:
  si se pierde, se reaplica.
- **El freno de bajas.** Borrar a alguien del equipo **le borra la cara**, y recuperarla exige
  tenerlo parado enfrente otra vez. Si el padrón llegara vacío o cortado, una sola corrida
  dejaría al gimnasio entero teniendo que re-enrolarse. Si las bajas superan el 20% de lo que
  hay cargado, no se borra nada y se avisa.
- **Lo cargado a mano no se toca.** Solo se borran ids con nuestra forma (32 hex). Una persona
  que cargó el técnico en el equipo no es asunto nuestro.

⚠️ Sincronizar carga al socio **sin cara**: el equipo todavía no lo reconoce. La foto se toma
una vez, desde la ficha, con la persona parada frente al equipo.

## Lo que falta

1. **Mostrar los rechazados** en la pantalla de Acceso, al lado de los avisos del QR. El
   backend ya los guarda; nadie los muestra todavía.
2. **Apuntar el equipo a Cloud Run** y verificar ahí un riesgo abierto: **no está probado que
   el equipo hable HTTPS**, y Cloud Run no atiende otra cosa. Si no puede, el escritorio recibe
   en la LAN y reenvía — el endpoint no cambia.
3. **Probar contra el equipo real** `person/update` y `person/delete`: son los dos únicos
   pedidos que usa la sincronización y que todavía no se ejercitaron contra el aparato (el
   resto sí: alta, horario abierto y cerrado, listado, foto y callback).
4. **Cambiar la clave del equipo**, que hoy es la de fábrica.
5. **Limpiar `accessControl`** en `preload.cjs`: 25 canales sin handler, de un modelo distinto
   —un aparato que nos pregunta si abre— que este equipo no usa.
