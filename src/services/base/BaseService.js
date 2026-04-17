// ============================================
// VELTRONIK - BASE SERVICE (Abstract CRUD)
// ============================================
// Clase base para todos los servicios de datos.
// Provee operaciones CRUD genéricas y helpers
// comunes para evitar repetición de código.
// ============================================

import supabase from './SupabaseClient';

export class BaseService {
  /**
   * @param {string} tableName — Nombre de la tabla en Supabase
   * @param {string} orgField — Nombre del campo FK de organización ('gym_id' o 'org_id')
   */
  constructor(tableName, orgField = 'gym_id') {
    if (new.target === BaseService) {
      throw new Error('BaseService es abstracta y no puede instanciarse directamente.');
    }
    this.tableName = tableName;
    this.orgField = orgField;
    this.client = supabase;
  }

  // ─── Generic CRUD ───

  /**
   * Obtener todos los registros con orden opcional.
   * SIEMPRE filtra por la organización actual para evitar mezcla de datos.
   */
  async getAll(orderBy = 'created_at', ascending = false) {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq(this.orgField, orgId)
      .order(orderBy, { ascending });

    if (error) throw error;
    return data || [];
  }

  /**
   * Obtener un registro por ID.
   */
  async getById(id) {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Crear un registro nuevo.
   */
  async create(record) {
    const { data, error } = await this.client
      .from(this.tableName)
      .insert(record)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Actualizar un registro por ID.
   */
  async update(id, updates) {
    const { data, error } = await this.client
      .from(this.tableName)
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Eliminar un registro por ID.
   */
  async delete(id) {
    const { error } = await this.client
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ─── Helper: obtener org_id actual ───

  /**
   * Obtener el ID de la organización actual del perfil del usuario.
   * Primero intenta desde localStorage (rápido), luego fallback a DB.
   * @returns {Promise<string>}
   */
  async _getOrgId() {
    // Fast path: use localStorage
    const cachedOrgId = localStorage.getItem('current_org_id');
    if (cachedOrgId) return cachedOrgId;

    // Slow path: query profile
    const { data: { user }, error: userError } = await this.client.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error('No authenticated user');

    const { data: profile, error: profileError } = await this.client
      .from('profiles')
      .select('gym_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile?.gym_id) throw new Error('No gym/organization associated');

    return profile.gym_id;
  }

  /**
   * Crear un registro asociado a la organización actual.
   */
  async createForOrg(record) {
    const orgId = await this._getOrgId();
    return this.create({ gym_id: orgId, ...record });
  }

  /**
   * Crear un registro asociado a la organización actual (campo org_id).
   * Usado por tablas de restaurante que usan 'org_id' en vez de 'gym_id'.
   */
  async createForOrgAlt(record) {
    const orgId = await this._getOrgId();
    return this.create({ org_id: orgId, ...record });
  }
}
