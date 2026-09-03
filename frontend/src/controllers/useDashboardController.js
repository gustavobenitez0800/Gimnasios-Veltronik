import { useCallback, useMemo } from 'react';
import { useQueryCache } from '../hooks';
import { dashboardStatsService } from '../services/DashboardStatsService';
import { memberService } from '../services/MemberService';
import { paymentService } from '../services/PaymentService';
import { insightsService } from '../services';
import {
  graficoDeIngresos, prediccionDeIngresos, alertasDeVencimiento, graficoDeSocios, insightsDelDia,
} from '../lib/resumenDashboard';

// Una sola lista vacía compartida. Con `data?.x || []` se creaba un array NUEVO en cada
// render mientras los datos no estaban: como los useMemo de abajo dependen de esas listas,
// ninguno memorizaba nada y los cinco cálculos de insights se rehacían en cada render.
const EMPTY = [];

export function useDashboardController(gym) {
  // El id del negocio sale del contexto O del localStorage (que el Lobby setea ANTES de
  // navegar; `gym` se hidrata en background y llega DESPUÉS). Antes, al entrar desde el
  // Lobby este hook corría con gym=null → cacheaba un dashboard VACÍO bajo la key null,
  // y al llegar `gym` cambiaba la key y refetcheaba todo → "carga sin datos, vuelve a
  // cargar y recién ahí muestra datos". Con el fallback, el fetch real arranca al instante.
  const orgId = gym?.id || localStorage.getItem('current_org_id');

  const fetchDashboardData = useCallback(async () => {
    if (!orgId) return { resumen: null, dashStats: null, membersData: [], paymentsData: [] };

    // ── El camino de hoy: UN pedido, ya resumido por el servidor ──
    try {
      const resumen = await dashboardStatsService.getResumen();
      return { resumen, dashStats: null, membersData: [], paymentsData: [] };
    } catch {
      // ⚠️ Un backend que todavía no tiene /resumen (deploy desfasado, o un escritorio
      // instalado apuntando a un servidor viejo) responde 404. Ahí se cae al camino de
      // antes: es lento, pero un dashboard lento es infinitamente mejor que uno vacío.
    }

    const [dashStats, rawMembers, paymentsData] = await Promise.all([
      dashboardStatsService.getDashboardStats(),
      memberService.getAllMembers(),
      paymentService.getAll()
    ]);

    // Mapear DTOs de Java (camelCase) al formato que InsightsService espera.
    const now = new Date();
    const membersData = (rawMembers || []).map(m => {
      let status = 'active';
      if (m.active === false) status = 'inactive';
      else if (m.membershipEnd && new Date(m.membershipEnd) < now) status = 'expired';
      return {
        ...m,
        fullName: `${m.firstName || ''} ${m.lastName || ''}`.trim(),
        birthDate: m.birthDate,
        membershipStart: m.membershipStart,
        membershipEnd: m.membershipEnd,
        attendanceDays: m.attendanceDays || [],
        status,
      };
    });

    const mappedPayments = (paymentsData || []).map(p => ({
      ...p,
      status: (p.status || '').toLowerCase(),
    }));

    return { resumen: null, dashStats, membersData, paymentsData: mappedPayments };
  }, [orgId]);

  const { data, loading, isFetching, invalidate } = useQueryCache(
    ['gym_dashboard', orgId],
    fetchDashboardData,
    { staleTime: 3 * 60 * 1000 }
  );

  const resumen = data?.resumen || null;
  const stats = data?.dashStats;
  const members = data?.membersData || EMPTY;
  const payments = data?.paymentsData || EMPTY;

  const handleRefreshStats = useCallback(async () => {
    try {
      invalidate();
      return true;
    } catch {
      return false;
    }
  }, [invalidate]);

  // ─── Los cuatro números de arriba ───
  const dashboardStats = useMemo(() => {
    if (resumen) {
      const alDia = Number(resumen.socios?.activos) || 0;
      const vencidos = Number(resumen.socios?.vencidos) || 0;
      return {
        // Los dos números, con nombre propio: la tarjeta muestra "al día" y la torta de
        // abajo distingue las tres porciones. `activeMembers` (los dados de alta, vencidos
        // incluidos) se conserva porque es lo que contaba la versión anterior.
        alDia,
        activeMembers: alDia + vencidos,
        expiredMembers: vencidos,
        expiringMembers: Number(resumen.vencimientos?.estaSemana) || 0,
        monthlyRevenue: Number(resumen.ingresos?.delMes) || 0,
      };
    }
    if (stats) {
      return {
        // Backend viejo: solo trae el total de dados de alta, así que "al día" se aproxima
        // restándole los vencidos. Es la mejor cuenta posible con lo que ese servidor manda.
        alDia: Math.max(0, (stats.activeMembers || 0) - (stats.expiredMembers || 0)),
        activeMembers: stats.activeMembers || 0,
        expiredMembers: stats.expiredMembers || 0,
        expiringMembers: stats.expiringMembers || 0,
        monthlyRevenue: parseFloat(stats.monthlyRevenue || 0),
      };
    }
    return { alDia: 0, activeMembers: 0, expiredMembers: 0, expiringMembers: 0, monthlyRevenue: 0 };
  }, [resumen, stats]);

  // ─── Gráficos, predicción, alertas e insights ───
  //
  // Con el resumen del servidor se arman a partir de series y conteos; sin él (backend viejo)
  // se sigue calculando sobre las listas completas, como antes. Las fórmulas son LAS MISMAS
  // en los dos caminos: ver lib/resumenDashboard.js.
  const prediction = useMemo(
    () => (resumen ? prediccionDeIngresos(resumen.ingresos?.serieMensual) : insightsService.predictNextMonthRevenue(payments)),
    [resumen, payments],
  );
  const alerts = useMemo(
    () => (resumen ? alertasDeVencimiento(resumen.vencimientos) : insightsService.getPaymentAlerts(members)),
    [resumen, members],
  );
  const insights = useMemo(
    () => (resumen ? insightsDelDia(resumen) : insightsService.generateDailyInsights({ members, payments, gym })),
    [resumen, members, payments, gym],
  );
  const revenueChartData = useMemo(
    () => (resumen ? graficoDeIngresos(resumen.ingresos?.serieMensual, 6) : insightsService.getMonthlyRevenueChartData(payments, 6)),
    [resumen, payments],
  );
  const membersChartData = useMemo(
    () => (resumen ? graficoDeSocios(resumen.socios) : insightsService.getMemberStatusChartData(members)),
    [resumen, members],
  );

  // Las últimas altas: el servidor manda cinco, ya ordenadas por fecha de alta. Antes se
  // cortaban los cinco primeros de la lista completa, que venía sin orden garantizado.
  const recentMembers = useMemo(
    () => (resumen ? (resumen.ultimosSocios || EMPTY) : members.slice(0, 5)),
    [resumen, members],
  );

  return {
    dashboardStats,
    prediction,
    alerts,
    insights,
    revenueChartData,
    membersChartData,
    recentMembers,
    loading: loading,
    isFetching,
    handleRefreshStats
  };
}
