// ============================================
// VELTRONIK - LOS PLANES (Básico, Premium) Y SU PRECIO
// ============================================
// Los define el BACKEND (/public/plans): nombre, precio y qué incluye. Lo piden el Lobby,
// Planes y Ajustes; antes cada uno por su lado, y Ajustes ni preguntaba: decía "Veltronik Pro"
// con el precio del básico a todos, aunque la sucursal pagara Premium.
//
// Un solo pedido por sesión: el catálogo cambia cuando se redeploya el backend, no mientras
// alguien mira la pantalla. Si falla, se olvida y el próximo que pregunte lo intenta de nuevo.
// ============================================

import apiClient from './apiClient';

let pedido = null;

/** La lista de planes que se pueden contratar hoy. Nunca rechaza: sin respuesta, []. */
export function obtenerPlanes() {
  if (!pedido) {
    pedido = apiClient.get('/public/plans')
      .then((res) => (Array.isArray(res.data) ? res.data : []))
      .catch(() => {
        pedido = null;
        return [];
      });
  }
  return pedido;
}

/** El plan de un código ("BASICO", "PREMIUM"), o null si no está en la lista. */
export function planDe(planes, codigo) {
  if (!codigo) return null;
  return (planes || []).find((p) => p.code === codigo) || null;
}

/**
 * Los planes con su precio, en una frase: "Veltronik $55.000/mes o Veltronik Premium
 * $145.000/mes".
 *
 * <p>Para los carteles que anuncian lo que se va a cobrar ANTES de llegar a la página de
 * planes. El alta de una sucursal adicional decía solo el precio del básico, y al activarla
 * aparecían los dos planes: el cartel prometía un número y la pantalla siguiente ofrecía otro.
 * Con la misma lista que usa Planes, los dos dicen siempre lo mismo.</p>
 *
 * <p>Cada plan va pegado a su precio con espacios que no cortan: en una pantalla angosta el
 * renglón se parte entre un plan y el otro, nunca dejando "$145.000/mes" solo abajo.</p>
 *
 * @returns la frase, o '' si no hay ningún plan con nombre y precio. Quien la use tiene que
 *          contemplar el '': mejor no decir un precio que decir uno equivocado.
 */
export function preciosDeLosPlanes(planes) {
  const partes = (planes || [])
    .filter((p) => p?.name && Number(p.price) > 0)
    .map((p) => `${p.name} $${Number(p.price).toLocaleString('es-AR')}/mes`.replace(/ /g, ' '));
  if (partes.length <= 1) return partes[0] || '';
  return `${partes.slice(0, -1).join(', ')} o ${partes[partes.length - 1]}`;
}

/** Solo para los tests: que cada uno arranque sin el pedido del anterior. */
export function olvidarPlanes() {
  pedido = null;
}
