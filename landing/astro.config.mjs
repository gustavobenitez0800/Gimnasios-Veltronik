// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

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
      // El endpoint de descarga es un redirect, no una página: no va al sitemap.
      filter: (page) => !page.includes('/api/'),
      // El sitemap arma las URLs con barra final por su cuenta. Se la sacamos para que
      // sea idéntico a la canónica que escribe Base.astro (la raíz sí la conserva).
      serialize: (item) => ({
        ...item,
        url: item.url.replace(/(?<!\/\/)\/$/, ''),
      }),
    }),
  ],
});
