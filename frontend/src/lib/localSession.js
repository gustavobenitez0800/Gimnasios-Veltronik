// ============================================
// VELTRONIK - SESIÓN LOCAL DEL CAJERO (V3, ladrillo 6)
// ============================================
// El cajero entró por PIN contra el cerebro local. Guardamos el token de sesión
// y sus datos para operar el POS offline. El token se manda como Bearer (apiClient
// en modo local); el backend lo valida y saca de él tenant + rol.

const TOKEN_KEY = 'veltronik_local_token';
const CASHIER_KEY = 'veltronik_local_cashier';

export function getLocalToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}

export function getLocalCashier() {
  try {
    const raw = localStorage.getItem(CASHIER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setLocalSession({ token, cashier }) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(CASHIER_KEY, JSON.stringify(cashier || {}));
  } catch { /* modo privado extremo: la sesión no persiste, se re-pide el PIN */ }
}

export function clearLocalSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CASHIER_KEY);
  } catch { /* noop */ }
}

/** El backend local es la autoridad; acá solo miramos si HAY sesión guardada. */
export function hasLocalSession() {
  return !!getLocalToken();
}
