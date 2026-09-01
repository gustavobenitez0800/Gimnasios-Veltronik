// ============================================
// VELTRONIK — LOGO DEL GIMNASIO (procesamiento en el navegador)
// ============================================
// El dueño elige una foto de su galería y tiene que ver SU logo en la app al
// instante, sin recortar nada a mano y sin esperar una subida.
//
// Cómo funciona: la imagen se normaliza acá mismo, en el navegador, a un cuadrado
// chico y liviano, y viaja como data URI en el mismo PUT que el resto de los datos
// del gimnasio. No hay bucket, ni URLs firmadas, ni un segundo servicio que pueda
// estar caído justo cuando un dueño nuevo está probando el sistema: si el gimnasio
// se guardó, el logo se guardó.
//
// El costo de esa simplicidad es que el logo pesa dentro de la fila del gimnasio,
// por eso el objetivo es agresivo: 256px de lado y ~50 KB. Un logo de gimnasio es
// una marca plana; a ese tamaño se ve nítido incluso en pantallas retina, porque
// nunca se dibuja más grande que 96px.

/** Lado del cuadrado final, en píxeles. */
const SIZE = 256;

/** Techo duro del data URI resultante. El backend rechaza cualquier cosa más grande. */
import { colorDominante } from './brandColor';

export const MAX_LOGO_BYTES = 200 * 1024;

/** Objetivo al que apuntamos bajando calidad antes de rendirnos. */
const TARGET_BYTES = 60 * 1024;

/** Tamaño máximo del archivo ORIGINAL que aceptamos abrir (antes de comprimir). */
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

/** Emojis que puede elegir el dueño si no quiere subir una imagen. */
export const LOGO_EMOJIS = ['🏋️', '💪', '🥊', '🤸', '🧘', '🏃', '🔥', '⚡'];

/** El que se pone solo cuando no eligió nada. */
export const DEFAULT_LOGO_EMOJI = '🏋️';

/** Carga un File a un elemento imagen decodificado. */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No pudimos leer esa imagen.')); };
    img.src = url;
  });
}

/**
 * Convierte la imagen elegida en un cuadrado listo para guardar.
 *
 * El recorte es "cover" centrado (lo mismo que hace object-fit: cover): se toma el
 * cuadrado del medio de la foto. Es lo que espera cualquiera que sube un logo — y
 * evita la alternativa fea, que es deformar la marca para que entre.
 *
 * @param {File} file archivo elegido por el usuario
 * @returns {Promise<string>} data URI listo para mandar al backend
 * @throws {Error} con un mensaje ya redactado para mostrarle al dueño
 */
export async function fileToSquareDataUrl(file) {
  if (!file) throw new Error('No elegiste ningún archivo.');
  if (!file.type.startsWith('image/')) {
    throw new Error('Ese archivo no es una imagen. Elegí un PNG, JPG o WEBP.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('La imagen es muy pesada (máximo 12 MB). Probá con una más chica.');
  }

  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new Error('No pudimos leer esa imagen.');

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    img,
    (img.naturalWidth - side) / 2, // recorte centrado horizontal
    (img.naturalHeight - side) / 2, // recorte centrado vertical
    side, side,
    0, 0, SIZE, SIZE
  );

  // WebP pesa la mitad que PNG con la misma nitidez. Si el navegador no lo soporta,
  // toDataURL devuelve PNG silenciosamente y lo detectamos por el prefijo.
  const encode = (type, quality) => {
    const url = canvas.toDataURL(type, quality);
    return url.startsWith(`data:${type}`) ? url : null;
  };

  // Bajamos calidad hasta entrar en el objetivo. Los logos son planos: incluso a 0.6
  // no se nota, y la diferencia de peso es de 3x.
  let out = null;
  for (const q of [0.92, 0.85, 0.75, 0.65]) {
    out = encode('image/webp', q) || encode('image/jpeg', q);
    if (out && out.length <= TARGET_BYTES) break;
  }
  // Último recurso: PNG (navegador sin WebP ni JPEG en canvas — no debería pasar).
  if (!out) out = canvas.toDataURL('image/png');

  if (out.length > MAX_LOGO_BYTES) {
    throw new Error('No pudimos comprimir esa imagen lo suficiente. Probá con un logo más simple.');
  }

  // El color de la marca sale del MISMO canvas que ya se dibujó: no hay que decodificar
  // la imagen otra vez. Si el navegador marca el canvas como "sucio" (no debería: la
  // imagen viene de un archivo local, no de otro dominio) getImageData tira y se sigue
  // sin color, que es exactamente como se comportaba antes.
  let colorDetectado = null;
  try {
    colorDetectado = colorDominante(ctx.getImageData(0, 0, SIZE, SIZE).data);
  } catch {
    colorDetectado = null;
  }

  return { dataUrl: out, colorDetectado };
}
