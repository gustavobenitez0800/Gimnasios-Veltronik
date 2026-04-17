// ============================================
// VELTRONIK - ORDER SERVICE (Restaurant)
// ============================================

import { BaseService } from '../base/BaseService';

class OrderService extends BaseService {
  constructor() {
    super('restaurant_orders', 'org_id');
  }

  /**
   * Get orders with optional status filter.
   */
  async getAll(statusFilter = null) {
    const orgId = await this._getOrgId();
    let query = this.client
      .from(this.tableName)
      .select('*, table:restaurant_tables(table_number), waiter:restaurant_staff(full_name)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Get active orders with items.
   */
  async getActive() {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .select(
        '*, table:restaurant_tables(table_number), waiter:restaurant_staff(full_name), items:order_items(*, menu_item:menu_items(name))'
      )
      .eq('org_id', orgId)
      .in('status', ['pending', 'preparing', 'ready', 'served'])
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  /**
   * Create an order. If dine-in, mark the table as occupied.
   */
  async create(orderData) {
    const orgId = await this._getOrgId();
    const { data, error } = await this.client
      .from(this.tableName)
      .insert({ org_id: orgId, ...orderData })
      .select()
      .maybeSingle();
    if (error) throw error;

    if (data && orderData.table_id) {
      await this.client
        .from('restaurant_tables')
        .update({ status: 'occupied', current_order_id: data.id })
        .eq('id', orderData.table_id);
    }

    return data;
  }

  /**
   * Close an order as paid and free the table.
   */
  async close(id, paymentMethod, tip = 0) {
    const { data, error } = await this.client
      .from(this.tableName)
      .update({
        status: 'paid',
        payment_status: 'paid',
        payment_method: paymentMethod,
        tip,
        paid_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;

    if (data?.table_id) {
      await this.client
        .from('restaurant_tables')
        .update({ status: 'available', current_order_id: null })
        .eq('id', data.table_id);
    }

    return data;
  }

  // ─── Order Items ───

  async getItems(orderId) {
    const { data, error } = await this.client
      .from('order_items')
      .select('*, menu_item:menu_items(name, price)')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async addItem(orderId, item) {
    const { data, error } = await this.client
      .from('order_items')
      .insert({
        order_id: orderId,
        menu_item_id: item.menu_item_id,
        item_name: item.item_name,
        quantity: item.quantity || 1,
        unit_price: item.unit_price,
        modifiers: item.modifiers || [],
        notes: item.notes || null,
      })
      .select()
      .maybeSingle();
    if (error) throw error;

    await this._recalculateTotal(orderId);
    return data;
  }

  async updateItem(id, updates) {
    const { data, error } = await this.client
      .from('order_items')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async removeItem(id, orderId) {
    const { error } = await this.client.from('order_items').delete().eq('id', id);
    if (error) throw error;
    await this._recalculateTotal(orderId);
  }

  /**
   * Recalculate order totals from items.
   */
  async _recalculateTotal(orderId) {
    const items = await this.getItems(orderId);
    const subtotal = items
      .filter((i) => i.status !== 'cancelled')
      .reduce((sum, i) => {
        const modifiersPrice = Array.isArray(i.modifiers)
          ? i.modifiers.reduce((s, m) => s + (parseFloat(m.price) || 0), 0)
          : 0;
        return sum + (parseFloat(i.unit_price) + modifiersPrice) * i.quantity;
      }, 0);

    await this.client
      .from(this.tableName)
      .update({ subtotal, total: subtotal })
      .eq('id', orderId);
  }
}

export const orderService = new OrderService();
