// ============================================
// VELTRONIK - useLoadOnMount Hook
// ============================================
// "Traé los datos al abrir la página, y dejame volver a traerlos después de
// guardar algo." Era el patrón más copiado del proyecto: seis páginas del kiosco
// tenían el mismo useCallback + try/catch/finally + useEffect, cambiando solo el
// texto del error.
//
// El hook se queda con el `loading` y con el aviso de error. NO se queda con los
// datos: varias páginas piden tres cosas en paralelo y las reparten en tres
// estados distintos, así que quién guarda qué sigue siendo decisión de la página.
//
// Para cachear entre visitas está `useQueryCache`, que es otra cosa: acá se pide
// SIEMPRE de nuevo, que es lo que corresponde en un mostrador (stock y caja no
// pueden salir de una copia vieja).
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../contexts/ToastContext';

/**
 * @param {Function} load — async, sin argumentos. NO hace falta envolverla en useCallback:
 *   el hook se queda siempre con la última versión (ver `loadRef`), así que redefinirla en
 *   cada render no dispara recargas.
 * @param {string} errorMessage — qué decirle al usuario si falla. El mensaje del backend,
 *   cuando viene, gana: es más específico que cualquier texto que pongamos acá.
 * @returns {{ loading: boolean, reload: Function }}
 */
export function useLoadOnMount(load, errorMessage) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);

  // "Latest ref": la función llega nueva en cada render (es una closure sobre los setState
  // de la página). Guardarla en un ref permite que `reload` sea estable y que el efecto de
  // abajo corra UNA sola vez, sin obligar a cada página a acordarse del useCallback.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  const reload = useCallback(async () => {
    try {
      await loadRef.current();
    } catch (err) {
      showToast(err?.response?.data?.message || err.message || errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, errorMessage]);

  useEffect(() => { reload(); }, [reload]);

  return { loading, reload };
}
