// ============================================
// VELTRONIK - DASHBOARD STATS SERVICE
// ============================================
// Servicio optimizado que consulta vistas materializadas
// y RPCs en vez de traer tablas completas al frontend.
// Reduce las queries del dashboard de 3-5 a solo 1-2.
// ============================================

import { BaseService } from './base/BaseService';

class DashboardStatsService extends BaseService {
  constructor() {
    super('members'); // tabla base (no se usa directamente)
  }

  /**
   * Obtener stats del dashboard en UNA sola llamada RPC.
   * Usa la vista materializada en el backend.
   * Fallback: cálculo en frontend si la vista no existe aún.
   */
  async getDashboardStats() {
    const orgId = await this._getOrgId();

    try {
      const { data, error } = await this.client.rpc('get_dashboard_stats', {
        p_org_id: orgId,
      });

      if (error) throw error;
      return data;
    } catch (err) {
      // Fallback si la función RPC no existe todavía
      // (permite que el frontend funcione antes de aplicar la migración)
      console.warn('get_dashboard_stats RPC not available, using fallback:', err.message);
      return this._fallbackStats(orgId);
    }
  }

  /**
   * Obtener datos para el gráfico de ingresos mensuales.
   * Usa la vista materializada en el backend.
   */
  async getRevenueChart(months = 6) {
    const orgId = await this._getOrgId();

    try {
      const { data, error } = await this.client.rpc('get_revenue_chart', {
        p_org_id: orgId,
        p_months: months,
      });

      if (error) throw error;
      return {
        labels: (data || []).map((d) => d.month),
        data: (data || []).map((d) => parseFloat(d.total_revenue || 0)),
      };
    } catch (err) {
      console.warn('get_revenue_chart RPC not available, using fallback:', err.message);
      return { labels: [], data: [] };
    }
  }

  /**
   * Refrescar las vistas materializadas manualmente.
   * Útil si no tienes pg_cron (plan Pro).
   */
  async refreshStats() {
    try {
      const { error } = await this.client.rpc('refresh_org_stats');
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('refresh_org_stats not available:', err.message);
      return false;
    }
  }

  /**
   * Obtener análisis de retención en una sola llamada RPC.
   */
  async getRetentionAnalytics() {
    const orgId = await this._getOrgId();
    try {
      const { data, error } = await this.client.rpc('get_retention_data', { p_org_id: orgId });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('get_retention_data RPC failed:', err);
      return {
        total_members: 0,
        active_members: 0,
        inactive_members: 0,
        retention_rate: 0,
        expiring_soon: [],
        at_risk: []
      };
    }
  }

  /**
   * Fallback: calcular stats desde tablas directas.
   * Se usa solo si la migración 008 no fue aplicada aún.
   */
  async _fallbackStats(orgId) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const todayStr = today.toISOString().split('T')[0];
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    // Parallel queries for performance
    const [membersRes, paymentsRes, accessRes] = await Promise.all([
      this.client
        .from('members')
        .select('id, status, membership_end', { count: 'exact' })
        .eq('gym_id', orgId),
      this.client
        .from('member_payments')
        .select('amount')
        .eq('gym_id', orgId)
        .eq('status', 'paid')
        .gte('payment_date', startOfMonth),
      this.client
        .from('access_logs')
        .select('id', { count: 'exact', head: true })
        .eq('gym_id', orgId)
        .gte('check_in_at', todayStr),
    ]);

    const members = membersRes.data || [];
    const payments = paymentsRes.data || [];

    const active = members.filter((m) => m.status === 'active').length;
    const expired = members.filter(
      (m) => m.membership_end && new Date(m.membership_end) < today
    ).length;
    const expiringWeek = members.filter((m) => {
      if (!m.membership_end) return false;
      const end = new Date(m.membership_end);
      return end >= today && end <= new Date(nextWeek);
    }).length;

    const monthlyRevenue = payments.reduce(
      (sum, p) => sum + parseFloat(p.amount || 0),
      0
    );

    return {
      total_members: members.length,
      active_members: active,
      inactive_members: members.filter((m) => m.status === 'inactive').length,
      expired_members: expired,
      expiring_this_week: expiringWeek,
      expiring_3_days: 0,
      new_this_month: 0,
      monthly_revenue: monthlyRevenue,
      monthly_payments: payments.length,
      access_today: accessRes.count || 0,
    };
  }
}

export const dashboardStatsService = new DashboardStatsService();
