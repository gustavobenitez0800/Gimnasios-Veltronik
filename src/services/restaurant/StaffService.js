// ============================================
// VELTRONIK - STAFF SERVICE (Restaurant)
// ============================================

import { BaseService } from '../base/BaseService';

class StaffService extends BaseService {
  constructor() {
    super('restaurant_staff', 'org_id');
  }

  async getAll() {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .order('full_name', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async create(staffData) {
    return this.createForOrgAlt(staffData);
  }
}

export const staffService = new StaffService();
