import apiClient from '../lib/apiClient';

/**
 * Borrado de la cuenta entera.
 *
 * <p>Va contra {@code /api/account} y NO contra un gimnasio: lo que se borra es la persona,
 * y sus gimnasios se van con ella. Un dueño con tres sucursales borra las tres.</p>
 *
 * <p>Estas rutas están fuera del filtro de acceso del backend a propósito: durante los 30
 * días de gracia el sistema está cerrado, pero el arrepentimiento tiene que seguir
 * funcionando. Si no, la única puerta para cancelar el borrado estaría cerrada con llave por
 * el mismo borrado que se quiere cancelar.</p>
 */
class AccountService {
  /** ¿Mi cuenta está marcada para borrarse? Lo pregunta el Lobby en cada entrada. */
  async getDeletionStatus() {
    const { data } = await apiClient.get('/account/deletion');
    return data;
  }

  /** Pide el borrado: corta el cobro y arranca la cuenta regresiva de 30 días. */
  async requestDeletion() {
    const { data } = await apiClient.post('/account/deletion');
    return data;
  }

  /** El arrepentimiento. */
  async cancelDeletion() {
    const { data } = await apiClient.delete('/account/deletion');
    return data;
  }
}

export const accountService = new AccountService();
