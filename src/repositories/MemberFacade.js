import AbstractFacade from './AbstractFacade';
import Member from '../models/Member';

/**
 * Clase: MemberFacade
 * Equivalente a: ClienteFacade.java (SIG JEE7)
 * 
 * Contiene consultas especializadas para la tabla 'members'
 * utilizando el ORM / Query Builder de Supabase.
 */
class MemberFacade extends AbstractFacade {
  constructor() {
    // Le pasamos la Clase Modelo y el nombre de la tabla
    super(Member, 'members');
  }

  /**
   * Consulta Especializada: Buscar Socios con paginación y filtro.
   * Equivalente a las Custom Queries JPQL en Java EE.
   */
  async findPaginated(gymId, page = 0, pageSize = 50, search = '') {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = this.getEntityManager()
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('gym_id', gymId)
      .order('full_name', { ascending: true })
      .range(from, to);

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,dni.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;

    // Transformamos la respuesta plana en Instancias del Modelo Member
    const membersList = data ? data.map(record => new this.entityClass(record)) : [];

    return {
      data: membersList,
      count: count || 0,
      hasMore: from + pageSize < (count || 0),
    };
  }

  /**
   * Consulta Especializada: Verificar duplicado
   */
  async isDniDuplicate(gymId, dni, excludeId = null) {
    if (!dni || dni.trim() === '') return false;

    let query = this.getEntityManager()
      .from(this.tableName)
      .select('id')
      .eq('dni', dni.trim())
      .eq('gym_id', gymId);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query.limit(1);
    if (error) return false;
    return data && data.length > 0;
  }
}

// Exportamos como Singleton (equivalente al @Stateless de EJB)
export const memberFacade = new MemberFacade();
