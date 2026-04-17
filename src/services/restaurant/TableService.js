// ============================================
// VELTRONIK - TABLE SERVICE (Restaurant)
// ============================================

import { BaseService } from '../base/BaseService';

class TableService extends BaseService {
  constructor() {
    super('restaurant_tables', 'org_id');
  }

  async getAll() {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*, area:restaurant_areas(name), waiter:restaurant_staff(full_name)')
      .eq('org_id', orgId)
      .order('table_number', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async create(tableData) {
    return this.createForOrgAlt(tableData);
  }
}

export const tableService = new TableService();
