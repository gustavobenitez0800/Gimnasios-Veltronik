// ============================================
// VELTRONIK - RESUMEN DEL DUEÑO (todas sus sucursales)
// ============================================
// El único dato del sistema que cruza sucursales. El backend arma la lista de cuáles sumar
// desde las membresías OWNER del usuario — desde acá NO se manda ninguna lista, y no hay
// forma de pedirle el resumen de sucursales ajenas.

import apiClient from '../lib/apiClient';

export const ownerInsightsService = {
  /**
   * Plata cobrada, altas y bajas de cada sucursal, mes a mes.
   *
   * @param {number} months cuántos meses hacia atrás (incluido el actual)
   * @returns {Promise<{months: string[], branches: Array, totals: Array,
   *                    graceDays: number, provisionalFrom: string}>}
   */
  async forOwner(months = 12) {
    const response = await apiClient.get('/gym/insights/owner', { params: { months } });
    return response.data;
  },
};
