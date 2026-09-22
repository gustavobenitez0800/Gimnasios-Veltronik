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

/** Solo para los tests: que cada uno arranque sin el pedido del anterior. */
export function olvidarPlanes() {
  pedido = null;
}
