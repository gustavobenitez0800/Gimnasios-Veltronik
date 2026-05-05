import AbstractFacade from './AbstractFacade';

/**
 * Clase: DashboardFacade
 * Equivalente a: ReporteFacade.java o DashboardFacade.java
 */
class DashboardFacade extends AbstractFacade {
  constructor() {
    super(null, 'members'); // Base virtual
  }

  async getDashboardStats(orgId) {
    try {
      const { data, error } = await this.getEntityManager().rpc('get_dashboard_stats', { p_org_id: orgId });
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('get_dashboard_stats RPC not available, using fallback:', err.message);
      return this._fallbackStats(orgId);
    }
  }

  async getRevenueChart(orgId, months = 6) {
    try {
      const { data, error } = await this.getEntityManager().rpc('get_revenue_chart', { p_org_id: orgId, p_months: months });
      if (error) throw error;
      return {
        labels: (data || []).map((d) => d.month),
        data: (data || []).map((d) => parseFloat(d.total_revenue || 0)),
      };
    } catch (err) {
      console.warn('get_revenue_chart RPC not available:', err.message);
      return { labels: [], data: [] };
    }
  }

  async refreshStats() {
    try {
      const { error } = await this.getEntityManager().rpc('refresh_org_stats');
      if (error) throw error;
      return true;
    } catch (err) {
      return false;
    }
  }

  async _fallbackStats(orgId) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [membersRes, paymentsRes, accessRes] = await Promise.all([
      this.getEntityManager().from('members').select('id, status, membership_end', { count: 'exact' }).eq('gym_id', orgId),
      this.getEntityManager().from('member_payments').select('amount').eq('gym_id', orgId).eq('status', 'paid').gte('payment_date', startOfMonth),
      this.getEntityManager().from('access_logs').select('id', { count: 'exact', head: true }).eq('gym_id', orgId).gte('check_in_at', todayStr),
    ]);

    const members = membersRes.data || [];
    const payments = paymentsRes.data || [];

    const active = members.filter((m) => m.status === 'active').length;
    const expired = members.filter((m) => m.membership_end && new Date(m.membership_end) < today).length;
    const expiringWeek = members.filter((m) => {
      if (!m.membership_end) return false;
      const end = new Date(m.membership_end);
      return end >= today && end <= new Date(nextWeek);
    }).length;

    const monthlyRevenue = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    return {
      total_members: members.length,
      active_members: active,
      inactive_members: members.filter((m) => m.status === 'inactive').length,
      expired_members: expired,
      expiring_this_week: expiringWeek,
      monthly_revenue: monthlyRevenue,
      monthly_payments: payments.length,
      access_today: accessRes.count || 0,
    };
  }
}

export const dashboardFacade = new DashboardFacade();
