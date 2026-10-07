// Qué versión se está ofreciendo AHORA: veltronik.com.ar/api/version
//
// La página de descarga escribe la versión y el peso al armarse el sitio, y el sitio se arma
// cuando cambia la landing, no cuando sale una versión del escritorio. El botón siempre bajó
// la última (pasa por /api/descargar), pero el renglón de abajo se quedaba en la del último
// armado: el 2026-10-07 decía "Versión 2.6.45" y lo que se bajaba era la 2.6.46.
//
// La página pide esto al abrirse y corrige el renglón. Si no contesta, queda lo del armado.

import { getInstalador } from '../../lib/release.js';

export const prerender = false;

export async function GET() {
  const instalador = await getInstalador();

  if (!instalador) {
    // Sin caché: que el próximo pedido vuelva a probar en vez de repetir el tropiezo.
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  return new Response(JSON.stringify({ version: instalador.version, peso: instalador.peso }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Los mismos 10 minutos en el borde que /api/descargar: van juntas.
      'Cache-Control': 'public, max-age=0, s-maxage=600',
    },
  });
}
