// veltronik.com.ar/confirmar?token_hash=… — el botón «Confirmar mi cuenta» del correo de alta.
// Lleva al portal con el mismo token (ver lib/enlaceDelCorreo.js para el porqué).

import { destinoDelCorreo, redirigir } from '../lib/enlaceDelCorreo.js';

export const prerender = false;

export function GET({ url }) {
  return redirigir(destinoDelCorreo('confirmar', url));
}
