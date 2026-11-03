import { useEffect, useRef } from 'react';
import { crearDetectorDeRafagas, MAX_INTERVALO_MS } from '../lib/rafagaDelLector';

/** ¿Es un campo donde se escribe? Ahí la ráfaga deja letras que hay que sacar. */
function esCampo(t) {
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
}

/** Lo que tiene el campo ahora: antes de que la tecla que se está procesando se escriba. */
function valorDe(t) {
  return esCampo(t) ? t.value : null;
}

/**
 * Le devuelve al campo un valor como lo haría una persona, para que React se entere.
 *
 * <p>⚠️ Por el setter NATIVO y con su evento. React le pone su propio rastreador de valor al
 * campo: un `el.value = …` a mano no le parece un cambio, y el estado de la pantalla se quedaría
 * con el número del llavero aunque el campo se vea limpio.</p>
 */
function devolver(el, valor) {
  if (!esCampo(el) || valor == null) return;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
    : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) return;
  setter.call(el, valor);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

/**
 * ⭐ EL LECTOR DE LLAVEROS, EN CUALQUIER PANTALLA (ADR-016 §3; global desde el 03/11/2026).
 *
 * <p>El lector "tipo teclado" escribe el número del llavero y un Enter en lo que tenga el foco,
 * sea lo que sea. Este hook escucha el teclado de toda la página ANTES que nadie (fase de
 * captura) y, cuando reconoce la ráfaga de un lector, se queda con ese Enter y llama a
 * {@code alLeer(codigo)}. El Enter de una persona pasa de largo y hace lo de siempre.</p>
 *
 * <p><b>Lo que escribió el lector no se queda en ningún campo.</b> Antes este hook no tocaba las
 * teclas que iban a otro campo —para no romperle el formulario a nadie—, así que el lector solo
 * andaba con el buscador de Accesos: si el profe estaba cobrando, el número del llavero quedaba
 * en el monto. Ahora las teclas entran (no hay forma de saber que son del lector hasta que llega
 * la sexta), y al reconocer la ráfaga el campo vuelve a quedar exactamente como estaba, y el
 * Enter del lector no llega al formulario: no envía nada ni aprieta ningún botón.</p>
 *
 * <p>El campo marcado con {@code data-lector="vaciar"} —el buscador de Accesos— queda VACÍO: lo que
 * hubiera antes era el principio de una búsqueda, no un trabajo a medias, y pegado al llavero no
 * encontraría a nadie.</p>
 *
 * <p>⚠️ Y el campo marcado con {@code data-lector="propio"} NO se toca: es uno que lee el lector él
 * mismo —«Asignar llavero» en la ficha del socio, «Probar el lector» en Ajustes—. Ahí pasar el
 * llavero es para asignarlo o probarlo, no para entrar: si el portero se quedara con la lectura,
 * le registraría la entrada al socio en vez de darle el llavero.</p>
 *
 * <p><b>El reloj es el de la tecla</b> ({@code e.timeStamp}), no el de cuando se procesa: si la
 * pantalla estuvo ocupada, las teclas de una persona se procesan todas juntas y con el reloj de
 * ahora parecerían una ráfaga. Con el de la tecla, cada una dice cuándo se apretó.</p>
 *
 * @param {(codigo: string) => void} alLeer lo que pasa con un llavero leído
 * @param {{ activo?: boolean, reloj?: (e: KeyboardEvent) => number }} [opciones]
 */
export function useLectorDeLlaveros(alLeer, { activo = true, reloj = (e) => e.timeStamp } = {}) {
  // La función más nueva, sin volver a enganchar el escucha en cada dibujo: si se enganchara de
  // nuevo, el detector nacería vacío y una ráfaga cortada al medio por un dibujo no se vería.
  const alLeerRef = useRef(alLeer);
  const relojRef = useRef(reloj);
  useEffect(() => {
    alLeerRef.current = alLeer;
    relojRef.current = reloj;
  });

  useEffect(() => {
    if (!activo) return undefined;
    const detector = crearDetectorDeRafagas();
    // Dónde empezó la ráfaga que puede estar llegando, y qué tenía ese campo antes de la
    // primera tecla. La misma cuenta que el detector: una pausa larga empieza una nueva.
    let inicio = null;
    let ultimoCaracter = -Infinity;

    const alTeclear = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      // Un campo que lee el lector él mismo: todo lo que llega es suyo, empezando por el Enter.
      if (e.target?.closest?.('[data-lector="propio"]')) {
        detector.reiniciar();
        inicio = null;
        ultimoCaracter = -Infinity;
        return;
      }
      const t = relojRef.current(e);

      if (typeof e.key === 'string' && e.key.length === 1) {
        if (t - ultimoCaracter > MAX_INTERVALO_MS || !inicio) {
          inicio = { el: e.target, valor: valorDe(e.target) };
        }
        ultimoCaracter = t;
      }

      const leido = detector.tecla(e.key, t);
      if (e.key === 'Enter') ultimoCaracter = -Infinity;
      if (!leido) return;

      // El Enter es del lector: que no llegue a nadie (un buscador lo tomaría por una persona,
      // un formulario se enviaría, un botón con el foco se apretaría).
      e.preventDefault();
      e.stopPropagation();

      // Y lo que escribió no se queda: donde empezó vuelve a como estaba, y el campo que pide
      // quedar vacío (el buscador de Accesos) queda vacío. Puede ser otro que el del principio:
      // en Accesos la primera tecla suelta se lleva el foco al buscador.
      const origen = inicio;
      inicio = null;
      for (const el of new Set([origen?.el, e.target])) {
        if (!esCampo(el)) continue;
        if (el.dataset?.lector === 'vaciar') devolver(el, '');
        else if (el === origen?.el) devolver(el, origen.valor);
      }

      alLeerRef.current(leido.codigo);
    };

    document.addEventListener('keydown', alTeclear, true);
    return () => document.removeEventListener('keydown', alTeclear, true);
  }, [activo]);
}
