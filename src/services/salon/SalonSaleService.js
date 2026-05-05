// ============================================
// VELTRONIK - SALON SALE SERVICE
// ============================================

import { BaseService } from '../base/BaseService';

class SalonSaleService extends BaseService {
  constructor() {
    super('salon_sales', 'org_id');
  }

  /**
   * Get sales for a specific date range.
   */
  async getByRange(startDate, endDate) {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*, client:salon_clients(full_name), stylist:salon_stylists(full_name)')
      .eq('org_id', orgId)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate + 'T23:59:59')
      .order('sale_date', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /**
   * Get today's sales.
   */
  async getToday() {
    const today = new Date().toISOString().split('T')[0];
    return this.getByRange(today, today);
  }

  /**
   * Create a sale (when completing an appointment).
   */
  async create(saleData) {
    return this.createForOrgAlt(saleData);
  }

  /**
   * Get daily totals for dashboard.
   */
  async getDailyTotal() {
    const sales = await this.getToday();
    return {
      total: sales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0),
      tips: sales.reduce((sum, s) => sum + (parseFloat(s.tip) || 0), 0),
      count: sales.length,
      byCash: sales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0),
      byCard: sales.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0),
      byTransfer: sales.filter(s => s.payment_method === 'transfer').reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0),
    };
  }
}

export const salonSaleService = new SalonSaleService();
