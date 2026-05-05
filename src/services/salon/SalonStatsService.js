// ============================================
// VELTRONIK - SALON STATS SERVICE (Dashboard)
// ============================================

import supabase from '../base/SupabaseClient';

class SalonStatsService {
  async _getOrgId() {
    const cached = localStorage.getItem('current_org_id');
    if (cached) return cached;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No auth');
    const { data } = await supabase.from('profiles').select('gym_id').eq('id', user.id).maybeSingle();
    return data?.gym_id;
  }

  async getDashboardStats() {
    const orgId = await this._getOrgId();
    const today = new Date().toISOString().split('T')[0];

    const [appointmentsRes, clientsRes, stylistsRes, salesRes] = await Promise.all([
      supabase.from('salon_appointments').select('id, status, price').eq('org_id', orgId).eq('appointment_date', today),
      supabase.from('salon_clients').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      supabase.from('salon_stylists').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
      supabase.from('salon_sales').select('total, tip, payment_method').eq('org_id', orgId).gte('sale_date', today).lte('sale_date', today + 'T23:59:59'),
    ]);

    const appointments = appointmentsRes.data || [];
    const sales = salesRes.data || [];

    return {
      todayAppointments: appointments.length,
      confirmedToday: appointments.filter(a => a.status === 'confirmed').length,
      completedToday: appointments.filter(a => a.status === 'completed').length,
      inProgressToday: appointments.filter(a => a.status === 'in_progress').length,
      totalClients: clientsRes.count || 0,
      activeStylists: stylistsRes.count || 0,
      todayRevenue: sales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0),
      todayTips: sales.reduce((sum, s) => sum + (parseFloat(s.tip) || 0), 0),
      todaySalesCount: sales.length,
    };
  }
}

export const salonStatsService = new SalonStatsService();
