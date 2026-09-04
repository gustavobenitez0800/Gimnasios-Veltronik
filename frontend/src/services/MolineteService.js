import apiClient from '../lib/apiClient';

/**
 * El molinete facial: lo que Veltronik sabe y el equipo necesita.
 *
 * <p>Acá NO se le habla al equipo. El equipo está en la red local del gimnasio y solo el
 * proceso principal de Electron le llega (`window.electronAPI.molinete`). Esta clase habla
 * con el backend; el puente de Electron habla con el aparato. La pantalla junta las dos
 * puntas: baja el padrón de acá y se lo pasa a aquel.</p>
 */
class MolineteService {

  /**
   * La lista de socios con el veredicto ya resuelto: quién es cada uno y si hoy puede pasar.
   *
   * <p>El "puede pasar" lo decide el backend a propósito. Es la misma regla que usa el
   * mostrador y el check-in por QR, y una segunda cuenta de fechas del lado del escritorio
   * terminaría desincronizada de la primera el día que cambie cualquiera de las dos.</p>
   */
  async getPadron(opts = {}) {
    const response = await apiClient.get('/gym/molinete/padron', { timeout: 20000, ...opts });
    return response.data;
  }
}

export const molineteService = new MolineteService();
