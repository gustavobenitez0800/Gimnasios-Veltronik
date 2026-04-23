// ============================================
// VELTRONIK - AREA SERVICE (Restaurant)
// ============================================

import { BaseService } from '../base/BaseService';

class AreaService extends BaseService {
  constructor() {
    super('restaurant_areas', 'org_id');
  }

  async getAll() {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('org_id', orgId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async create(areaData) {
    return this.createForOrgAlt(areaData);
  }
}

export const areaService = new AreaService();
