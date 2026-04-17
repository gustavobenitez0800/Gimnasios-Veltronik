// ============================================
// VELTRONIK - INVENTORY SERVICE (Restaurant)
// ============================================

import { BaseService } from '../base/BaseService';

class InventoryService extends BaseService {
  constructor() {
    super('inventory_items', 'org_id');
  }

  async getAll() {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async create(itemData) {
    return this.createForOrgAlt(itemData);
  }

  async getLowStock() {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .filter('current_stock', 'lte', 'minimum_stock');
    if (error) throw error;
    return data || [];
  }
}

export const inventoryService = new InventoryService();
