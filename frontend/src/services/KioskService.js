import apiClient from '../lib/apiClient';

/**
 * Servicio del vertical Kiosco / Almacén (KIOSCO).
 *
 * Mapea 1:1 los endpoints del módulo `kiosk` del backend. DTOs en camelCase, consumidos tal cual.
 * Regla de oro: el front NO calcula plata ni stock — el backend es la autoridad (total de venta,
 * arqueo de caja, stock). Acá solo se envían intención (qué producto, cuánto, cómo se paga) y se
 * dibuja lo que el backend devuelve.
 */
class KioskService {
  // ─── Productos ───

  async getProducts() {
    const response = await apiClient.get('/kiosk/products');
    return Array.isArray(response.data) ? response.data : [];
  }

  async getActiveProducts() {
    const response = await apiClient.get('/kiosk/products/active');
    return Array.isArray(response.data) ? response.data : [];
  }

  async getLowStock() {
    const response = await apiClient.get('/kiosk/products/low-stock');
    return Array.isArray(response.data) ? response.data : [];
  }

  /** Lookup por código de barras del scanner. Lanza 404 si no existe. */
  async getProductByBarcode(barcode) {
    const response = await apiClient.get(`/kiosk/products/barcode/${encodeURIComponent(barcode)}`);
    return response.data;
  }

  async createProduct(product) {
    const response = await apiClient.post('/kiosk/products', product);
    return response.data;
  }

  async updateProduct(id, updates) {
    const response = await apiClient.put(`/kiosk/products/${id}`, updates);
    return response.data;
  }

  async deleteProduct(id) {
    await apiClient.delete(`/kiosk/products/${id}`);
    return true;
  }

  // ─── Rubros ───

  async getCategories() {
    const response = await apiClient.get('/kiosk/categories');
    return Array.isArray(response.data) ? response.data : [];
  }

  async getActiveCategories() {
    const response = await apiClient.get('/kiosk/categories/active');
    return Array.isArray(response.data) ? response.data : [];
  }

  async createCategory(category) {
    const response = await apiClient.post('/kiosk/categories', category);
    return response.data;
  }

  async updateCategory(id, updates) {
    const response = await apiClient.put(`/kiosk/categories/${id}`, updates);
    return response.data;
  }

  async deleteCategory(id) {
    await apiClient.delete(`/kiosk/categories/${id}`);
    return true;
  }

  // ─── Inventario ───

  async getMovements() {
    const response = await apiClient.get('/kiosk/inventory/movements');
    return Array.isArray(response.data) ? response.data : [];
  }

  async getProductMovements(productId) {
    const response = await apiClient.get(`/kiosk/inventory/movements/product/${productId}`);
    return Array.isArray(response.data) ? response.data : [];
  }

  /** Ajuste por recuento: { productId, countedQuantity, reason }. */
  async adjustStock(adjustment) {
    const response = await apiClient.post('/kiosk/inventory/adjust', adjustment);
    return response.data;
  }

  // ─── Caja ───

  /** Caja abierta actual, o null si no hay ninguna (el backend responde 204). */
  async getCurrentCash() {
    const response = await apiClient.get('/kiosk/cash/current');
    return response.data || null;
  }

  async getCashHistory() {
    const response = await apiClient.get('/kiosk/cash/history');
    return Array.isArray(response.data) ? response.data : [];
  }

  async openCash(openingAmount) {
    const response = await apiClient.post('/kiosk/cash/open', { openingAmount });
    return response.data;
  }

  /** Cierre: el backend calcula esperado y diferencia; el front solo manda lo contado. */
  async closeCash(closingDeclared) {
    const response = await apiClient.post('/kiosk/cash/close', { closingDeclared });
    return response.data;
  }

  // ─── Ventas (POS) ───

  /**
   * Registra una venta. payload: { clientUuid, notes?, items:[{productId, quantity}],
   * payments:[{method, amount}] }. Idempotente por clientUuid (reintentar es seguro).
   */
  async registerSale(sale) {
    const response = await apiClient.post('/kiosk/sales', sale);
    return response.data;
  }

  async getTodaySales() {
    const response = await apiClient.get('/kiosk/sales/today');
    return Array.isArray(response.data) ? response.data : [];
  }

  async getSale(id) {
    const response = await apiClient.get(`/kiosk/sales/${id}`);
    return response.data;
  }

  async voidSale(id) {
    const response = await apiClient.post(`/kiosk/sales/${id}/void`);
    return response.data;
  }

  // ─── Configuración ───

  async getSettings() {
    const response = await apiClient.get('/kiosk/settings');
    return response.data;
  }

  async updateSettings(updates) {
    const response = await apiClient.put('/kiosk/settings', updates);
    return response.data;
  }
}

export const kioskService = new KioskService();
