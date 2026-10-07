// ============================================
// VELTRONIK - Ningún botón de enviar queda fuera de su formulario
// ============================================
// ⚠️ UN <button type="submit"> FUERA DE SU <form> NO ENVÍA NADA.
//
// El Modal dibuja su ranura `actions` DESPUÉS de `children`, o sea fuera de cualquier <form>
// que venga adentro. Si ahí se pone <ModalActions> (que trae el botón de enviar), el botón se
// ve perfecto, se puede apretar, y no pasa nada. Ya pasó DOS veces: en CobroRapido, y en la
// Caja, donde "Anotar un gasto" y "Anular" estuvieron muertos del 2026-09-02 al 2026-10-07 con
// todos los tests en verde, porque ninguno apretaba el botón.
//
// Esto recorre el código de todas las pantallas y falla si el error vuelve a escribirse.
// Es por texto y por archivo: NO ve un botón que llega desde otro componente. Para eso están
// los tests de cada pantalla, que tienen que APRETAR el botón (ver CajaPage.test.jsx).

import { describe, it, expect } from 'vitest';

/**
 * El código sin sus comentarios, con los mismos renglones (así el número de línea sirve).
 * Los comentarios de este proyecto CUENTAN este error con sus propias palabras —"un
 * <button type="submit"> fuera de su form…"— y sin esto el guardián los tomaba por código.
 */
const sinComentarios = (texto) => texto
  .replace(/\/\*[\s\S]*?\*\//g, (bloque) => bloque.replace(/[^\n]/g, ''))
  .replace(/^[ \t]*\/\/.*$/gm, '');

const fuentes = import.meta.glob('../../**/*.jsx', { query: '?raw', import: 'default', eager: true });
const archivos = Object.entries(fuentes)
  .filter(([ruta]) => !ruta.includes('.test.'))
  .map(([ruta, texto]) => [ruta, sinComentarios(texto)]);

// Las etiquetas de verdad llevan un espacio y sus atributos (`<form onSubmit=…`).
const FORM = /<form\s/g;
const MODAL_ACTIONS = /<ModalActions\s/g;
const BOTON_DE_ENVIAR = /<button\s[^>]*\btype="submit"[^>]*>/g;

/** ¿La posición cae dentro de algún <form> … </form> del archivo? */
const enUnForm = (texto, posicion) => [...texto.matchAll(FORM)].some((m) => {
  const cierre = texto.indexOf('</form>', m.index);
  return posicion > m.index && posicion < cierre;
});
const linea = (texto, posicion) => texto.slice(0, posicion).split('\n').length;
// Donde se DEFINE ModalActions: su botón de enviar no tiene form a propósito, lo pone quien lo usa.
const esElModal = (ruta) => ruta.endsWith('/Modal.jsx');

describe('⚠️ ningún botón de enviar queda fuera de su formulario', () => {

  it('recorre las pantallas de verdad', () => {
    expect(archivos.length).toBeGreaterThan(40);
    expect(archivos.some(([ruta]) => ruta.endsWith('pages/CajaPage.jsx'))).toBe(true);
    // Y sabe reconocer lo que busca: si esto da cero, las reglas de arriba dejaron de servir.
    const usos = archivos.reduce((n, [, texto]) => n + [...texto.matchAll(MODAL_ACTIONS)].length, 0);
    expect(usos).toBeGreaterThan(5);
  });

  it('<ModalActions> va adentro del <form>, nunca en la ranura `actions` del Modal', () => {
    const sueltos = [];
    for (const [ruta, texto] of archivos) {
      if (esElModal(ruta)) continue;
      for (const m of texto.matchAll(MODAL_ACTIONS)) {
        if (!enUnForm(texto, m.index)) sueltos.push(`${ruta}:${linea(texto, m.index)}`);
      }
    }
    expect(sueltos, 'estos <ModalActions> están fuera de un <form>: su botón no envía nada').toEqual([]);
  });

  it('todo <button type="submit"> está dentro de un <form>, o lo nombra con `form=`', () => {
    const sueltos = [];
    for (const [ruta, texto] of archivos) {
      if (esElModal(ruta)) continue;
      for (const m of texto.matchAll(BOTON_DE_ENVIAR)) {
        if (!enUnForm(texto, m.index) && !/\bform=/.test(m[0])) sueltos.push(`${ruta}:${linea(texto, m.index)}`);
      }
    }
    expect(sueltos, 'estos botones de enviar no tienen formulario').toEqual([]);
  });
});
