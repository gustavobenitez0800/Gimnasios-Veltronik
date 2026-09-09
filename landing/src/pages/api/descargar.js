// El link estable de descarga: veltronik.com.ar/api/descargar
//
// Es la ÚNICA ruta del sitio que corre en el servidor (todo lo demás es HTML estático).
// Necesita correr en vivo porque el nombre del instalador lleva la versión adentro, así
// que hay que preguntarle a GitHub cuál es el más nuevo en el momento del click.
//
// La gracia: este link nunca cambia. Se puede poner en un mail, en un cartel, en un
// WhatsApp o en el manual del cliente, y va a seguir bajando la última versión dentro de
// dos años sin que nadie lo actualice.

import { getInstalador, RELEASES_URL } from '../../lib/release.js';

export const prerender = false;

export async function GET() {
  const instalador = await getInstalador();

  // Si GitHub no contesta (o nos comimos el rate limit de la API, que sin token son 60
  // pedidos por hora y por IP), mandamos al visitante a la página de releases en vez de
  // mostrarle un error. Ahí el .exe está a un click y se lo baja igual.
  const destino = instalador?.url || RELEASES_URL;

  return new Response(null, {
    status: 302,
    headers: {
      Location: destino,
      // 10 minutos de caché en el borde: aguanta una tanda de descargas sin volver a
      // pegarle a GitHub, y una versión nueva tarda como mucho ese rato en aparecer.
      'Cache-Control': 'public, max-age=0, s-maxage=600',
    },
  });
}
