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
    this.fullName = data.fullName || '';
    this.dni = data.dni || '';
    this.email = data.email || '';
    this.phone = data.phone || '';
    this.address = data.address || '';
    this.status = data.status || 'active'; // active, inactive, expired
    this.birthDate = data.birthDate || null;
    this.gender = data.gender || '';
    this.photo_url = data.photo_url || null;
    this.notes = data.notes || '';
    this.membershipStart = data.membershipStart || null;
    this.membershipEnd = data.membershipEnd || null;
    this.attendanceDays = data.attendanceDays || [];
    this.created_at = data.created_at || new Date().toISOString();
  }

  // --- LÓGICA DE NEGOCIO ENCAPSULADA (POO) ---

  /**
   * @returns {boolean} True si la membresía está vigente
   */
  isMembershipActive() {
    if (!this.membershipEnd) return false;
    const endDate = new Date(this.membershipEnd);
    const today = new Date();
    return endDate >= today && this.status === 'active';
  }

  /**
   * @returns {number} Los días restantes de membresía
   */
  getDaysRemaining() {
    if (!this.membershipEnd) return 0;
    const end = new Date(this.membershipEnd).getTime();
    const now = new Date().getTime();
    const diff = end - now;
    return diff > 0 ? Math.ceil(diff / (1000 * 3600 * 24)) : 0;
  }

  /**
   * @returns {string} El nombre completo formateado
   */
  getFormattedName() {
    return this.fullName.trim().toUpperCase();
  }

  /**
   * Transforma la instancia de vuelta a un objeto plano para guardar en BD
   * @returns {Object}
   */
  toDatabaseRecord() {
    return {
      gym_id: this.gym_id,
      fullName: this.fullName,
      dni: this.dni,
      email: this.email,
      phone: this.phone,
      address: this.address,
      status: this.status,
      birthDate: this.birthDate,
      gender: this.gender,
      photo_url: this.photo_url,
      notes: this.notes,
      membershipStart: this.membershipStart,
      membershipEnd: this.membershipEnd,
      attendanceDays: this.attendanceDays,
      // No mandamos id ni created_at si es creación
    };
  }
}
