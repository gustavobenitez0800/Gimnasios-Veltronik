// @ts-check
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// ⭐ LAS CABECERAS DE SEGURIDAD, ADENTRO DE LO QUE LEE VERCEL (08/11/2026).
//
// Con el adaptador, Vercel no arma el sitio desde un vercel.json: lee la configuración que
// escribe el adaptador (.vercel/output/config.json), y un vercel.json suelto no llegaba ahí
// (se probó: el config.json salía sin ninguna). Esta integración corre DESPUÉS del adaptador
// (Astro lo pone primero en la lista) y antepone una ruta con las cabeceras para todo el sitio.
//   - Nadie puede meter la landing adentro de otra página (frame-ancestors / X-Frame-Options).
//   - El navegador no adivina tipos de archivo (nosniff) y el referrer sale recortado.
//   - Sin cámara, micrófono ni ubicación: la landing no los usa.
const CABECERAS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
};

function cabecerasDeSeguridad() {
  return {
    name: 'veltronik:cabeceras-de-seguridad',
    hooks: {
      'astro:build:done': ({ logger }) => {
        const archivo = fileURLToPath(new URL('./.vercel/output/config.json', import.meta.url));
        if (!existsSync(archivo)) {
          logger.warn('No está .vercel/output/config.json: el sitio sale SIN cabeceras de seguridad.');
          return;
        }
        const config = JSON.parse(readFileSync(archivo, 'utf8'));
        config.routes = [{ src: '^/(.*)$', headers: CABECERAS, continue: true }, ...(config.routes || [])];
        writeFileSync(archivo, JSON.stringify(config, null, 2));
        logger.info('Cabeceras de seguridad puestas en todo el sitio.');
      },
    },
  };
}

// El sitio se construye ESTÁTICO a propósito: Google tiene que recibir el HTML ya
// escrito en la primera respuesta. Ese es justamente el problema que tiene el portal
// (React + HashRouter: el buscador ve un <div id="root"> vacío y las rutas viven
// después del "#", donde el servidor ni las ve). Por eso la landing es un proyecto
// aparte y no una ruta más de la app.
//
// El adaptador de Vercel está SOLO para /api/descargar, que necesita correr en el
// servidor para preguntarle a GitHub cuál es el instalador más nuevo. Todas las
// páginas siguen siendo HTML estático (`prerender` por defecto).
export default defineConfig({
  site: 'https://veltronik.com.ar',
  output: 'static',
  adapter: vercel(),

  // UNA sola forma de escribir cada URL: /descargar, nunca /descargar/.
  // Para Google son dos direcciones distintas, y si la canónica dice una y el sitemap
  // dice la otra, el buscador tiene que adivinar cuál vale. Acá coinciden las tres
  // cosas: lo que servimos, lo que declara <link rel="canonical"> y lo que lista el
  // sitemap.
  trailingSlash: 'never',

  // La página del molinete se bajó el 2026-10-22: la web habla del sistema, y el molinete es
  // un agregado que se ofrece al que lo pide. Google ya la tenía indexada, así que la dirección
  // vieja lleva a la portada (301) en vez de a un 404. No sacar esto aunque nadie la enlace.
  redirects: {
    '/molinete-facial': '/',
  },

  integrations: [
    sitemap({
      // El endpoint de descarga es un redirect, no una página: no va al sitemap. Tampoco los
      // enlaces de los correos de la cuenta (/confirmar y /recuperar): son de un solo uso.
      filter: (page) => !page.includes('/api/') && !/\/(confirmar|recuperar)\/?$/.test(page),
      // El sitemap arma las URLs con barra final por su cuenta. Se la sacamos para que
      // sea idéntico a la canónica que escribe Base.astro (la raíz sí la conserva).
      serialize: (item) => ({
        ...item,
        url: item.url.replace(/(?<!\/\/)\/$/, ''),
      }),
    }),
    // Tiene que ir DESPUÉS del adaptador (que Astro corre primero): escribe sobre su salida.
    cabecerasDeSeguridad(),
  ],
});
