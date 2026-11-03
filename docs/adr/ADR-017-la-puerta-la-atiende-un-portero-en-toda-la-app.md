# ADR-017: La puerta la atiende un portero en toda la app, y la cajita que no abre anota un frenado

- **Estado:** ✅ Aceptada (Gustavo, 2026-11-03: «Sí hacela… Que quede bien hecho, arreglado y bien pensado») y construida en la rama `feat/portero-del-mostrador`
- **Fecha:** 2026-11-03

## Contexto

El pedido del dueño: automatizar al máximo la entrada en los dos planes, pensando en el profe
que **también da clases, cobra y atiende**, y que en la puerta suene cuando pasa un llavero.

Lo que se encontró al recorrer el código:

| Pieza de la puerta | Dónde vivía |
|---|---|
| El lector de llaveros (`useLectorDeLlaveros`) | adentro de `AccessPage` |
| La cajita del molinete (se conectaba al montar, y todas las llamadas a `abrirSiPasa`) | adentro de `AccessPage` |
| Lo que llega solo: QR, frenados del molinete facial (`useNovedadesDeLaPuerta` + la siembra de "ya visto") | adentro de `AccessPage` |
| Los sonidos de la puerta | adentro de `AccessPage` |

Consecuencias, con el profe en Pagos (o Clases, o Socios):

1. **El molinete no abría para nadie**: ni QR ni llavero (la cajita quedaba enchufada, pero nadie
   le ordenaba abrir).
2. **La X no sonaba**, y lo que pasaba mientras tanto se perdía: al volver a Accesos la pantalla se
   volvía a "sembrar" y daba todo por visto.
3. **El lector escribía el número del llavero en el campo que tuviera el foco** (el monto del
   cobro), y su Enter enviaba el formulario.

Y un agujero aparte, en la cajita: al vencido que pasaba el llavero se le **anotaba una ENTRADA**
aunque la puerta no abriera. Figuraba adentro estando en la vereda, y si volvía a pasar el llavero
el servidor lo tomaba por una **SALIDA**: con un molinete que también abre para salir, le abría.

Precedente en el mismo código: el molinete facial (`MolineteAlDia`) y la cola (`VaciadorDeCola`)
ya se habían sacado de sus pantallas por lo mismo: «si viviera adentro de Ajustes, solo
funcionaría mientras alguien tuviera esa pantalla abierta».

## Decisión

### 1. Un portero, montado una vez (`contexts/PorteroContext.jsx`, en `AppLayout`)

Es el único dueño de la puerta: el dato del mostrador (`useQueryCache('mostrador')`, que Accesos
lee de él —dos copias del caché no se avisan entre sí—), las novedades de la puerta, el lector, la
cajita, la cola, los sonidos, el cartel de entrada, el aviso del llavero sin asignar y el cobro.
**Accesos pasa a ser una vista**: el buscador, el cartel y quién necesita atención.

- **Escritorio: atiende siempre.** Fuera de Accesos, lo que pasa en la puerta aparece en una
  tarjeta abajo a la derecha (`components/portero/PuertaFlotante.jsx`): quién necesita atención
  (con «Cobrar» y «OK», plegable) y el último que pasó (unos segundos, sin poder tocarse).
- **Web: solo con Accesos abierta**, como antes. El portal es del dueño, que lo mira desde la casa:
  carteles de la puerta mientras mira reportes no le sirven, y preguntar cada 2 s desde ahí es
  gastar. Para eso `useQueryCache` ganó la opción `enabled`.
- La siembra de "ya visto" es UNA por sesión en el escritorio (no se rehace al volver a Accesos).

### 2. El lector, en cualquier campo (`hooks/useLectorDeLlaveros.js`)

Las teclas de la ráfaga entran (hasta la sexta no se sabe que son de un lector); al reconocerla,
el Enter se frena (no envía nada ni aprieta ningún botón) y el campo vuelve a quedar como estaba
antes de la ráfaga, por el setter nativo y con su evento (React se entera). El campo marcado
`data-lector="vaciar"` —el buscador de Accesos— queda vacío.

### 3. La cajita que no abre anota un FRENADO, no una entrada

Con la cajita a cargo de la puerta (`laCajitaManda()`: enchufada y habilitada por el plan), con
internet, si el socio **no pasa** y **no está adentro**: no se registra la entrada; se anota un
rechazo (`POST /api/gym/access/rechazos` → `AccessDenied` con motivo **`NO_ESTA_AL_DIA`**, V91), que
es lo mismo que deja el molinete facial y aparece en «la puerta frenó a un socio». Al que está
adentro se le registra la salida y se le abre (no se lo deja encerrado). Sin cajita, la puerta la
maneja una persona: se registra la entrada y se avisa, como antes. Sin internet, como antes (la
cola y el veredicto local).

### 4. «Necesitan atención» incluye a todos los que entraron solos

Antes los avisos eran solo del QR. Ahora la consulta (`sinAtenderQueNoEstanAlDia`) toma `QR`,
`LLAVERO` y `FACIAL`, y cada aviso dice por dónde entró (`metodo`). Los que marca la recepcionista
a mano siguen afuera: ya los vio ella.

### 5. Cobrar desde la puerta

Cada aviso (y cada frenado) trae «Cobrar»: el cobro rápido de siempre (`lib/cobrarCuota.js`,
compartido con Socios). Al cobrar se marca atendido y, si la puerta no lo había dejado pasar y
pasaron menos de 10 minutos (sigue ahí parado): al frenado por la cajita **se le registra la
entrada y se le abre**; al que entró por QR sin que la cajita abriera, se le abre. Al frenado del
molinete facial no se le registra nada: lo vuelve a dejar pasar el equipo.

### 6. El lector lento y el llavero sin asignar

Si lo tecleado parece un llavero (6+ caracteres, con números, sin espacios) y no es el DNI de
nadie, se busca también como llavero: si es de alguien, entra con el llavero; si no, aparece el
botón «Es un llavero: asignárselo a un socio». No se abre solo: un DNI mal tecleado también parece
un llavero. El llavero de varios socios (lo de ControlFit) se resuelve en el mismo aviso, «Es este».

## Consecuencias

- ✅ La puerta funciona con el profe en cualquier pantalla del escritorio, en los dos planes (en el
  Básico avisa y suena; en el Premium, además, abre).
- ✅ Un vencido ya no entra pasando el llavero dos veces, y no figura adentro estando afuera.
- ✅ El llavero no ensucia formularios ni los envía.
- ⚠️ El escritorio pregunta la marca de la puerta cada 2 s aunque Accesos no esté abierta (antes,
  solo con Accesos abierta, que en un mostrador es casi siempre). La marca es una sola consulta
  desde el 31/10; fuera de Accesos el latido de respaldo baja a uno por minuto.
- ⚠️ Lo que el portero dibuja va envuelto en un borde de error propio: si la tarjeta fallara,
  desaparece y queda en la consola, pero la puerta (lector, cajita, sonido) sigue.
- 🔜 Pendiente: el QR de un vencido con cajita sigue quedando como ENTRADA en el servidor (el
  servidor no sabe si en ese gimnasio la puerta la maneja una cajita). Tiene aviso y «Cobrar»; si
  hace falta, se resuelve en el servidor cuando la cajita le cuente que existe.

## Cómo se probó

- Backend: `MolineteFlowIntegrationTest` (el frenado del mostrador, el repetido, el ajeno),
  `MostradorEgressTest` (avisan QR, llavero y cara; la recepcionista no). Suite: 778 verdes.
- Frontend: `PorteroContext.test` (11), `useLectorDeLlaveros.test` (5), `AvisosMostrador.test` (7) y
  los de Accesos (la cajita frena, el agujero cerrado, la salida, el lector lento). Suite: 1.094
  verdes. Vistos en rojo rompiendo a propósito el portero en Accesos solo, el cobro que no registra
  la entrada, la devolución del campo y el Enter del lector.
- En un navegador de verdad, con un banco de datos de mentira (sin tocar producción): el llavero
  en el monto de Pagos, el cobro desde la tarjeta con otro llavero pasando en el medio, Accesos con
  los dos bloques de avisos y el botón del lector lento. Sin un lector ni una cajita reales.
