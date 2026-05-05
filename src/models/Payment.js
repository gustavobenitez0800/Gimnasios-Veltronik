/**
 * Clase Modelo: Payment (Pago)
 * Equivalente a: BeansDeEntidad (ej. Factura.java en SIG JEE7)
 * 
 * Esta clase representa un registro en la tabla 'member_payments'.
 */
export default class Payment {
  constructor(data = {}) {
    this.id = data.id || null;
    this.gym_id = data.gym_id || null;
    this.member_id = data.member_id || null;
    this.amount = data.amount ? parseFloat(data.amount) : 0.0;
    this.payment_date = data.payment_date || new Date().toISOString().split('T')[0];
    this.payment_method = data.payment_method || 'cash';
    this.status = data.status || 'paid'; // paid, pending, failed, refunded
    this.notes = data.notes || '';
    this.period_start = data.period_start || null;
    this.period_end = data.period_end || null;
    this.created_at = data.created_at || new Date().toISOString();
    
    // Relaciones OneToOne/ManyToOne (Equivalente a @ManyToOne)
    this.member = data.member || null; 
  }

  // --- LÓGICA DE NEGOCIO ENCAPSULADA (POO) ---

  /**
   * @returns {string} El monto formateado como moneda local
   */
  getFormattedAmount() {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS'
    }).format(this.amount);
  }

  /**
   * @returns {boolean} True si el pago fue exitoso
   */
  isPaid() {
    return this.status === 'paid';
  }

  /**
   * Obtiene la descripción legible del método de pago
   */
  getPaymentMethodDescription() {
    const methods = {
      'cash': 'Efectivo',
      'card': 'Tarjeta',
      'transfer': 'Transferencia',
      'mercadopago': 'Mercado Pago'
    };
    return methods[this.payment_method] || this.payment_method;
  }

  /**
   * Transforma la instancia de vuelta a un objeto plano para guardar en BD
   * @returns {Object}
   */
  toDatabaseRecord() {
    return {
      gym_id: this.gym_id,
      member_id: this.member_id,
      amount: this.amount,
      payment_date: this.payment_date,
      payment_method: this.payment_method,
      status: this.status,
      notes: this.notes,
      period_start: this.period_start,
      period_end: this.period_end,
    };
  }
}
