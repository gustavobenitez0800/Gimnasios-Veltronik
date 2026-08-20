// ============================================
// VELTRONIK - RELEVO DE LOGIN PARA EL ESCRITORIO (Fase 1)
// ============================================
// Página del PORTAL WEB, no de la app. Es la última parada del login con Google del
// escritorio: Google devuelve a Supabase, Supabase devuelve acá con un `?code=...`, y lo
// único que hace esta pantalla es reenviarlo a `veltronik://auth?code=...` para que la
// app lo canjee.
//
// NO CANJEA EL CÓDIGO, Y ES A PROPÓSITO: no puede. El flujo PKCE lo arrancó la app de
// escritorio, así que el `code_verifier` está en la máquina del cliente, no en este
// navegador. Esa imposibilidad es justamente la propiedad de seguridad — el código que
// pasa por acá no le sirve a nadie más.
//
// Ojo con el `detectSessionInUrl` de Supabase: apenas se construye el cliente procesa el
// código y limpia la URL. Por eso el código se lee de INITIAL_URL, la foto que se toma
// arriba de todo en lib/supabase.js, y no de window.location.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { INITIAL_URL } from '../lib/supabase';
import { readAuthCode, readAuthError } from '../lib/authCode';
import Icon from '../components/Icon';
import logoSrc from '../assets/LogotipoSecundario.png';

/** Arma el enlace que despierta a la app de escritorio. */
function buildDeepLink(code) {
  return `veltronik://auth?code=${encodeURIComponent(code)}`;
}

/**
 * Busca primero en la foto inicial de la URL y después en la URL actual.
 *
 * El orden importa y cubre dos situaciones distintas:
 *  · Supabase ya limpió window.location al arrancar → sobrevive en INITIAL_URL.
 *  · Se llegó por navegación del router sin recargar (un cambio de hash no vuelve a
 *    evaluar los módulos) → INITIAL_URL es vieja y la buena es window.location.
 * En el flujo real siempre es una carga completa, pero fallar por la forma en que
 * alguien llegó a la pantalla sería un misterio caro de depurar.
 */
function readFromBothUrls(read) {
  return read(INITIAL_URL) || read(window.location.href);
}

export default function DesktopAuthPage() {
  const [code] = useState(() => readFromBothUrls(readAuthCode));
  const [failure] = useState(() => readFromBothUrls(readAuthError));
  const [sent, setSent] = useState(false);

  const handoff = useCallback(() => {
    if (!code) return;
    setSent(true);
    // Navegar a un protocolo propio: el sistema operativo levanta Veltronik. El navegador
    // puede pedir confirmación ("¿Abrir Veltronik?") y está bien que lo haga.
    window.location.href = buildDeepLink(code);
  }, [code]);

  // Intento automático al entrar. Algunos navegadores exigen un gesto del usuario para
  // saltar a un protocolo externo, así que abajo queda igual el botón: entre "a veces
  // anda solo" y "siempre hay un botón", conviene tener los dos.
  useEffect(() => { handoff(); }, [handoff]);

  const ok = !!code && !failure;

  return (
    <div className="auth-card" style={{ textAlign: 'center' }}>
      <img src={logoSrc} alt="Veltronik" style={{ height: '48px', margin: '0 auto 1.5rem', display: 'block' }} />

      {ok ? (
        <>
          <div style={{ color: 'var(--primary-400)', marginBottom: '1rem' }}>
            <Icon name="checkCircle" size="3rem" />
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>
            Listo — volvé a Veltronik
          </h1>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            {sent
              ? 'Le pasamos tu sesión a la aplicación. Si no se abrió sola, tocá el botón.'
              : 'Tocá el botón para terminar de iniciar sesión en la aplicación.'}
          </p>
          <button className="auth-submit" onClick={handoff} style={{ width: '100%' }}>
            Abrir Veltronik
          </button>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '1rem', lineHeight: 1.5 }}>
            Ya podés cerrar esta pestaña.
          </p>
        </>
      ) : (
        <>
          <div style={{ color: '#ef4444', marginBottom: '1rem' }}>
            <Icon name="alertTriangle" size="3rem" />
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>
            No pudimos completar el inicio de sesión
          </h1>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {failure
              ? `Google respondió: ${failure}`
              : 'Este enlace no trae los datos necesarios. Volvé a la aplicación e intentá iniciar sesión de nuevo.'}
          </p>
        </>
      )}
    </div>
  );
}
