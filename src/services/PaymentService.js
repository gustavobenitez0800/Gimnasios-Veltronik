// ============================================
// VELTRONIK - PAYMENT SERVICE
// ============================================

import { BaseService } from './base/BaseService';

class PaymentService extends BaseService {
  constructor() {
    super('member_payments');
  }

  /**
   * Get all payments with member info, ordered by date (not recommended for large datasets).
   */
  async getAll() {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*, member:members(full_name, dni)')
      .eq('gym_id', orgId)
      .order('payment_date', { ascending: false })
      .limit(1000); // safety limit

    if (error) throw error;
    return data || [];
  }

  /**
   * Get payments filtered by date range and optional search.
   * This is much safer for memory and performance.
   */
  async getByFilters(dateFrom, dateTo, search = '', method = '', status = '') {
    const orgId = await this._getOrgId();
    
    let query = this.client
      .from(this.tableName)
      .select('*, member:members!inner(full_name, dni)')
      .eq('gym_id', orgId)
      .order('payment_date', { ascending: false });

    if (dateFrom) query = query.gte('payment_date', dateFrom);
    if (dateTo) query = query.lte('payment_date', dateTo);
    if (method) query = query.eq('payment_method', method);
    if (status) query = query.eq('status', status);

    if (search) {
      // Need to use inner join and filter on member table columns
      query = query.or(`full_name.ilike.%${search}%,dni.ilike.%${search}%`, { referencedTable: 'members' });
    }

    // Limit to 2000 records maximum per view to avoid memory issues
    const { data, error } = await query.limit(2000);
    
    if (error) throw error;
    return data || [];
  }

  /**
   * Get payments for a specific member.
   */
  async getByMemberId(memberId) {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('member_id', memberId)
      .eq('gym_id', orgId)
      .order('payment_date', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Create a payment scoped to the current org.
   */
  async create(paymentData) {
    return this.createForOrg(paymentData);
  }

  /**
   * Update a payment (org-scoped for safety).
   */
  async update(id, updates) {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .update(updates)
      .eq('id', id)
      .eq('gym_id', orgId)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Delete a payment (org-scoped for safety).
   */
  async delete(id) {
    const orgId = await this._getOrgId();
    const { error } = await this.client
      .from(this.tableName)
      .delete()
      .eq('id', id)
      .eq('gym_id', orgId);

    if (error) throw error;
  }

  /**
   * Get payment statistics for the current org.
   */
  async getMonthlyStats() {
    const orgId = await this._getOrgId();
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data, error } = await this.client
      .from(this.tableName)
      .select('amount, status, payment_method')
      .eq('gym_id', orgId)
      .eq('status', 'paid')
      .gte('payment_date', startOfMonth.toISOString().split('T')[0]);

    if (error) throw error;

    const payments = data || [];
    return {
      totalMonth: payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0),
      totalCount: payments.length,
      byMethod: payments.reduce((acc, p) => {
        acc[p.payment_method] = (acc[p.payment_method] || 0) + 1;
        return acc;
      }, {}),
    };
  }

  /**
   * Get pending payments count for the current org.
   */
  async getPendingCount() {
    const orgId = await this._getOrgId();
    const { count, error } = await this.client
      .from(this.tableName)
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', orgId)
      .eq('status', 'pending');

    if (error) throw error;
    return count || 0;
  }
}

export const paymentService = new PaymentService();
