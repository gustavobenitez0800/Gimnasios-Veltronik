// ============================================
// VELTRONIK - CUÁNTO LE QUEDA, DICHO PARA LA PUERTA
// ============================================
// Lo que muestran el cartel de la puerta y el buscador de Accesos de cada socio: el número
// grande (los días), su aclaración chiquita y el color.
//
// Vivía adentro de la pantalla Accesos. Se mudó acá (03/11/2026) porque ahora la puerta la
// atiende el portero en cualquier pantalla, y el cartel del llavero o del QR tiene que decir lo
// MISMO esté abierta la pantalla que esté.
//
// ⭐ ACÁ NO SE RECALCULA NADA, Y ES A PROPÓSITO. La situación la dice el BACKEND (o el espejo,
// que es el único dato que se pone viejo y se pone al día en `lib/localMembers.js`). Una cuenta
// de días propia acá fue, en su momento, una de las cinco que no coincidían entre sí: "hace 2
// días" en el aviso, "4d vencido" en la lista.
// ============================================

/**
 * @param {{situacion?: string, diasVencido?: number, diasRestantes?: number}} socio
 * @returns {{label: string, type: 'ok'|'warning'|'danger'|'expired'|'unknown', valor: string|null, unidad: string}}
 *   label: lo corto, para la lista de resultados. valor + unidad: el número partido en dos, para
 *   mostrarlo enorme en el cartel (partirlo acá evita recomponerlo con una expresión regular).
 */
export function cuantoLeQueda(socio) {
  const { situacion, diasVencido, diasRestantes } = socio || {};
  if (!situacion || situacion === 'SIN_DATOS') {
    // Sin número: un "—" gigante en el cartel no le dice nada a nadie. Se dice con palabras.
    return { label: 'Sin fecha', type: 'unknown', valor: null, unidad: 'Sin fecha cargada' };
  }
  if (situacion === 'INACTIVO') {
    return { label: 'Dado de baja', type: 'expired', valor: null, unidad: 'Dado de baja' };
  }

  if (situacion === 'VENCIDO' || situacion === 'EN_GRACIA') {
    return {
      label: `${diasVencido}d vencido`, type: 'expired',
      valor: String(diasVencido ?? 0),
      unidad: diasVencido === 1 ? 'día vencido' : 'días vencido',
    };
  }

  // ⭐ DÍAS, Y NADA MÁS. El cupo de clases se dio de baja (2026-09-02): se paga el mes y se
  // entra, se vence y hay que renovar. En la puerta hay un solo número y no dos compitiendo.
  const d = diasRestantes ?? 0;
  const label = `${d}d restantes`;
  const detalle = { valor: String(d), unidad: d === 1 ? 'día restante' : 'días restantes' };

  if (d <= 3) return { label, type: 'danger', ...detalle };
  if (d <= 7) return { label, type: 'warning', ...detalle };
  return { label, type: 'ok', ...detalle };
}

/** El color del cartel según los días: rojo el vencido, ámbar el que vence en tres días. */
export function colorDelCartel(info) {
  return info.type === 'expired' ? 'error' : info.type === 'danger' ? 'warning' : 'success';
}
