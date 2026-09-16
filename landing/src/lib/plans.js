// El precio sale del BACKEND, no de acá.
//
// POR QUÉ (está documentado en PlansPage.jsx del portal, y vale el doble en una página
// pública): antes el precio estaba escrito a mano en el frontend. Bajarlo en el servidor
// dejaba la pantalla mostrando el viejo — el cliente leía un número y le cobraban otro.
// Una landing indexada por Google con un precio viejo es peor todavía: queda en la caché
// del buscador.
//
// Se pide en BUILD TIME, no en el navegador, por dos razones:
//   1. SEO: el precio queda escrito en el HTML que recibe Google, no lo pone un script.
//   2. CORS: el backend solo acepta el origen del portal (FRONTEND_URL). Un fetch desde
//      veltronik.com.ar da 403. Desde el build no hay navegador, así que no hay CORS.
//
// Consecuencia a tener presente: si se cambia el precio hay que redeployar la landing
// (en Vercel, "Redeploy"). No se actualiza sola.

const API = import.meta.env.PUBLIC_API_URL || 'https://v2-backend-7rpsadmoka-rj.a.run.app/api';

/**
 * Respaldo si el backend no contesta durante el build.
 *
 * No es un precio inventado: es el mismo default que tiene `BillingProperties` en el
 * backend (`veltronik.billing.monthly-price`). Si algún día se separan, manda el
 * backend — este valor solo evita que la página de precios salga en blanco.
 *
 * ⚠️ **Y por eso hay que actualizarlo junto con el del backend, siempre.** Hasta el
 * 2026-09-16 acá decía 45.000 mientras se cobraban 55.000: si Cloud Run hubiera estado
 * frío durante un build, la web habría publicado un precio 18% más barato que el real —
 * y alguien podría haberse suscripto mirando ese número.
 *
 * ⛔ El respaldo tiene UN solo plan a propósito: si el backend no contesta, no hay forma
 * de saber si el premium está disponible hoy. Publicar un plan que tal vez no se puede
 * comprar es peor que no mostrarlo.
 */
const RESPALDO = [{
  code: 'BASICO',
  name: 'Veltronik',
  tagline: 'Todo lo que necesitás para manejar el gimnasio.',
  price: 55000,
  features: [
    'Gestión ilimitada de socios activos',
    'Control de caja y pagos mensuales',
    'Dashboard con las métricas del negocio',
    'Registro de asistencia y accesos',
    'Sigue funcionando sin internet',
    'Múltiples perfiles de usuario por equipo',
    'Soporte técnico y asistencia prioritaria',
    'Nuevas funciones y actualizaciones gratis',
  ],
}];

/**
 * Afirmaciones del catálogo que HOY no son ciertas y no se publican.
 *
 * ✅ **La lista está vacía desde el 2026-09-16, y es una buena noticia.**
 *
 * Tenía una sola entrada: `/sin internet/i`. El catálogo prometía "Sigue funcionando sin
 * internet" y era falso — el circuito local-first se había borrado entero en la V43 —, así
 * que se filtraba acá para que la landing no se contradijera con su propio FAQ.
 *
 * **Volvió a ser cierto, y esta vez de punta a punta.** Entre el 6 y el 15 de septiembre se
 * construyó el núcleo local: el mostrador cobra, da de alta, registra accesos y salidas,
 * anota egresos y cierra la caja sin conexión, todo con el momento real y subiendo en orden
 * cuando vuelve la red. Ver `docs/FASE3-CAMINOS.md`.
 *
 * ⚠️ **El filtro se deja vacío en vez de borrar el archivo entero.** Es el lugar donde va a
 * ir la próxima frase del catálogo que se adelante a lo construido, y este proyecto ya
 * demostró que eso pasa: una promesa quedó publicada meses después de que dejara de ser
 * verdad. Tener el gancho puesto es más barato que volver a inventarlo.
 */
const NO_PUBLICABLES = [];

const esPublicable = (feature) => !NO_PUBLICABLES.some((re) => re.test(feature));

export async function getPlanes() {
  try {
    const res = await fetch(`${API}/public/plans`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lista = await res.json();
    if (!Array.isArray(lista) || lista.length === 0) throw new Error('catálogo vacío');

    return lista.map((plan) => ({
      ...plan,
      features: (plan.features || []).filter(esPublicable),
    }));
  } catch (e) {
    // Un build no se cae porque el backend esté frío (Cloud Run tarda en arrancar).
    console.warn(`[landing] No se pudo leer /public/plans (${e.message}). Uso el respaldo.`);
    return RESPALDO;
  }
}

/** 45000 → "45.000". El signo $ lo pone el HTML, para poder darle otro tamaño. */
export const formatoPrecio = (n) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Number(n));
