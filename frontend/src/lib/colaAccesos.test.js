// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests de la cola de accesos
// ============================================
// Registrar un acceso NO es "grabar una entrada": el servidor deduce si es entrada o salida
// mirando el estado del socio. Por eso una cola ingenua es PELIGROSA — un reintento no
// duplica, INVIERTE: el socio queda "afuera" sin haberse ido. Ese bug ya apareció dos veces
// en este proyecto.
//
// Lo que se prueba acá son las tres reglas que lo vuelven seguro, y el caso que las une:
// el pedido que salió y del que nunca volvió respuesta.
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  encolar, pendientes, cuantosPendientes, vaciar, esDefinitivo,
  momentoLocal, disponible, olvidarCola, resumenDeCola,
} from './colaAccesos';

const GIMNASIO = '11111111-1111-1111-1111-111111111111';

/** El núcleo, de mentira: la misma cola pero en un array. */
function nucleoFalso() {
  let filas = [];
  return {
    filas: () => filas,
    encolar: vi.fn(async (item) => {
      if (filas.some((f) => f.clientRef === item.clientRef)) return { ok: true };
      filas.push({ ...item, intentos: 0, ultimoError: null, creadoEn: Date.now() + filas.length });
      return { ok: true, clientRef: item.clientRef };
    }),
    pendientes: vi.fn(async (tenantId) => filas
      .filter((f) => !tenantId || !f.tenantId || f.tenantId === tenantId)
      .slice()
      .sort((a, b) => (a.ocurridoEn < b.ocurridoEn ? -1 : a.ocurridoEn > b.ocurridoEn ? 1 : a.creadoEn - b.creadoEn))),
    contar: vi.fn(async () => filas.length),
    sacar: vi.fn(async (ref) => { filas = filas.filter((f) => f.clientRef !== ref); return true; }),
    anotarFallo: vi.fn(async (ref, msg) => {
      const f = filas.find((x) => x.clientRef === ref);
      if (f) { f.intentos += 1; f.ultimoError = msg; }
      return true;
    }),
    olvidar: vi.fn(async () => { filas = []; return true; }),
  };
}

let cola;

beforeEach(() => {
  cola = nucleoFalso();
  window.electronAPI = { nucleo: { cola } };
  localStorage.clear();
  localStorage.setItem('current_org_id', GIMNASIO);
});

describe('el momento en que pasó', () => {
  it('⚠️ NO manda UTC: la diferencia son tres horas y una visita mal ubicada', () => {
    // Del otro lado `ocurridoEn` es un LocalDateTime de Java: fecha y hora SIN zona, leída
    // en la del negocio. Con `toISOString()` el servidor leería tres horas MÁS TARDE —en el
    // futuro— y como acota el futuro a "ahora", el acceso perdería justo la propiedad por la
    // que este campo existe.
    const cuando = new Date(2026, 8, 6, 19, 42, 7); // 6 de septiembre, 19:42:07 local
    expect(momentoLocal(cuando)).toBe('2026-09-06T19:42:07');
    expect(momentoLocal(cuando)).not.toContain('Z');
  });

  it('rellena con ceros, que es lo que LocalDateTime sabe parsear', () => {
    expect(momentoLocal(new Date(2026, 0, 5, 8, 3, 9))).toBe('2026-01-05T08:03:09');
  });
});

describe('encolar', () => {
  it('guarda el acceso con su gimnasio y su momento', async () => {
    const ref = await encolar({ memberId: 'm1', memberName: 'José Pérez' });

    expect(ref).toBeTruthy();
    const [item] = cola.filas();
    expect(item.memberId).toBe('m1');
    expect(item.tenantId, 'sin esto, otra sucursal se lleva la visita').toBe(GIMNASIO);
    expect(item.ocurridoEn).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('⭐ respeta el sello que le dan, y de eso depende no invertir una visita', async () => {
    // El caso: el mostrador mandó el acceso online, el servidor lo guardó, y la respuesta se
    // perdió en el camino de vuelta. Se encola CON EL MISMO sello: el índice único del
    // servidor lo reconoce y no lo procesa de nuevo. Con un sello nuevo serían dos pasos del
    // mismo socio — y dos pasos no duplican, INVIERTEN.
    await encolar({ memberId: 'm1', clientRef: 'sello-que-ya-salio' });
    expect(cola.filas()[0].clientRef).toBe('sello-que-ya-salio');
  });

  it('en la web no hay cola, y lo dice en vez de fingir', async () => {
    delete window.electronAPI;
    expect(disponible()).toBe(false);
    expect(await encolar({ memberId: 'm1' })).toBeNull();
  });
});

describe('vaciar: en orden, de a uno', () => {
  /** Encola tres accesos con momentos crecientes. */
  async function tresAccesos() {
    await encolar({ memberId: 'm1', clientRef: 'a', ocurridoEn: '2026-09-06T10:00:00' });
    await encolar({ memberId: 'm2', clientRef: 'b', ocurridoEn: '2026-09-06T11:00:00' });
    await encolar({ memberId: 'm3', clientRef: 'c', ocurridoEn: '2026-09-06T12:00:00' });
  }

  it('manda en el orden en que OCURRIERON, no en el que se encolaron', async () => {
    // Se encola al revés a propósito: si saliera por orden de encolado, la salida iría antes
    // que la entrada y las dos marcas quedarían invertidas.
    await encolar({ memberId: 'm1', clientRef: 'tarde', ocurridoEn: '2026-09-06T11:00:00' });
    await encolar({ memberId: 'm1', clientRef: 'temprano', ocurridoEn: '2026-09-06T10:00:00' });

    const mandados = [];
    await vaciar(async (item) => { mandados.push(item.clientRef); });

    expect(mandados).toEqual(['temprano', 'tarde']);
  });

  it('un fallo de RED corta la tanda: no saltea al siguiente', async () => {
    // Saltear rompería el orden, que es lo único que sostiene la corrección. El que falló y
    // los que vienen detrás se quedan, y se reintentan enteros la próxima.
    await tresAccesos();
    const mandados = [];
    const r = await vaciar(async (item) => {
      mandados.push(item.clientRef);
      if (item.clientRef === 'b') throw new Error('Network Error'); // sin `response`
    });

    expect(mandados, 'llegó hasta el que falló y paró').toEqual(['a', 'b']);
    expect(r.enviados).toBe(1);
    expect(cola.filas().map((f) => f.clientRef), 'b y c siguen esperando').toEqual(['b', 'c']);
  });

  it('lo que falla por red se ANOTA pero no se borra: es una visita real', async () => {
    await encolar({ memberId: 'm1', clientRef: 'a' });
    await vaciar(async () => { throw new Error('Network Error'); });

    expect(cola.filas()).toHaveLength(1);
    expect(cola.filas()[0].intentos).toBe(1);
  });

  it('⚠️ un rechazo DEFINITIVO se descarta y la cola sigue: no la tapona', async () => {
    // Este es el "mensaje envenenado": un acceso que el servidor rechaza para siempre —un
    // socio que ya no existe— bloquearía la cola entera si se respetara la regla de cortar.
    await tresAccesos();
    const r = await vaciar(async (item) => {
      if (item.clientRef === 'a') {
        const e = new Error('Ese socio no existe');
        e.response = { status: 404 };
        throw e;
      }
    });

    expect(r.descartados).toBe(1);
    expect(r.enviados, 'los de atrás pasaron').toBe(2);
    expect(cola.filas()).toHaveLength(0);
  });

  it('no corre dos veces a la vez', async () => {
    await tresAccesos();
    let enVuelo = 0;
    let maximoSimultaneo = 0;
    const lento = async () => {
      enVuelo += 1;
      maximoSimultaneo = Math.max(maximoSimultaneo, enVuelo);
      await new Promise((r) => setTimeout(r, 5));
      enVuelo -= 1;
    };

    await Promise.all([vaciar(lento), vaciar(lento)]);

    expect(maximoSimultaneo, 'dos tandas en paralelo pueden invertir un par entrada/salida').toBe(1);
  });
});

describe('qué error dice "no insistas"', () => {
  it('un 4xx del servidor es definitivo', () => {
    expect(esDefinitivo(404)).toBe(true);
    expect(esDefinitivo(400)).toBe(true);
  });

  it('pero 408 y 429 son "probá de nuevo"', () => {
    expect(esDefinitivo(408)).toBe(false);
    expect(esDefinitivo(429)).toBe(false);
  });

  it('y 401/403 se arreglan solos cuando la sesión se renueva', () => {
    // Descartar un acceso por un token vencido sería perder una visita por un problema que
    // se resuelve en el próximo refresco.
    expect(esDefinitivo(401)).toBe(false);
    expect(esDefinitivo(403)).toBe(false);
  });

  it('un 5xx o un error sin respuesta NO son definitivos', () => {
    expect(esDefinitivo(500)).toBe(false);
    expect(esDefinitivo(undefined)).toBe(false);
  });
});

describe('contar y limpiar', () => {
  it('dice cuántos esperan', async () => {
    await encolar({ memberId: 'm1', clientRef: 'a' });
    await encolar({ memberId: 'm2', clientRef: 'b' });
    expect(await cuantosPendientes()).toBe(2);
  });

  it('los de OTRO gimnasio no se mandan con este', async () => {
    await encolar({ memberId: 'm1', clientRef: 'mio', tenantId: GIMNASIO });
    await encolar({ memberId: 'm2', clientRef: 'ajeno', tenantId: 'otro-gimnasio' });

    const lista = await pendientes(GIMNASIO);

    expect(lista.map((i) => i.clientRef)).toEqual(['mio']);
    expect(cola.filas(), 'y el ajeno NO se borra: es una visita real de otra sucursal')
      .toHaveLength(2);
  });

  it('olvidarCola vacía todo (para los tests y el borrado deliberado)', async () => {
    await encolar({ memberId: 'm1', clientRef: 'a' });
    await olvidarCola();
    expect(cola.filas()).toHaveLength(0);
  });
});

describe('⚠️ desde cuándo esperan, no solo cuántos son', () => {
  // "3 pendientes" no dice nada: pueden ser de hace dos minutos —el vaciado está por correr—
  // o de hace tres semanas, y eso segundo significa que el gimnasio viene guardando visitas
  // en UN SOLO DISCO desde hace tres semanas. El diseño permite acumular 30 días; sin la
  // antigüedad, esos 30 días pasan en silencio hasta el día que la máquina no arranca.

  /** Fija qué contesta el núcleo, que es lo único que este cálculo consume. */
  function elNucleoDice(respuesta) {
    window.electronAPI = { nucleo: { cola: { ...cola, resumen: vi.fn(async () => respuesta) } } };
  }

  it('con la cola vacía no hay antigüedad que informar', async () => {
    elNucleoDice({ cuantos: 0, masViejo: null });
    expect(await resumenDeCola()).toEqual({ cuantos: 0, dias: 0 });
  });

  it('lo de recién es de hoy: cero días', async () => {
    elNucleoDice({ cuantos: 1, masViejo: momentoLocal(new Date(Date.now() - 60 * 1000)) });
    expect((await resumenDeCola()).dias).toBe(0);
  });

  it('cuenta los días desde lo MÁS VIEJO, que es lo que mide el riesgo', async () => {
    const hace4Dias = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    elNucleoDice({ cuantos: 12, masViejo: momentoLocal(hace4Dias) });

    const r = await resumenDeCola();

    expect(r.cuantos).toBe(12);
    expect(r.dias).toBe(4);
  });

  it('un momento ilegible no inventa una antigüedad', async () => {
    // Preferible decir "0 días" que asustar con un número inventado — o peor, mostrar NaN.
    elNucleoDice({ cuantos: 3, masViejo: 'no-es-una-fecha' });
    expect(await resumenDeCola()).toEqual({ cuantos: 3, dias: 0 });
  });

  it('un reloj adelantado no da días negativos', async () => {
    elNucleoDice({ cuantos: 1, masViejo: momentoLocal(new Date(Date.now() + 60 * 60 * 1000)) });
    expect((await resumenDeCola()).dias).toBe(0);
  });

  it('en la web, donde no hay cola, contesta cero sin romperse', async () => {
    delete window.electronAPI;
    expect(await resumenDeCola()).toEqual({ cuantos: 0, dias: 0 });
  });

  it('una versión vieja del núcleo, sin `resumen`, tampoco rompe', async () => {
    // El escritorio se actualiza solo, pero no todos a la vez: durante un rato hay terminales
    // con el preload viejo. Pedirle algo que no tiene no puede tumbar la pantalla.
    window.electronAPI = { nucleo: { cola } };
    expect(await resumenDeCola()).toEqual({ cuantos: 0, dias: 0 });
  });
});
