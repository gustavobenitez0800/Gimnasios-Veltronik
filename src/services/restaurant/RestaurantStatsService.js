// ============================================
// VELTRONIK - RESTAURANT STATS SERVICE
// ============================================

import supabase from '../base/SupabaseClient';

class RestaurantStatsService {
  constructor() {
    this.client = supabase;
  }

  /**
   * Get aggregated dashboard stats for the restaurant.
   */
  async getDashboardStats() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const orgId = localStorage.getItem('current_org_id');
      if (!orgId) return { todayOrders: 0, todayRevenue: 0, activeOrders: 0, tablesOccupied: 0, tablesTotal: 0, todayReservations: 0 };

      const [ordersRes, tablesRes, reservationsRes] = await Promise.all([
        this.client
          .from('restaurant_orders')
          .select('id, total, status, payment_method, created_at')
          .eq('org_id', orgId)
          .gte('created_at', today)
          .order('created_at', { ascending: false }),
        this.client.from('restaurant_tables').select('id, status').eq('org_id', orgId),
        this.client
          .from('reservations')
          .select('id, status')
          .eq('org_id', orgId)
          .eq('reservation_date', today),
      ]);

      const orders = ordersRes.data || [];
      const tables = tablesRes.data || [];
      const reservations = reservationsRes.data || [];

      const paidOrders = orders.filter(
        (o) => o.payment_status === 'paid' || o.status === 'paid'
      );
      const todayRevenue = paidOrders.reduce(
        (sum, o) => sum + parseFloat(o.total || 0),
        0
      );

      return {
        todayOrders: orders.length,
        todayRevenue,
        activeOrders: orders.filter((o) =>
          ['pending', 'preparing', 'ready', 'served'].includes(o.status)
        ).length,
        tablesOccupied: tables.filter((t) => t.status === 'occupied').length,
        tablesTotal: tables.length,
        todayReservations: reservations.filter((r) => r.status !== 'cancelled')
          .length,
      };
    } catch (error) {
      console.error('Dashboard stats error:', error);
      return {
        todayOrders: 0,
        todayRevenue: 0,
        activeOrders: 0,
        tablesOccupied: 0,
        tablesTotal: 0,
        todayReservations: 0,
      };
    }
  }
}

export const restaurantStatsService = new RestaurantStatsService();
