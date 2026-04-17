// ============================================
// VELTRONIK - TABLE SERVICE (Restaurant)
// ============================================

import { BaseService } from '../base/BaseService';

class TableService extends BaseService {
  constructor() {
    super('restaurant_tables');
  }

  async getAll() {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*, area:restaurant_areas(name), waiter:restaurant_staff(full_name)')
      .order('table_number', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async create(tableData) {
    return this.createForOrgAlt(tableData);
  }
}

export const tableService = new TableService();
