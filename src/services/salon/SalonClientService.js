// ============================================
// VELTRONIK - SALON CLIENT SERVICE
// ============================================

import { BaseService } from '../base/BaseService';

class SalonClientService extends BaseService {
  constructor() {
    super('salon_clients', 'org_id');
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

  async search(query) {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('org_id', orgId)
      .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
      .order('full_name', { ascending: true })
      .limit(20);
    if (error) throw error;
    return data || [];
  }

  async create(clientData) {
    return this.createForOrgAlt(clientData);
  }

  async update(id, updates) {
    const { data, error } = await this.client
      .from(this.tableName)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async getHistory(clientId) {
    const { data, error } = await this.client
      .from('salon_appointments')
      .select('*, service:salon_services(name, price), stylist:salon_stylists(full_name)')
      .eq('client_id', clientId)
      .order('appointment_date', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  }
}

export const salonClientService = new SalonClientService();
