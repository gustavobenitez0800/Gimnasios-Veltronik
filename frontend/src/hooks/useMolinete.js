import { useState, useEffect, useCallback } from 'react';

/**
 * ¿Esta computadora puede hablarle al molinete, y está configurado?
 *
 * <p>Devuelve {@code disponible: false} en el navegador, en una versión vieja del escritorio
 * sin estos canales, y cuando todavía nadie cargó la IP o la clave. Las pantallas lo usan para
 * <b>no dibujar un botón que no puede funcionar</b>: un botón muerto en la ficha de un socio
 * hace que la recepcionista lo apriete tres veces y llame diciendo que el sistema falla.</p>
 */
export function useMolinete() {
  const api = typeof window !== 'undefined' ? window.electronAPI?.molinete : null;
  const [configurado, setConfigurado] = useState(false);

  useEffect(() => {
    if (!api) return;
    let vivo = true;
    api.getConfig()
      .then((c) => { if (vivo) setConfigurado(!!(c?.ip && c?.clave)); })
      .catch(() => { if (vivo) setConfigurado(false); });
    return () => { vivo = false; };
  }, [api]);

  /** Pone al equipo en modo captura para este socio. Hay que estar parado enfrente. */
  const sacarFoto = useCallback(
    (socioId) => (api ? api.sacarFoto(socioId) : Promise.resolve({ ok: false, error: 'Sin molinete.' })),
    [api]);

  return { disponible: !!api && configurado, sacarFoto };
}
