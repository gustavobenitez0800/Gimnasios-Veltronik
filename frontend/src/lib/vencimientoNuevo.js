// ============================================
// VELTRONIK - CÓMO QUEDA EL VENCIMIENTO DESPUÉS DE COBRAR (para mostrarlo ANTES)
// ============================================
// Lo pidió un gimnasio (08/11/2026): «cuando la persona paga dos o tres días tarde, el sistema le
// deja la fecha en que pagó y no la que se venció; la cambio a mano y a veces no me acuerdo cuál
// era». Ahora, al cobrarle a alguien vencido, se elige si el mes arranca desde que venció o desde
// hoy, viendo la fecha que queda en cada caso.
//
// ⚠️ ESTA ES LA GEMELA DE `GymPaymentService.aplicarPeriodoDelPlan` (backend), y la que manda es
// aquella: acá solo se MUESTRA. Las dos aplican la misma regla y tienen los mismos casos en sus
// tests (CoberturaDelMesIntegrationTest / vencimientoNuevo.test.js). Si cambia una, cambia la
// otra. El cobro rápido, además, muestra después el vencimiento que dijo el servidor.
//
// La regla:
//   · Al día (vence en el futuro): se le suma desde su vencimiento. No hay nada que elegir.
//   · Vencido: «desde que venció» (no pierde su ciclo) o «desde hoy».
//   · «Desde que venció» solo existe si deja al socio AL DÍA: si ese período ya terminó, pagaría
//     y seguiría vencido. Ahí solo hay «desde hoy».
// ============================================

export const ARRANCA = { VENCIMIENTO: 'VENCIMIENTO', HOY: 'HOY' };

/** Una fecha del servidor ("2026-11-02T00:00:00", sin zona: la hora del gimnasio) como Date local. */
function comoFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return new Date(valor.getTime());
  const [d, t = '00:00:00'] = String(valor).split('T');
  const [a, m, dia] = d.split('-').map(Number);
  const [h = 0, min = 0, s = 0] = t.split(':').map((x) => Number.parseFloat(x) || 0);
  const f = new Date(a, (m || 1) - 1, dia || 1, h, min, Math.floor(s));
  return Number.isNaN(f.getTime()) ? null : f;
}

/**
 * Suma lo que cubre un arancel. Meses como `LocalDateTime.plusMonths`: el mismo día del mes que
 * viene y, si no existe (un 31), el último que exista. Días, de a días.
 */
export function sumarCobertura(desde, cantidad, unidad) {
  const f = new Date(desde.getTime());
  if (unidad === 'MES') {
    const dia = f.getDate();
    f.setDate(1);
    f.setMonth(f.getMonth() + cantidad);
    const ultimo = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
    f.setDate(Math.min(dia, ultimo));
    return f;
  }
  f.setDate(f.getDate() + cantidad);
  return f;
}

/**
 * Las opciones que tiene quien cobra.
 *
 * @param {{ vence?: string|Date|null, plan?: {coberturaCantidad?: number, coberturaUnidad?: string}|null, ahora?: Date }} o
 *   plan null = cobro sin arancel (corre un mes).
 * @returns {null | { alDia: Date|null, desdeQueVencio: Date|null, desdeHoy: Date, vencia: Date|null,
 *   sugerida: string }}
 *   null si el cobro no corre la fecha (un arancel que no cubre tiempo). `alDia` = el socio
 *   todavía no venció: queda esa fecha y no hay nada que elegir. `desdeQueVencio` = null si esa
 *   opción no existe.
 */
export function opcionesDeArranque({ vence = null, plan = null, ahora = new Date() } = {}) {
  const cantidad = plan ? (plan.coberturaCantidad ?? 1) : 1;
  const unidad = plan ? (plan.coberturaUnidad || 'MES') : 'MES';
  if (!(cantidad > 0)) return null;

  const vigente = comoFecha(vence);
  const desdeHoy = sumarCobertura(ahora, cantidad, unidad);

  if (vigente && vigente > ahora) {
    return { alDia: sumarCobertura(vigente, cantidad, unidad), desdeQueVencio: null, desdeHoy, vencia: vigente, sugerida: ARRANCA.VENCIMIENTO };
  }

  const candidato = vigente ? sumarCobertura(vigente, cantidad, unidad) : null;
  const desdeQueVencio = candidato && candidato > ahora ? candidato : null;
  return {
    alDia: null,
    desdeQueVencio,
    desdeHoy,
    vencia: vigente,
    // Lo que pidió el gimnasio: el que pagó tarde, por defecto, no pierde su ciclo. Un clic lo cambia.
    sugerida: desdeQueVencio ? ARRANCA.VENCIMIENTO : ARRANCA.HOY,
  };
}
