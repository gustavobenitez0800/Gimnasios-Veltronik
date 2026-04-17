// ============================================
// VELTRONIK - CLASS SERVICE
// ============================================

import { BaseService } from './base/BaseService';

class ClassService extends BaseService {
  constructor() {
    super('classes');
  }

  /**
   * Get all classes ordered by day and time.
   */
  async getAll() {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Create a class scoped to the current org.
   */
  async create(classData) {
    return this.createForOrg(classData);
  }

  // ─── Bookings ───

  /**
   * Get bookings for a specific date with class and member info.
   */
  async getBookingsByDate(date) {
    const { data, error } = await this.client
      .from('class_bookings')
      .select(
        '*, class:classes(name, instructor, start_time, end_time, capacity), member:members(full_name, dni)'
      )
      .eq('booking_date', date)
      .order('booked_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get bookings for a specific class on a specific date.
   */
  async getBookingsForClass(classId, date) {
    const { data, error } = await this.client
      .from('class_bookings')
      .select('*, member:members(id, full_name, dni, phone)')
      .eq('class_id', classId)
      .eq('booking_date', date);

    if (error) throw error;
    return data || [];
  }

  /**
   * Create a booking scoped to the current org.
   */
  async createBooking(bookingData) {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from('class_bookings')
      .insert({ gym_id: orgId, ...bookingData })
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Cancel a booking.
   */
  async cancelBooking(id) {
    const { data, error } = await this.client
      .from('class_bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Mark a booking as attended.
   */
  async markAttended(id) {
    const { data, error } = await this.client
      .from('class_bookings')
      .update({ status: 'attended', attended_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }
}

export const classService = new ClassService();
