// ============================================
// VELTRONIK - useMonthlyPrice (el precio, una sola fuente)
// ============================================
// Devuelve el precio mensual que el backend va a cobrar de verdad.
//
// POR QUÉ EXISTE
// El precio vivía escrito a mano en tres lugares del frontend: CONFIG.SUBSCRIPTION_PRICE,
// un `const price = 80000` adentro de PlansPage (que ni siquiera miraba el CONFIG) y el
// texto "$80.000 ARS" hardcodeado en BlockedPage. El backend, en cambio, ya lo tenía
// centralizado en BillingProperties. Resultado: bajar el precio en el servidor dejaba a
// la app mostrando el viejo — el cliente leía un número y le cobraban otro.
//
// La cañería para resolverlo ya existía (paymentConfig lo pide a /public/payment-config);
// lo único que faltaba era que las pantallas la usaran. Este hook es esa puerta.
//
// Arranca con el valor de build como respaldo, así la pantalla nunca parpadea ni muestra
// un hueco mientras responde el backend.

import { useEffect, useState } from 'react';
import { getPaymentConfig } from '../lib/paymentConfig';
import CONFIG from '../lib/config';

export function useMonthlyPrice() {
  const [price, setPrice] = useState(CONFIG.SUBSCRIPTION_PRICE);

  useEffect(() => {
    let vigente = true;
    getPaymentConfig()
      .then((cfg) => {
        // Number(): el backend serializa BigDecimal y puede llegar como string.
        const resuelto = Number(cfg?.monthlyPrice);
        if (vigente && Number.isFinite(resuelto) && resuelto > 0) setPrice(resuelto);
      })
      // getPaymentConfig ya cae al valor de build si el backend no contesta; si aun así
      // fallara, nos quedamos con el que ya está en el estado. Nunca dejamos la UI sin precio.
      .catch(() => {});
    return () => { vigente = false; };
  }, []);

  return price;
}

/** El mismo precio ya formateado para mostrar: "45.000". */
export function useMonthlyPriceLabel() {
  return useMonthlyPrice().toLocaleString('es-AR');
}
