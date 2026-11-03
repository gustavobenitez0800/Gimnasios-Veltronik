// veltronik.com.ar/recuperar?token_hash=… — el botón «Cambiar contraseña» del correo de
// recuperación. Lleva al portal con el mismo token (ver lib/enlaceDelCorreo.js para el porqué).

import { destinoDelCorreo, redirigir } from '../lib/enlaceDelCorreo.js';

export const prerender = false;

export function GET({ url }) {
  return redirigir(destinoDelCorreo('recuperar', url));
}
