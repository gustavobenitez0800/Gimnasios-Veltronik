// Los datos que cambian de lugar, en UN solo archivo.
//
// Mismo criterio que BillingProperties en el backend: el precio y la URL del frontend
// vivían repartidos en cuatro clases y tocar uno obligaba a acordarse de los otros. Acá
// pasa igual con el dominio del portal: aparece en el nav, en el hero, en los planes y
// en el pie. Se define una vez.

/** Dominio público de esta landing. Tiene que coincidir con `site` de astro.config. */
export const SITE_URL = 'https://veltronik.com.ar';

/**
 * El portal web (la app React que ya corre en Vercel).
 *
 * Hoy apunta al dominio de Vercel para que los botones funcionen ANTES de que el DNS
 * esté configurado. Cuando `app.veltronik.com.ar` esté apuntando, se cambia la variable
 * PUBLIC_APP_URL en Vercel y listo — sin tocar código.
 */
export const APP_URL = import.meta.env.PUBLIC_APP_URL || 'https://veltronik-v2.vercel.app';

/**
 * OJO: la app usa HashRouter, o sea que TODAS sus rutas viven después del "#".
 * Un link a `${APP_URL}/register` cae en la pantalla de login, no en el registro.
 * Por eso los links del portal se arman siempre con este helper.
 */
export const appRoute = (ruta = '/') => `${APP_URL}/#${ruta}`;

export const REPO = 'gustavobenitez0800/Gimnasios-Veltronik';

/** Contacto. TODO: reemplazar por el WhatsApp comercial real. */
export const CONTACTO = {
  email: 'veltronikcompany@gmail.com',
  // Formato internacional sin espacios ni signos: 549 + código de área + número.
  whatsapp: '', // ← vacío = no se muestra el botón. Cargar cuando haya número.
};

export const NAV = [
  { href: '/#funciones', label: 'Funciones' },
  { href: '/molinete-facial', label: 'Molinete facial' },
  { href: '/#precios', label: 'Precios' },
  { href: '/descargar', label: 'Descargar' },
];
