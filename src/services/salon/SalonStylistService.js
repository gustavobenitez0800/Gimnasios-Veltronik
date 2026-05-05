// ============================================
// VELTRONIK - SALON STYLIST SERVICE
// ============================================

import { BaseService } from '../base/BaseService';

class SalonStylistService extends BaseService {
  constructor() {
    super('salon_stylists', 'org_id');
  }

  async getAll() {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('org_id', orgId)
      .order('full_name', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async getActive() {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('full_name', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async create(stylistData) {
    return this.createForOrgAlt(stylistData);
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
}

export const salonStylistService = new SalonStylistService();
