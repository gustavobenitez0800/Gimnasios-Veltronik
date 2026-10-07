// ============================================
// VELTRONIK - LA COLA TRABADA SE AVISA SOLA
// ============================================
// Cuando el servidor viene rechazando lo que el terminal tiene para subir, el terminal se lo
// dice al servidor por otra puerta. No arregla nada: hace que nos enteremos.
//
// POR QUÉ EXISTE (Santo Sport, 05/10/2026)
// Un alta que el servidor contestaba con 500 dejó detrás 139 entradas, cobros y el cierre de
// caja durante 36 horas. El terminal la reintentó 288 veces y no tenía a quién contárselo; la
// pantalla decía "se mandan al volver internet" con el internet andando. Nos enteramos por el
// WhatsApp del dueño, después de que llamara al técnico del router.
//
// ⚠️ NO PUEDE ROMPER NADA. Es un aviso de que algo ya anda mal: si este pedido también falla,
// se calla y se vuelve a intentar en la próxima vuelta del vaciado. Y no cierra la sesión si
// le contestan 401 (`__noCierraSesion`), igual que el aviso de por qué se cerró una sesión.
// ============================================

import apiClient from './apiClient';

const CLAVE = 'veltronik_cola_trabada_avisada';

/**
 * Cada cuánto se repite el aviso mientras siga trabada. El vaciado corre cada cinco minutos;
 * avisar en cada vuelta serían doce líneas por hora diciendo lo mismo.
 */
export const REPETIR_CADA_MS = 30 * 60 * 1000;

function ultimoAviso() {
  try {
    return Number(localStorage.getItem(CLAVE)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Avisa al servidor que la cola está trabada.
 *
 * @param {{cuantos: number, desde: string|null, trabada: object|null}} resumen lo que devuelve
 *        `resumenDeCola`
 * @returns {Promise<boolean>} true si el servidor ya lo sabe: se lo acaba de decir, o se lo
 *          dijo hace menos de {@link REPETIR_CADA_MS}. La pantalla lo usa para no afirmar
 *          "ya avisamos" cuando no es cierto.
 */
export async function avisarColaTrabada(resumen) {
  const t = resumen?.trabada;
  if (!t) return false;
  if (Date.now() - ultimoAviso() < REPETIR_CADA_MS) return true;

  try {
    await apiClient.post('/account/cola-trabada', {
      cuantos: resumen.cuantos,
      desde: resumen.desde,
      tipo: t.tipo,
      status: t.status,
      intentos: t.intentos,
      error: t.error,
    }, { __noCierraSesion: true, timeout: 8000 });
  } catch {
    return false;
  }

  try {
    localStorage.setItem(CLAVE, String(Date.now()));
  } catch {
    // Sin dónde anotarlo se avisa de nuevo en la próxima vuelta: de más, pero se avisa.
  }
  return true;
}

/**
 * La cola se destrabó: si se vuelve a trabar, es un problema nuevo y se avisa en el acto, sin
 * esperar a que pase el rato del aviso anterior.
 */
export function olvidarAvisoDeColaTrabada() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que olvidar.
  }
}
