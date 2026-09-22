// ============================================
// VELTRONIK - DESDE / HASTA + HOY · SEMANA · MES · AÑO
// ============================================
// El mismo selector en Pagos y en la Caja: el dueño aprende a usarlo una vez. El estado lo
// lleva useRangoDeFechas; esto solo lo dibuja.
// ============================================

import { PERIODOS_RAPIDOS } from '../hooks/useRangoDeFechas';

const NOMBRE = { today: 'Hoy', week: 'Semana', month: 'Mes', year: 'Año' };

/**
 * @param {object} props
 * @param {ReturnType<typeof import('../hooks/useRangoDeFechas').useRangoDeFechas>} props.rango
 * @param {string} [props.className]
 */
export default function SelectorDeFechas({ rango, className = '' }) {
  const { desde, hasta, periodo, elegirPeriodo, cambiarDesde, cambiarHasta } = rango;
  return (
    <div className={`selector-fechas ${className}`.trim()}>
      <label className="selector-fechas-campo">
        <span>Desde</span>
        {/* El tope cruzado evita elegir un "hasta" anterior al "desde" desde el calendario. */}
        <input type="date" className="form-input" value={desde || ''} max={hasta || undefined}
          onChange={(e) => cambiarDesde(e.target.value)} />
      </label>
      <label className="selector-fechas-campo">
        <span>Hasta</span>
        <input type="date" className="form-input" value={hasta || ''} min={desde || undefined}
          onChange={(e) => cambiarHasta(e.target.value)} />
      </label>
      <div className="selector-fechas-atajos" role="group" aria-label="Período rápido">
        {PERIODOS_RAPIDOS.map((p) => (
          <button key={p} type="button"
            className={`btn btn-sm ${periodo === p ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={periodo === p}
            onClick={() => elegirPeriodo(p)}>
            {NOMBRE[p]}
          </button>
        ))}
      </div>
    </div>
  );
}
