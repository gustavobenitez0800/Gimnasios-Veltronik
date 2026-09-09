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
 * No es un precio inventado: es el mismo default que tiene BillingProperties en el
 * backend (`veltronik.billing.monthly-price:45000`). Si algún día se separan, manda el
 * backend — este valor solo evita que la página de precios salga en blanco.
 */
const RESPALDO = [{
  code: 'BASICO',
  name: 'Veltronik',
  tagline: 'Todo lo que necesitás para manejar el gimnasio.',
  price: 45000,
  features: [
    'Gestión ilimitada de socios activos',
    'Control de caja y pagos mensuales',
    'Dashboard con las métricas del negocio',
    'Registro de asistencia y accesos',
    'Múltiples perfiles de usuario por equipo',
    'Soporte técnico y asistencia prioritaria',
    'Nuevas funciones y actualizaciones gratis',
  ],
}];

/**
 * Afirmaciones del catálogo que HOY no son ciertas y no se publican.
 *
 * ⚠️ ESTO ES UN PARCHE, NO LA SOLUCIÓN. El arreglo de verdad es sacar la frase de
 * PlanCatalog.java en el backend.
 *
 * El caso: el catálogo promete "Sigue funcionando sin internet". Era cierto cuando
 * existía el circuito local-first, pero eso se borró entero en la V43 y hoy no queda
 * cola offline en el código (se buscó: no hay). O sea que la frase quedó prometiendo
 * algo que el sistema ya no hace — y no solo acá: se la está mostrando a los clientes
 * en el muro de pago del portal, que es literalmente la pantalla donde deciden pagar.
 *
 * Se filtra acá porque una landing pública no puede contradecirse: el FAQ de esta
 * misma página contesta, con todas las letras, que Veltronik necesita conexión.
 * Prometer lo contrario tres bloques más arriba es peor que no decir nada.
 */
const NO_PUBLICABLES = [/sin internet/i];

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
