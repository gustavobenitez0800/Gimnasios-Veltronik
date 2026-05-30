import { useCallback, useMemo } from 'react';
import { useQueryCache } from '../hooks';
import { dashboardStatsService } from '../services/DashboardStatsService';
import { memberService } from '../services/MemberService';
import { paymentService } from '../services/PaymentService';
import { insightsService } from '../services';

export function useDashboardController(gym) {
  const fetchDashboardData = useCallback(async () => {
    if (!gym?.id) return { dashStats: null, membersData: [], paymentsData: [] };
    
    const [dashStats, rawMembers, paymentsData] = await Promise.all([
      dashboardStatsService.getDashboardStats(),
      memberService.getAllMembers(),
      paymentService.getAll()
    ]);

    // Mapear DTOs de Java (camelCase) a formato que InsightsService espera (snake_case)
    const membersData = (rawMembers || []).map(m => ({
      ...m,
      fullName: `${m.firstName || ''} ${m.lastName || ''}`.trim(),
      birthDate: m.birthDate,
      membershipStart: m.membershipStart,
      membershipEnd: m.membershipEnd,
      attendanceDays: m.attendanceDays || [],
      status: (m.status || 'active').toLowerCase(),
    }));

    // Mapear pagos de Java (snake_case del DTO manual) - ya vienen en snake_case
    const mappedPayments = (paymentsData || []).map(p => ({
      ...p,
      // Asegurar compatibilidad (ya vienen en snake_case del backend)
      paymentDate: p.paymentDate,
      paymentMethod: p.paymentMethod,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
    }));
    
    return { 
      dashStats, 
      membersData, 
      paymentsData: mappedPayments 
    };
  }, [gym?.id]);

  const { data, loading, isFetching, invalidate } = useQueryCache(
    ['gym_dashboard', gym?.id], 
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

  // Dashboard stats ahora vienen del backend en snake_case
  const dashboardStats = useMemo(() => {
    if (stats) {
      return {
        activeMembers: stats.active_members || 0,
        expiredMembers: stats.expired_members || 0,
        expiringMembers: stats.expiring_this_week || 0,
        monthlyRevenue: parseFloat(stats.monthly_revenue || 0),
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
