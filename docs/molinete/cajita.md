# La cajita del molinete

Una cajita con una **Raspberry Pi Pico** y un **relé**, enchufada por USB a la PC del mostrador
y cableada al molinete. Cuando entra alguien que puede pasar —con su DNI en el mostrador o con
el QR de la puerta— Veltronik le dice «abrí» y el molinete deja pasar a una persona.

Sirve para **cualquier molinete con traba eléctrica o con una entrada de «abrir»**. El primero
fue el del gimnasio de Nelson Hernández (31/10/2026).

- Quién pasa: **los mismos que en el molinete facial**: al día, en gracia o sin fecha cargada.
  El vencido y el dado de baja, no (y en el mostrador suena la X).
- Sin internet anda igual: decide la copia local del mostrador.
- Es del **plan Premium**, y la **prueba gratis** lo incluye (Ajustes dice hasta cuándo). Con el
  básico no abre sola; los botones manuales andan con cualquier plan.
- Si se corta la luz o se apaga la PC, el molinete queda **libre** (con el cableado «sostener»):
  se puede salir siempre.

El programa de la cajita está en [`frontend/firmware/cajita-molinete/main.py`](../../frontend/firmware/cajita-molinete/main.py).
La app de escritorio se lo instala y se lo actualiza sola.

Con un lector de llaveros, el socio también abre pasando su llavero: ver [los llaveros](llaveros.md).

---

## 1. Qué hay que comprar

| Pieza | Para qué | Ojo |
|---|---|---|
| Raspberry Pi Pico (la común, sin W) | el cerebro | Que sea **Pico** de Raspberry. No hace falta la Pico W |
| Módulo relé de **1 canal, 5 V** (tipo HW-482 / JQC3F-05VDC-C) | el que abre y traba | Que se active con señal **ALTA** («high level trigger») de 3,3 V en `IN`, como el de Nelson. Uno de disparo por señal baja haría todo al revés |
| Cable USB micro-B **de datos** | a la PC del mostrador | Muchos cables de celular solo cargan: probar que pase datos |
| Cables dupont hembra-hembra (3) y una cajita plástica | armado | |

No hace falta ningún driver: Windows la reconoce sola.

## 2. Armarla

Las tres patas, siempre las mismas (el programa usa **GP28**):

| Pico | Relé |
|---|---|
| `VBUS` (pata 40, 5 V del USB) | `VCC` |
| `GND` (pata 38) | `GND` |
| `GP28` (pata 34) | `IN` |

## 3. Cablearla al molinete: los dos modos

⚡ **Con el molinete desenchufado.** Si en el gimnasio hay dudas con la instalación eléctrica
(se quemaron equipos, enchufes flojos), primero un electricista.

Mirá cómo traba el molinete y elegí uno de los dos:

**Sostener** — el molinete se traba cuando le llega corriente a su electroimán, y gira libre sin
ella (así es el de Nelson: un trípode Tango Access). El relé va **en serie con la orden de
trabar**: `COM` y `NO` del relé en lugar del cable que manda trabar. La cajita sostiene el relé
prendido (cruz roja) y lo suelta unos segundos para que pase alguien. Tiempo típico: **5 s**.

**Pulso** — el molinete tiene su propia placa y una entrada de «abrir» (la del botón de
apertura, a veces dice `BOT`, `OPEN`, `ENT` o `LIB`). El relé va **en paralelo con ese botón**:
`COM` y `NO` a los dos bornes del botón. La cajita manda un pulso y la placa del molinete cuenta
la vuelta y vuelve a trabar sola. Tiempo típico: **0,5 s**.

En la duda: el instalador o el manual del molinete dicen cuál es la entrada de «abrir».

## 4. Instalarle MicroPython (una vez por placa, si es nueva)

1. Bajá el archivo `.uf2` de MicroPython para **Raspberry Pi Pico** de la página oficial:
   <https://micropython.org/download/RPI_PICO/> (el último estable).
2. Con la Pico **desenchufada**, mantené apretado el botón **BOOTSEL** y enchufala a la PC.
   Soltalo: aparece una unidad nueva llamada **RPI-RP2**, como un pendrive.
3. Copiá el `.uf2` a esa unidad. La Pico se reinicia sola y la unidad desaparece. Listo.

⚠️ Si la unidad RPI-RP2 no aparece, el cable no pasa datos: probá con otro.

## 5. Instalarle el programa de Veltronik

En la PC del mostrador, con el **escritorio de Veltronik** abierto y la cajita enchufada:

1. **Ajustes → Cajita del molinete → «Buscar la cajita»**.
2. Una placa nueva aparece como «no contesta». Apretá **«Instalarle el programa»**: tarda unos
   segundos. Tiene que quedar **«Conectada · veltronik-molinete 2»**.
3. En **«Cómo está cableada al molinete»** elegí el modo del paso 3 (sostener o pulso) y el tiempo.
   Queda guardado **adentro de la cajita**: si se cambia la PC, la cajita sigue igual.
4. Si por el molinete también se sale (molinete de dos sentidos), marcá **«Abrir también al
   registrar la salida»**. Si se sale por otra puerta, dejalo sin marcar.

Una cajita con el primer programa (la de Nelson) aparece conectada con el botón
**«Actualizar el programa»**: abre y traba igual, pero para elegir el modo hay que actualizarla.

## 6. Probarla antes de irse

Con el molinete enchufado:

- [ ] Ajustes: **Trabar** → no gira. **Abrir** → pasa una persona y se vuelve a trabar solo.
- [ ] Accesos: el DNI de un socio **al día** → abre. El de un **vencido** → no abre y suena la X.
- [ ] El botón **«Abrir molinete»** de Accesos abre sin registrar a nadie.
- [ ] Un **QR** escaneado con un socio al día → abre (en cualquier pantalla del programa).
- [ ] Desenchufá el USB de la cajita → el molinete queda libre (modo sostener). Volvé a
      enchufarla → se reconecta sola y vuelve a trabar.
- [ ] La sucursal tiene el **plan Premium** o está en la prueba gratis (si no, el DNI no abre: ver Ajustes).

## 7. Si algo no anda

| Pasa esto | Qué es |
|---|---|
| «No hay ninguna cajita enchufada» | El cable no pasa datos, o el USB está flojo. Probá otro cable y otro puerto |
| «No contesta» y el botón de instalar dice que no es MicroPython | Falta el paso 4 |
| «No contesta» con el programa instalado | Otro programa (Thonny, el monitor serie) tiene la cajita abierta: cerralo |
| El relé hace clic pero el molinete no cambia | Cableado o modo equivocado (paso 3), o el molinete sin corriente |
| Hace clic, cambia la flecha, pero el brazo gira igual | La traba mecánica del molinete: es para un técnico, no para la cajita |
| Abre con un clic manual pero no con el DNI | El plan de la sucursal no es Premium (o la prueba gratis terminó) |

## 8. Por dentro (para quien la programe)

Órdenes por USB, una por renglón, a 115200 baudios (⚠️ **nunca 1200**: reinicia la Pico en modo
cargador):

| Orden | Respuesta |
|---|---|
| `PING` | `PONG veltronik-molinete 2` |
| `ABRIR [ms]` | abre esos milisegundos (sin número, los guardados) y vuelve a trabar sola |
| `TRABAR` / `LIBRE` | `OK TRABADO` / `OK LIBRE` |
| `ESTADO` | `ESTADO TRABADO MODO=SOSTENER ABRIR_MS=5000 veltronik-molinete 2` |
| `MODO SOSTENER\|PULSO`, `TIEMPO <ms>` | cambian la configuración y la guardan en `cajita.json` |

La placa se reconoce por USB como VID `2E8A` / PID `0005`. El escritorio la habla con la API
serie de Chromium (sin librerías nativas): [`frontend/src/lib/cajitaMolinete.js`](../../frontend/src/lib/cajitaMolinete.js).
El programa se instala por la consola cruda de MicroPython (Ctrl-C, Ctrl-A, escribir `main.py`,
Ctrl-D, Ctrl-B, reinicio). El CI comprueba que `main.py` compile.
