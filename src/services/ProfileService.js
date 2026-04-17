// ============================================
// VELTRONIK - PROFILE SERVICE
// ============================================

import { BaseService } from './base/BaseService';

class ProfileService extends BaseService {
  constructor() {
    super('profiles');
  }

  async getCurrent() {
    const { data: { user }, error: userError } = await this.client.auth.getUser();
    if (userError) throw userError;
    if (!user) return null;

    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async updateCurrent(updates) {
    const { data: { user }, error: userError } = await this.client.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error('No authenticated user');

    const { data, error } = await this.client
      .from(this.tableName)
      .update(updates)
      .eq('id', user.id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }
}

export const profileService = new ProfileService();
