import { useCallback, useMemo } from 'react';
import { useQueryCache } from '../hooks';
import { dashboardStatsService } from '../services/DashboardStatsService';
import { memberService } from '../services/MemberService';
import { paymentService } from '../services/PaymentService';
import { insightsService } from '../services';

export function useDashboardController(gym) {
  // El id del negocio sale del contexto O del localStorage (que el Lobby setea ANTES de
  // navegar; `gym` se hidrata en background y llega DESPUÉS). Antes, al entrar desde el
  // Lobby este hook corría con gym=null → cacheaba un dashboard VACÍO bajo la key null,
  // y al llegar `gym` cambiaba la key y refetcheaba todo → "carga sin datos, vuelve a
  // cargar y recién ahí muestra datos". Con el fallback, el fetch real arranca al instante.
  const orgId = gym?.id || localStorage.getItem('current_org_id');

  const fetchDashboardData = useCallback(async () => {
    if (!orgId) return { dashStats: null, membersData: [], paymentsData: [] };

    const [dashStats, rawMembers, paymentsData] = await Promise.all([
      dashboardStatsService.getDashboardStats(),
      memberService.getAllMembers(),
      paymentService.getAll()
    ]);

    // Mapear DTOs de Java (camelCase) al formato que InsightsService espera.
    // El DTO trae `active` (boolean), NO `status` → derivamos el estado real
    // (inactive / expired / active) desde active + membershipEnd.
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

    // Pagos: el backend manda status en MAYÚSCULA ('PAID'); InsightsService compara
    // contra 'paid' (minúscula) → normalizamos acá.
    const mappedPayments = (paymentsData || []).map(p => ({
      ...p,
      paymentDate: p.paymentDate,
      paymentMethod: p.paymentMethod,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      status: (p.status || '').toLowerCase(),
    }));
    
    return { 
      dashStats, 
      membersData, 
      paymentsData: mappedPayments 
    };
  }, [orgId]);

  const { data, loading, isFetching, invalidate } = useQueryCache(
    ['gym_dashboard', orgId],
    fetchDashboardData,
    { staleTime: 3 * 60 * 1000 }
  );

  const stats = data?.dashStats;
  const members = data?.membersData || [];
  const payments = data?.paymentsData || [];

  const handleRefreshStats = useCallback(async () => {
    try {
      invalidate();
      return true;
    } catch {
      return false;
    }
  }, [invalidate]);

  // Dashboard stats ahora vienen del backend de Java (camelCase)
  const dashboardStats = useMemo(() => {
    if (stats) {
      return {
        activeMembers: stats.activeMembers || 0,
        expiredMembers: stats.expiredMembers || 0,
        expiringMembers: stats.expiringMembers || 0,
        monthlyRevenue: parseFloat(stats.monthlyRevenue || 0),
      };
    }
    return { activeMembers: 0, expiredMembers: 0, expiringMembers: 0, monthlyRevenue: 0 };
  }, [stats]);

  // AI & Insights (datos ya mapeados a snake_case)
  const prediction = useMemo(() => insightsService.predictNextMonthRevenue(payments), [payments]);
  const alerts = useMemo(() => insightsService.getPaymentAlerts(members), [members]);
  const insights = useMemo(() => insightsService.generateDailyInsights({ members, payments, gym }), [members, payments, gym]);
  const revenueChartData = useMemo(() => insightsService.getMonthlyRevenueChartData(payments, 6), [payments]);
  const membersChartData = useMemo(() => insightsService.getMemberStatusChartData(members), [members]);
  
  const recentMembers = useMemo(() => members.slice(0, 5), [members]);

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
