// ============================================
// VELTRONIK - SUBSCRIPTION SERVICE
// ============================================

import { BaseService } from './base/BaseService';

class SubscriptionService extends BaseService {
  constructor() {
    super('subscriptions');
  }

  /**
   * Get all available plans, ordered by price.
   */
  async getPlans() {
    const { data, error } = await this.client
      .from('plans')
      .select('*')
      .order('price', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get the subscription for the current user's gym.
   * Priority: active > latest.
   */
  async getCurrent() {
    const orgId = await this._getOrgId();
    return this.getByOrgId(orgId);
  }

  /**
   * Get the subscription for a specific org.
   */
  async getByOrgId(orgId) {
    if (!orgId) return null;

    // Priority: active subscription
    const { data: activeSub, error: activeError } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('gym_id', orgId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (activeSub) return activeSub;
    if (activeError && activeError.code !== 'PGRST116') throw activeError;

    // Fallback: latest subscription
    const { data: latestSub, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('gym_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code === 'PGRST116') return null;
    if (error) throw error;
    return latestSub;
  }
}

export const subscriptionService = new SubscriptionService();
