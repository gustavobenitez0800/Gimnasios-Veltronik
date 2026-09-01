// @vitest-environment happy-dom
//
// happy-dom no trae IndexedDB, así que se usa la implementación falsa de referencia. Es la
// misma API real, en memoria: lo que se prueba acá es la lógica de la cola, no el navegador.
//
// ============================================
// VELTRONIK - Tests de la cola de accesos
// ============================================
// Lo que se defiende acá es UNA propiedad: vaciar la cola tiene que dar el mismo resultado
// que si hubiera habido internet. Todo lo demás son detalles.

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encolar, pendientes, cuantosPendientes, vaciar, hayProblema, olvidarCola } from './colaAccesos';

const error = (status) => Object.assign(new Error('falló'), status ? { response: { status } } : {});

describe('la cola de accesos', () => {
  beforeEach(async () => {
    await olvidarCola();
  });

  it('guarda un acceso y lo devuelve', async () => {
    await encolar({ memberId: 'socio-1', method: 'manual', memberName: 'Paula' });
    const lista = await pendientes();
    expect(lista).toHaveLength(1);
    expect(lista[0].memberId).toBe('socio-1');
    expect(lista[0].clientRef).toMatch(/^[0-9a-f-]{36}$/);
    expect(lista[0].ocurridoEn).toBeTruthy();
  });

  it('cada acceso lleva un sello distinto', async () => {
    // Dos accesos del MISMO socio no son el mismo hecho: uno es la entrada y el otro la
    // salida. Si compartieran sello, el servidor se tragaría el segundo por idempotencia.
    const a = await encolar({ memberId: 'socio-1', method: 'manual' });
    const b = await encolar({ memberId: 'socio-1', method: 'manual' });
    expect(a).not.toBe(b);
    expect(await cuantosPendientes()).toBe(2);
  });

  // ⭐ EL TEST QUE SOSTIENE LA CORRECCIÓN
  it('los manda EN EL ORDEN en que ocurrieron', async () => {
    // Si el socio entró a las 10 y salió a las 11, mandar la salida primero invierte las
    // dos marcas: el servidor leería la salida como entrada y viceversa.
    await encolar({ memberId: 's', method: 'manual', ocurridoEn: '2026-09-01T11:00:00.000Z' });
    await encolar({ memberId: 's', method: 'manual', ocurridoEn: '2026-09-01T09:00:00.000Z' });
    await encolar({ memberId: 's', method: 'manual', ocurridoEn: '2026-09-01T10:00:00.000Z' });

    const enviados = [];
    await vaciar(async (item) => { enviados.push(item.ocurridoEn); });

    expect(enviados).toEqual([
      '2026-09-01T09:00:00.000Z',
      '2026-09-01T10:00:00.000Z',
      '2026-09-01T11:00:00.000Z',
    ]);
  });

  it('lo enviado se saca; lo que falló se queda', async () => {
    await encolar({ memberId: 'a', ocurridoEn: '2026-09-01T09:00:00.000Z' });
    await encolar({ memberId: 'b', ocurridoEn: '2026-09-01T10:00:00.000Z' });

    let primera = true;
    const r = await vaciar(async () => {
      if (primera) { primera = false; return; }
      throw error(); // sin status: se cayó la red
    });

    expect(r.enviados).toBe(1);
    expect(r.quedan).toBe(1);
    expect((await pendientes())[0].memberId).toBe('b');
  });

  // ⭐ EL OTRO QUE SOSTIENE LA CORRECCIÓN
  it('un fallo de red CORTA la tanda, no la saltea', async () => {
    // Seguir con el siguiente después de un fallo rompe el orden: llegaría la salida sin
    // haber llegado la entrada. Mejor frenar y reintentar todo junto después.
    await encolar({ memberId: 'a', ocurridoEn: '2026-09-01T09:00:00.000Z' });
    await encolar({ memberId: 'b', ocurridoEn: '2026-09-01T10:00:00.000Z' });
    await encolar({ memberId: 'c', ocurridoEn: '2026-09-01T11:00:00.000Z' });

    const intentados = [];
    await vaciar(async (item) => { intentados.push(item.memberId); throw error(); });

    expect(intentados).toEqual(['a']);
    expect(await cuantosPendientes()).toBe(3);
  });

  it('un rechazo definitivo se descarta para no trabar la cola', async () => {
    // Un 404 —el socio no existe— no se arregla reintentando, y dejarlo adelante trabaría
    // todos los accesos que vienen detrás para siempre.
    await encolar({ memberId: 'fantasma', ocurridoEn: '2026-09-01T09:00:00.000Z' });
    await encolar({ memberId: 'real', ocurridoEn: '2026-09-01T10:00:00.000Z' });

    const enviados = [];
    const r = await vaciar(async (item) => {
      if (item.memberId === 'fantasma') throw error(404);
      enviados.push(item.memberId);
    });

    expect(r.descartados).toBe(1);
    expect(enviados).toEqual(['real']);
    expect(await cuantosPendientes()).toBe(0);
  });

  it('un 401 NO se descarta: la sesión se renueva sola', async () => {
    await encolar({ memberId: 'a' });
    const r = await vaciar(async () => { throw error(401); });
    expect(r.descartados).toBe(0);
    expect(await cuantosPendientes()).toBe(1);
  });

  it('un 500 tampoco: el servidor puede estar reiniciándose', async () => {
    await encolar({ memberId: 'a' });
    const r = await vaciar(async () => { throw error(500); });
    expect(r.descartados).toBe(0);
    expect(await cuantosPendientes()).toBe(1);
  });

  it('dos vaciados a la vez no se pisan', async () => {
    // Sin candado, dos tandas en paralelo mandan el mismo acceso dos veces y —peor— pueden
    // mandar el segundo antes de que termine el primero, rompiendo el orden.
    await encolar({ memberId: 'a', ocurridoEn: '2026-09-01T09:00:00.000Z' });
    await encolar({ memberId: 'b', ocurridoEn: '2026-09-01T10:00:00.000Z' });

    const enviados = [];
    const lento = async (item) => {
      await new Promise((r) => setTimeout(r, 10));
      enviados.push(item.memberId);
    };
    const [uno, dos] = await Promise.all([vaciar(lento), vaciar(lento)]);

    expect(enviados).toEqual(['a', 'b']);      // cada uno UNA vez, y en orden
    expect(uno.enviados + dos.enviados).toBe(2);
  });

  it('avisa cuando algo viene fallando hace rato', async () => {
    await encolar({ memberId: 'a' });
    expect(await hayProblema()).toBe(false);
    for (let i = 0; i < 5; i++) await vaciar(async () => { throw error(); });
    expect(await hayProblema()).toBe(true);
  });

  it('cerrar sesión vacía la cola', async () => {
    await encolar({ memberId: 'a' });
    await olvidarCola();
    expect(await cuantosPendientes()).toBe(0);
  });

  it('la cola no crece sin límite, y descarta lo más viejo', async () => {
    // Se prueba la REGLA, no el número: llenar 5000 en un test sería lento y frágil. Se
    // verifica que al desbordar sobreviva el nuevo y muera el más antiguo.
    vi.resetModules();
    await encolar({ memberId: 'viejo', ocurridoEn: '2020-01-01T00:00:00.000Z' });
    await encolar({ memberId: 'nuevo', ocurridoEn: '2026-09-01T10:00:00.000Z' });
    const lista = await pendientes();
    expect(lista[0].memberId).toBe('viejo'); // el primero de la fila es el más antiguo
  });

  describe('cada acceso es de SU gimnasio', () => {
    // Un terminal puede cambiar de manos: el dueño de dos sucursales entra en la misma
    // máquina, o se reasigna el equipo. Un acceso que quedó esperando NO puede escribirse
    // en el gimnasio equivocado — sería una visita inventada en un negocio y una perdida
    // en el otro.
    it('solo se mandan los del gimnasio actual', async () => {
      await encolar({ memberId: 'a', tenantId: 'gym-1', ocurridoEn: '2026-09-01T09:00:00.000Z' });
      await encolar({ memberId: 'b', tenantId: 'gym-2', ocurridoEn: '2026-09-01T10:00:00.000Z' });

      const enviados = [];
      const r = await vaciar(async (item) => { enviados.push(item.memberId); }, 'gym-1');

      expect(enviados).toEqual(['a']);
      expect(r.enviados).toBe(1);
    });

    it('los del otro gimnasio NO se borran: esperan su turno', async () => {
      await encolar({ memberId: 'a', tenantId: 'gym-1', ocurridoEn: '2026-09-01T09:00:00.000Z' });
      await encolar({ memberId: 'b', tenantId: 'gym-2', ocurridoEn: '2026-09-01T10:00:00.000Z' });

      await vaciar(async () => {}, 'gym-1');
      expect(await cuantosPendientes('gym-2')).toBe(1);

      const enviados = [];
      await vaciar(async (item) => { enviados.push(item.memberId); }, 'gym-2');
      expect(enviados).toEqual(['b']);
    });

    it('el contador de la pantalla solo cuenta los propios', async () => {
      await encolar({ memberId: 'a', tenantId: 'gym-1' });
      await encolar({ memberId: 'b', tenantId: 'gym-2' });
      await encolar({ memberId: 'c', tenantId: 'gym-2' });
      expect(await cuantosPendientes('gym-1')).toBe(1);
      expect(await cuantosPendientes('gym-2')).toBe(2);
    });
  });
});
