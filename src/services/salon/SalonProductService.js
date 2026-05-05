// ============================================
// VELTRONIK - SALON PRODUCT SERVICE
// ============================================

import { BaseService } from '../base/BaseService';

class SalonProductService extends BaseService {
  constructor() {
    super('salon_products', 'org_id');
  }

  async getAll() {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('org_id', orgId)
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async create(productData) {
    return this.createForOrgAlt(productData);
  }

  async update(id, updates) {
    const { data, error } = await this.client
      .from(this.tableName)
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async getLowStock() {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('org_id', orgId)
      .gt('minimum_stock', 0)
      .order('name', { ascending: true });
    if (error) throw error;
    // Filter client-side where current_stock <= minimum_stock
    return (data || []).filter(p => p.current_stock <= p.minimum_stock);
  }
}

export const salonProductService = new SalonProductService();
