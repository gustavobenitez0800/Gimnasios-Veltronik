// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests del depósito local
// ============================================
// Existe por un bug que dejó al mostrador sin poder buscar socios, en la web y en el
// escritorio a la vez.
//
// ⭐ EL BUG: dos módulos abrían LA MISMA base de IndexedDB con versiones distintas
// —`localMembers` con la 1, la cola de accesos con la 2—. IndexedDB no permite abrir una
// base pidiendo una versión MENOR que la que ya tiene: falla. Así que en cuanto la cola
// subía la base a la versión 2, la lista de socios no podía abrirla nunca más, no cargaba
// el padrón local, y escribir un DNI no encontraba a nadie.
//
// La lección: una base de datos tiene UN dueño. El esquema —nombre, versión y todos los
// almacenes— se declara en un solo lugar, y los módulos piden el almacén que necesitan.

import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { NOMBRE_DB, VERSION_DB, ALMACENES, abrirDB, conAlmacen, pedir } from './db';

describe('el depósito local tiene un solo dueño', () => {
  it('abre la base y crea TODOS los almacenes de una', async () => {
    // Si un almacén se creara en otra versión, el módulo que lo pida antes de que esa
    // versión corra se encontraría con una base sin su almacén.
    const db = await abrirDB();
    for (const nombre of Object.values(ALMACENES)) {
      expect(db.objectStoreNames.contains(nombre), `falta el almacén ${nombre}`).toBe(true);
    }
    db.close();
  });

  it('pedir una versión vieja falla: por eso el esquema va en un solo lugar', async () => {
    // Es el mecanismo exacto del bug. `localMembers` pedía la versión 1 cuando la cola ya
    // la había subido a 2, y se encontraba con esto.
    const db = await abrirDB();
    db.close();

    const resultado = await new Promise((resolve) => {
      const req = indexedDB.open(NOMBRE_DB, VERSION_DB - 1);
      req.onsuccess = () => { req.result.close(); resolve('abrió'); };
      req.onerror = () => resolve('falló');
      req.onblocked = () => resolve('bloqueada');
    });

    expect(resultado).toBe('falló');
  });

  it('abrirla dos veces seguidas no rompe', async () => {
    const a = await abrirDB();
    a.close();
    const b = await abrirDB();
    expect(b.version).toBe(VERSION_DB);
    b.close();
  });

  // ⭐ EL GUARDIÁN DE LA REGRESIÓN
  //
  // El bug no estaba adentro de ningún módulo —los dos andaban bien por separado— sino en
  // que COMPARTÍAN una base sin saberlo, cada uno con su propia versión. Un test de
  // comportamiento no lo ve, porque para verlo hay que ejecutar los dos módulos en el
  // orden justo. Lo que sí se puede es impedir la CAUSA: que exista un segundo abridor.
  // Por eso este mira el código fuente en vez de ejecutarlo.
  it('NADIE más abre la base: db.js es el único dueño', () => {
    const raiz = join(cwd(), 'src');
    const archivos = [];
    (function recorrer(dir) {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) recorrer(ruta);
        else if (/\.jsx?$/.test(entrada.name)) archivos.push(ruta);
      }
    })(raiz);

    const abridor = /indexedDB\s*\.\s*open\s*\(/;
    const esElDueno = (ruta) => /db\.js$/.test(ruta) || /db\.test\.js$/.test(ruta);

    const culpables = archivos
      .filter((ruta) => !esElDueno(ruta) && abridor.test(readFileSync(ruta, 'utf8')))
      .map((ruta) => ruta.slice(raiz.length + 1));

    expect(culpables, 'estos archivos abren la base por su cuenta: usá conAlmacen() de lib/db.js')
      .toEqual([]);
  });

  it('los socios y la cola conviven en la misma base', async () => {
    // La cola primero, que era la que subía la versión...
    const { encolar, cuantosPendientes } = await import('./colaAccesos');
    await encolar({ memberId: 'socio-1', tenantId: 'gym-1' });
    expect(await cuantosPendientes('gym-1')).toBe(1);

    // ...y los socios tienen que seguir guardando y leyendo igual.
    await conAlmacen(ALMACENES.SOCIOS, 'readwrite', (st) => pedir(st.put({ socios: ['x'] }, 'gym-1')));
    const leido = await conAlmacen(ALMACENES.SOCIOS, 'readonly', (st) => pedir(st.get('gym-1')));

    expect(leido).toEqual({ socios: ['x'] });
  });
});
