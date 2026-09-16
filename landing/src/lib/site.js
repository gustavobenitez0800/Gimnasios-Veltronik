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

export const CONTACTO = {
  email: 'veltronikcompany@gmail.com',
  /**
   * Formato internacional sin espacios ni signos: `549` + código de área + número,
   * los dos SIN el 0 ni el 15.
   *
   * <p>El `9` después del 54 no es opcional ni decorativo: es lo que distingue un celular
   * de un fijo en Argentina. Sin él, WhatsApp no encuentra el contacto y el botón abre una
   * conversación vacía con un número que no existe.</p>
   *
   * <p>Vacío = el botón no se muestra. Un botón de WhatsApp que no abre nada es peor que
   * no tener botón: el que quería escribirte ya se fue.</p>
   */
  whatsapp: '5493756417238',
};

/**
 * El link de WhatsApp, con el mensaje ya escrito.
 *
 * <p><b>Por qué el texto va precargado.</b> El que llega desde la web no sabe cómo
 * arrancar la conversación, y un chat en blanco es donde se cae la mitad de las consultas.
 * Con el mensaje puesto, solo tiene que apretar enviar — y del otro lado se sabe de qué
 * página vino, que es media respuesta adelantada.</p>
 *
 * @returns el link, o `null` si no hay número cargado. Quien lo use tiene que contemplar
 *          el null: es lo que apaga el botón en vez de dejarlo roto.
 */
export const waLink = (mensaje = 'Hola! Vi Veltronik en la web y quiero saber más.') => (
  CONTACTO.whatsapp
    ? `https://wa.me/${CONTACTO.whatsapp}?text=${encodeURIComponent(mensaje)}`
    : null
);

export const NAV = [
  { href: '/#funciones', label: 'Funciones' },
  { href: '/molinete-facial', label: 'Molinete facial' },
  { href: '/#precios', label: 'Precios' },
  { href: '/descargar', label: 'Descargar' },
];
