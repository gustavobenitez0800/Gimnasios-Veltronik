/**
 * Clase Modelo: Member (Socio)
 * Equivalente a: BeansDeEntidad (ej. Cliente.java en SIG JEE7)
 * 
 * Esta clase representa la estructura de datos en la base de datos
 * y encapsula la lógica de negocio propia de la entidad.
 */
export default class Member {
  constructor(data = {}) {
    this.id = data.id || null;
    this.gym_id = data.gym_id || null;
    this.full_name = data.full_name || '';
    this.dni = data.dni || '';
    this.email = data.email || '';
    this.phone = data.phone || '';
    this.address = data.address || '';
    this.status = data.status || 'active'; // active, inactive, expired
    this.birth_date = data.birth_date || null;
    this.gender = data.gender || '';
    this.photo_url = data.photo_url || null;
    this.notes = data.notes || '';
    this.membership_start = data.membership_start || null;
    this.membership_end = data.membership_end || null;
    this.attendance_days = data.attendance_days || [];
    this.created_at = data.created_at || new Date().toISOString();
  }

  // --- LÓGICA DE NEGOCIO ENCAPSULADA (POO) ---

  /**
   * @returns {boolean} True si la membresía está vigente
   */
  isMembershipActive() {
    if (!this.membership_end) return false;
    const endDate = new Date(this.membership_end);
    const today = new Date();
    return endDate >= today && this.status === 'active';
  }

  /**
   * @returns {number} Los días restantes de membresía
   */
  getDaysRemaining() {
    if (!this.membership_end) return 0;
    const end = new Date(this.membership_end).getTime();
    const now = new Date().getTime();
    const diff = end - now;
    return diff > 0 ? Math.ceil(diff / (1000 * 3600 * 24)) : 0;
  }

  /**
   * @returns {string} El nombre completo formateado
   */
  getFormattedName() {
    return this.full_name.trim().toUpperCase();
  }

  /**
   * Transforma la instancia de vuelta a un objeto plano para guardar en BD
   * @returns {Object}
   */
  toDatabaseRecord() {
    return {
      gym_id: this.gym_id,
      full_name: this.full_name,
      dni: this.dni,
      email: this.email,
      phone: this.phone,
      address: this.address,
      status: this.status,
      birth_date: this.birth_date,
      gender: this.gender,
      photo_url: this.photo_url,
      notes: this.notes,
      membership_start: this.membership_start,
      membership_end: this.membership_end,
      attendance_days: this.attendance_days,
      // No mandamos id ni created_at si es creación
    };
  }
}
