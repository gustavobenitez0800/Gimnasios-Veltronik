import apiClient from '../lib/apiClient';

/**
 * Servicio del vertical Canchas (FUTBOL_5).
 *
 * El backend habla camelCase (DTOs del módulo courts) y la UI lo consume tal cual:
 * a diferencia del módulo gym (que arrastra snake_case histórico), acá nacemos
 * alineados — sin adaptador de nombres.
 *
 * Horarios: LocalDateTime de Java ↔ strings ISO sin zona ("2026-06-10T21:00:00").
 * Todo el dominio es hora local de Argentina, igual que el resto del sistema.
 */
class CourtService {
  // ─── Grilla ───

  /** Un solo round-trip: { date, settings, courts, bookings } del día. */
  async getGrid(dateISO) {
    const response = await apiClient.get('/courts/bookings/grid', {
      params: dateISO ? { date: dateISO } : {},
    });
    return response.data;
  }

  /** Resumen del día: turnos, ocupación, plata cobrada/pendiente (barra + caja). */
  async getSummary(dateISO) {
    const response = await apiClient.get('/courts/bookings/summary', {
      params: dateISO ? { date: dateISO } : {},
    });
    return response.data;
  }

  // ─── Analítica (dueño/admin) ───

  /** Dashboard del complejo: KPIs, ingresos, ocupación, predicción IA. */
  async getDashboard() {
    const response = await apiClient.get('/courts/analytics/dashboard');
    return response.data;
  }

  /** Datos para exportar reportes en un rango de fechas. */
  async getReport(from, to) {
    const response = await apiClient.get('/courts/analytics/report', { params: { from, to } });
    return response.data;
  }

  // ─── Turnos ───

  async createBooking(booking) {
    const response = await apiClient.post('/courts/bookings', booking);
    return response.data;
  }

  async updateBooking(id, updates) {
    const response = await apiClient.put(`/courts/bookings/${id}`, updates);
    return response.data;
  }

  /** Drag & drop. Tira 409 si el slot destino está ocupado. */
  async moveBooking(id, courtId, startAt) {
    const response = await apiClient.patch(`/courts/bookings/${id}/move`, { courtId, startAt });
    return response.data;
  }

  /** Seña recibida → CONFIRMED. method: 'CASH' | 'TRANSFER' | 'MP' (default efectivo). */
  async confirmBooking(id, method) {
    const response = await apiClient.post(`/courts/bookings/${id}/confirm`, method ? { method } : {});
    return response.data;
  }

  async cancelBooking(id) {
    const response = await apiClient.post(`/courts/bookings/${id}/cancel`);
    return response.data;
  }

  /** Cerrar turno cobrando el saldo. payload: { amountPaid, method }. */
  async completeBooking(id, payload) {
    const response = await apiClient.post(`/courts/bookings/${id}/complete`, payload || {});
    return response.data;
  }

  async noShowBooking(id) {
    const response = await apiClient.post(`/courts/bookings/${id}/no-show`);
    return response.data;
  }

  // ─── Canchas ───

  async getCourts() {
    const response = await apiClient.get('/courts');
    return Array.isArray(response.data) ? response.data : [];
  }

  async createCourt(court) {
    const response = await apiClient.post('/courts', court);
    return response.data;
  }

  async updateCourt(id, updates) {
    const response = await apiClient.put(`/courts/${id}`, updates);
    return response.data;
  }

  async deleteCourt(id) {
    await apiClient.delete(`/courts/${id}`);
    return true;
  }

  // ─── Clientes ───

  async getCustomers(query) {
    const response = await apiClient.get('/courts/customers', {
      params: query ? { q: query } : {},
    });
    return Array.isArray(response.data) ? response.data : [];
  }

  async createCustomer(customer) {
    const response = await apiClient.post('/courts/customers', customer);
    return response.data;
  }

  async updateCustomer(id, updates) {
    const response = await apiClient.put(`/courts/customers/${id}`, updates);
    return response.data;
  }

  async deleteCustomer(id) {
    await apiClient.delete(`/courts/customers/${id}`);
    return true;
  }

  // ─── Turnos fijos ───

  async getRecurring() {
    const response = await apiClient.get('/courts/recurring');
    return Array.isArray(response.data) ? response.data : [];
  }

  async createRecurring(recurring) {
    const response = await apiClient.post('/courts/recurring', recurring);
    return response.data;
  }

  async updateRecurring(id, updates) {
    const response = await apiClient.put(`/courts/recurring/${id}`, updates);
    return response.data;
  }

  async deleteRecurring(id) {
    await apiClient.delete(`/courts/recurring/${id}`);
    return true;
  }

  // ─── Configuración y precios ───

  async getSettings() {
    const response = await apiClient.get('/courts/settings');
    return response.data;
  }

  async updateSettings(updates) {
    const response = await apiClient.put('/courts/settings', updates);
    return response.data;
  }

  async getPriceRules() {
    const response = await apiClient.get('/courts/price-rules');
    return Array.isArray(response.data) ? response.data : [];
  }

  async createPriceRule(rule) {
    const response = await apiClient.post('/courts/price-rules', rule);
    return response.data;
  }

  async deletePriceRule(id) {
    await apiClient.delete(`/courts/price-rules/${id}`);
    return true;
  }
}

export const courtService = new CourtService();
