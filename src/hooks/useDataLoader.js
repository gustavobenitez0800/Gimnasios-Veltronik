// ============================================
// VELTRONIK - useDataLoader Hook
// ============================================
// Hook genérico para cargar datos asincrónicos.
// Maneja estados de loading, error y reload.
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * @param {Function} fetchFn — Función async que retorna los datos
 * @param {Array} deps — Dependencias para re-fetch automático
 * @param {object} options — { autoLoad: true, initialData: null }
 */
export function useDataLoader(fetchFn, deps = [], options = {}) {
  const { autoLoad = true, initialData = null } = options;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState(null);

  // Ref para evitar actualizaciones en componentes desmontados
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      if (mountedRef.current) {
        setData(result);
      }
    } catch (err) {
      console.error('useDataLoader error:', err);
      if (mountedRef.current) {
        setError(err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchFn]);

  useEffect(() => {
    mountedRef.current = true;
    if (autoLoad) {
      load();
    }
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, ...deps]);

  return { data, loading, error, reload: load, setData };
}
