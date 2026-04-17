// ============================================
// VELTRONIK - MENU SERVICE (Restaurant)
// ============================================

import { BaseService } from '../base/BaseService';

class MenuService extends BaseService {
  constructor() {
    super('menu_items', 'org_id');
  }

  // ─── Categories ───

  async getCategories() {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from('menu_categories')
      .select('*')
      .eq('org_id', orgId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async createCategory(catData) {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from('menu_categories')
      .insert({ org_id: orgId, ...catData })
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async updateCategory(id, updates) {
    const { data, error } = await this.client
      .from('menu_categories')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async deleteCategory(id) {
    const { error } = await this.client.from('menu_categories').delete().eq('id', id);
    if (error) throw error;
  }

  // ─── Items ───

  async getAll() {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*, category:menu_categories(name, icon)')
      .eq('org_id', orgId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  /** Alias used by pages */
  async getItems() {
    return this.getAll();
  }

  async create(itemData) {
    return this.createForOrgAlt(itemData);
  }

  /** Alias used by pages */
  async createItem(itemData) {
    return this.create(itemData);
  }

  async update(id, updates) {
    const { data, error } = await this.client
      .from(this.tableName)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Alias used by pages */
  async updateItem(id, updates) {
    return this.update(id, updates);
  }

  /** Alias used by pages */
  async deleteItem(id) {
    return this.delete(id);
  }
}

export const menuService = new MenuService();
