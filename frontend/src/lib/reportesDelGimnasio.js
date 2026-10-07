// ============================================
// VELTRONIK - LAS TABLAS DE LA PANTALLA DE REPORTES
// ============================================
// Qué columnas y qué filas lleva cada reporte. Funciones puras: la pantalla pide los datos,
// estas arman la tabla, y reportExport la baja en Excel o PDF.
//
// ⭐ NINGUNA CUENTA DE PLATA SE HACE ACÁ. El de ingresos sale del reporte de caja del servidor
// (el libro de ingresos: el mismo número del tablero, de Pagos, de la Caja y del Excel del
// contador). Esta pantalla sumaba los pagos por su lado, con los anulados y sin las ventas, y
// el "total" del PDF no coincidía con ningún otro número del sistema.
//
// ⭐ EL ESTADO DE UN SOCIO SALE DE estadoDelSocio, como en Socios y en el tablero. Acá había una
// cuarta traducción ("deriveMemberStatus") que llamaba "activo" al que nunca pagó.
// ============================================

import { formatCurrency, formatDate, horaDe } from './utils';
import { ESTADOS_DEL_SOCIO, estadoDelSocio } from './situacionSocio';
import { nombreDeForma } from './formasDePago';

const num = (v) => Number(v || 0);
const dia = (instante) => (instante ? formatDate(String(instante).slice(0, 10)) : '');

/** El padrón entero, con el estado de HOY. No depende del rango de fechas. */
export function tablaDeSocios(socios, ahora = new Date()) {
  const headers = ['Nombre', 'DNI', 'Teléfono', 'Email', 'Estado', 'Arancel', 'Vence', 'Alta'];
  const rows = [...(socios || [])]
    .sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || ''), 'es'))
    .map((s) => [
      s.fullName || '',
      s.dni || '',
      s.phone || '',
      s.email || '',
      ESTADOS_DEL_SOCIO[estadoDelSocio(s, ahora)].texto,
      s.planNombre || '',
      dia(s.membershipEnd),
      dia(s.createdAt),
    ]);
  return { headers, rows };
}

/**
 * Los ingresos del período para el PDF, desde el reporte de caja del servidor: cada cobro, las
 * ventas y otros ingresos, y los totales que dio el servidor (no una suma de acá).
 */
export function tablaDeIngresos(reporte) {
  const headers = ['Fecha', 'Hora', 'Concepto', 'Forma de pago', 'Monto', 'Origen'];
  const t = reporte?.totales || {};
  const rows = (reporte?.cobros || []).map((c) => [
    dia(c.fecha), horaDe(c.fecha), c.socio || 'Sin socio', nombreDeForma(c.metodo), formatCurrency(c.monto),
    // El del sistema anterior suma en los ingresos, pero no pasó por esta caja.
    c.importado ? 'Historial importado' : 'Cuota',
  ]);
  // Las ventas y otros ingresos que no son una cuota. Los anulados y los aportes del dueño, no:
  // no son plata que el gimnasio ganó.
  (reporte?.movimientos || [])
    .filter((m) => m.tipo === 'INGRESO' && !m.anulado && !m.deFondos)
    .forEach((m) => rows.push([
      dia(m.fecha), horaDe(m.fecha), [m.categoria, m.detalle].filter(Boolean).join(' · ') || 'Ingreso',
      nombreDeForma(m.metodo), formatCurrency(m.monto), 'Venta u otro ingreso',
    ]));
  rows.push(
    ['', '', '', '', '', ''],
    ['', '', 'Cuotas cobradas', '', formatCurrency(t.cobrado), ''],
    ['', '', 'Ventas y otros ingresos', '', formatCurrency(num(t.ingresosEfectivo) + num(t.ingresosOtros)), ''],
    ['', '', 'TOTAL QUE ENTRÓ', '', formatCurrency(t.ingresos ?? num(t.cobrado) + num(t.ingresosEfectivo) + num(t.ingresosOtros)), ''],
  );
  return { headers, rows };
}

const METODO_DE_ACCESO = { MANUAL: 'Manual', QR: 'QR', MOLINETE: 'Molinete', TURNSTILE: 'Molinete' };

/** Cada entrada del período, con la fecha y las horas como se leen (no el ISO crudo). */
export function tablaDeAccesos(accesos) {
  const headers = ['Fecha', 'Entrada', 'Salida', 'Socio', 'DNI', 'Cómo entró'];
  const rows = [...(accesos || [])]
    .sort((a, b) => String(a.checkInAt || '').localeCompare(String(b.checkInAt || '')))
    .map((a) => {
      const metodo = String(a.accessMethod || '').toUpperCase();
      return [
        dia(a.checkInAt), horaDe(a.checkInAt), horaDe(a.checkOutAt),
        a.member?.fullName || '', a.member?.dni || '',
        METODO_DE_ACCESO[metodo] || (metodo ? metodo.charAt(0) + metodo.slice(1).toLowerCase() : ''),
      ];
    });
  return { headers, rows };
}

/**
 * El resumen del período: el padrón de hoy, las altas, la plata del libro y las entradas.
 * @param {{ socios: object[], reporte: object, accesos: object[], desde: string, hasta: string }} datos
 */
export function tablaDelResumen({ socios, reporte, accesos, desde, hasta }, ahora = new Date()) {
  const lista = socios || [];
  const cuantos = (estado) => lista.filter((s) => estadoDelSocio(s, ahora) === estado).length;
  // El alta es cuándo se anotó (createdAt), no el inicio de la cuota: un socio de hace un año
  // que renovó este mes no es una alta de este mes.
  const altas = lista.filter((s) => {
    const d = String(s.createdAt || '').slice(0, 10);
    return d && d >= desde && d <= hasta;
  }).length;
  const t = reporte?.totales || {};
  const periodo = desde === hasta ? formatDate(desde) : `${formatDate(desde)} al ${formatDate(hasta)}`;
  return {
    headers: ['Qué', 'Cuánto'],
    rows: [
      ['SOCIOS HOY', ''],
      ['Al día', cuantos('al_dia')],
      ['Vencidos', cuantos('vencido')],
      ['Sin cuota', cuantos('sin_cuota')],
      ['Bajas', cuantos('baja')],
      ['', ''],
      [`DEL ${periodo}`, ''],
      ['Altas nuevas', altas],
      ['Cobros', num(t.cantidadCobros)],
      ['Total que entró', formatCurrency(t.ingresos ?? num(t.cobrado) + num(t.ingresosEfectivo) + num(t.ingresosOtros))],
      ['Entradas al gimnasio', (accesos || []).length],
    ],
  };
}
