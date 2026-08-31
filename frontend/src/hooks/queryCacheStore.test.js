// ============================================
// VELTRONIK - Tests del depósito de caché
// ============================================
// Lo que se prueba acá no es "que ande el caché": es que NO mienta, que NO deje la
// pantalla en blanco al refrescar, y que NO crezca sin techo. Las tres duelen en
// producción y ninguna se ve mirando la pantalla un rato.
// ============================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  readEntry,
  writeEntry,
  markStale,
  invalidateQueries,
  clearQueryCache,
  MAX_ENTRIES,
} from './queryCacheStore';

const key = (ns, ...rest) => JSON.stringify([ns, ...rest]);

describe('depósito de caché de consultas', () => {
  beforeEach(() => {
    clearQueryCache();
  });

  it('guarda y devuelve lo guardado', () => {
    writeEntry(key('members', 0), 'members', ['ana']);
    expect(readEntry(key('members', 0)).data).toEqual(['ana']);
  });

  // ─── Refrescar NO es borrar ───
  //
  // El mostrador se refresca solo cada 15 segundos, y refrescar era BORRAR la entrada:
  // el hook se encontraba sin caché, prendía el "cargando" y la lista de quién está
  // adentro se reemplazaba por un spinner. Cada 15 segundos, y cuanto más lenta la
  // conexión más rato — justo la pantalla que se estaba tratando de acelerar.
  it('marcar viejo conserva el dato para poder seguir mostrándolo', () => {
    writeEntry(key('mostrador'), 'mostrador', { adentro: ['ana'] });

    markStale(key('mostrador'));

    const entry = readEntry(key('mostrador'));
    expect(entry).toBeDefined();
    expect(entry.data).toEqual({ adentro: ['ana'] });
    expect(entry.timestamp).toBe(0); // viejo ⇒ el hook lo vuelve a pedir por detrás
  });

  it('marcar viejo una clave que no existe no inventa nada', () => {
    markStale(key('mostrador'));
    expect(readEntry(key('mostrador'))).toBeUndefined();
  });

  // ─── Invalidar por módulo ───
  // Cobrar una cuota corre el vencimiento del socio: los días que muestra la lista de
  // Socios quedan viejos EN TODAS SUS PÁGINAS, no solo en la que se está mirando. Sin
  // esto, el socio que acaba de pagar sigue figurando vencido al pasar de página.
  it('invalida todas las entradas de un módulo y no toca las de los demás', () => {
    writeEntry(key('members', 0), 'members', ['pág 0']);
    writeEntry(key('members', 1), 'members', ['pág 1']);
    writeEntry(key('members', 0, 'juan'), 'members', ['búsqueda']);
    writeEntry(key('payments', '2026-08'), 'payments', ['un pago']);

    invalidateQueries('members');

    expect(readEntry(key('members', 0)).timestamp).toBe(0);
    expect(readEntry(key('members', 1)).timestamp).toBe(0);
    expect(readEntry(key('members', 0, 'juan')).timestamp).toBe(0);
    // El dato sigue ahí: se muestra mientras se refresca.
    expect(readEntry(key('members', 0)).data).toEqual(['pág 0']);
    // Y los pagos ni se enteraron.
    expect(readEntry(key('payments', '2026-08')).timestamp).not.toBe(0);
  });

  // Va por NOMBRE de módulo, no por prefijo de texto. Con `startsWith`, invalidar
  // 'members' se llevaría puesto a 'members_stats' sin que nadie lo note.
  it('no confunde dos módulos que empiezan igual', () => {
    writeEntry(key('members', 0), 'members', ['socios']);
    writeEntry(key('members_stats'), 'members_stats', ['otra cosa']);

    invalidateQueries('members');

    expect(readEntry(key('members', 0)).timestamp).toBe(0);
    expect(readEntry(key('members_stats')).timestamp).not.toBe(0);
  });

  // ─── Borrar sí es borrar ───
  // Cambio de sucursal y cierre de sesión: acá marcar viejo no alcanza, porque el dato
  // del negocio anterior seguiría en memoria y se pintaría un instante antes de que
  // llegue el del nuevo.
  it('clearQueryCache borra todo, no lo marca viejo', () => {
    writeEntry(key('members', 0), 'members', ['socios']);
    writeEntry(key('payments', '2026-08'), 'payments', ['pagos']);

    clearQueryCache();

    expect(readEntry(key('members', 0))).toBeUndefined();
    expect(readEntry(key('payments', '2026-08'))).toBeUndefined();
  });

  // ─── El techo ───
  // El buscador de Socios pide al backend: cada búsqueda distinta es una clave nueva. En
  // un terminal que arranca con Windows y no se apaga nunca, un Map sin tope es una fuga
  // de memoria lenta — y encima cada entrada puede traer cientos de socios.
  it('descarta la entrada más vieja al pasarse del tope', () => {
    for (let i = 0; i < MAX_ENTRIES; i++) {
      writeEntry(key('members', i), 'members', [i]);
    }
    expect(readEntry(key('members', 0)).data).toEqual([0]);

    writeEntry(key('members', MAX_ENTRIES), 'members', ['la nueva']);

    expect(readEntry(key('members', 0))).toBeUndefined();
    expect(readEntry(key('members', 1)).data).toEqual([1]);
    expect(readEntry(key('members', MAX_ENTRIES)).data).toEqual(['la nueva']);
  });

  // La pantalla del mostrador reescribe SU clave cada 15 segundos. Si reescribir no
  // renovara la antigüedad, la clave más usada de todas sería la primera en caer.
  it('reescribir una clave la vuelve reciente', () => {
    for (let i = 0; i < MAX_ENTRIES; i++) {
      writeEntry(key('members', i), 'members', [i]);
    }
    writeEntry(key('members', 0), 'members', ['refrescada']);

    writeEntry(key('members', MAX_ENTRIES), 'members', ['la nueva']);

    expect(readEntry(key('members', 0)).data).toEqual(['refrescada']);
    expect(readEntry(key('members', 1))).toBeUndefined();
  });
});
