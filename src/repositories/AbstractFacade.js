import supabase from '../services/base/SupabaseClient';

/**
 * Clase: AbstractFacade
 * Equivalente a: AbstractFacade.java (JPA en SIG JEE7)
 * 
 * Provee los métodos CRUD genéricos para cualquier tabla (Entidad).
 */
export default class AbstractFacade {
  constructor(entityClass, tableName) {
    this.entityClass = entityClass; // Referencia a la clase Modelo (ej. Member)
    this.tableName = tableName;     // Nombre de la tabla (ej. 'members')
  }

  /**
   * Equivalente a getEntityManager() en Java EE
   */
  getEntityManager() {
    return supabase;
  }

  /**
   * Busca todas las entidades de esta tabla pertenecientes a una organización.
   * @param {string} gymId 
   * @returns {Promise<Array>} Lista de Entidades (Instancias de la clase)
   */
  async findAll(gymId) {
    const { data, error } = await this.getEntityManager()
      .from(this.tableName)
      .select('*')
      .eq('gym_id', gymId);

    if (error) throw error;
    
    // Mapeamos los resultados planos a instancias de la clase modelo
    return data ? data.map(record => new this.entityClass(record)) : [];
  }

  /**
   * Busca una entidad por su ID.
   * @param {string} id 
   * @returns {Promise<Object|null>} Instancia de la entidad
   */
  async find(id) {
    const { data, error } = await this.getEntityManager()
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 es "no rows"
    return data ? new this.entityClass(data) : null;
  }

  /**
   * Equivalente a em.persist()
   * @param {Object} entity 
   * @returns {Promise<Object>} La entidad creada
   */
  async create(entity) {
    const record = typeof entity.toDatabaseRecord === 'function' 
      ? entity.toDatabaseRecord() 
      : entity;

    const { data, error } = await this.getEntityManager()
      .from(this.tableName)
      .insert([record])
      .select()
      .single();

    if (error) throw error;
    return new this.entityClass(data);
  }

  /**
   * Equivalente a em.merge()
   * @param {string} id 
   * @param {Object} entity 
   * @returns {Promise<Object>} La entidad actualizada
   */
  async edit(id, entity) {
    const record = typeof entity.toDatabaseRecord === 'function' 
      ? entity.toDatabaseRecord() 
      : entity;

    const { data, error } = await this.getEntityManager()
      .from(this.tableName)
      .update(record)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return new this.entityClass(data);
  }

  /**
   * Equivalente a em.remove()
   * @param {string} id 
   */
  async remove(id) {
    const { error } = await this.getEntityManager()
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }
}
