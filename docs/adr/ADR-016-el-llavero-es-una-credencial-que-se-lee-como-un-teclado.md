# ADR-016: El llavero es una credencial del socio, aparte del DNI, y el lector se lee como si alguien tecleara

- **Estado:** ✅ Aceptada (Gustavo, 2026-11-02) y construida en la rama `feat/llaveros`
- **Fecha:** 2026-11-02

## Contexto

En Hernández Tecnofit (el gimnasio de Nelson, migrado de ControlFit el 31/10) los socios tienen
un **llavero de proximidad**. Con ControlFit lo pasaban por el lector y la PC del mostrador
mostraba al socio, su cuota y si podía pasar. El dueño quiere eso en Veltronik, para ese
gimnasio **y para los próximos**.

Lo que ya había y lo que faltaba:

| Pieza | En Veltronik antes de esto |
|---|---|
| Identificar al socio en el mostrador | DNI o nombre tecleado en **Accesos** + Enter (copia local, anda sin internet) |
| Identificarlo en la puerta | QR con el celular; cara en el molinete facial (Uniubi) |
| Decidir si pasa | `puedePasarElMolinete` = la regla de `MolineteService.puedePasar` (al día, en gracia o sin datos) |
| Abrir el molinete | la cajita del relé, `abrirSiPasa` (Premium) |
| **El llavero** | **no existía**: ni dónde guardarlo, ni cómo leerlo |

Tres cosas que se vieron en el gimnasio y en los Excel de ControlFit:

1. **ControlFit no tenía un campo de llavero: usaba el `DNI/ID`.** De los socios activos, ~727
   tienen un DNI de 8 dígitos, y **unos 35 tienen un número largo, casi todos empezando con 0**:
   son números de llavero puestos en el lugar del documento. Así se importaron el 31/10, así que
   esos socios tienen el llavero **adentro de su DNI** en Veltronik.
2. **El lector que hay en el mostrador no escribe nada.** Es un «SYC ID&IC USB Reader»
   (VID `FFFF`, PID `0035`): se anuncia como teclado, pero con el llavero no tipeó ni un
   carácter. Habla por un canal de comandos propio (tramas `AA … BB`) que manejaba el programa
   de ControlFit.
3. **No se sabe todavía la frecuencia del llavero.** Los hay de 125 kHz (EM4100, los más baratos)
   y de 13,56 MHz (MIFARE). «ID&IC» quiere decir que ese lector lee los dos. Un celular con NFC
   lee los de 13,56 y no los de 125: es la prueba en treinta segundos.

## Decisión

### 1 · El llavero es una credencial del socio, no su DNI

Una tabla nueva, **`member_credential`** (migración **V90**): un renglón por llavero.

| Columna | Qué |
|---|---|
| `id`, `tenant_id`, `created_at`, `updated_at`, `origin_device_id`, `performed_by_cashier_id` | como todo lo del vertical (`TenantAwareEntity`, RLS prendido, sin permisos públicos) |
| `member_id` | de quién es (FK a `gym_member`, se va con él solo si se purga la cuenta) |
| `tipo` | `LLAVERO`; la columna existe para que mañana entren tarjeta o PIN sin tabla nueva (un CHECK obliga a decidirlo en una migración) |
| `codigo` | el número, **tal como lo escribe el lector** (ver 2); un CHECK frena en la base lo que no esté normalizado |
| `asignado_por_nombre` | quién lo asignó, con el nombre congelado |
| `dado_de_baja_at`, `motivo_baja`, `dado_de_baja_por_nombre` | «Lo perdió», «Se lo pasaron a …», «Su socio estaba en la papelera» |

- **Un socio puede tener más de uno** (perdió el suyo y le dieron otro: el viejo queda dado de
  baja, no borrado).
- **Un llavero activo es de un solo socio por sucursal**: índice único
  `(tenant_id, tipo, codigo) WHERE dado_de_baja_at IS NULL`. Lo garantiza la base, no el código:
  dos mostradores asignando el mismo llavero a la vez no pueden dejarlo con dos dueños.
- **Anular, no borrar** (la misma regla que la caja): dar de baja un llavero deja el renglón con
  fecha y motivo. Si mañana aparece una entrada rara, se sabe de quién era ese llavero ese día.
- **Se guarda en claro, sin hash.** El número de un llavero no es un secreto: viene impreso en
  muchos, cualquier celular o lector lo lee, y por eso no protege nada esconderlo. Es un
  identificador, como el DNI, que ya viaja en la copia local. Esto **reemplaza** lo que decía el
  diseño de agosto («credenciales hasheadas»): el hash tiene sentido para un PIN, no para algo
  que el socio lleva colgado con las llaves. Y en claro se puede mostrar en la ficha y traer de
  otro sistema.

### 2 · El código se compara EXACTO, y casi sin tocarlo

Al guardar y al leer se le aplica lo mismo: sin espacios y en mayúsculas (por si el lector
escribe hexadecimal). **Nada más.** La regla está escrita dos veces, una de cada lado
(`Llavero.java` y `lib/llaveros.js`), con un test gemelo en cada uno.

- ⚠️ **No se le sacan los ceros de adelante.** El lector típico escribe 10 dígitos
  (`0012345678`). Sin los ceros queda `12345678`, que **es un DNI válido** y podría ser el de
  otro socio. Diez dígitos nunca son un DNI argentino; ocho, sí.
- ⚠️ **No se convierte de formato.** El mismo llavero puede salir como `0012345678` (decimal),
  `188,22136` (Wiegand 26) o `00BC5678` (hex) según el lector. Veltronik guarda **lo que escribe
  el lector del gimnasio**, y por eso los llaveros se asignan pasándolos por ese lector (ver 6).
- Se acepta entre 4 y 64 caracteres de `0-9 A-Z , . : _ -`. Otra cosa es un error de tipeo o un
  lector con la distribución de teclado cambiada, y se dice en vez de guardarse.
- **Nunca «contiene».** El buscador de nombres encuentra a «González» con «gon»; un llavero que
  coincide en parte con otro es **otra persona**. La búsqueda de llavero es igualdad o nada.

### 3 · El lector: uno que escriba como un teclado

El lector que se usa es uno **«tipo teclado»** (*keyboard wedge*): pasás el llavero y escribe el
número y un Enter, como si alguien lo tecleara. Es lo que ya hace el lector de códigos de barras
de un kiosco.

- **Cero drivers, cero código de hardware.** Windows lo reconoce solo, y anda igual en el
  escritorio y en la web.
- **Entra por donde ya entra el DNI.** Accesos ya agarra cualquier tecla suelta y la manda al
  buscador. El lector no necesita una pantalla nueva.
- **Para comprar**: un lector USB de la frecuencia del llavero —o uno doble, 125 kHz + 13,56 MHz,
  para no tener que averiguarla— que diga *«emulación de teclado»* y termine con Enter.

**La ráfaga** (`lib/rafagaDelLector.js`). Un lector escribe diez caracteres en unos 30 ms; una
persona no baja de 80 ms entre tecla y tecla. Es ráfaga cuando llegan **6 caracteres o más, con
50 ms o menos entre uno y otro, y el Enter hasta 150 ms después**. El reloj es el de la tecla
(`timeStamp`), no el de cuando se procesa: si la pantalla estuvo ocupada, las teclas de una
persona se procesarían todas juntas y parecerían una ráfaga. Con eso Accesos sabe tres cosas que
con el teclado solo no sabría:

- **Que fue un llavero**: la entrada se registra con método `LLAVERO`.
- **Que se busca exacto** (ver 4), y no con el buscador de nombres.
- **Que lo que había en el campo sobra.** Si la recepcionista había escrito «pe» y pasa un socio
  el llavero, el campo quedaría «pe0012345678». La ráfaga se lleva solo lo que escribió el lector.

El Enter de la ráfaga se lo queda el lector (`useLectorDeLlaveros`, escuchando en la fase de
captura): no llega al buscador. El de una persona pasa de largo y hace lo de siempre. Las teclas
que van a otro campo o a una ventana abierta no se tocan.

**Una sola entrada para los llaveros.** Todo lo que lea un llavero termina en la misma función de
Accesos, `alLeerLlavero(codigo)`. El teclado es la primera fuente. Las otras dos quedan con la
puerta abierta y **no se hicieron** (ver Cuándo reconsiderar):

- **La cajita lee el llavero.** Un módulo lector (RDM6300 a 125 kHz o RC522 a 13,56 MHz) pegado a
  la Pico, que ya está al lado del molinete y enchufada al mostrador. Mandaría `LLAVERO 0012345678`
  por el mismo cable: una sola caja que lee y abre, y que lee aunque la PC esté en otra pantalla.
- **Un lector USB por comandos**, como el SYC de Nelson, hablado directo por el escritorio (WebHID).

### 4 · Lo que pasa cuando el socio pasa el llavero

```
lector ──"0012345678⏎"──▶ Accesos (buscador)
                              │  ráfaga → método LLAVERO, el campo queda vacío
                              ▼
                    alLeerLlavero(codigo)
                              │  1. copia local, EXACTO: el llavero asignado y, después, el
                              │     DOCUMENTO (como lo dejaba ControlFit). Sin red, instantáneo.
                              │  2. si la copia no lo conoce y hay red: POST /gym/llaveros/consulta
              ┌───────────────┼──────────────────────────┐
         es de un socio   no es de nadie             es de un llavero dado de baja
              │               │                          │
              ▼               ▼                          ▼
   el mismo registro    «Llavero sin asignar»     «Llavero sin asignar» + «Este llavero era
   que con el DNI:      + buscar al socio y        de Ana y se dio de baja el 20/10 (Lo
   cartel, X, días,       asignárselo ahí mismo     perdió)». Se puede volver a asignar.
   cola si no hay red     (no abre)                 (no abre)
              │
              ▼
   puedePasarElMolinete(socio) ──▶ abrirSiPasa()   ← la misma regla y la misma cajita de siempre
```

- **Sin internet anda igual.** La copia local de socios (la del buscador, válida 30 días) trae
  los llaveros activos de cada socio; al cargarla se arma un `Map` de código a socio. En el
  escritorio la copia vive en SQLite, que suma la columna `llaveros` (los escritorios ya
  instalados la agregan solos al abrir).
- **La consulta al servidor** cubre lo que la copia no puede saber todavía: un llavero que se
  asignó en **otra PC** hace un rato (la copia se refresca cada cinco minutos) —entonces el socio
  entra igual y la copia se corrige en el acto— y uno que se **dio de baja**, para decir a quién
  se le perdió. Va por POST para que el número no quede escrito en la dirección, que se anota en
  los registros del servidor.
- **El veredicto es el que ya existe.** El llavero solo dice *quién es*. Si pasa, si suena la X,
  si abre la cajita, lo deciden `situacionSocio` y `puedePasarElMolinete`, igual que con el DNI.
  No hay una regla del llavero.
- **El cartel es el mismo**: nombre, situación, días que le quedan o que debe. Es «el socio, su
  cuota y demás» que mostraba ControlFit.
- **Freno de rebote, como el QR**: la gente pasa el llavero dos veces «por las dudas», y un aparato
  repitiendo un gesto no es una salida. `ventanaDeRebote("LLAVERO")` = 15 s, la del QR. Como con el
  QR, un rebote no vuelve a abrir el molinete (pasarían dos con el mismo llavero).
- **Si el llavero apunta a un socio y el DNI a otro**, no se elige: se muestran los dos, como hoy
  con varios resultados.
- **Asignar en el momento.** Con el aviso de «sin asignar» abierto, el lector no se escucha en
  Accesos: lo que escriba va al buscador del aviso. Al asignar, se le registra la entrada al socio
  como si lo hubiera pasado.
- **El buscador de siempre también lo conoce**: si alguien teclea el número de un llavero, su dueño
  sale primero, en Accesos y en la búsqueda de Socios del servidor.

### 5 · Cuándo NO abre

| Pasa esto | Lo que ve el mostrador | Abre |
|---|---|---|
| Llavero de un socio al día / en gracia / sin datos | el cartel verde | ✅ |
| Llavero de un socio vencido | el cartel con la X y los días que debe | ❌ |
| Llavero de un socio dado de baja | «dado de baja» | ❌ |
| Llavero que no es de nadie | «Llavero sin asignar» y la búsqueda para asignarlo | ❌ |
| Llavero dado de baja (perdido) | lo mismo, más «Este llavero era de … y se dio de baja el …» | ❌ |
| La PC no está en Accesos | nada (el número se escribe donde esté el cursor) | ❌ |

⚠️ **La última fila es la debilidad del teclado**, y es la misma que tiene el QR. En la v1 el
mostrador tiene que estar en Accesos, que es donde ya está cuando hay molinete. La cajita lectora
(punto 3) es lo que la saca de ahí.

### 6 · Cómo se le asigna un llavero a un socio

Siempre **pasándolo por el lector del gimnasio**, para que quede guardado en el formato que ese
lector escribe (si alguien lo teclea, se acepta con la misma regla).

1. **Desde la ficha del socio**: sección «Llaveros» → «Asignar llavero» → «Pasá el llavero por el
   lector». El Enter del lector asigna y no guarda la ficha.
2. **Desde Accesos, al pasar uno que no es de nadie**: «Llavero sin asignar» → se busca al socio →
   «Asignárselo» → entra. Así se carga un gimnasio entero sin sentarse a hacerlo: cada socio la
   primera vez que viene.
3. **Si el llavero ya es de otro**: «Este llavero ya es de Juan Pérez. ¿Pasárselo a María Gómez?».
   El de Juan queda dado de baja con el motivo, no borrado. Si Juan está en la papelera, se le
   saca sin preguntar: para el gimnasio ese socio no existe.
4. **Perdió el llavero**: en la ficha, «Lo perdió» → confirmar → dado de baja. Deja de abrir en el
   acto, también en la copia local.

**Asignar necesita internet.** Pasar el llavero para entrar, no. Asignar es raro y la regla de
«un llavero, un socio» la tiene que verificar la base: hacerlo sin conexión sería encolar un
conflicto. Sin internet, la ficha y el aviso lo dicen.

**El importador no suma una columna «Llavero» todavía.** Ningún sistema del que vinieron clientes
la tiene: ControlFit pone el llavero en el DNI, y para eso está el punto 9. Ver Cuándo reconsiderar.

### 7 · El backend

- **V90**: la tabla, el índice único parcial, los CHECK, el índice de `member_id`, RLS prendido y
  sin `GRANT` a los roles públicos (`MigracionesSinPermisosPublicosTest`).
- **`GET /gym/members`** (lo que baja la copia local) suma `llaveros: ["0012345678"]` en los socios
  que tienen; en los demás el campo no viaja. Los llaveros tienen **su propia foto con su propia
  marca** en el controlador: asignar no toca la ficha del socio, y traer la lista de llaveros con
  cada cobro sería tráfico de Supabase tirado en un gimnasio donde todos usan llavero.
- **`GET` y `POST /gym/members/{id}/llaveros`** `{codigo, reasignar, hechoPor}` → la ficha y
  asignar: 201 nuevo; 200 si ya era suyo; 409 con `{codigo: "LLAVERO_DE_OTRO_SOCIO", socio}` si es
  de otro y no vino `reasignar`.
- **`POST /gym/llaveros/{id}/baja`** `{motivo, hechoPor}`. No hay `DELETE`.
- **`POST /gym/llaveros/consulta`** `{codigo}` → de quién es hoy, o su última baja.
- **`GET` y `POST /gym/llaveros/en-el-documento`** → el punto 9. **Solo dueño o admin.** Asignar y
  dar de baja son de cualquier rol del gimnasio: es el mostrador.
- **La búsqueda paginada de socios** encuentra por llavero exacto.
- **El check-in** acepta el método `LLAVERO` (`AccessLogService.METODO_LLAVERO`) con el freno del
  QR; «Adentro» y los reportes lo muestran como «Llavero».

### 8 · El plan

**El llavero identifica en cualquier plan. Lo que es Premium es que el molinete abra solo**, y
eso ya estaba: `abrirSiPasa` no abre sin `CONTROL_DE_ACCESO`. Es la misma línea que separa el DNI y
el QR (todos los planes) del molinete facial y la cajita (Premium).

### 9 · Hernández Tecnofit (y cualquier gimnasio que venga de ControlFit)

1. **Hoy, con solo cambiar el lector**: los ~35 socios con el llavero en el DNI **ya entran**: la
   puerta busca también en el documento, exacto.
2. **Ajustes → Llaveros → «Llaveros que vinieron en el DNI»** (dueño o admin): una lista para
   REVISAR de los socios cuyo documento son **nueve dígitos o más** (un DNI argentino tiene ocho;
   un DNI de siete rellenado con un cero, `01234567`, no entra). Vienen marcados, se destildan los
   que sean un documento extranjero (un CPF de Brasil tiene once dígitos), y se pasan. El documento
   no se toca: lo corrige el mostrador cuando el socio traiga el DNI. El que ya es el llavero de
   otro socio sale sin poder marcarse.
3. **Antes de pasarlos**, Ajustes → Llaveros → «Probar el lector» con dos llaveros de esos socios:
   dice qué número escribe el lector, si lo reconoce como lector y de quién es. Si el lector
   escribe otro formato, no se pasan: se configura el lector (muchos traen tarjetas para elegir el
   formato) o se asignan de a uno con el punto 6.2.

## Alternativas descartadas

- **Dejar el llavero en el campo DNI, como ControlFit.** Anda para entrar —y por eso la puerta
  también busca ahí—, pero el socio queda sin DNI (o con un DNI que no es), un socio no puede tener
  dos llaveros, perder uno obliga a editar el documento, y el buscador por partes se mezcla con un
  número que tiene que ser exacto.
- **Hablar con el lector SYC de Nelson por USB en la v1.** Habría que adivinar un protocolo sin
  documentación, solo serviría para ese modelo, y solo en el escritorio. Un lector tipo teclado
  cuesta como un lector de barras y sirve para todos los gimnasios.
- **El lector dentro de la cajita en la v1.** Es la mejor versión a la larga (punto 3), pero exige
  soldar un módulo, elegir la frecuencia antes de saber cuál es, y firmware nuevo.
- **Preguntarle siempre al servidor de quién es cada llavero.** Sin internet no entraría nadie, y la
  regla del núcleo local es que la puerta decide con la copia local. El servidor se consulta solo
  cuando la copia no lo conoce.
- **Hashear el código.** Ver punto 1: no protege nada y no deja mostrarlo ni migrarlo.
- **Pasar los del DNI con un script de una vez.** Se hizo una herramienta revisable en Ajustes: el
  próximo gimnasio que venga de ControlFit la va a necesitar igual, y un número largo puede ser un
  documento extranjero que tiene que mirar una persona.

## Consecuencias

- La copia local crece unos bytes por socio con llavero. Nada.
- Hay una regla nueva que no se puede romper: **el código se compara exacto**. Tiene tests de los
  dos lados (`0012345678` no encuentra al socio del DNI `12345678`; un pedazo no encuentra a nadie).
- Accesos distingue un lector de una persona (la ráfaga), con tests de tiempos falsos.
- El teclado ata el llavero a la pantalla de Accesos, igual que el QR. Queda anotado arriba.
- La respuesta de `GET /gym/members` hace una consulta más por pedido (la marca de los llaveros:
  una fila), y trae la lista de llaveros solo cuando cambia.
- De paso se arregló algo que ya pasaba con el DNI: la búsqueda que espera 300 ms volvía a mostrar
  la lista con la persona que acababa de entrar si el Enter llegaba antes. Con el lector pasaba
  siempre.
- El diseño de agosto («Agente de Puerta», `MemberCredential` hasheada) queda corregido en el hash;
  el resto (credenciales como entidad aparte, la puerta decide local) se mantiene.

## Cuándo reconsiderar

- **Un gimnasio con el lector en la puerta y la PC lejos**, o que necesita que el mostrador use
  otras pantallas mientras la gente entra: es la señal para la cajita lectora.
- **Un gimnasio que ya tiene lectores por comandos** y no los quiere cambiar: un driver WebHID por
  modelo, entrando por `alLeerLlavero`.
- **Un sistema de origen con una columna propia de llavero**: ahí se suma la columna «Llavero» al
  importador (con el deshacer de la importación, V84).
- **Si alguien empieza a copiar llaveros** (los de 125 kHz se clonan con un aparato de feria): ahí
  se mira MIFARE con clave, y el código deja de ser el número de serie.
- **Si la gente se queda trabada en el molinete por pasar el llavero dos veces** (el rebote no
  vuelve a abrir): ahí se mira volver a abrir dentro de la ventana, sabiendo que deja pasar a dos.

## Lo que hay que averiguar en el gimnasio

1. **¿El celular lee el llavero?** (NFC prendido, apoyarlo atrás). Sí → 13,56 MHz. No → 125 kHz.
   Con un lector doble no hace falta saberlo.
2. **¿Todos los socios tienen llavero, o solo esos ~35?** Cambia cuántos se asignan de a uno.
3. **El número que escribe el lector nuevo, contra el que tienen en Veltronik** (punto 9.3).
