import apiClient from '../lib/apiClient';

/**
 * Los aranceles del gimnasio: qué vende, a cuánto, y qué otorga cada plan.
 *
 * Un arancel da DOS cosas y puede dar las dos a la vez: días de cobertura y cupo de visitas.
 * "Pase libre 1 mes / 30 clases" es un mes con tope de treinta entradas.
 */
class PlanService {
  /** Todos, incluidos los dados de baja. Para la pantalla de configuración. */
  async getAll() {
    const { data } = await apiClient.get('/gym/plans');
    return data;
  }

  /** Solo los que se venden hoy. Es lo que alimenta el selector al cobrar. */
  async getVigentes() {
    const { data } = await apiClient.get('/gym/plans/vigentes');
    return data;
  }

  async create(plan) {
    const { data } = await apiClient.post('/gym/plans', plan);
    return data;
  }

  async update(id, plan) {
    const { data } = await apiClient.put(`/gym/plans/${id}`, plan);
    return data;
  }

  /**
   * Da de baja el arancel. El backend NO lo borra: hay pagos viejos que lo nombran, y
   * borrarlo dejaría esa historia sin explicación.
   */
  async darDeBaja(id) {
    await apiClient.delete(`/gym/plans/${id}`);
    return true;
  }

  async reactivar(id) {
    const { data } = await apiClient.post(`/gym/plans/${id}/reactivar`);
    return data;
  }
}

export const planService = new PlanService();
export default planService;
