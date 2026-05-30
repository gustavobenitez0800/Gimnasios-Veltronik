/**
 * Clase Modelo: GymClass (Clase / Actividad)
 * Equivalente a un Bean de Entidad en Java EE
 */
export default class GymClass {
  constructor(data = {}) {
    this.id = data.id || null;
    this.gym_id = data.gym_id || null;
    this.name = data.name || '';
    this.instructor = data.instructor || '';
    this.start_time = data.start_time || '';
    this.end_time = data.end_time || '';
    this.day_of_week = data.day_of_week !== undefined ? parseInt(data.day_of_week) : null;
    this.capacity = data.capacity ? parseInt(data.capacity) : 20;
    this.room = data.room || '';
    this.color = data.color || '#0EA5E9';
    this.description = data.description || '';
    this.status = data.status || 'active';
  }

  /**
   * Retorna el rango horario formateado (ej. 14:00 - 15:00)
   */
  getFormattedSchedule() {
    const formatTime = (time) => {
      if (!time) return '';
      return time.substring(0, 5);
    };
    return `${formatTime(this.start_time)} - ${formatTime(this.end_time)}`;
  }

  /**
   * Comprueba si la clase está activa
   */
  isActive() {
    return this.status === 'active';
  }

  /**
   * Transforma el objeto para guardarlo en BD
   */
  toDatabaseRecord() {
    return {
      gym_id: this.gym_id,
      name: this.name,
      instructor: this.instructor,
      start_time: this.start_time,
      end_time: this.end_time,
      day_of_week: this.day_of_week,
      capacity: this.capacity,
      room: this.room,
      color: this.color,
      description: this.description,
      status: this.status,
    };
  }
}
