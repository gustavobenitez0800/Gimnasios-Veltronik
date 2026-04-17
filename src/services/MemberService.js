// ============================================
// VELTRONIK - MEMBER SERVICE
// ============================================

import { BaseService } from './base/BaseService';

class MemberService extends BaseService {
  constructor() {
    super('members');
  }

  /**
   * Get all members ordered by name.
   */
  async getAll() {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .order('full_name', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get members with pagination and optional search.
   */
  async getPaginated(page = 0, pageSize = 50, search = '') {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = this.client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .order('full_name', { ascending: true })
      .range(from, to);

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,dni.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: data || [],
      count: count || 0,
      hasMore: from + pageSize < (count || 0),
    };
  }

  /**
   * Create a member scoped to the current org.
   */
  async create(memberData) {
    return this.createForOrg(memberData);
  }

  /**
   * Check if a DNI is duplicated within the current org.
   */
  async isDniDuplicate(dni, excludeId = null) {
    if (!dni || dni.trim() === '') return false;

    let orgId;
    try {
      orgId = await this._getOrgId();
    } catch {
      return false;
    }

    let query = this.client
      .from(this.tableName)
      .select('id')
      .eq('dni', dni.trim())
      .eq('gym_id', orgId);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query.limit(1);
    if (error) return false;
    return data && data.length > 0;
  }

  /**
   * Search members for access control (limited fields).
   */
  async searchForAccess(query) {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('id, full_name, dni, phone, status, photo_url, membership_end')
      .or(`dni.ilike.%${query}%,full_name.ilike.%${query}%`)
      .in('status', ['active', 'expired', 'inactive'])
      .limit(10);

    if (error) throw error;
    return data || [];
  }
}

export const memberService = new MemberService();
