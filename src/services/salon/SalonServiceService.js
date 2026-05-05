// ============================================
// VELTRONIK - SALON SERVICE SERVICE (Catálogo)
// ============================================

import { BaseService } from '../base/BaseService';

class SalonServiceService extends BaseService {
  constructor() {
    super('salon_services', 'org_id');
  }

  async getAll() {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('org_id', orgId)
      .order('category', { ascending: true })
      .order('name', { ascending: true });
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
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async create(serviceData) {
    return this.createForOrgAlt(serviceData);
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

export const salonServiceService = new SalonServiceService();
