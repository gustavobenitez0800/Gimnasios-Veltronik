// ============================================
// VELTRONIK - CASH REGISTER SERVICE (Restaurant)
// ============================================

import { BaseService } from '../base/BaseService';

class CashRegisterService extends BaseService {
  constructor() {
    super('cash_register', 'org_id');
  }

  /**
   * Get the currently open cash register.
   */
  async getOpen() {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'open')
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Open a new cash register session.
   */
  async open(openingAmount = 0) {
    const orgId = await this._getOrgId();
    const {
      data: { user },
    } = await this.client.auth.getUser();

    const { data, error } = await this.client
      .from(this.tableName)
      .insert({
        org_id: orgId,
        opened_by: user?.id,
        opening_amount: openingAmount,
      })
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Close a cash register session.
   */
  async close(id, closingData) {
    const {
      data: { user },
    } = await this.client.auth.getUser();

    const { data, error } = await this.client
      .from(this.tableName)
      .update({
        ...closingData,
        closed_by: user?.id,
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }
}

export const cashRegisterService = new CashRegisterService();
