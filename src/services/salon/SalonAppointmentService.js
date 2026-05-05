// ============================================
// VELTRONIK - SALON APPOINTMENT SERVICE
// ============================================

import { BaseService } from '../base/BaseService';

class SalonAppointmentService extends BaseService {
  constructor() {
    super('salon_appointments', 'org_id');
  }

  /**
   * Get appointments for a specific date, with client, service and stylist joins.
   */
  async getByDate(date) {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*, client:salon_clients(id, full_name, phone), service:salon_services(id, name, price, duration_min, color, category), stylist:salon_stylists(id, full_name, color)')
      .eq('org_id', orgId)
      .eq('appointment_date', date)
      .order('start_time', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  /**
   * Get appointments for a date range (for weekly view).
   */
  async getByRange(startDate, endDate) {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*, client:salon_clients(id, full_name, phone), service:salon_services(id, name, price, duration_min, color, category), stylist:salon_stylists(id, full_name, color)')
      .eq('org_id', orgId)
      .gte('appointment_date', startDate)
      .lte('appointment_date', endDate)
      .order('appointment_date', { ascending: true })
      .order('start_time', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  /**
   * Create a new appointment.
   */
  async create(appointmentData) {
    return this.createForOrgAlt(appointmentData);
  }

  /**
   * Update an appointment (reschedule, change status, etc.).
   */
  async update(id, updates) {
    const { data, error } = await this.client
      .from(this.tableName)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, client:salon_clients(id, full_name, phone), service:salon_services(id, name, price, duration_min, color, category), stylist:salon_stylists(id, full_name, color)')
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Check availability for a stylist at a given date/time.
   */
  async checkAvailability(stylistId, date, startTime, endTime, excludeId = null) {
    const orgId = await this._getOrgId();
    let query = this.client
      .from(this.tableName)
      .select('id, start_time, end_time')
      .eq('org_id', orgId)
      .eq('stylist_id', stylistId)
      .eq('appointment_date', date)
      .neq('status', 'cancelled')
      .lt('start_time', endTime)
      .gt('end_time', startTime);

    if (excludeId) query = query.neq('id', excludeId);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).length === 0; // true = available
  }

  /**
   * Get today's appointments count and stats for dashboard.
   */
  async getTodayStats() {
    const orgId = await this._getOrgId();
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await this.client
      .from(this.tableName)
      .select('id, status, price')
      .eq('org_id', orgId)
      .eq('appointment_date', today);
    if (error) throw error;
    const all = data || [];
    return {
      total: all.length,
      confirmed: all.filter(a => a.status === 'confirmed').length,
      completed: all.filter(a => a.status === 'completed').length,
      cancelled: all.filter(a => a.status === 'cancelled').length,
      inProgress: all.filter(a => a.status === 'in_progress').length,
      revenue: all.filter(a => a.status === 'completed').reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0),
    };
  }
}

export const salonAppointmentService = new SalonAppointmentService();
