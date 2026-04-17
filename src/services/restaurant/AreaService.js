// ============================================
// VELTRONIK - AREA SERVICE (Restaurant)
// ============================================

import { BaseService } from '../base/BaseService';

class AreaService extends BaseService {
  constructor() {
    super('restaurant_areas', 'org_id');
  }

  async getAll() {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async create(areaData) {
    return this.createForOrgAlt(areaData);
  }
}

export const areaService = new AreaService();
