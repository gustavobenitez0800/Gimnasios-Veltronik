// ============================================
// VELTRONIK - EL RANGO DE FECHAS DE UNA PANTALLA
// ============================================
// Desde, hasta y cuál de los atajos (Hoy, Semana, Mes, Año) está puesto. Lo usan Pagos y la
// Caja con el mismo selector: si cada pantalla lo armara a su manera, "Semana" arrancaría el
// lunes en una y el domingo en la otra.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { getQuickDates } from '../lib/utils';

/** Los atajos, en el orden en que se muestran. */
export const PERIODOS_RAPIDOS = ['today', 'week', 'month', 'year'];

/**
 * @param {'today'|'week'|'month'|'year'} inicial el atajo con el que arranca la pantalla
 * @returns {{ desde: string, hasta: string, periodo: string,
 *             elegirPeriodo: (p: string) => void,
 *             cambiarDesde: (v: string) => void, cambiarHasta: (v: string) => void }}
 */
export function useRangoDeFechas(inicial = 'today') {
  const [desde, setDesde] = useState(() => getQuickDates(inicial).from);
  const [hasta, setHasta] = useState(() => getQuickDates(inicial).to);
  // '' = las fechas las escribió la persona a mano.
  const [periodo, setPeriodo] = useState(inicial);

  const elegirPeriodo = useCallback((p) => {
    const { from, to } = getQuickDates(p);
    setDesde(from);
    setHasta(to);
    setPeriodo(p);
  }, []);

  const cambiarDesde = useCallback((v) => { setDesde(v); setPeriodo(''); }, []);
  const cambiarHasta = useCallback((v) => { setHasta(v); setPeriodo(''); }, []);

  // ─── "Hasta" tiene que seguir siendo HOY, no el día en que se abrió la pantalla ───
  //
  // El rango se calcula al elegirlo. En una PC que se apaga todos los días eso no se nota; en
  // el terminal de un gimnasio —que arranca con Windows y queda prendido— pasada la medianoche
  // "Hasta" se quedaba en AYER, y los cobros del día no aparecían por ningún lado.
  //
  // Solo con un atajo puesto: si la persona escribió las fechas a mano, son suyas.
  useEffect(() => {
    if (!periodo) return undefined;
    const resincronizar = () => {
      if (document.visibilityState !== 'visible') return;
      const { from, to } = getQuickDates(periodo);
      setDesde(from);
      setHasta(to);
    };
    document.addEventListener('visibilitychange', resincronizar);
    window.addEventListener('focus', resincronizar);
    return () => {
      document.removeEventListener('visibilitychange', resincronizar);
      window.removeEventListener('focus', resincronizar);
    };
  }, [periodo]);

  return { desde, hasta, periodo, elegirPeriodo, cambiarDesde, cambiarHasta };
}
