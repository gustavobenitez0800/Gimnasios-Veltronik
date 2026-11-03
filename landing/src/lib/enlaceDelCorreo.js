// Los enlaces de los correos de la cuenta (confirmar el alta, recuperar la contraseña).
//
// POR QUÉ PASAN POR ACÁ (02/11/2026). Los correos salen de veltronik.com.ar, pero el botón
// llevaba directo al portal (veltronik-v2.vercel.app). Resend lo marca como el primer problema
// de entrega —«Ensure link URLs match sending domain»—: un correo que dice venir de un dominio y
// manda a otro es justo lo que hace un correo falso, y Hotmail, Outlook y Yahoo lo mandan a
// «Correo no deseado». Con el enlace en veltronik.com.ar, este sitio lo reenvía al portal con
// el mismo token: para el portal no cambia nada.
//
// ⚠️ El token abre la cuenta: la respuesta no se guarda en ningún caché ni se lo pasa a nadie
// más (no-store, no-referrer), y solo se acepta con la forma que tienen los de Supabase.

import { APP_URL } from './site.js';

/** Los token_hash de Supabase: hexadecimal (a veces con prefijo «pkce_»). Nada más. */
const TOKEN = /^[A-Za-z0-9_-]{8,200}$/;

/**
 * A dónde mandar a quien tocó el enlace del correo.
 *
 * @param {'confirmar'|'recuperar'} tipo qué correo era: lo decide la ruta, nunca el enlace
 * @param {URL} url la dirección pedida
 * @param {string} portal el portal (se puede pasar otro para probar)
 */
export function destinoDelCorreo(tipo, url, portal = APP_URL) {
  const base = portal.replace(/\/+$/, '');
  const token = url.searchParams.get('token_hash') || '';
  // Sin token válido no hay nada que canjear: al login, que es donde va a tener que entrar.
  if (!TOKEN.test(token)) return `${base}/`;

  const t = encodeURIComponent(token);
  if (tipo === 'confirmar') return `${base}/?alta=1&token_hash=${t}&type=email`;
  if (tipo === 'recuperar') return `${base}/?token_hash=${t}&type=recovery#/reset-password`;
  return `${base}/`;
}

/** La respuesta: un 302 que no se guarda ni pasa el token como referencia. */
export function redirigir(destino) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: destino,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
