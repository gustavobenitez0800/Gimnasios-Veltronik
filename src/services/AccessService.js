// ============================================
// VELTRONIK - ACCESS SERVICE
// ============================================

import { BaseService } from './base/BaseService';

class AccessService extends BaseService {
  constructor() {
    super('access_logs');
  }

  /**
   * Get today's access logs with member info.
   */
  async getTodayLogs() {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await this.client
      .from(this.tableName)
      .select('*, member:members(id, full_name, dni, phone, status, membership_end)')
      .gte('check_in_at', today)
      .order('check_in_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get access logs for a date range.
   */
  async getLogsByDateRange(startDate, endDate) {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*, member:members(id, full_name, dni)')
      .gte('check_in_at', startDate)
      .lte('check_in_at', endDate + 'T23:59:59')
      .order('check_in_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Check in a member.
   */
  async checkIn(memberId, accessMethod = 'manual', notes = null) {
    const orgId = await this._getOrgId();

    const { data, error } = await this.client
      .from(this.tableName)
      .insert({
        gym_id: orgId,
        member_id: memberId,
        check_in_at: new Date().toISOString(),
        access_method: accessMethod,
        notes,
      })
      .select('*, member:members(full_name, dni)')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('No se pudo registrar la entrada. Verificá los permisos del socio.');
    return data;
  }

  /**
   * Check out a member.
   */
  async checkOut(accessLogId) {
    const { data, error } = await this.client
      .from(this.tableName)
      .update({ check_out_at: new Date().toISOString() })
      .eq('id', accessLogId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('No se pudo procesar la salida. Es posible que el registro ya no exista.');
    return data;
  }

  /**
   * Get currently checked-in members (checked in today, not checked out).
   */
  async getCurrentlyCheckedIn() {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await this.client
      .from(this.tableName)
      .select('*, member:members(id, full_name, dni, phone, photo_url)')
      .gte('check_in_at', today)
      .is('check_out_at', null)
      .order('check_in_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}

export const accessService = new AccessService();
