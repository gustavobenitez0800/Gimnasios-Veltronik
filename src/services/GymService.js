// ============================================
// VELTRONIK - GYM SERVICE
// ============================================

import { BaseService } from './base/BaseService';

class GymService extends BaseService {
  constructor() {
    super('gyms');
  }

  /**
   * Get the gym associated with the current user's profile.
   */
  async getCurrent() {
    const { data: { user }, error: userError } = await this.client.auth.getUser();
    if (userError) throw userError;
    if (!user) return null;

    const { data: profile, error: profileError } = await this.client
      .from('profiles')
      .select('gym_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile?.gym_id) return null;

    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('id', profile.gym_id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Create a new gym for the current user via RPC.
   */
  async createForUser(gymData) {
    const { data, error } = await this.client.rpc('create_gym_for_user', {
      gym_name: gymData.name,
      gym_address: gymData.address || null,
      gym_phone: gymData.phone || null,
      gym_email: gymData.email || null,
    });

    if (error) throw error;
    return data;
  }

  /**
   * Update the gym associated with the current user's profile.
   */
  async updateCurrent(updates) {
    const orgId = await this._getOrgId();

    const { data, error } = await this.client
      .from(this.tableName)
      .update(updates)
      .eq('id', orgId)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Get all organizations the current user belongs to (via organization_members).
   */
  async getUserGyms() {
    const { data: { user }, error: userError } = await this.client.auth.getUser();
    if (userError) throw userError;
    if (!user) return [];

    const { data, error } = await this.client
      .from('organization_members')
      .select('role, organization_id, gyms:organization_id(*)')
      .eq('user_id', user.id);

    if (error) {
      console.error('getUserGyms error:', error);
      return [];
    }

    return (data || [])
      .filter((om) => om.gyms)
      .map((om) => ({
        ...om.gyms,
        role: om.role || 'owner',
      }))
      // Deduplicar por org ID: si el usuario tiene múltiples membresías
      // al mismo negocio, mantener la de mayor jerarquía (owner > admin > staff)
      .reduce((unique, org) => {
        const existing = unique.find(o => o.id === org.id);
        if (!existing) {
          unique.push(org);
        } else {
          const hierarchy = { owner: 3, admin: 2, staff: 1, reception: 0 };
          if ((hierarchy[org.role] || 0) > (hierarchy[existing.role] || 0)) {
            const idx = unique.indexOf(existing);
            unique[idx] = org;
          }
        }
        return unique;
      }, []);
  }
}

export const gymService = new GymService();
