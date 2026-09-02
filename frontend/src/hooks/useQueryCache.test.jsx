// @vitest-environment happy-dom
//
// happy-dom y no jsdom: jsdom arrastra undici, que usa `markAsUncloneable` de
// worker_threads SIN protección, y esa función existe recién en Node 22. CI corre en
// Node 20 a propósito —el mismo que arma el instalador en release.yml— así que jsdom
// rompía ahí aunque pasara en la máquina de desarrollo.
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
    // Dibujar de nuevo sin cambiar nada: es lo que hace una pantalla viva todo el día.
    redibujar: () => act(() => { root.render(<Sonda />); }),
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

describe('el "Cargando..." no puede ser eterno', () => {
  // ⭐ EL BUG QUE SE VIO EN EL GIMNASIO: "En el Gimnasio · Cargando..." que no salía nunca.
  //
  // `loading` se apagaba solo en el `finally` del fetch, y ese `finally` corre
  // `if (isMounted)`. Si el pedido no se resolvía —algo trabado ANTES de salir a la red, que
  // el timeout de axios no cubre— o si el efecto se volvía a disparar con un pedido en
  // vuelo, el spinner quedaba puesto para siempre. Sin error, sin nada en consola, sin nada
  // que reintentar.
  //
  // Y lo peor: el aviso de "no pudimos consultar" solo se muestra cuando `loading` es
  // falso. O sea que la pantalla no tenía forma de contar lo que estaba pasando.
  it('si el pedido no vuelve nunca, deja de decir que carga', async () => {
    vi.useFakeTimers();
    try {
      clearQueryCache();
      // Un fetch que no se resuelve jamás.
      const renders = montar(() => useQueryCache('colgado', () => new Promise(() => {})));

      expect(renders.ultimo().loading, 'arranca cargando, que está bien').toBe(true);

      await act(async () => { await vi.advanceTimersByTimeAsync(13000); });

      expect(renders.ultimo().loading, 'a los 12 s deja de mentir que carga').toBe(false);
      expect(renders.ultimo().data, 'y no inventa datos: sigue sin haber nada').toBe(null);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('el "Cargando..." no puede ser eterno', () => {
  // ⭐ EL BUG QUE SE VIO EN EL GIMNASIO: "En el Gimnasio · Cargando..." que no salía nunca.
  //
  // `loading` se apagaba solo en el `finally` del fetch, y ese `finally` corre
  // `if (isMounted)`. Si el pedido no se resolvía —algo trabado ANTES de salir a la red, que
  // el timeout de axios no cubre— o si el efecto se volvía a disparar con un pedido en
  // vuelo, el spinner quedaba puesto para siempre. Sin error, sin nada en consola, sin nada
  // que reintentar.
  //
  // Y lo peor: el aviso de "no pudimos consultar" solo se muestra cuando `loading` es
  // falso. O sea que la pantalla no tenía forma de contar lo que estaba pasando.
  it('si el pedido no vuelve nunca, deja de decir que carga', async () => {
    vi.useFakeTimers();
    try {
      clearQueryCache();
      // Un fetch que no se resuelve jamás.
      const renders = montar(() => useQueryCache('colgado', () => new Promise(() => {})));

      expect(renders.ultimo().loading, 'arranca cargando, que está bien').toBe(true);

      await act(async () => { await vi.advanceTimersByTimeAsync(13000); });

      expect(renders.ultimo().loading, 'a los 12 s deja de mentir que carga').toBe(false);
      expect(renders.ultimo().data, 'y no inventa datos: sigue sin haber nada').toBe(null);
    } finally {
      vi.useRealTimers();
    }
  });

  // ⭐ EL BUG DEL REFRESCO QUE NUNCA LLEGABA
  //
  // El mostrador se refresca solo cada 15 segundos, y ese intervalo vive en un efecto que
  // depende de `invalidate`. Si `invalidate` es una función nueva en cada render, el efecto
  // se desarma y se rearma en cada render, y el intervalo vuelve a empezar de cero. Una
  // pantalla que se dibuja de nuevo antes de los 15 segundos NUNCA llega a refrescarse.
  //
  // En el gimnasio se veía así: alguien entra por el QR, o desde la otra terminal, y en el
  // mostrador no aparece nunca. Los datos entran; la pantalla no los muestra.
  it('invalidate no cambia de identidad entre renders', async () => {
    const vista = montar(() => useQueryCache(['estable'], () => Promise.resolve(1)));
    await esperar();

    const antes = vista.ultimo().invalidate;
    vista.redibujar();

    expect(vista.ultimo().invalidate, 'si cambia, todo efecto que dependa de ella se rearma en cada render').toBe(antes);
  });

  it('mutate tampoco cambia de identidad entre renders', async () => {
    // Mismo riesgo: se usa como dependencia de efectos y de useMemo.
    const vista = montar(() => useQueryCache(['estable2'], () => Promise.resolve(1)));
    await esperar();

    const antes = vista.ultimo().mutate;
    vista.redibujar();

    expect(vista.ultimo().mutate).toBe(antes);
  });

  // ⭐ EL PEDIDO QUE NUNCA LLEGABA A TERMINAR
  //
  // El mostrador se refresca cada 15 segundos y el pedido puede tardar hasta 25 (5 s de
  // sesión + 20 s de timeout). O sea: en una conexión lenta, el refresco arranca un pedido
  // nuevo ANTES de que el anterior termine. El anterior queda huérfano —su efecto ya se
  // desarmó— así que cuando por fin falla, ese error se descarta.
  //
  // El resultado es un bucle del que no se sale: cada 15 segundos empieza otro pedido, se
  // apilan, ninguno llega a contar qué pasó, y la pantalla nunca puede mostrar un error de
  // verdad. Encima cada intento nuevo suma carga sobre la conexión que ya estaba lenta.
  //
  // En el gimnasio se vio exactamente así: "sin respuesta", para siempre.
  it('no arranca un pedido nuevo si el anterior sigue en vuelo', async () => {
    let cuantos = 0;
    const traer = () => { cuantos++; return new Promise(() => {}); };
    const vista = montar(() => useQueryCache(['lento'], traer));
    await esperar();

    // El refresco de los 15 segundos, dos veces, con el primer pedido todavía colgado.
    await act(async () => { vista.ultimo().invalidate(); });
    await act(async () => { vista.ultimo().invalidate(); });

    expect(cuantos, 'apilar pedidos empeora justo la conexión que ya estaba lenta').toBe(1);
  });

  it('el error de un pedido lento se muestra aunque haya habido un refresco en el medio', async () => {
    // Esta es la consecuencia que importa: si el error se pierde, la pantalla no puede
    // decir NUNCA qué falló, y desde afuera no hay manera de arreglarlo.
    let fallar;
    const traer = () => new Promise((_, rechazar) => { fallar = rechazar; });
    const vista = montar(() => useQueryCache(['lento2'], traer));
    await esperar();

    await act(async () => { vista.ultimo().invalidate(); });
    await act(async () => { fallar(new Error('tardó una eternidad')); await Promise.resolve(); });

    expect(vista.ultimo().error, 'el error quedó huérfano y nadie lo vio').toBeTruthy();
  });

  // ⭐ EL NÚMERO QUE USAMOS PARA DIAGNOSTICAR NO PUEDE MENTIR
  //
  // Al compartir el pedido en vuelo, quien se engancha tarde mediría solo lo que faltaba.
  // Paso de verdad: un pedido que se agoto a los 8 segundos se reporto como 1,6 — y con ese
  // numero el diagnostico apuntaba a cualquier lado menos al problema real.
  it('informa lo que tardó EL PEDIDO, no lo que esperó quien se enganchó tarde', async () => {
    vi.useFakeTimers();
    try {
      let terminar;
      const traer = () => new Promise((r) => { terminar = r; });
      const vista = montar(() => useQueryCache(['medido'], traer));
      await act(async () => {});

      // Cinco segundos con el pedido en vuelo, y recién ahí llega el refresco.
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      await act(async () => { vista.ultimo().invalidate(); });

      await act(async () => { terminar(['ok']); await Promise.resolve(); });

      expect(vista.ultimo().demoraMs,
        'midió desde que se enganchó, no desde que arrancó el pedido').toBeGreaterThanOrEqual(5000);
    } finally {
      vi.useRealTimers();
    }
  });
});
