import { useState, useEffect } from 'react';
import { readEntry, writeEntry, markStale, invalidateQueries, clearQueryCache } from './queryCacheStore';

// El Map vive en ./queryCacheStore (se puede probar sin React, y se puede invalidar
// desde fuera de un componente: cobrar un pago vuelve vieja la lista de Socios).
export { invalidateQueries, clearQueryCache };

/**
 * Hook para obtener datos con caché (Stale-While-Revalidate).
 * Si los datos están en caché, los devuelve inmediatamente (0ms load).
 * Si están obsoletos, los devuelve pero recarga en background.
 *
 * @param {string|array} queryKey - Clave única para la caché (puede ser un array que se serializará).
 *                                  El PRIMER elemento del array es el módulo: es lo que mira
 *                                  `invalidateQueries('members')` para marcar viejas todas sus páginas.
 * @param {Function} fetchFn - Función asíncrona que retorna los datos
 * @param {Object} options - Opciones de configuración
 * @param {number} options.staleTime - Tiempo en ms antes de considerar los datos obsoletos (default: 5 min)
 * @returns {{ data: any, loading: boolean, error: Error|null, mutate: Function, isFetching: boolean }}
 */
export function useQueryCache(queryKey, fetchFn, options = {}) {
  const { staleTime = 5 * 60 * 1000 } = options;

  // Serializar la clave si es un array
  const key = Array.isArray(queryKey) ? JSON.stringify(queryKey) : queryKey;
  const ns = Array.isArray(queryKey) ? String(queryKey[0]) : queryKey;

  // Obtener estado inicial desde la caché (sincrónico)
  const cachedData = readEntry(key);
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
      const cached = readEntry(key);
      const isStale = !cached || (Date.now() - cached.timestamp > staleTime);

      // Si no hay caché en absoluto, bloqueamos la UI con `loading`
      if (!cached) {
        setLoading(true);
      } else {
        // Y si SÍ hay, se pinta ya mismo. Sin esto, al cambiar de clave (otra página,
        // otra búsqueda) quedaba en pantalla el resultado de la clave anterior hasta
        // que volviera el fetch, aunque el nuevo ya estuviera cacheado.
        setData(cached.data);
        setLoading(false);
      }

      // Si los datos están obsoletos o no existen, pedimos nuevos a la DB en background
      if (isStale) {
        setIsFetching(true);
        try {
          const result = await fetchFn();
          if (isMounted) {
            writeEntry(key, ns, result);
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
    writeEntry(key, ns, newData);
    setData(newData);
  };

  /**
   * Invalida la caché para forzar un refetch inmediato.
   *
   * MARCA la entrada como vieja, NO la borra: lo que hay en pantalla se sigue viendo
   * mientras se vuelve a pedir por detrás. Borrarla dejaba al hook sin caché, y sin
   * caché se prende el `loading` — el mostrador se refresca solo cada 15 segundos, así
   * que la lista de quién está adentro se reemplazaba por un spinner en cada ciclo (y
   * cuanto peor la conexión, más rato). Justo la pantalla que se quería acelerar.
   */
  const invalidate = () => {
    markStale(key);
    setTrigger(t => t + 1);
  };

  return { data, loading, error, isFetching, mutate, invalidate };
}
