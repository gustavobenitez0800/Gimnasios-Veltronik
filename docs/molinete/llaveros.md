# Los llaveros

El socio pasa su **llavero de proximidad** por un lector enchufado a la PC del mostrador y
Veltronik hace lo mismo que si hubiera tecleado su DNI en **Accesos**: aparece su cartel (cuánto
le queda, si está vencido) y, si hay [cajita del molinete](cajita.md), el molinete se abre.

- Quién pasa: **los mismos que con el DNI**: al día, en gracia o sin fecha cargada. El vencido y
  el dado de baja, no (y suena la X).
- Sin internet anda igual: la PC tiene la lista de socios con sus llaveros.
- El llavero sirve en **cualquier plan**. Que el molinete abra solo es del **plan Premium**.
- La PC tiene que estar en **Accesos**, como con el DNI y el QR.

Por qué está hecho así: [ADR-016](../adr/ADR-016-el-llavero-es-una-credencial-que-se-lee-como-un-teclado.md).

---

## 1. Qué lector comprar

Un lector USB de llaveros **«tipo teclado»** (en las publicaciones dice *emulación de teclado*,
*keyboard*, *HID* o *plug and play*): pasás el llavero y escribe el número y un **Enter** solo,
como un lector de códigos de barras. No necesita drivers ni programas.

| Si… | Comprá |
|---|---|
| No sabés la frecuencia del llavero | Uno **doble**: 125 kHz + 13,56 MHz («ID + IC») |
| El celular lee el llavero (NFC prendido, apoyado atrás) | Uno de **13,56 MHz** (MIFARE) |
| El celular no lo lee | Uno de **125 kHz** (EM4100) |

⚠️ Que termine con **Enter** (viene así de fábrica casi siempre). Si termina con Tab o con nada,
Veltronik no se entera de que terminó.

⚠️ El lector «SYC ID&IC» que trajo ControlFit en lo de Nelson **no sirve**: no escribe nada, habla
con su propio programa.

## 2. Probarlo

En la PC del mostrador, con Veltronik abierto:

1. Enchufá el lector.
2. **Ajustes → Llaveros → Probar el lector**: hacé clic en el campo y pasá un llavero.
3. Tiene que decir **«Lo reconocí como un lector: en Accesos va a andar solo»** y el número.
   - Si dice **«Eso parece tecleado a mano»**, el lector es lento o no está en modo teclado.
   - Debajo dice **de quién es** ese llavero, o que no es de nadie todavía.

## 3. Darles el llavero a los socios

Hay tres formas, y se pueden mezclar:

- **Que se carguen solos.** Un socio pasa un llavero que no es de nadie → en Accesos aparece
  **«Llavero sin asignar»** → se busca al socio por nombre o DNI → **«Asignárselo»** → entra. La
  próxima vez entra solo con el llavero.
- **Desde su ficha.** Socios → editar → **Llaveros → Asignar llavero** → pasarlo por el lector.
- **Si venían de ControlFit** (ver el punto 4).

Si el llavero ya es de otro socio, Veltronik pregunta antes de pasárselo; al otro se le da de
baja y queda anotado. Asignar necesita internet; entrar con el llavero, no.

**Lo perdió:** en su ficha, **«Lo perdió»** → confirmar. Deja de abrir en el acto. Si alguien
pasa después ese llavero, Accesos avisa (con internet) a quién se le había perdido.

## 4. Los que vinieron de ControlFit

ControlFit no tenía dónde guardar el llavero y lo ponía en el campo **DNI/ID**. Por eso esos
socios llegan a Veltronik con el número del llavero en el lugar del DNI.

- **Ya entran con el llavero** apenas haya un lector nuevo: Accesos también busca en el documento.
- Para ordenarlos: **Ajustes → Llaveros → Llaveros que vinieron en el DNI → Buscarlos** (dueño o
  admin). Muestra los socios cuyo documento tiene nueve dígitos o más.
  1. **Antes**, pasá dos de esos llaveros en «Probar el lector» y fijate que el número sea el mismo
     que tienen en el DNI. Si no coincide, no los pases: el lector escribe en otro formato (se
     puede configurar, o se asignan de a uno).
  2. **Destildá los documentos de verdad**: un número largo también puede ser un documento
     extranjero (un CPF de Brasil tiene 11 dígitos).
  3. **Pasar a llavero.** El DNI no se toca: corregilo cuando el socio traiga el documento.

## 5. Si algo no anda

| Pasa esto | Qué es |
|---|---|
| Pasa el llavero y no aparece nada | La PC no está en Accesos, o el foco está en otro campo de texto o una ventana abierta |
| En «Probar el lector» no aparece nada | El lector no escribe (no es tipo teclado, o es de otra frecuencia que el llavero) |
| «Eso parece tecleado a mano» | El lector es lento o no termina con Enter |
| Aparece «Llavero sin asignar» con un socio que ya tenía llavero | Se lo asignaron en otra PC hace un rato y no había internet, o el lector escribe otro número que el que se guardó |
| Abre con el DNI pero no con el llavero | El llavero no es de ese socio: mirá su ficha |
| Entra pero el molinete no abre | Lo mismo que con el DNI: la [cajita](cajita.md), el plan Premium, o la cuota |
| Pasa el llavero dos veces y la segunda no abre | Es a propósito: dentro de 15 segundos es el mismo gesto, y abrir de nuevo dejaría pasar a dos |

## 6. Por dentro

- El llavero se guarda **como lo escribe el lector**, sin espacios y en mayúsculas, **con los
  ceros de adelante** (`0012345678` no es el DNI `12345678`), y se compara **exacto**.
- Se distingue un lector de una persona por la velocidad: 6 caracteres o más, con 50 ms o menos
  entre uno y otro, y el Enter hasta 150 ms después ([`lib/rafagaDelLector.js`](../../frontend/src/lib/rafagaDelLector.js)).
- Tabla `member_credential` (V90); los llaveros viajan en la lista de socios para buscarlos sin
  internet. Detalle en el ADR-016.
