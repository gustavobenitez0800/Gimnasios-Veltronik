// ============================================
// VELTRONIK - LA CLAVE PARA COBRAR (el servidor)
// ============================================
// Ver `contexts/ClaveDeCobroContext.jsx` (la que la pide) y `ClaveDeCobroService.java`.

import apiClient from '../lib/apiClient';

class ClaveDeCobroService {
  /** ¿Esta sucursal pide clave para cobrar? */
  async estado() {
    const { data } = await apiClient.get('/gym/clave-de-cobro', { timeout: 8000 });
    return !!data?.activa;
  }

  /** La pone o la cambia (dueño o admin). Si ya había una, hay que mandar la actual. */
  async fijar(nueva, actual = null) {
    await apiClient.put('/gym/clave-de-cobro', { nueva, actual });
  }

  /** La saca (dueño o admin), sabiendo la actual. */
  async sacar(clave) {
    await apiClient.post('/gym/clave-de-cobro/sacar', { clave });
  }

  /** Comprueba la clave. Tira el error del servidor si no coincide (o si hubo muchos intentos). */
  async verificar(clave) {
    await apiClient.post('/gym/clave-de-cobro/verificar', { clave }, { timeout: 8000 });
  }
}

export const claveDeCobroService = new ClaveDeCobroService();
