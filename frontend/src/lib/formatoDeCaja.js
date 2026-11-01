// ============================================
// LA CAJA — formatos y listas que comparten sus tarjetas
// ============================================
// Antes vivían arriba de pages/CajaPage.jsx. Los usan la página, su controlador
// (controllers/useCajaController.js) y las tarjetas de components/caja/.

import { toLocalDateString, horaDe } from './utils';

/** "21/09, 21:54": día y hora de 24, como se lee en un mostrador argentino (no "09:54 p. m."). */
export const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}) : '—');

/**
 * La hora si el cobro es de hoy; día y hora si es de otro día.
 *
 * <p>⭐ Desde la V88 el cierre toma también lo que se cargó TARDE con la fecha de un día que ya
 * cerró (antes no lo contaba ningún cierre). Esos cobros tienen que verse con su día: "18:30" a
 * secas haría creer que se cobraron hoy.</p>
 */
export const cuandoDe = (iso) => {
  if (!iso) return '';
  return toLocalDateString(new Date(iso)) === toLocalDateString(new Date()) ? horaDe(iso) : fecha(iso);
};

/** El título del total según el atajo del selector. */
export const TOTAL_DEL = { today: 'Total de hoy', week: 'Total de la semana', month: 'Total del mes', year: 'Total del año' };
/** Lo que dice el botón del Excel según el atajo del selector. */
export const EXCEL_DEL = { today: 'Excel de hoy', week: 'Excel de la semana', month: 'Excel del mes', year: 'Excel del año' };

export const diasDesde = (iso) => (iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null);

/**
 * En qué se gasta la plata de un gimnasio.
 *
 * Son sugerencias, no una lista cerrada: el backend guarda texto libre a propósito, porque
 * el gimnasio va a necesitar un rubro que hoy no imaginamos y eso no puede requerir una
 * migración.
 */
export const CATEGORIAS_EGRESO = ['Limpieza', 'Adelanto', 'Proveedor', 'Mantenimiento', 'Retiro', 'Otro'];
export const CATEGORIAS_INGRESO = ['Venta', 'Aporte', 'Otro'];

/** Aporte y retiro son plata del dueño: mueven el cajón, pero no son ingreso ni gasto del negocio. */
export const ES_DE_FONDOS = (rubro) => ['aporte', 'retiro'].includes(String(rubro || '').trim().toLowerCase());

export const numero = (v) => Number(v || 0);
