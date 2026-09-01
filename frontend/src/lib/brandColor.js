// ============================================
// VELTRONIK - COLOR DE MARCA DEL GIMNASIO
// ============================================
// El dueño elige UN color y de ahí sale la paleta entera del sistema.
//
// Por qué derivar y no pedirle diez colores: nadie que atiende un gimnasio va a
// elegir diez tonos coherentes entre sí, y si los elige mal la app queda ilegible.
// Pedimos el color de su marca —el que ya está en su cartel— y el resto lo calcula
// la misma curva que usa la paleta de Veltronik.
//
// LA CURVA sale de medir la paleta original en HSL: el TONO se mantiene y lo que
// cambia es la luminosidad, de 97% (casi blanco) a 33% (casi negro). La saturación
// baja en los extremos oscuros. Copiando esa forma, cualquier color genera una
// escala con el mismo carácter en vez de diez variantes planas.

// La forma de la curva, no sus valores absolutos: qué tan lejos está cada paso entre
// el casi-blanco y el color principal (y del principal hacia el casi-negro). Sale de
// normalizar la escala original, así la paleta derivada tiene el mismo ritmo.
const HACIA_EL_CLARO = { 50: 1, 100: 0.892, 200: 0.730, 300: 0.486, 400: 0.216, 500: 0 };
const HACIA_EL_OSCURO = { 500: 0, 600: 0.259, 700: 0.444, 800: 0.741, 900: 1 };

/** El casi-blanco del paso 50 y la proporción del 900 respecto del principal. */
const LUZ_MAS_CLARA = 97;
const PROPORCION_MAS_OSCURA = 33 / 60;

// Contraste mínimo del botón principal contra el texto blanco. 3.5 no es un número
// elegido de la nada: es el que YA tiene Veltronik con su azul (#3b82f6 da 3.64). Subir
// la vara dejaría al azul por debajo de su propio default, que es absurdo.
const CONTRASTE_MINIMO = 3.5;

const luminancia = (r, g, b) =>
  [r, g, b]
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
    .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);

/** Contraste de un hex contra el blanco, según WCAG. */
export function contrasteConBlanco(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 1.05 / (luminancia(r, g, b) + 0.05);
}

/**
 * Hasta qué luminosidad hay que bajar este tono para que el texto blanco se lea.
 *
 * <p>Sin esto, anclar todos los colores en 60% de luz da resultados ilegibles: un verde
 * o un turquesa al 60% son casi fluorescentes y el blanco encima no se ve (1,6 de
 * contraste, cuando el mínimo usable es 3). Y encima devuelve un color que NO es el que
 * el dueño eligió: un verde oscuro salía menta.</p>
 */
function luzQueSeLee(h, s) {
  let luz = 60;
  while (luz > 20 && contrasteConBlanco(hslAHex(h, s, luz)) < CONTRASTE_MINIMO) luz -= 1;
  return luz;
}

/** Saturación de cada paso, relativa a la del paso 500 (91% en la original). */
const SATURACION = { 50: 1.10, 100: 1.04, 200: 1.07, 300: 1.05, 400: 1.03, 500: 1.00, 600: 0.91, 700: 0.84, 800: 0.78, 900: 0.70 };

// ── La curva del amarillo ──
// Un amarillo no puede ser oscuro y seguir siendo amarillo: al bajarle la luz se vuelve
// caqui. Las paletas serias no lo aceptan, lo CORREN hacia el ámbar mientras oscurecen
// (el yellow-700 de Tailwind ya es tono 41, no 48). Sin esto, un logo amarillo —que en
// gimnasios es de los más comunes— daba un botón color barro.
const BANDA_AMARILLA = [40, 80]; // tonos que se ensucian al oscurecerse
const DESTINO_AMBAR = 32;        // hacia dónde se los corre

/** El acento es el mismo tono corrido: en la paleta original van 217° y 239°. */
const CORRIMIENTO_ACENTO = 22;

const PASOS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

const limitar = (n, min, max) => Math.min(max, Math.max(min, n));

/** '#3b82f6' -> [217, 91, 60]. Devuelve null si no es un hex de 6 dígitos. */
export function hexAHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const n = m[1];
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let h = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

/** [217, 91, 60] -> '#3b82f6'. */
export function hslAHex(h, s, l) {
  const sr = limitar(s, 0, 100) / 100;
  const lr = limitar(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * lr - 1)) * sr;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = lr - c / 2;
  const dos = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${dos(r1)}${dos(g1)}${dos(b1)}`;
}

/**
 * Las variables CSS que pintan el sistema con este color.
 *
 * Devuelve `{}` cuando no hay color elegido (o el valor es basura): un objeto vacío
 * de estilos no pisa nada y el sistema se queda con la paleta de Veltronik. Es
 * deliberado que "sin elegir" y "elegido mal" terminen en el mismo lugar seguro.
 */
export function derivarPaleta(hex) {
  const hsl = hexAHsl(hex);
  if (!hsl) return {};
  const [h, s] = hsl;

  // Un color muy apagado (un gris) generaría diez grises indistinguibles y el sistema
  // perdería toda jerarquía visual: los botones dejarían de verse como botones. Se le
  // pone un piso a la saturación para que siempre haya algo de color.
  const base = Math.max(s, 25);

  // El ancla: el paso 500, el que pinta los botones. Se elige por CONTRASTE, no por un
  // número fijo, y nunca más claro que el 60% original.
  // Primera pasada: cuánto habría que oscurecer ESTE tono para que se lea. Sirve de
  // medida de cuán "difícil" es el color.
  const cuantoOscurecio = Math.max(0, (60 - luzQueSeLee(h, base)) / 60);

  const tono =
    h >= BANDA_AMARILLA[0] && h <= BANDA_AMARILLA[1]
      ? h - (h - DESTINO_AMBAR) * Math.min(1, cuantoOscurecio * 1.6)
      : h;

  // Segunda pasada, sobre el tono ya corrido. Sin esto el ámbar heredaba la luz que
  // necesitaba el amarillo —que es más brillante— y salía marrón oscuro: 5,7 de
  // contraste cuando alcanzaba con 3,5, o sea un color innecesariamente apagado.
  const ancla = tono === h ? luzQueSeLee(h, base) : luzQueSeLee(tono, base);
  const masOscura = ancla * PROPORCION_MAS_OSCURA;

  const luzDe = (paso) =>
    paso <= 500
      ? ancla + (LUZ_MAS_CLARA - ancla) * HACIA_EL_CLARO[paso]
      : ancla - (ancla - masOscura) * HACIA_EL_OSCURO[paso];

  const vars = {};
  for (const paso of PASOS) {
    const luz = luzDe(paso);
    vars[`--primary-${paso}`] = hslAHex(tono, base * SATURACION[paso], luz);
    vars[`--accent-${paso}`] = hslAHex(tono + CORRIMIENTO_ACENTO, base * SATURACION[paso] * 0.92, luz);
  }
  return vars;
}

/**
 * El color de marca que se ve en un logo.
 *
 * <p>Recibe los píxeles crudos del canvas (RGBA) y devuelve el hex dominante, o null si
 * la imagen no tiene ningún color de marca reconocible (un logo en blanco y negro, por
 * ejemplo, donde inventar un color sería peor que no poner ninguno).</p>
 *
 * <p><b>Qué se descarta y por qué:</b> lo transparente (no se ve), lo casi blanco y lo
 * casi negro (fondo y contornos, presentes en casi todos los logos) y lo desaturado (los
 * grises no son la marca). Lo que sobrevive se agrupa en cubetas y gana la más poblada,
 * <b>ponderada por saturación</b>: en un logo con mucho gris claro y un detalle rojo, la
 * marca es el rojo aunque ocupe menos píxeles.</p>
 */
export function colorDominante(pixeles) {
  if (!pixeles || !pixeles.length) return null;

  const cubetas = new Map();
  for (let i = 0; i < pixeles.length; i += 4) {
    if (pixeles[i + 3] < 200) continue; // transparente

    const r = pixeles[i];
    const g = pixeles[i + 1];
    const b = pixeles[i + 2];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 245 && min > 245) continue; // blanco
    if (max < 25) continue;               // negro
    if (max - min < 25) continue;         // gris

    const luz = (max + min) / 2 / 255;
    const sat = (max - min) / 255 / (1 - Math.abs(2 * luz - 1) || 1);

    // Cubetas de 16 niveles por canal: junta los antialiasings del borde con el relleno.
    const clave = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const previo = cubetas.get(clave) || { peso: 0, r: 0, g: 0, b: 0, n: 0 };
    previo.peso += 1 + sat * 2; // la saturación pesa, pero no aplasta al recuento
    previo.r += r; previo.g += g; previo.b += b; previo.n += 1;
    cubetas.set(clave, previo);
  }

  let mejor = null;
  for (const c of cubetas.values()) if (!mejor || c.peso > mejor.peso) mejor = c;
  if (!mejor || mejor.n < 8) return null; // demasiado poco color para llamarlo "la marca"

  const dos = (v) => Math.round(v / mejor.n).toString(16).padStart(2, '0');
  return `#${dos(mejor.r)}${dos(mejor.g)}${dos(mejor.b)}`;
}

/** Colores sugeridos, para que elegir sea un clic y no una decisión de diseño. */
export const COLORES_SUGERIDOS = [
  { nombre: 'Azul', hex: '#3b82f6' },
  { nombre: 'Rojo', hex: '#e11d48' },
  { nombre: 'Naranja', hex: '#ea580c' },
  { nombre: 'Verde', hex: '#16a34a' },
  { nombre: 'Violeta', hex: '#7c3aed' },
  { nombre: 'Turquesa', hex: '#0891b2' },
  { nombre: 'Rosa', hex: '#db2777' },
  { nombre: 'Grafito', hex: '#475569' },
];

/** El de Veltronik, para el botón "volver al original". */
export const COLOR_VELTRONIK = '#3b82f6';
