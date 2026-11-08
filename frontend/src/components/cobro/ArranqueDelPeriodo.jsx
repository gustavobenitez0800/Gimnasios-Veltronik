import { formatDate } from '../../lib/utils';
import { ARRANCA } from '../../lib/vencimientoNuevo';

/** "02/11" — el día y el mes, que es lo que se compara de un vistazo. */
const corta = (f) => formatDate(f).slice(0, 5);

/**
 * ⭐ AL QUE PAGÓ TARDE: ¿EL MES ARRANCA DESDE QUE VENCIÓ O DESDE HOY? (08/11/2026)
 *
 * <p>Lo pidió un gimnasio: la gente pide pagar mañana o pasado, y al cobrarle el sistema le dejaba
 * la fecha del día que pagó; había que cambiarla a mano, y a veces ya no se sabía cuál era. Ahora
 * se ven las dos fechas y se elige con un clic; viene marcada «desde que venció».</p>
 *
 * <p>Solo aparece si hay algo que elegir: el socio está vencido y «desde que venció» todavía lo
 * deja al día. Las fechas salen de `lib/vencimientoNuevo` (la gemela de la regla del servidor).</p>
 *
 * @param {ReturnType<typeof import('../../lib/vencimientoNuevo').opcionesDeArranque>} opciones
 */
export default function ArranqueDelPeriodo({ opciones, valor, onCambiar }) {
  if (!opciones?.desdeQueVencio) return null;
  return (
    <fieldset className="arranque-periodo">
      <legend className="form-label">Venció el {corta(opciones.vencia)}. El mes nuevo arranca:</legend>
      <label className={`arranque-opcion${valor === ARRANCA.VENCIMIENTO ? ' elegida' : ''}`}>
        <input type="radio" name="arranque-periodo" checked={valor === ARRANCA.VENCIMIENTO}
          onChange={() => onCambiar(ARRANCA.VENCIMIENTO)} />
        <span>Desde que venció ({corta(opciones.vencia)})</span>
        <strong>vence el {formatDate(opciones.desdeQueVencio)}</strong>
      </label>
      <label className={`arranque-opcion${valor === ARRANCA.HOY ? ' elegida' : ''}`}>
        <input type="radio" name="arranque-periodo" checked={valor === ARRANCA.HOY}
          onChange={() => onCambiar(ARRANCA.HOY)} />
        <span>Desde hoy</span>
        <strong>vence el {formatDate(opciones.desdeHoy)}</strong>
      </label>
    </fieldset>
  );
}
