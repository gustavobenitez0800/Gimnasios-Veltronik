// ============================================
// LA LISTA DE SOCIOS — constantes y lecturas sin estado
// ============================================
// Antes vivían adentro de pages/MembersPage.jsx. Las usan la pantalla
// (controllers/usePantallaDeSocios.js) y sus piezas (components/socios/).

import { ESTADOS_DEL_SOCIO } from './situacionSocio';

export const PAGE_SIZE = 25;
// Cuando se filtra por estado traemos el set completo (suficiente para PyMEs) para evaluar
// el estado sobre TODOS los socios, no solo la página actual del backend.
export const LARGE_SIZE = 1000;

/** El valor del desplegable que significa 'sacarles el arancel'. Vacío no sirve: sería
 *  indistinguible de la opción de texto que encabeza la lista. */
export const SACAR_ARANCEL = '__sin__';

// Los cuatro estados parten la lista sin huecos (lib/situacionSocio: estadoDelSocio): todo socio
// está en uno solo. "Sin cuota" son los que nunca pagaron: desde que el alta dejó de regalar un
// mes (ADR-013) es el estado de todo socio recién cargado, y es la lista de a quién cobrarle.
export const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'al_dia', label: ESTADOS_DEL_SOCIO.al_dia.plural },
  { value: 'vencido', label: ESTADOS_DEL_SOCIO.vencido.plural },
  { value: 'sin_cuota', label: ESTADOS_DEL_SOCIO.sin_cuota.plural },
  { value: 'baja', label: ESTADOS_DEL_SOCIO.baja.plural },
  // El dueño acaba de cargar sus aranceles y tiene cientos de socios sin ninguno. Este
  // filtro es la diferencia entre "asignarlos" y "recorrer la lista entera a ojo".
  { value: 'sin_arancel', label: 'Sin arancel' },
];

/** Los valores del filtro hasta el 2026-09-22 → los de ahora. */
export const ESTADO_DE_ANTES = { active: 'al_dia', expired: 'vencido', inactive: 'baja' };

/**
 * ⭐ EL SOCIO QUE NO TIENE NINGUNA COBERTURA — ni vigente ni vencida.
 *
 * <p>Una sola lectura para las CUATRO cosas que lo muestran: el chip de estado, la columna de
 * días, el filtro y el CSV exportado. Escrita cuatro veces serían cuatro formas de discrepar,
 * que es el patrón que este proyecto ya pagó tres de tres veces con las cuentas de fechas.</p>
 *
 * <p><b>No es un estado nuevo: es una lectura del que ya hay, y eso es a propósito.</b>
 * `toApi` traduce el estado del socio a un booleano —cualquier cosa que no sea 'active' viaja
 * como BAJA—, así que un `status: 'sin_cuota'` haría que editarle el teléfono a un socio
 * recién dado de alta LO DIERA DE BAJA en silencio, sin que nadie toque ese campo. Es el mismo
 * mapeo que ya se comió el arancel una vez. Queda fijado por un test en el controller.</p>
 *
 * <p>Se exige `status === 'active'` porque al dado de baja le corresponde decir "baja", no
 * "sin cuota": el que ya no es socio no debe nada.</p>
 */
export const esSinCuota = (member) => member?.status === 'active'
  && (!member.situacion || member.situacion === 'SIN_DATOS');

// ─── DÍAS: lo dice el BACKEND, acá solo se pinta ───
//
// Esta función calculaba los días por su cuenta y daba MAL. Para el mismo socio, el aviso
// del mostrador decía "hace 2 días" y esta lista "4d vencido". Dos errores que se sumaban:
//   · el socio llegaba acá con la hora del vencimiento recortada (solo la fecha), y
//   · un texto "2026-08-27" en JavaScript se lee como UTC — en Argentina, tres horas antes.
//
// Ahora el número viene calculado por la misma clase del backend que decide qué ve el socio
// al escanear el QR y qué se le avisa al mostrador. Un socio no puede deber dos cantidades
// distintas de días según qué pantalla se mire.
export const getDaysInfo = (member) => {
  const { situacion, diasVencido, diasRestantes } = member || {};
  // ⭐ "SIN CUOTA" Y NO UN GUION.
  //
  // Un guion se lee como "falta el dato", y acá el dato está: ese socio NO TIENE cobertura.
  // Desde que el alta dejó de regalar un mes (ADR-013), este estado es el de todo socio
  // recién dado de alta hasta que se le cobra — y decirle "-" al lado de un estado que dice
  // ACTIVO hace que se vea igual que uno al día.
  //
  // No dice "sin pagar" a propósito: la política del servidor distingue "sin fecha cargada"
  // de "debe" (un socio migrado sin fecha tampoco pagó por acá, y afirmar que no pagó sería
  // inventar). "Sin cuota" es cierto en los dos casos.
  //
  // La baja se pregunta PRIMERO: al que ya no es socio le corresponde decir "baja", no
  // "sin cuota". Y por `status` además de por `situacion`, porque la copia local puede
  // mandar el socio sin situación calculada.
  if (situacion === 'INACTIVO' || member?.status === 'inactive') {
    return { text: 'baja', className: 'days-none' };
  }
  if (esSinCuota(member)) return { text: 'sin cuota', className: 'days-none' };

  if (situacion === 'VENCIDO' || situacion === 'EN_GRACIA') {
    return { text: `${diasVencido}d vencido`, className: 'days-expired' };
  }
  // Días y nada más: el cupo de clases se dio de baja (2026-09-02). Se paga el mes y se
  // entra; se vence y hay que renovar.
  // Rojo es SOLO para el vencido: un socio al día con los días en rojo parecía moroso. El que
  // vence esta semana va en ámbar, que es "atención", no "debe".
  const d = diasRestantes ?? 0;
  if (d <= 7) return { text: `${d}d`, className: 'days-warning' };
  return { text: `${d}d`, className: 'days-ok' };
};
