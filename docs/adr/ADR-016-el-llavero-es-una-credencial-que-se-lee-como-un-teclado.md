# ADR-016: El llavero es una credencial del socio, aparte del DNI, y el lector se lee como si alguien tecleara

- **Estado:** 🟡 Propuesta (espera el visto bueno de Gustavo antes de escribir código)
- **Fecha:** 2026-11-02

## Contexto

En Hernández Tecnofit (el gimnasio de Nelson, migrado de ControlFit el 31/10) los socios tienen
un **llavero de proximidad**. Con ControlFit lo pasaban por el lector y la PC del mostrador
mostraba al socio, su cuota y si podía pasar. El dueño quiere eso en Veltronik, para ese
gimnasio **y para los próximos**.

Lo que ya hay y lo que falta:

| Pieza | Hoy en Veltronik |
|---|---|
| Identificar al socio en el mostrador | DNI o nombre tecleado en **Accesos** + Enter (copia local, anda sin internet) |
| Identificarlo en la puerta | QR con el celular; cara en el molinete facial (Uniubi) |
| Decidir si pasa | `puedePasarElMolinete` = la regla de `MolineteService.puedePasar` (al día, en gracia o sin datos) |
| Abrir el molinete | la cajita del relé, `abrirSiPasa` (Premium) |
| **El llavero** | **no existe**: ni dónde guardarlo, ni cómo leerlo |

Tres cosas que se vieron en el gimnasio y en los Excel de ControlFit:

1. **ControlFit no tenía un campo de llavero: usaba el `DNI/ID`.** De los socios activos, ~727
   tienen un DNI de 8 dígitos, y **unos 35 tienen un número largo, casi todos empezando con 0**:
   son números de llavero puestos en el lugar del documento. Así los importamos el 31/10, así
   que hoy esos socios tienen el llavero **adentro de su DNI** en Veltronik.
2. **El lector que hay en el mostrador no escribe nada.** Es un «SYC ID&IC USB Reader»
   (VID `FFFF`, PID `0035`): se anuncia como teclado, pero con el llavero no tipeó ni un
   carácter. Habla por un canal de comandos propio (tramas `AA … BB`) que manejaba el programa
   de ControlFit.
3. **No sabemos todavía la frecuencia del llavero.** Los hay de 125 kHz (EM4100, los más baratos)
   y de 13,56 MHz (MIFARE). «ID&IC» quiere decir que ese lector lee los dos. Un celular con NFC
   lee los de 13,56 y no los de 125: es la prueba en treinta segundos.

## Decisión

### 1 · El llavero es una credencial del socio, no su DNI

Una tabla nueva, **`member_credential`**: un renglón por llavero.

| Columna | Qué |
|---|---|
| `id`, `tenant_id` | como todo lo del vertical (`TenantAwareEntity`, RLS cerrado) |
| `member_id` | de quién es |
| `tipo` | `LLAVERO` (la columna existe para que mañana entren tarjeta o PIN sin tabla nueva) |
| `codigo` | el número, **tal como lo escribe el lector** (ver 2) |
| `creado_en`, `creado_por` | quién lo asignó |
| `dado_de_baja_en`, `motivo_baja` | «lo perdió», «se lo pasaron a otro socio» |

- **Un socio puede tener más de uno** (perdió el suyo y le dieron otro: el viejo queda dado de
  baja, no borrado).
- **Un llavero activo es de un solo socio por sucursal**: índice único
  `(tenant_id, tipo, codigo) WHERE dado_de_baja_en IS NULL`. Lo garantiza la base, no el código.
- **Anular, no borrar** (la misma regla que la caja): dar de baja un llavero deja el renglón con
  fecha y motivo. Si mañana aparece una entrada rara, se sabe de quién era ese llavero ese día.
- **Se guarda en claro, sin hash.** El número de un llavero no es un secreto: viene impreso en
  muchos, cualquier celular o lector lo lee, y por eso no protege nada esconderlo. Es un
  identificador, como el DNI, que ya viaja en la copia local. Esto **reemplaza** lo que decía
  el diseño de agosto («credenciales hasheadas»): el hash tiene sentido para un PIN, no para
  algo que el socio lleva colgado con las llaves. Y en claro se puede mostrar en la ficha
  («Llavero 0012345678») y traer de otro sistema.

### 2 · El código se compara EXACTO, y casi sin tocarlo

Al guardar y al leer se le aplica lo mismo: sin espacios en las puntas ni en el medio, y en
mayúsculas (por si el lector escribe hexadecimal). **Nada más.**

- ⚠️ **No se le sacan los ceros de adelante.** El lector típico escribe 10 dígitos
  (`0012345678`). Sin los ceros queda `12345678`, que **es un DNI válido** y podría ser el de
  otro socio. Diez dígitos nunca son un DNI argentino; ocho, sí.
- ⚠️ **No se convierte de formato.** El mismo llavero puede salir como `0012345678` (decimal),
  `188,22136` (Wiegand 26) o `00BC5678` (hex) según el lector. Veltronik guarda **lo que escribe
  el lector del gimnasio**, y por eso los llaveros se asignan pasándolos por ese lector (ver 6).
- **Nunca «contiene».** El buscador de nombres encuentra a «González» con «gon»; un llavero que
  coincide en parte con otro es **otra persona**. La búsqueda de llavero es igualdad o nada.

### 3 · El lector: uno que escriba como un teclado

El lector que se usa es uno **«tipo teclado»** (*keyboard wedge*): pasás el llavero y escribe el
número y un Enter, como si alguien lo tecleara. Es lo que ya hace el lector de códigos de barras
de un kiosco.

- **Cero drivers, cero código de hardware.** Windows lo reconoce solo, y anda igual en el
  escritorio y en la web.
- **Entra por donde ya entra el DNI.** Accesos ya agarra cualquier tecla suelta y la manda al
  buscador, y el Enter ya busca y registra. El lector no necesita una pantalla nueva.
- **Para comprar**: un lector USB de la frecuencia del llavero (o uno doble, 125 kHz + 13,56 MHz,
  para no tener que averiguarla), que diga *«emulación de teclado»* o *«keyboard»*. Salen como un
  lector de barras.

**La ráfaga.** Un lector escribe 10 caracteres en unos 30 ms; una persona no baja de 300. Accesos
reconoce la ráfaga (≥ 8 caracteres en menos de ~150 ms, terminados en Enter) y con eso sabe dos
cosas que con el teclado solo no sabría:

- **Que fue un llavero**, y no alguien tecleando: la entrada se registra con método `LLAVERO`.
- **Que lo que había en el campo sobra.** Si la recepcionista había escrito «pe» y pasa un
  socio el llavero, el campo quedaría «pe0012345678» y no encontraría a nadie. La ráfaga
  reemplaza lo que hubiera.

**Una sola entrada para los llaveros.** Todo lo que lea un llavero termina en la misma función,
`alLeerLlavero(codigo)`. El teclado es la primera fuente. Las otras dos quedan con la puerta
abierta y **no se hacen ahora** (ver Cuándo reconsiderar):

- **La cajita lee el llavero.** Un módulo lector (RDM6300 a 125 kHz o RC522 a 13,56 MHz) pegado a
  la Pico, que ya está al lado del molinete y enchufada al mostrador. Mandaría `LLAVERO 0012345678`
  por el mismo cable: una sola caja que lee y abre, y que lee aunque la PC esté en otra pantalla.
- **Un lector USB por comandos**, como el SYC de Nelson, hablado directo por el escritorio (WebHID).

### 4 · Lo que pasa cuando el socio pasa el llavero

```
lector ──"0012345678⏎"──▶ Accesos (buscador)
                              │  ráfaga → método LLAVERO
                              ▼
                    alLeerLlavero(codigo)
                              │  copia local: Map código → socio  (sin red, instantáneo)
              ┌───────────────┼────────────────────────┐
         es de un socio   no es de nadie          es de un llavero dado de baja
              │               │                         │
              ▼               ▼                         ▼
   el mismo registro    «Llavero sin asignar»     «Ese llavero fue dado de baja»
   que con el DNI:      + «Asignárselo a…»        (no abre)
   cartel, X, días,       (no abre)
   cola si no hay red
              │
              ▼
   puedePasarElMolinete(socio) ──▶ abrirSiPasa()   ← la misma regla y la misma cajita de hoy
```

- **Sin internet anda igual.** La copia local de socios (la que ya usa el buscador, válida 30
  días) suma los llaveros activos de cada socio; al cargarla se arma un `Map` de código a socio.
  Buscar un llavero es una consulta a ese mapa, no a la red.
- **El veredicto es el que ya existe.** El llavero solo dice *quién es*. Si pasa, si suena la X,
  si abre la cajita, lo deciden `situacionSocio` y `puedePasarElMolinete`, igual que con el DNI.
  No hay una regla del llavero.
- **El cartel es el mismo**: foto, nombre, situación, días que le quedan o que debe, arancel. Es
  «el socio, su cuota y demás» que mostraba ControlFit.
- **Freno de rebote, como el QR.** La gente pasa el llavero dos veces «por las dudas». Un aparato
  repitiendo un gesto no es una salida: `ventanaDeRebote("LLAVERO")` igual que el QR (hoy sin freno
  serían entrada y salida en un segundo).
- **Prioridad.** El llavero se busca **antes** que el texto. Si el código es de un llavero, ese es
  el socio. Si no, sigue la búsqueda de siempre (y por eso los ~35 que tienen el llavero en el DNI
  siguen andando aunque nadie los migre). Si el llavero apunta a un socio y el DNI a otro, no se
  elige: se muestran los dos, como hoy con varios resultados.

### 5 · Cuándo NO abre

| Pasa esto | Lo que ve el mostrador | Abre |
|---|---|---|
| Llavero de un socio al día / en gracia / sin datos | el cartel verde | ✅ |
| Llavero de un socio vencido | el cartel con la X y los días que debe | ❌ |
| Llavero de un socio dado de baja | «dado de baja» | ❌ |
| Llavero que no es de nadie | «Llavero sin asignar» y el botón para asignarlo | ❌ |
| Llavero dado de baja (perdido) | «Ese llavero fue dado de baja el …» | ❌ |
| La PC no está en Accesos | nada (el número se escribe donde esté el cursor) | ❌ |

⚠️ **La última fila es la debilidad del teclado**, y es la misma que hoy tiene el QR. En la v1 el
mostrador tiene que estar en Accesos, que es donde ya está cuando hay molinete. La cajita lectora
(punto 3) es lo que la saca de ahí.

### 6 · Cómo se le asigna un llavero a un socio

Siempre **pasándolo por el lector del gimnasio**, nunca tecleando el número, para que quede
guardado en el formato que ese lector escribe.

1. **Desde la ficha del socio**: sección «Llaveros» → «Asignar llavero» → «Pasalo por el lector».
   Se guarda solo al leerlo.
2. **Desde Accesos, al pasar uno que no es de nadie**: «Llavero sin asignar» → «Asignárselo a…» →
   buscás al socio → listo. Así se carga un gimnasio entero sin sentarse a hacerlo: cada socio la
   primera vez que viene.
3. **Si el llavero ya es de otro**: «Este llavero es de Juan Pérez. ¿Pasárselo a María Gómez?».
   El de Juan queda dado de baja con el motivo, no borrado.
4. **Perdió el llavero**: en la ficha, «Lo perdió» → dado de baja. El próximo que le den se asigna
   como uno nuevo.
5. **El importador** suma una columna opcional «Llavero» para las migraciones.

**Asignar necesita internet.** Pasar el llavero para entrar, no. Asignar es raro y la regla de
«un llavero, un socio» la tiene que verificar la base: hacerlo sin conexión sería encolar un
conflicto. Sin internet, el botón lo dice.

### 7 · El backend

- **Migración V90**: la tabla, el índice único parcial, RLS cerrado y **sin `GRANT` a
  `anon`/`authenticated`** (lo controla `MigracionesSinPermisosPublicosTest`).
- **`GET /gym/members`** (lo que baja la copia local) suma `llaveros: ["0012345678"]` por socio,
  solo los activos.
- **`POST /gym/members/{id}/llaveros`** `{codigo, reasignar?}` → 201; 409 con el dueño actual si
  ya es de otro y no vino `reasignar`.
- **`POST /gym/llaveros/{id}/baja`** `{motivo}`. No hay `DELETE`.
- **La búsqueda del servidor** (el respaldo de cuando todavía no bajó la copia local) también
  encuentra por llavero exacto.
- **El check-in** acepta el método `LLAVERO`; `ventanaDeRebote` le da el freno del QR; los
  reportes y la pantalla «Adentro» lo muestran como «Llavero».

### 8 · El plan

**El llavero identifica en cualquier plan. Lo que es Premium es que el molinete abra solo**, y
eso ya está: `abrirSiPasa` no abre sin `CONTROL_DE_ACCESO`. Es la misma línea que hoy separa el
DNI y el QR (todos los planes) del molinete facial y la cajita (Premium). Un gimnasio básico con
lector usa el llavero para no teclear el DNI; el que quiere el molinete, sube de plan.

### 9 · Hernández Tecnofit

1. **Hoy, sin código nuevo**: con un lector tipo teclado, los ~35 socios que tienen el llavero en
   el DNI **ya entran**: el número se escribe en Accesos, el buscador lo encuentra, y la cajita
   abre. Es la prueba del lector antes de construir nada.
2. **Cuando esté el código**: un script de una vez pasa esos números de `document` a
   `member_credential` (los que no tienen forma de DNI: 9 o más dígitos). El documento no se toca:
   lo corrige el mostrador cuando el socio traiga el DNI.
3. **Antes del script**, pasar dos llaveros de esos socios por el lector nuevo y comparar con el
   número que tienen en Veltronik. Si el lector escribe otro formato, no se migra: se configura el
   lector (muchos traen tarjetas de configuración para elegir el formato) o se asignan de a uno con
   el punto 6.2.

## Alternativas descartadas

- **Dejar el llavero en el campo DNI, como ControlFit.** Es lo que hay hoy y anda para entrar, pero
  el socio queda sin DNI (o con un DNI que no es), un socio no puede tener dos llaveros, perder uno
  obliga a editar el documento, y la búsqueda «contiene» del nombre se mezcla con un número que
  debería ser exacto.
- **Hablar con el lector SYC de Nelson por USB en la v1.** Habría que adivinar un protocolo sin
  documentación, solo serviría para ese modelo, y solo en el escritorio. Un lector tipo teclado
  cuesta como un lector de barras y sirve para todos los gimnasios.
- **El lector dentro de la cajita en la v1.** Es la mejor versión a la larga (punto 3), pero exige
  soldar un módulo, elegir la frecuencia antes de saber cuál es, y firmware nuevo. Primero que
  ande el llavero con lo que se compra hecho; la cajita lectora viene después y entra por la misma
  función.
- **Preguntarle al servidor de quién es cada llavero.** Sin internet no entraría nadie, y la
  regla del núcleo local es que la puerta decide con la copia local.
- **Hashear el código.** Ver punto 1: no protege nada y no deja mostrarlo ni migrarlo.

## Consecuencias

- La copia local crece unos bytes por socio con llavero. Nada.
- Hay una regla nueva que no se puede romper: **el código se compara exacto**. Va con un test que
  pruebe que `0012345678` no encuentra al socio del DNI `12345678`.
- Accesos aprende a distinguir un lector de una persona (la ráfaga). Va con su test, con tiempos
  falsos.
- El teclado ata el llavero a la pantalla de Accesos, igual que el QR. Queda anotado arriba.
- El diseño de agosto («Agente de Puerta», `MemberCredential` hasheada) queda corregido en el
  hash; el resto (credenciales como entidad aparte, la puerta decide local) se mantiene.

## Cuándo reconsiderar

- **Un gimnasio con el lector en la puerta y la PC lejos**, o que necesita que el mostrador use
  otras pantallas mientras la gente entra: es la señal para la cajita lectora.
- **Un gimnasio que ya tiene lectores por comandos** y no los quiere cambiar: un driver WebHID por
  modelo, entrando por `alLeerLlavero`.
- **Si alguien empieza a copiar llaveros** (los de 125 kHz se clonan con un aparato de feria): ahí
  se mira MIFARE con clave, y el código deja de ser el número de serie.

## Lo que hay que averiguar en el gimnasio antes de escribir código

1. **¿El celular lee el llavero?** (NFC prendido, apoyarlo atrás). Sí → 13,56 MHz. No → 125 kHz.
2. **¿Todos los socios tienen llavero, o solo esos ~35?** Cambia si la migración importa o si se
   asignan de a uno.
3. **El número que escribe el lector nuevo, contra el que tienen en Veltronik** (punto 9.3).
