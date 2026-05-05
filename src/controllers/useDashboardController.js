import { useCallback, useMemo } from 'react';
import { useQueryCache } from '../hooks';
import { dashboardFacade } from '../repositories/DashboardFacade';
import { memberFacade } from '../repositories/MemberFacade';
import { paymentFacade } from '../repositories/PaymentFacade';
import { insightsService } from '../services'; // Keep insights service for AI logic

/**
 * Hook Controlador: useDashboardController
 * Orquesta la obtención de datos y la inteligencia de negocio para la vista principal.
 */
export function useDashboardController(gym) {
  const fetchDashboardData = useCallback(async () => {
    if (!gym?.id) return { dashStats: null, membersData: [], paymentsData: [] };
    
    // Ejecuta las llamadas en paralelo
    const [dashStats, membersData, paymentsData] = await Promise.all([
      dashboardFacade.getDashboardStats(gym.id),
      memberFacade.findPaginated(gym.id, 0, 1000, ''), // Get all for insights
      paymentFacade.findByFilters(gym.id, null, null, '', '', ''), // Get all for insights
    ]);
    
    return { 
      dashStats, 
      membersData: membersData.data || [], 
      paymentsData: paymentsData || [] 
    };
  }, [gym?.id]);

  const { data, loading, isFetching, invalidate } = useQueryCache(
    ['gym_dashboard', gym?.id], 
    fetchDashboardData,
    { staleTime: 3 * 60 * 1000 } // 3 minutes cache
  );

  const stats = data?.dashStats;
  const members = data?.membersData || [];
  const payments = data?.paymentsData || [];

  const handleRefreshStats = useCallback(async () => {
    try {
      const ok = await dashboardFacade.refreshStats();
      if (ok) {
        invalidate(); // Force refetch
      }
      return ok;
    } catch {
      return false;
    }
  }, [invalidate]);

  // Transform stats
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

  // AI & Insights
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
