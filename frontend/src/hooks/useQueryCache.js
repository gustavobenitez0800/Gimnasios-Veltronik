import { useState, useEffect, useCallback } from 'react';
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
/**
 * Cuánto se muestra "Cargando..." como máximo.
 *
 * <p>12 segundos es más que el timeout de cualquier pedido de la app (el del mostrador son
 * 8). Si a esa altura no volvió nada, no es que esté tardando: es que algo se trabó, y la
 * pantalla tiene que decirlo en vez de girar para siempre.</p>
 */
const TECHO_CARGANDO_MS = 12000;

/**
 * Los pedidos que todavía no volvieron, por clave.
 *
 * ⚠️ ESTO EVITA UN BUCLE DEL QUE NO SE SALE. El mostrador se refresca cada 15 segundos y un
 * pedido puede tardar hasta 25 (5 s esperando la sesión + 20 s de timeout). En una conexión
 * lenta eso significa que el refresco arranca uno nuevo ANTES de que el anterior termine: se
 * apilan, cada uno suma carga sobre la conexión que ya estaba lenta, y ninguno llega a
 * contar qué pasó, porque el efecto que lo pidió ya se desarmó y su error se descarta.
 *
 * La pantalla queda sin datos y sin poder decir por qué. Se vio así en el gimnasio: "el
 * servidor no contestó a tiempo", para siempre, aunque el problema fuera otro.
 *
 * Compartiendo el pedido en vuelo hay UNO solo, y su resultado —o su error— le llega a todos
 * los que lo estaban esperando.
 */
const enVuelo = new Map();

/**
 * @returns {{pedido: Promise, empezo: number}} `empezo` es cuándo arrancó EL PEDIDO, no
 *          cuándo esta pantalla se enganchó a él.
 *
 * ⚠️ La diferencia importa. Al compartir el pedido en vuelo, quien se engancha tarde mide
 * solo lo que faltaba: un pedido que tardó 8 segundos se reportaba como 1,6, y ese número
 * es justamente el que usamos para saber si el problema es la conexión o el servidor.
 */
function pedirUnaSolaVez(key, fetchFn) {
  const yaVa = enVuelo.get(key);
  if (yaVa) return yaVa;

  const registro = { empezo: Date.now() };
  registro.pedido = Promise.resolve()
    .then(fetchFn)
    .finally(() => { enVuelo.delete(key); });

  enVuelo.set(key, registro);
  return registro;
}

/** Solo para los tests: nadie debería tener que limpiar esto a mano. */
export function _olvidarPedidosEnVuelo() {
  enVuelo.clear();
}

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
  // Cuánto tardó el último pedido en volver, haya salido bien o mal. Sin este número, un
  // "no anda" desde un gimnasio es imposible de distinguir de otro: no es lo mismo fallar
  // a los 300 ms que a los 20 segundos.
  const [demoraMs, setDemoraMs] = useState(null);

  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;

    // ⚠️ EL "CARGANDO..." NO PUEDE SER ETERNO.
    //
    // Antes `loading` se apagaba solo en el `finally` del fetch, y ese `finally` corre
    // `if (isMounted)`. Si el efecto se volvía a disparar con un pedido en vuelo —o si el
    // pedido no se resolvía nunca, que pasa cuando algo se cuelga antes de salir a la red—
    // el spinner quedaba puesto para siempre. Sin error, sin nada en consola, sin nada que
    // reintentar. Exactamente lo que se vio en el gimnasio: "En el Gimnasio · Cargando..."
    // que no salía nunca.
    //
    // Este reloj no cancela el pedido: solo deja de MENTIR que está cargando. Lo que haya
    // que mostrar —la caché vieja, o el aviso de que no se pudo consultar— aparece, y si
    // el pedido termina más tarde, se pinta igual.
    const dejarDeMostrarCargando = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, TECHO_CARGANDO_MS);

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
        const { pedido, empezo } = pedirUnaSolaVez(key, fetchFn);
        try {
          const result = await pedido;
          if (isMounted) setDemoraMs(Date.now() - empezo);
          if (isMounted) {
            writeEntry(key, ns, result);
            setData(result);
            setError(null);
          }
        } catch (err) {
          if (isMounted) {
            console.error('useQueryCache error:', err);
            setDemoraMs(Date.now() - empezo);
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
      clearTimeout(dejarDeMostrarCargando);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, trigger]);

  /**
   * Actualiza el valor de la caché manualmente (ej: después de una mutación CRUD)
   */
  // ⚠️ ESTAS DOS FUNCIONES NO PUEDEN CAMBIAR DE IDENTIDAD EN CADA RENDER.
  //
  // Las pantallas las usan como dependencia de sus efectos. Si son nuevas cada vez, el
  // efecto se desarma y se rearma en cada render, y todo temporizador que viva adentro
  // vuelve a empezar de cero. El mostrador se refresca solo cada 15 segundos: en una
  // pantalla que se redibuja más seguido que eso, ese refresco NO LLEGABA NUNCA. Alguien
  // entraba por el QR o desde la otra terminal y en el mostrador no aparecía.
  const mutate = useCallback((newData) => {
    writeEntry(key, ns, newData);
    setData(newData);
  }, [key, ns]);

  /**
   * Invalida la caché para forzar un refetch inmediato.
   *
   * MARCA la entrada como vieja, NO la borra: lo que hay en pantalla se sigue viendo
   * mientras se vuelve a pedir por detrás. Borrarla dejaba al hook sin caché, y sin
   * caché se prende el `loading` — el mostrador se refresca solo cada 15 segundos, así
   * que la lista de quién está adentro se reemplazaba por un spinner en cada ciclo (y
   * cuanto peor la conexión, más rato). Justo la pantalla que se quería acelerar.
   */
  const invalidate = useCallback(() => {
    markStale(key);
    setTrigger(t => t + 1);
  }, [key]);

  return { data, loading, error, isFetching, demoraMs, mutate, invalidate };
}
