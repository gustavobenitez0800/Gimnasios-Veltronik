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

  // ─── Clientes / cuenta corriente (fiado) ───

  async getCustomers() {
    const response = await apiClient.get('/kiosk/customers');
    return Array.isArray(response.data) ? response.data : [];
  }

  async getActiveCustomers() {
    const response = await apiClient.get('/kiosk/customers/active');
    return Array.isArray(response.data) ? response.data : [];
  }

  async getCustomersWithDebt() {
    const response = await apiClient.get('/kiosk/customers/with-debt');
    return Array.isArray(response.data) ? response.data : [];
  }

  async getCustomerMovements(id) {
    const response = await apiClient.get(`/kiosk/customers/${id}/movements`);
    return Array.isArray(response.data) ? response.data : [];
  }

  async createCustomer(customer) {
    const response = await apiClient.post('/kiosk/customers', customer);
    return response.data;
  }

  async updateCustomer(id, updates) {
    const response = await apiClient.put(`/kiosk/customers/${id}`, updates);
    return response.data;
  }

  async deleteCustomer(id) {
    await apiClient.delete(`/kiosk/customers/${id}`);
    return true;
  }

  /** Registra un pago del cliente a su cuenta corriente. */
  async registerCustomerPayment(id, amount, notes) {
    const response = await apiClient.post(`/kiosk/customers/${id}/payment`, { amount, notes });
    return response.data;
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

  // ─── Proveedores / compras ───

  async getSuppliers() {
    const response = await apiClient.get('/kiosk/suppliers');
    return Array.isArray(response.data) ? response.data : [];
  }

  async getActiveSuppliers() {
    const response = await apiClient.get('/kiosk/suppliers/active');
    return Array.isArray(response.data) ? response.data : [];
  }

  async createSupplier(supplier) {
    const response = await apiClient.post('/kiosk/suppliers', supplier);
    return response.data;
  }

  async updateSupplier(id, updates) {
    const response = await apiClient.put(`/kiosk/suppliers/${id}`, updates);
    return response.data;
  }

  async deleteSupplier(id) {
    await apiClient.delete(`/kiosk/suppliers/${id}`);
    return true;
  }

  async getPurchases() {
    const response = await apiClient.get('/kiosk/purchases');
    return Array.isArray(response.data) ? response.data : [];
  }

  /** Registra una compra: { supplierId?, purchaseDate?, notes?, items:[{productId, quantity, unitCost}] }. */
  async registerPurchase(purchase) {
    const response = await apiClient.post('/kiosk/purchases', purchase);
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

  // ─── Analítica (dashboard + reportes, solo dueño/admin) ───

  /** Tablero del dueño: rentabilidad, producto estrella, hora pico, fiado, stock bajo + insights. */
  async getDashboard() {
    const response = await apiClient.get('/kiosk/analytics/dashboard');
    return response.data;
  }

  /** Reporte exportable del rango: resumen, rentabilidad por producto y ticket por ticket. */
  async getReport(from, to) {
    const response = await apiClient.get('/kiosk/analytics/report', { params: { from, to } });
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

  // ─── Facturación ARCA (módulo fiscal compartido, /api/fiscal) ───

  async getFiscalConfig() {
    const response = await apiClient.get('/fiscal/config');
    return response.data;
  }

  async updateFiscalConfig(updates) {
    const response = await apiClient.put('/fiscal/config', updates);
    return response.data;
  }

  /** Sube el certificado + clave (PEM). El backend los guarda CIFRADOS. */
  async uploadFiscalCertificate(certificatePem, privateKeyPem) {
    const response = await apiClient.post('/fiscal/config/certificate', { certificatePem, privateKeyPem });
    return response.data;
  }

  async getFiscalVouchers() {
    const response = await apiClient.get('/fiscal/vouchers');
    return Array.isArray(response.data) ? response.data : [];
  }

  /** Comprobante de una venta (para el ticket del POS). null si todavía no se emitió (204). */
  async getVoucherBySource(sourceType, sourceId) {
    const response = await apiClient.get('/fiscal/vouchers/by-source', { params: { sourceType, sourceId } });
    return response.data || null;
  }
}

export const kioskService = new KioskService();
