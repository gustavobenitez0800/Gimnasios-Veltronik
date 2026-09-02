import { useEffect, useRef } from 'react';

/**
 * Mantiene una pantalla al día sola, preguntándole al servidor cada tanto.
 *
 * Existe porque hay DOS pantallas que miran lo mismo desde ángulos distintos —el mostrador
 * y "En el gimnasio"— y el latido no se puede copiar y pegar entre ellas: la forma de
 * escribirlo mal es sutil y no da error. Está acá una sola vez y se usa en las dos.
 *
 * ⚠️⚠️ LO QUE ESTE HOOK EVITA (pasó de verdad, arreglado en la v2.6.29).
 *
 * El efecto que monta el `setInterval` NO puede depender de la identidad de la función que
 * refresca. `invalidate` de useQueryCache nacía nueva en cada render, así que tenerla en las
 * dependencias desarmaba el temporizador y lo arrancaba de cero en CADA render. Y el
 * mostrador renderiza todo el tiempo —cada tecla del DNI, cada cartel que se va a los 4
 * segundos—, así que la cuenta no llegaba al final casi nunca: podía pasar minutos sin
 * refrescarse. No hay error, no hay log, y los tests unitarios lo ven todo bien.
 *
 * Se notó en las entradas por QR, que las marca el socio desde su celular: la pantalla se
 * entera SOLO por este latido. A mano el cartel lo pinta el propio handler y siempre fue
 * instantáneo — por eso el síntoma era "por QR tarda" y no "el sistema va lento".
 *
 * Por eso acá: el efecto se monta UNA vez (`[]`) y todo lo que cambia se lee por referencia.
 *
 * @param {Function} refrescar  Qué llamar para pedir datos nuevos (normalmente `invalidate`).
 * @param {boolean}  enVuelo    Si ya hay un pedido en curso (normalmente `isFetching`).
 * @param {{enFoco?: number, deFondo?: number}} ritmos  Cada cuánto preguntar, en ms.
 */
export function useRefrescoAutomatico(refrescar, enVuelo, ritmos = {}) {
  const { enFoco = 3000, deFondo = 15000 } = ritmos;

  const refrescarRef = useRef(refrescar);
  const enVueloRef = useRef(false);
  const ritmosRef = useRef({ enFoco, deFondo });
  // Al día después de cada render (no DURANTE: escribir un ref mientras se renderiza está
  // prohibido y el lint lo marca). En el primer render ya valen, por el valor inicial.
  useEffect(() => {
    refrescarRef.current = refrescar;
    enVueloRef.current = enVuelo;
    ritmosRef.current = { enFoco, deFondo };
  });

  useEffect(() => {
    let ultimoPedido = 0;

    const pedir = (forzado = false) => {
      // Una pantalla que nadie está mirando no tiene por qué seguir preguntando. Un terminal
      // olvidado abierto toda la noche es el caso real.
      if (document.visibilityState !== 'visible') return;

      // Con la ventana adelante hay alguien atendiendo y puede haber un socio escaneando el
      // QR ahora mismo. De fondo no la mira nadie, y preguntar seguido solo gasta.
      const { enFoco: rapido, deFondo: lento } = ritmosRef.current;
      const ritmo = document.hasFocus?.() ? rapido : lento;
      if (!forzado && Date.now() - ultimoPedido < ritmo) return;

      // Si el pedido anterior sigue en vuelo, este ciclo se saltea: con mala conexión,
      // encimar pedidos no trae la respuesta antes — solo agrega pedidos.
      if (enVueloRef.current) return;

      ultimoPedido = Date.now();
      refrescarRef.current();
    };

    // El latido es corto y casi siempre no hace nada: quien decide si toca pedir es `pedir`,
    // mirando el reloj. Así el ritmo cambia con el foco sin rearmar ningún temporizador.
    const t = setInterval(pedir, 1000);

    // Al volver a la pantalla se refresca en el acto, sin esperar el próximo ciclo — que es
    // justo cuando la persona vuelve a mirar.
    const alVolver = () => pedir(true);
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, []);
}
