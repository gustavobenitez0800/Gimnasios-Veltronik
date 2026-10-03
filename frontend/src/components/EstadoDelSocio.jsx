// ============================================
// VELTRONIK - EL CHIP DEL ESTADO DE UN SOCIO
// ============================================
// Al día / Vencido / Sin cuota / Baja: el mismo chip en Socios, el tablero y donde haga falta.
// La regla vive en lib/situacionSocio (estadoDelSocio), hermana de MemberAccessPolicy.
// ============================================

import { ESTADOS_DEL_SOCIO, estadoDelSocio } from '../lib/situacionSocio';

export default function EstadoDelSocio({ socio }) {
  const estado = ESTADOS_DEL_SOCIO[estadoDelSocio(socio)];
  return <span className={`badge ${estado.clase}`}>{estado.texto}</span>;
}
