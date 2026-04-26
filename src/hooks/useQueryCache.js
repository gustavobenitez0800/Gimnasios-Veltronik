import { useState, useEffect } from 'react';

// Cache global en memoria
// Estructura: { [key]: { data: any, timestamp: number } }
const queryCache = new Map();

/**
 * Hook para obtener datos con caché (Stale-While-Revalidate).
 * Si los datos están en caché, los devuelve inmediatamente (0ms load).
 * Si están obsoletos, los devuelve pero recarga en background.
 *
 * @param {string|array} queryKey - Clave única para la caché (puede ser un array que se serializará)
 * @param {Function} fetchFn - Función asíncrona que retorna los datos
 * @param {Object} options - Opciones de configuración
 * @param {number} options.staleTime - Tiempo en ms antes de considerar los datos obsoletos (default: 5 min)
 * @returns {{ data: any, loading: boolean, error: Error|null, mutate: Function, isFetching: boolean }}
 */
export function useQueryCache(queryKey, fetchFn, options = {}) {
  const { staleTime = 5 * 60 * 1000 } = options;

  // Serializar la clave si es un array
  const key = Array.isArray(queryKey) ? JSON.stringify(queryKey) : queryKey;

  // Obtener estado inicial desde la caché (sincrónico)
  const cachedData = queryCache.get(key);
  const initialData = cachedData ? cachedData.data : null;
  const hasValidCache = cachedData !== undefined;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(!hasValidCache); // Solo muestra loading si NO hay caché
  const [isFetching, setIsFetching] = useState(false); // Background fetching
  const [error, setError] = useState(null);

  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      const cached = queryCache.get(key);
      const isStale = !cached || (Date.now() - cached.timestamp > staleTime);

      // Si no hay caché en absoluto, bloqueamos la UI con `loading`
      if (!cached) {
        setLoading(true);
      }

      // Si los datos están obsoletos o no existen, pedimos nuevos a la DB en background
      if (isStale) {
        setIsFetching(true);
        try {
          const result = await fetchFn();
          if (isMounted) {
            queryCache.set(key, { data: result, timestamp: Date.now() });
            setData(result);
            setError(null);
          }
        } catch (err) {
          if (isMounted) {
            console.error('useQueryCache error:', err);
            setError(err);
          }
        } finally {
          if (isMounted) {
            setLoading(false);
            setIsFetching(false);
          }
        }
      } else {
        // Tenemos caché fresco, aseguramos el estado
        if (isMounted) {
          setData(cached.data);
          setLoading(false);
          setIsFetching(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, trigger]);

  /**
   * Actualiza el valor de la caché manualmente (ej: después de una mutación CRUD)
   */
  const mutate = (newData) => {
    queryCache.set(key, { data: newData, timestamp: Date.now() });
    setData(newData);
  };

  /**
   * Invalida la caché para forzar un refetch inmediato
   */
  const invalidate = () => {
    queryCache.delete(key);
    setTrigger(t => t + 1);
  };

  return { data, loading, error, isFetching, mutate, invalidate };
}

/**
 * Función auxiliar para limpiar la caché global (útil al cambiar de usuario/organización)
 */
export function clearQueryCache() {
  queryCache.clear();
}
