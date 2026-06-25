// ============================================
// VELTRONIK - PAYMENT CONFIG (config en runtime)
// ============================================
// Resuelve la configuración de pago (clave pública de Mercado Pago) en RUNTIME desde el
// backend, con el valor de build-time como respaldo.
//
// POR QUÉ
// Antes la clave pública de MP se horneaba en el bundle en build-time (VITE_MP_PUBLIC_KEY).
// Si ese secret faltaba/estaba mal al generar el instalador, el modal de pago quedaba roto
// para TODOS los clientes de TODAS las verticales, sin arreglo posible salvo un release nuevo.
// Ahora la fuente de verdad es el backend (una env var: MP_PUBLIC_KEY), que el cliente
// consulta al vuelo. Un build con la clave ausente/vieja se autocorrige.

import apiClient from './apiClient';
import CONFIG from './config';

// Cache en memoria: la config no cambia durante la sesión. Se guarda la PROMESA para
// deduplicar llamadas concurrentes (el modal puede montarse varias veces).
let configPromise = null;

async function fetchRuntimeConfig() {
  // Endpoint público (permitAll + excluido del KillSwitch): responde en cualquier estado.
  const response = await apiClient.get('/public/payment-config');
  return response.data || {};
}

/**
 * Devuelve la config de pago resuelta: { mpPublicKey, currency, monthlyPrice }.
 * Prioriza el backend (autoritativo para el entorno actual) y cae al build-time si el
 * backend no responde o no trae la clave.
 */
export async function getPaymentConfig() {
  if (!configPromise) {
    configPromise = (async () => {
      const fallback = {
        mpPublicKey: CONFIG.MP_PUBLIC_KEY || '',
        currency: CONFIG.SUBSCRIPTION_CURRENCY,
        monthlyPrice: CONFIG.SUBSCRIPTION_PRICE,
      };
      try {
        const runtime = await fetchRuntimeConfig();
        return {
          // La clave del backend manda; si viniera vacía, usamos la de build.
          mpPublicKey: runtime.mpPublicKey || fallback.mpPublicKey,
          currency: runtime.currency || fallback.currency,
          monthlyPrice: runtime.monthlyPrice ?? fallback.monthlyPrice,
        };
      } catch (err) {
        // Backend inalcanzable → no rompemos el pago: usamos el valor de build.
        console.warn('[paymentConfig] backend no disponible, uso config de build:', err?.message);
        return fallback;
      }
    })();
    // Si la resolución falla de forma inesperada, permitir reintentar en la próxima llamada.
    configPromise.catch(() => { configPromise = null; });
  }
  return configPromise;
}

/** Atajo: la clave pública de MP ya resuelta (string vacío si no hay ninguna). */
export async function getMpPublicKey() {
  const cfg = await getPaymentConfig();
  return cfg.mpPublicKey || '';
}
