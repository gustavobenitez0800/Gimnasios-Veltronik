// ============================================
// VELTRONIK - Tests de "por qué no se pudo consultar"
// ============================================
// El mostrador del cliente se quedaba sin mostrar quién estaba adentro y desde acá no
// había manera de saber por qué: la pantalla decía lo mismo para "no hay internet", para
// "el servidor dijo que no" y para "el pedido nunca volvió". Tres problemas distintos,
// tres arreglos distintos, un solo cartel.

import { describe, it, expect } from 'vitest';
import { porQueFallo } from './porQueFallo';

describe('por qué falló', () => {
  it('sin error y sin datos: el pedido nunca volvió', () => {
    // ⭐ El caso que dejaba el "Cargando..." eterno. No deja error, así que cualquier
    // diagnóstico que arranque mirando el error se lo pierde entero.
    expect(porQueFallo(null).detalle).toBe('sin respuesta');
  });

  it('el timeout de axios se reconoce', () => {
    expect(porQueFallo({ code: 'ECONNABORTED' }).detalle).toBe('tiempo agotado');
    expect(porQueFallo({ message: 'timeout of 20000ms exceeded' }).detalle).toBe('tiempo agotado');
  });

  it('un 403 NO se confunde con falta de internet', () => {
    // Son opuestos: en uno el servidor contestó, en el otro no lo alcanzamos. En el
    // escritorio un 403 suele ser que la terminal perdió a qué sucursal pertenece, y
    // decirle a alguien "revisá tu internet" lo manda a buscar donde no está el problema.
    expect(porQueFallo({ response: { status: 403 } }).detalle).toBe('permiso 403');
  });

  it('un 500 se distingue de un rechazo', () => {
    expect(porQueFallo({ response: { status: 500 } }).detalle).toBe('error 500');
    expect(porQueFallo({ response: { status: 404 } }).detalle).toBe('respuesta 404');
  });

  it('un error sin respuesta es que no llegó a destino', () => {
    expect(porQueFallo({ message: 'Network Error' }).detalle).toBe('no llegó');
  });

  it('la sesión caída se dice como tal', () => {
    expect(porQueFallo({ sinSesion: true }).detalle).toBe('sin sesión');
  });

  it('siempre devuelve algo legible, nunca undefined', () => {
    // Este cartel aparece justo cuando algo anda mal: es el peor momento para que la
    // propia pantalla rompa por un campo vacío.
    for (const e of [null, undefined, {}, { response: {} }, 'roto', 0]) {
      const r = porQueFallo(e);
      expect(typeof r.texto).toBe('string');
      expect(r.texto.length).toBeGreaterThan(0);
      expect(typeof r.detalle).toBe('string');
    }
  });
});
