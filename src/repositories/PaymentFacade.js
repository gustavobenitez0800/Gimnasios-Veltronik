import AbstractFacade from './AbstractFacade';
import Payment from '../models/Payment';

/**
 * Clase: PaymentFacade
 * Equivalente a: FacturaFacade.java (SIG JEE7)
 * 
 * Contiene consultas especializadas para la tabla 'member_payments'.
 */
class PaymentFacade extends AbstractFacade {
  constructor() {
    super(Payment, 'member_payments');
  }

  /**
   * Consulta Especializada: Buscar pagos por fecha y/o miembro.
   * Utiliza Inner Joins equivalente a JPQL (FETCH JOIN).
   */
  async findByFilters(gymId, dateFrom, dateTo, search = '', method = '', status = '') {
    let query = this.getEntityManager()
      .from(this.tableName)
      .select('*, member:members!inner(full_name, dni)')
      .eq('gym_id', gymId)
      .order('payment_date', { ascending: false });

    if (dateFrom) query = query.gte('payment_date', dateFrom);
    if (dateTo) query = query.lte('payment_date', dateTo);
    if (method) query = query.eq('payment_method', method);
    if (status) query = query.eq('status', status);

    if (search) {
      // Filtrar usando columnas de la tabla relacionada 'members'
      query = query.or(`full_name.ilike.%${search}%,dni.ilike.%${search}%`, { referencedTable: 'members' });
    }

    const { data, error } = await query.limit(2000);
    
    if (error) throw error;
    
    // Transformar a instancias del Modelo Payment
    return data ? data.map(record => new this.entityClass(record)) : [];
  }

  /**
   * Buscar historial de pagos de un socio específico
   */
  async findByMember(gymId, memberId) {
    const { data, error } = await this.getEntityManager()
      .from(this.tableName)
      .select('*')
      .eq('member_id', memberId)
      .eq('gym_id', gymId)
      .order('payment_date', { ascending: false });

    if (error) throw error;
    return data ? data.map(record => new this.entityClass(record)) : [];
  }

  /**
   * Consultas analíticas (Equivalente a @NamedQuery con funciones de agregación)
   */
  async getMonthlyStats(gymId) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data, error } = await this.getEntityManager()
      .from(this.tableName)
      .select('amount, status, payment_method')
      .eq('gym_id', gymId)
      .eq('status', 'paid')
      .gte('payment_date', startOfMonth.toISOString().split('T')[0]);

    if (error) throw error;

    const payments = data || [];
    return {
      totalMonth: payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0),
      totalCount: payments.length,
      byMethod: payments.reduce((acc, p) => {
        acc[p.payment_method] = (acc[p.payment_method] || 0) + 1;
        return acc;
      }, {}),
    };
  }
}

export const paymentFacade = new PaymentFacade();
