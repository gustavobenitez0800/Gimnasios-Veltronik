import AbstractFacade from './AbstractFacade';
import GymClass from '../models/GymClass';

/**
 * Clase: ClassFacade
 * Equivalente a: ClaseFacade.java (SIG JEE7)
 */
class ClassFacade extends AbstractFacade {
  constructor() {
    super(GymClass, 'classes');
  }

  /**
   * Obtener todas las clases ordenadas por día y hora.
   * Devuelve instancias de GymClass.
   */
  async findAllOrdered(gymId) {
    const { data, error } = await this.getEntityManager()
      .from(this.tableName)
      .select('*')
      .eq('gym_id', gymId)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;
    return data ? data.map(record => new this.entityClass(record)) : [];
  }

  // ─── BOOKINGS (Reservas) ───
  // En un sistema estricto, esto podría ir en un BookingFacade, 
  // pero lo mantenemos acoplado a la clase por simplicidad.

  /**
   * Obtener reservas de una clase en una fecha específica
   */
  async findBookingsForClass(classId, date) {
    const { data, error } = await this.getEntityManager()
      .from('class_bookings')
      .select('*, member:members(id, full_name, dni, phone)')
      .eq('class_id', classId)
      .eq('booking_date', date);

    if (error) throw error;
    return data || [];
  }

  /**
   * Obtener todas las reservas de un día
   */
  async findBookingsByDate(gymId, date) {
    const { data, error } = await this.getEntityManager()
      .from('class_bookings')
      .select('*, class:classes(name, instructor, start_time, end_time, capacity), member:members(full_name, dni)')
      .eq('gym_id', gymId)
      .eq('booking_date', date)
      .order('booked_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createBooking(gymId, bookingData) {
    const { data, error } = await this.getEntityManager()
      .from('class_bookings')
      .insert({ gym_id: gymId, ...bookingData })
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async updateBookingStatus(id, status) {
    const updates = { status };
    if (status === 'cancelled') updates.cancelled_at = new Date().toISOString();
    if (status === 'attended') updates.attended_at = new Date().toISOString();

    const { data, error } = await this.getEntityManager()
      .from('class_bookings')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }
}

export const classFacade = new ClassFacade();
