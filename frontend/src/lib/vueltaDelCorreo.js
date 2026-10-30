// ============================================
// VELTRONIK - LA VUELTA DEL LINK "CONFIRMÁ TU CORREO"
// ============================================
// Quien se registra con email y contraseña recibe un correo de Supabase. Toca el link,
// Supabase confirma el correo y lo devuelve al portal con un `?code=...` que la app
// canjea por la sesión (PKCE, ver lib/supabase.js).
//
// ⚠️ ESE CANJE FALLA SEGUIDO, Y EL CORREO IGUAL QUEDA CONFIRMADO.
//
// Era el bug de "confirmo el correo, no entra al panel, y si entro de nuevo anda". Dos
// causas, las dos verificadas en el código de Supabase Auth (internal/api/verify.go,
// token.go y models/flow_state.go):
//
//   1. El canje VENCE A LOS 5 MINUTOS DE HABERSE REGISTRADO, no de haber tocado el link
//      (`FlowState.IsExpired` mide desde `CreatedAt` para todo lo que no es magic link, y
//      `defaultFlowStateExpiryDuration` es 300 s). Quien tarda más en abrir el correo
//      —casi todo el mundo— vuelve con un código que ya no sirve: 422 flow_state_expired.
//   2. El código solo se puede canjear en el MISMO navegador donde se registró, porque la
//      otra mitad (el `code-verifier`) quedó guardada ahí. Registrarse en la compu y abrir
//      el correo en el celular no puede funcionar nunca.
//
// En los dos casos Supabase YA confirmó el correo antes de redirigir (el código se emite
// adentro de la misma transacción que la confirmación). Por eso entrar con la contraseña
// anda. Lo que estaba mal es que la app no decía nada: caía al login en silencio.
//
// ⭐ EL ARREGLO DE FONDO ES `token_hash`. Si la plantilla "Confirm signup" de Supabase manda
// `{{ .SiteURL }}/?alta=1&token_hash={{ .TokenHash }}&type=email`, la app confirma con
// `verifyOtp`, que no necesita el code-verifier ni vence a los 5 minutos (dura lo que dure el
// link). Esta función lo detecta; mientras la plantilla siga siendo la de fábrica, entra por
// el `?code=` de siempre y, si falla, la pantalla de entrada lo explica.
// ============================================

/**
 * La marca que el alta pone en su URL de retorno (`emailRedirectTo`). Sin ella no hay
 * forma de distinguir el `?code=` de un alta del de Google o del de recuperar contraseña.
 */
export const MARCA_DE_ALTA = 'alta';

/** Los `type` de Supabase que confirman un alta. `signup` es el viejo; `email`, el actual. */
const TIPOS_DE_ALTA = ['email', 'signup'];

/** Todo lo que la vuelta del correo deja en la barra de direcciones. */
const PARAMETROS_DE_LA_VUELTA = [
  MARCA_DE_ALTA, 'code', 'token_hash', 'type', 'error', 'error_code', 'error_description', 'sb',
];

/**
 * Qué trajo el link del correo, o null si esta URL no es la vuelta de un alta.
 *
 * <p>Todo viaja en el search real, nunca adentro del hash: así arma Supabase la vuelta
 * (`https://portal/?alta=1&code=abc`), y así queda la plantilla con `token_hash`.</p>
 *
 * @param {string} href la URL con la que se abrió la pestaña (lib/supabase → INITIAL_URL)
 * @returns {{ tokenHash: string|null, tipo: string|null, traiaCodigo: boolean, error: string|null }|null}
 */
export function leerVueltaDelCorreo(href) {
  if (!href) return null;

  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const p = url.searchParams;
  const tipo = p.get('type');
  const tokenHash = p.get('token_hash') && TIPOS_DE_ALTA.includes(tipo) ? p.get('token_hash') : null;
  if (!p.has(MARCA_DE_ALTA) && !tokenHash) return null;

  return {
    tokenHash,
    tipo: tokenHash ? tipo : null,
    traiaCodigo: p.has('code'),
    error: p.get('error_description') || p.get('error') || null,
  };
}

/**
 * Qué decirle a quien volvió del correo y quedó en la pantalla de entrada (o sea, sin sesión:
 * si el canje anduvo ya está en el Lobby y esto no se pregunta).
 *
 * @param {ReturnType<typeof leerVueltaDelCorreo>} vuelta
 * @returns {{ tipo: 'ok'|'error', texto: string }|null}
 */
export function avisoDeLaVuelta(vuelta) {
  if (!vuelta) return null;

  // Hubo código y no hubo error: Supabase confirmó el correo. Lo que falló es el canje
  // (venció o es otro navegador), y eso se arregla entrando con la contraseña.
  if (vuelta.traiaCodigo && !vuelta.error) {
    return {
      tipo: 'ok',
      texto: 'Tu correo quedó confirmado. Entrá con tu email y tu contraseña.',
    };
  }

  // Supabase devolvió un error (link usado dos veces, o vencido), o el token_hash no se
  // pudo canjear. No se sabe si el correo llegó a confirmarse: se dicen los dos caminos.
  if (vuelta.error || vuelta.tokenHash) {
    return {
      tipo: 'error',
      texto: 'Ese enlace ya se usó o venció. Si ya confirmaste tu correo, entrá con tu email '
        + 'y tu contraseña. Si no, registrate de nuevo con el mismo email y te llega otro.',
    };
  }

  return null;
}

/**
 * Saca de la barra de direcciones lo que dejó la vuelta del correo, sin tocar la ruta del
 * hash. Un `?code=` vencido que queda ahí se vuelve a intentar canjear en cada recarga.
 *
 * <p>Se llama DESPUÉS de que Supabase leyó la URL (o sea, después de `getSession()`): antes
 * le sacaría el código de abajo.</p>
 */
export function limpiarVueltaDelCorreo() {
  try {
    const url = new URL(window.location.href);
    PARAMETROS_DE_LA_VUELTA.forEach((nombre) => url.searchParams.delete(nombre));
    window.history.replaceState(window.history.state, '', url.toString());
  } catch { /* sin history (o una URL rara): queda como estaba, no rompe nada */ }
}
