// ============================================
// VELTRONIK - INVENTORY SERVICE (Restaurant)
// ============================================

import { BaseService } from '../base/BaseService';

class InventoryService extends BaseService {
  constructor() {
    super('inventory_items', 'org_id');
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

  async create(itemData) {
    return this.createForOrgAlt(itemData);
  }

  async getLowStock() {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('org_id', orgId)
      .filter('current_stock', 'lte', 'minimum_stock');
    if (error) throw error;
    return data || [];
  }
}

export const inventoryService = new InventoryService();
