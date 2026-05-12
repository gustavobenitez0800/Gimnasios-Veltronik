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

  /**
   * Delete an organization and all its related data.
   * Only the owner should be able to call this.
   * Deletes: organization_members, gym_members, subscriptions,
   * subscription_payments, members, access_logs, payments, activity_log, and the gym itself.
   */
  async deleteOrg(orgId) {
    if (!orgId) throw new Error('No org ID provided');

    // First try the new enterprise-grade RPC deletion (transactional & safe)
    const { error: rpcError } = await this.client.rpc('delete_gym_cascade', {
      target_gym_id: orgId
    });

    if (!rpcError) {
      // Success using RPC! Clean up local storage
      if (localStorage.getItem('current_org_id') === orgId) {
        localStorage.removeItem('current_org_id');
        localStorage.removeItem('current_org_role');
        localStorage.removeItem('current_org_name');
        localStorage.removeItem('current_org_type');
      }
      return true;
    }

    // If the RPC does not exist yet (user hasn't run the SQL script), fallback to manual deletion
    console.warn("RPC delete_gym_cascade failed or not found, falling back to manual cascade:", rpcError);

    // Verify ownership manually
    const { data: { user } } = await this.client.auth.getUser();
    if (!user) throw new Error('No autenticado');

    const { data: membership } = await this.client
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || membership.role !== 'owner') {
      throw new Error('Solo el dueño puede eliminar un negocio');
    }

    // Manual deletion (fallback)
    const tableDefinitions = [
      { name: 'access_logs', fk: 'gym_id' },
      { name: 'member_payments', fk: 'gym_id' },
      { name: 'payments', fk: 'gym_id' },
      { name: 'subscription_payments', fk: 'gym_id' },
      { name: 'subscriptions', fk: 'gym_id' },
      { name: 'activity_log', fk: 'gym_id' },
      { name: 'class_bookings', fk: 'gym_id' },
      { name: 'classes', fk: 'gym_id' },
      { name: 'gym_members', fk: 'gym_id' },
      { name: 'members', fk: 'gym_id' },
      { name: 'organization_members', fk: 'organization_id' },
      { name: 'menu_items', fk: 'org_id' },
      { name: 'menu_categories', fk: 'org_id' },
      { name: 'restaurant_tables', fk: 'org_id' },
      { name: 'restaurant_orders', fk: 'org_id' },
      { name: 'reservations', fk: 'org_id' },
      { name: 'restaurant_staff', fk: 'org_id' },
      { name: 'inventory_items', fk: 'org_id' },
      { name: 'cash_register', fk: 'org_id' },
      { name: 'restaurant_areas', fk: 'org_id' },
      { name: 'salon_services', fk: 'org_id' },
      { name: 'salon_products', fk: 'org_id' },
      { name: 'salon_stylists', fk: 'org_id' },
      { name: 'salon_appointments', fk: 'org_id' },
      { name: 'salon_clients', fk: 'org_id' },
      { name: 'salon_sales', fk: 'org_id' }
    ];

    for (const { name, fk } of tableDefinitions) {
      try {
        await this.client.from(name).delete().eq(fk, orgId);
      } catch (e) {
        console.warn(`Could not delete from ${name}:`, e);
      }
    }

    // Unlink any profiles currently pointing to this gym
    await this.client.from('profiles').update({ gym_id: null }).eq('gym_id', orgId);

    // Finally delete the gym itself
    const { error } = await this.client
      .from('gyms')
      .delete()
      .eq('id', orgId);

    if (error) {
      console.error('Error al eliminar gym de Supabase:', error);
      throw new Error(`Error de base de datos: ${error.message || error.details || 'Permiso denegado o conflicto de FK'}`);
    }

    // Clean localStorage if this was the current org
    if (localStorage.getItem('current_org_id') === orgId) {
      localStorage.removeItem('current_org_id');
      localStorage.removeItem('current_org_role');
      localStorage.removeItem('current_org_name');
      localStorage.removeItem('current_org_type');
    }

    return true;
  }
}

export const gymService = new GymService();
