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
    this.paymentDate = data.paymentDate || new Date().toISOString().split('T')[0];
    this.paymentMethod = data.paymentMethod || 'cash';
    this.status = data.status || 'paid'; // paid, pending, failed, refunded
    this.notes = data.notes || '';
    this.periodStart = data.periodStart || null;
    this.periodEnd = data.periodEnd || null;
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
    return methods[this.paymentMethod] || this.paymentMethod;
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
      paymentDate: this.paymentDate,
      paymentMethod: this.paymentMethod,
      status: this.status,
      notes: this.notes,
      periodStart: this.periodStart,
      periodEnd: this.periodEnd,
    };
  }
}
