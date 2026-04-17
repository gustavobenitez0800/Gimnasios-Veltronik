// ============================================
// VELTRONIK - RESERVATION SERVICE (Restaurant)
// ============================================

import { BaseService } from '../base/BaseService';

class ReservationService extends BaseService {
  constructor() {
    super('reservations');
  }

  async getAll(date = null) {
    let query = this.client
      .from(this.tableName)
      .select('*, table:restaurant_tables(table_number)')
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true });

    if (date) {
      query = query.eq('reservation_date', date);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /** Alias: get reservations for a specific date */
  async getByDate(date) {
    return this.getAll(date);
  }

  async create(resData) {
    return this.createForOrgAlt(resData);
  }

  async cancel(id) {
    return this.update(id, { status: 'cancelled' });
  }
}

export const reservationService = new ReservationService();
