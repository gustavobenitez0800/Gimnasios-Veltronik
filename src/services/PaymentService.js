// ============================================
// VELTRONIK - PAYMENT SERVICE
// ============================================

import { BaseService } from './base/BaseService';

class PaymentService extends BaseService {
  constructor() {
    super('member_payments');
  }

  /**
   * Get all payments with member info, ordered by date.
   */
  async getAll() {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*, member:members(full_name, dni)')
      .order('payment_date', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get payments for a specific member.
   */
  async getByMemberId(memberId) {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('member_id', memberId)
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
}

export const paymentService = new PaymentService();
