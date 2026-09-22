import { useCallback, useMemo } from 'react';
import { useQueryCache } from '../hooks';
import { dashboardStatsService } from '../services/DashboardStatsService';
import { fromApi } from './useMemberController';
import {
  graficoDeIngresos, prediccionDeIngresos, alertasDeVencimiento, graficoDeSocios, insightsDelDia,
  comparacionDelMes,
} from '../lib/resumenDashboard';

// Una sola lista vacía compartida. Con `data?.x || []` se creaba un array NUEVO en cada
// render mientras los datos no estaban: como los useMemo de abajo dependen de esas listas,
// ninguno memorizaba nada.
const EMPTY = [];

/**
 * El Dashboard: UN pedido al servidor, ya resumido (ver GymDashboardService.getResumen).
 *
 * <p>⚠️ <b>Ya no hay camino de respaldo.</b> Si el resumen fallaba —por cualquier cosa, un corte
 * o un 500— la pantalla se bajaba TODOS los socios y TODOS los cobros para hacer las cuentas en
 * el navegador con fórmulas copiadas (InsightsService). Con el historial importado eso son
 * miles de filas por un error pasajero, y dos copias de cada cuenta que ya no daban lo mismo.
 * El resumen existe en el servidor desde el 2026-09-03; si falla, se dice que falló y se
 * ofrece reintentar. Mostrar ceros como si fueran datos era peor que no mostrar nada.</p>
 */
export function useDashboardController(gym) {
  // El id del negocio sale del contexto O del localStorage (que el Lobby setea ANTES de
  // navegar; `gym` se hidrata en background y llega DESPUÉS). Antes, al entrar desde el
  // Lobby este hook corría con gym=null → cacheaba un dashboard VACÍO bajo la key null,
  // y al llegar `gym` cambiaba la key y refetcheaba todo → "carga sin datos, vuelve a
  // cargar y recién ahí muestra datos". Con el fallback, el fetch real arranca al instante.
  const orgId = gym?.id || localStorage.getItem('current_org_id');

  const fetchResumen = useCallback(async () => {
    if (!orgId) return null;
    return dashboardStatsService.getResumen();
  }, [orgId]);

  const { data: resumen, loading, isFetching, error, invalidate } = useQueryCache(
    ['gym_dashboard', orgId],
    fetchResumen,
    { staleTime: 3 * 60 * 1000 }
  );

  const reintentar = useCallback(() => invalidate(), [invalidate]);

  // ─── Los cuatro números de arriba ───
  const dashboardStats = useMemo(() => {
    const alDia = Number(resumen?.socios?.activos) || 0;
    const vencidos = Number(resumen?.socios?.vencidos) || 0;
    return {
      alDia,
      expiredMembers: vencidos,
      expiringMembers: Number(resumen?.vencimientos?.estaSemana) || 0,
      monthlyRevenue: Number(resumen?.ingresos?.delMes) || 0,
    };
  }, [resumen]);

  // Cómo viene el mes contra el mismo tramo del mes pasado (null si no se puede comparar).
  const comparacion = useMemo(
    () => (resumen ? comparacionDelMes(resumen.ingresos, resumen.hoy) : null),
    [resumen],
  );

  // ─── Gráficos, predicción, alertas e insights ───
  const prediction = useMemo(
    () => prediccionDeIngresos(resumen?.ingresos?.serieMensual, {
      hoy: resumen?.hoy,
      primerCobro: resumen?.ingresos?.primerCobro,
    }),
    [resumen],
  );
  const alerts = useMemo(() => alertasDeVencimiento(resumen?.vencimientos), [resumen]);
  const insights = useMemo(() => (resumen ? insightsDelDia(resumen) : EMPTY), [resumen]);
  const revenueChartData = useMemo(
    () => graficoDeIngresos(resumen?.ingresos?.serieMensual, 6, 12, resumen?.hoy),
    [resumen],
  );
  const membersChartData = useMemo(() => graficoDeSocios(resumen?.socios), [resumen]);

  // Las últimas altas, con la MISMA traducción que la lista de Socios: el estado sale de la
  // situación que calcula el servidor.
  const recentMembers = useMemo(
    () => (resumen?.ultimosSocios ? resumen.ultimosSocios.map(fromApi) : EMPTY),
    [resumen],
  );

  return {
    dashboardStats,
    comparacion,
    prediction,
    alerts,
    // Cuántos necesitan atención en total: la lista trae los más cercanos a hoy, no todos.
    alertsTotal: Number(resumen?.vencimientos?.total) || 0,
    insights,
    revenueChartData,
    membersChartData,
    recentMembers,
    loading,
    isFetching,
    // Falló y no hay nada que mostrar: la pantalla lo dice en vez de pintar ceros.
    error: !resumen && error ? error : null,
    reintentar,
  };
}
