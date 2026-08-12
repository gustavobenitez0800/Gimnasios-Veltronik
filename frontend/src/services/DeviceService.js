// ============================================
// VELTRONIK - DEVICE SERVICE (Fase 1: equipos)
// ============================================
// Registro y bautizo de equipos (docs/FASE1-PLAN.md, ladrillos 1 y 2).
// El DNI de ESTE equipo viaja solo en cada request (X-Device-Id, apiClient).

import apiClient from '../lib/apiClient';

export const deviceService = {
  /** Equipos de la sucursal en curso (enrolados o vistos operándola). */
  async list() {
    const res = await apiClient.get('/core/devices');
    return res.data?.data || [];
  },

  /**
   * El bautizo: enrola ESTE equipo a la sucursal en curso.
   * @param {{role: 'CAJA'|'ENCARGADO', displayName: string, replaceActiveManager?: boolean}} payload
   * Si ya hay una Caja Madre activa y no se pidió reemplazo, el backend responde 409
   * con error ENCARGADO_ACTIVO — el caller decide si reintentar con replaceActiveManager.
   */
  async enroll({ role, displayName, replaceActiveManager = false }) {
    const res = await apiClient.post('/core/devices/enroll', { role, displayName, replaceActiveManager });
    // Credencial de equipo: viaja UNA sola vez, en la respuesta del enroll.
    // (Antes también se le pasaba al proceso principal de Electron para que el cerebro
    // local la usara; el circuito offline se dio de baja en la V43.)
    const deviceKey = res.data?.deviceKey;
    if (deviceKey) {
      try { localStorage.setItem('veltronik_device_key', deviceKey); } catch { /* sin storage: se re-enrola */ }
    }
    return res.data?.data;
  },

  /** Revoca el enrolamiento de un equipo (nunca borra su historial). */
  async revoke(deviceId) {
    await apiClient.post(`/core/devices/${deviceId}/revoke`);
  },

  /** Asigna el anillo de update: 0=piloto, 1=amigos, 2=todos, null=todos (ladrillo 7). */
  async setRing(deviceId, ring) {
    await apiClient.post(`/core/devices/${deviceId}/ring`, { ring });
  },
};
