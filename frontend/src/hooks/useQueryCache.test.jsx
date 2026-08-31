// @vitest-environment jsdom
// ============================================
// VELTRONIK - Tests de useQueryCache
// ============================================
// El depósito se prueba aparte (queryCacheStore.test.js). Acá se prueba lo que el hook
// DECIDE: cuándo pinta, cuándo pide y —sobre todo— cuándo prende el "cargando", que es
// lo que vacía la pantalla.
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useQueryCache, clearQueryCache } from './useQueryCache';

// Monta un hook de verdad y deja mirar lo que devolvió en cada render.
function montar(useHook) {
  const renders = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  function Sonda() {
    renders.push(useHook());
    return null;
  }

  act(() => { root.render(<Sonda />); });
  return {
    renders,
    ultimo: () => renders[renders.length - 1],
    desmontar: () => act(() => { root.unmount(); }),
  };
}

const esperar = () => act(async () => { await Promise.resolve(); });

describe('useQueryCache', () => {
  beforeEach(() => {
    clearQueryCache();
  });

  it('la primera vez no hay nada: pide y avisa que está cargando', async () => {
    const traer = vi.fn().mockResolvedValue(['ana']);
    const vista = montar(() => useQueryCache(['socios'], traer));

    expect(vista.renders[0].loading).toBe(true);
    expect(vista.renders[0].data).toBe(null);

    await esperar();

    expect(traer).toHaveBeenCalledTimes(1);
    expect(vista.ultimo().loading).toBe(false);
    expect(vista.ultimo().data).toEqual(['ana']);
    vista.desmontar();
  });

  it('la segunda visita pinta al instante y no vuelve a preguntar', async () => {
    const traer = vi.fn().mockResolvedValue(['ana']);
    const primera = montar(() => useQueryCache(['socios'], traer, { staleTime: 60000 }));
    await esperar();
    primera.desmontar();

    const segunda = montar(() => useQueryCache(['socios'], traer, { staleTime: 60000 }));

    // Sin spinner y CON datos ya en el primerísimo render: esto es "volver a la pantalla
    // es instantáneo". Y sin un pedido de más, porque lo que hay todavía sirve.
    expect(segunda.renders[0].loading).toBe(false);
    expect(segunda.renders[0].data).toEqual(['ana']);
    await esperar();
    expect(traer).toHaveBeenCalledTimes(1);
    segunda.desmontar();
  });

  // ⭐ EL BUG DEL MOSTRADOR (2026-08-31)
  //
  // La pantalla de Accesos se refresca sola cada 15 segundos llamando a invalidate(), y
  // invalidate BORRABA la entrada. El hook se encontraba sin caché, prendía `loading`, y
  // la lista de quién está adentro se reemplazaba por "Cargando..." en cada ciclo —
  // cuanto peor la conexión, más rato. Justo la pantalla que se estaba acelerando.
  //
  // Refrescar tiene que ser: seguir mostrando lo que hay, y pedir por detrás.
  it('refrescar NO deja la pantalla en blanco: sigue mostrando mientras pide', async () => {
    const traer = vi.fn()
      .mockResolvedValueOnce(['ana'])
      .mockResolvedValueOnce(['ana', 'beto']);

    const vista = montar(() => useQueryCache(['mostrador'], traer, { staleTime: 60000 }));
    await esperar();
    expect(vista.ultimo().data).toEqual(['ana']);

    const antes = vista.renders.length;
    act(() => { vista.ultimo().invalidate(); });

    // Ni un solo render con el spinner prendido entre el clic y la respuesta.
    const durante = vista.renders.slice(antes);
    expect(durante.every((r) => r.loading === false)).toBe(true);
    expect(durante.every((r) => r.data !== null)).toBe(true);

    await esperar();
    expect(traer).toHaveBeenCalledTimes(2);
    expect(vista.ultimo().data).toEqual(['ana', 'beto']);
    vista.desmontar();
  });

  it('cambiar de clave a algo ya cacheado muestra lo que corresponde, no lo anterior', async () => {
    const traer = vi.fn()
      .mockResolvedValueOnce(['página 0'])
      .mockResolvedValueOnce(['página 1']);

    let pagina = 0;
    const vista = montar(() => useQueryCache(['socios', pagina], traer, { staleTime: 60000 }));
    await esperar();

    pagina = 1;
    act(() => { vista.ultimo().invalidate(); }); // fuerza el re-render con la clave nueva
    await esperar();
    expect(vista.ultimo().data).toEqual(['página 1']);

    // Y al volver a la 0, que ya está guardada, no puede quedar pintada la 1.
    pagina = 0;
    act(() => { vista.ultimo().invalidate(); });
    expect(vista.ultimo().data).toEqual(['página 0']);
    vista.desmontar();
  });
});
