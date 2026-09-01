// ============================================
// VELTRONIK - Tests del color de marca
// ============================================
import { describe, it, expect } from 'vitest';
import { hexAHsl, hslAHex, derivarPaleta, contrasteConBlanco, COLOR_VELTRONIK, COLORES_SUGERIDOS } from './brandColor';

describe('conversión de color', () => {
  it('lee el azul de Veltronik como el HSL que se midió del CSS', () => {
    expect(hexAHsl('#3b82f6')).toEqual([217, 91, 60]);
  });

  it('vuelve del HSL a un hex a un pelo del original', () => {
    // #3b82f6 medido en HSL entero da (217, 91, 60), y de vuelta da #3c83f6: un punto
    // por canal. No es un bug del algoritmo, es el costo de pasar por enteros.
    expect(hslAHex(217, 91, 60)).toBe('#3c83f6');
  });

  it('sobrevive la ida y vuelta con pérdida mínima', () => {
    // El HSL entero es un intermedio CON PÉRDIDA: 360 tonos x 101 x 101 no alcanzan
    // para los 16,7 millones de RGB, así que algunos colores vuelven corridos en 1.
    // Se exige que la diferencia sea invisible (≤2 por canal), no que sea cero: pedir
    // exactitud sería fijar un requisito que la matemática no puede cumplir.
    const canales = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (const hex of ['#e11d48', '#16a34a', '#7c3aed', '#000000', '#ffffff', '#475569']) {
      const [h, s, l] = hexAHsl(hex);
      const vuelta = hslAHex(h, s, l);
      canales(vuelta).forEach((c, i) => expect(Math.abs(c - canales(hex)[i])).toBeLessThanOrEqual(2));
    }
  });

  it('acepta con y sin numeral, y en mayúsculas', () => {
    expect(hexAHsl('3B82F6')).toEqual([217, 91, 60]);
  });
});

describe('derivarPaleta', () => {
  // ⭐ El test que más importa: NO elegir color no puede pintar NADA.
  //
  // Si esto devolviera algo distinto de {}, todos los gimnasios que nunca tocaron
  // la función —que son todos hasta que la usen— se despertarían con la paleta
  // cambiada. Es la misma trampa que NULL vs 0 en el cupo de clases.
  it('sin color elegido no genera ninguna variable', () => {
    expect(derivarPaleta(null)).toEqual({});
    expect(derivarPaleta(undefined)).toEqual({});
    expect(derivarPaleta('')).toEqual({});
  });

  it('un valor inválido tampoco pinta nada, en vez de romper', () => {
    expect(derivarPaleta('rojo')).toEqual({});
    expect(derivarPaleta('#12345')).toEqual({});
    expect(derivarPaleta('#gggggg')).toEqual({});
    expect(derivarPaleta({ hex: '#fff' })).toEqual({});
  });

  it('genera los 10 pasos de primary y de accent', () => {
    const p = derivarPaleta('#e11d48');
    for (const paso of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      expect(p[`--primary-${paso}`]).toMatch(/^#[0-9a-f]{6}$/);
      expect(p[`--accent-${paso}`]).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(Object.keys(p)).toHaveLength(20);
  });

  it('el color elegido reaparece casi igual en el paso 500', () => {
    // El 500 es el tono "principal": el que el dueño ve en los botones. Tiene que
    // ser el color que eligió, no un primo lejano.
    const p = derivarPaleta('#e11d48');
    const [h] = hexAHsl(p['--primary-500']);
    expect(h).toBeCloseTo(hexAHsl('#e11d48')[0], -1);
  });

  it('reconstruye la paleta de Veltronik a partir de su propio azul', () => {
    // Si la curva es fiel, alimentarla con el azul original devuelve la escala
    // original. Se compara la luminosidad, que es lo que define cada paso.
    const p = derivarPaleta(COLOR_VELTRONIK);
    const esperado = { '--primary-50': 97, '--primary-500': 60, '--primary-900': 33 };
    for (const [nombre, luz] of Object.entries(esperado)) {
      expect(hexAHsl(p[nombre])[2]).toBeCloseTo(luz, 0);
    }
  });

  it('va de claro a oscuro, sin saltos hacia atrás', () => {
    const p = derivarPaleta('#16a34a');
    const luces = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]
      .map((paso) => hexAHsl(p[`--primary-${paso}`])[2]);
    for (let i = 1; i < luces.length; i++) {
      expect(luces[i]).toBeLessThan(luces[i - 1]);
    }
  });

  it('un gris no genera diez grises: hay un piso de saturación', () => {
    // Sin piso, elegir gris dejaría los botones indistinguibles del fondo y el
    // sistema perdería la jerarquía visual entera.
    const p = derivarPaleta('#808080');
    expect(hexAHsl(p['--primary-500'])[1]).toBeGreaterThanOrEqual(20);
  });

  it('el acento queda cerca del primario, no en otra familia', () => {
    const p = derivarPaleta('#ea580c');
    const dif = Math.abs(hexAHsl(p['--accent-500'])[0] - hexAHsl(p['--primary-500'])[0]);
    expect(dif).toBeLessThanOrEqual(30);
  });
});

describe('el botón se tiene que poder leer', () => {
  // Esto existe por un bug real: la primera versión anclaba TODOS los colores en 60% de
  // luminosidad. Para el azul daba bien —el de Veltronik ya está en 60— pero el verde
  // salía menta (#4be784) con 1,61 de contraste contra el blanco: el texto del botón
  // desaparecía. Y encima no era el color que el dueño había elegido.
  it('ningún color sugerido deja el botón por debajo del azul de Veltronik', () => {
    const piso = contrasteConBlanco(derivarPaleta(COLOR_VELTRONIK)['--primary-500']);
    for (const { nombre, hex } of COLORES_SUGERIDOS) {
      const c = contrasteConBlanco(derivarPaleta(hex)['--primary-500']);
      expect(c, `${nombre} (${hex}) quedó en ${c.toFixed(2)}`).toBeGreaterThanOrEqual(piso - 0.15);
    }
  });

  it('un color ya oscuro se respeta, no se aclara', () => {
    // Verde oscuro adentro, verde oscuro afuera. Antes salía menta.
    const elegido = '#16a34a';
    const obtenido = derivarPaleta(elegido)['--primary-500'];
    expect(Math.abs(hexAHsl(obtenido)[2] - hexAHsl(elegido)[2])).toBeLessThanOrEqual(6);
  });

  it('un color demasiado claro se oscurece hasta que se lea', () => {
    // Un amarillo puro es ilegible con texto blanco a cualquier luminosidad alta.
    const p = derivarPaleta('#facc15');
    expect(hexAHsl(p['--primary-500'])[2]).toBeLessThan(50);
    expect(contrasteConBlanco(p['--primary-500'])).toBeGreaterThanOrEqual(3.4);
  });

  it('sigue yendo de claro a oscuro con el ancla corrida', () => {
    const p = derivarPaleta('#0891b2');
    const luces = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]
      .map((paso) => hexAHsl(p[`--primary-${paso}`])[2]);
    for (let i = 1; i < luces.length; i++) expect(luces[i]).toBeLessThan(luces[i - 1]);
  });
});
