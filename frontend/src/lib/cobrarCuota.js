// ============================================
// VELTRONIK - COBRARLE LA CUOTA A UN SOCIO
// ============================================
// Lo que hace el botón «Cobrar» del cobro rápido, venga de Socios o de la puerta. Vivía adentro
// de la pantalla de Socios; se mudó acá (03/11/2026) cuando la puerta empezó a cobrar también:
// dos copias del mismo cobro terminan, tarde o temprano, cobrando distinto.
//
// ⚠️ NO SE MANDAN FECHAS. El vencimiento lo corre el BACKEND al aplicar la cobertura del arancel;
// calcularlo también acá sería tener dos cuentas para lo mismo, que es el error que ya costó los
// días de vencimiento en cinco lugares.
// ============================================

import { paymentService, memberService } from '../services';

/**
 * @param {{id: string, fullName?: string, firstName?: string, lastName?: string}} socio
 * @param {{planId?: string|null, monto: number, metodo?: string, desde?: string|null}} cobro
 *   desde: al que pagó tarde, 'VENCIMIENTO' (no pierde su ciclo) o 'HOY'. Lo aplica el servidor.
 * @returns {Promise<{encolado?: boolean, membershipEnd?: string, socio?: object}>}
 *   encolado: sin conexión, el cobro quedó en la cola (todavía no movió el vencimiento).
 *   membershipEnd y socio: lo que quedó de verdad en el servidor; vacío si no se pudo releer.
 */
export async function cobrarCuota(socio, { planId, monto, metodo, desde = null }) {
  const r = await paymentService.createPayment({
    member_id: socio.id,
    // Solo para la cola: sin esto, la lista del cierre sin conexión muestra renglones sin
    // nombre y quien cierra no puede reconocer lo que cobró.
    memberName: socio.fullName || [socio.firstName, socio.lastName].filter(Boolean).join(' ').trim(),
    plan_id: planId,
    amount: monto,
    paymentMethod: (metodo || 'cash').toUpperCase(),
    status: 'PAID',
    // Viaja también en la cola: sin conexión, el servidor lo aplica cuando el cobro sube.
    ...(desde ? { desde } : {}),
  });

  // ⚠️ SIN CONEXIÓN NO SE PROMETE UN VENCIMIENTO NUEVO. La cobertura la corre el SERVIDOR, y
  // hasta que el cobro no suba no se movió nada: decir "ahora vence el 7 de octubre" —o incluso
  // "el vencimiento se actualizó"— sería afirmar algo que todavía no pasó.
  if (r?.encolado) return { encolado: true };

  // El socio ya actualizado, para mostrar el vencimiento REAL. Si no se puede releer, vacío: el
  // modal prefiere no decir nada antes que inventar una fecha.
  try {
    const dto = await memberService.getMemberById(socio.id);
    return dto ? { membershipEnd: dto.membershipEnd, socio: dto } : {};
  } catch {
    return {};
  }
}
