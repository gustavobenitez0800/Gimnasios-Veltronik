// ============================================
// VELTRONIK - PUENTE DEL DEEP LINK DE LOGIN (Fase 2)
// ============================================
// No dibuja nada. Se queda escuchando los `veltronik://` que el proceso principal manda
// cuando el sistema operativo despierta a la app, y termina el login que arrancó en el
// navegador: canjea el `?code=` por la sesión.
//
// Va montado en routes/DesktopRoutes.jsx, adentro del AuthProvider: cuando el canje sale
// bien, Supabase emite SIGNED_IN, AuthContext recarga la sesión y su guard de rutas lleva
// solo al Lobby. Este componente no navega a mano — sería una segunda autoridad diciendo
// a dónde va el usuario, y esa autoridad ya existe.
//
// Solo el bundle de escritorio lo importa, así que no hace falta gatearlo por CONFIG.
// ============================================

import { useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import { completeFromDeepLink } from '../lib/desktopAuth';

export default function DeepLinkAuthBridge() {
  const { showToast } = useToast();

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDeepLink) return undefined;

    const unsubscribe = api.onDeepLink(async (url) => {
      // Hoy el único deep link es el del login. Si mañana hay más, acá se ramifica por
      // el "host" de la URL (veltronik://auth, veltronik://otra-cosa).
      const { ok, reason } = await completeFromDeepLink(url);

      if (ok) {
        showToast('Sesión iniciada con Google', 'success');
      } else if (reason) {
        showToast(`No se pudo completar el inicio de sesión: ${reason}`, 'error');
      }
    });

    return unsubscribe;
  }, [showToast]);

  return null;
}
