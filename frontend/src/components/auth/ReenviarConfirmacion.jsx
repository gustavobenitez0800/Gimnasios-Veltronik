import { useEffect, useState } from 'react';
import { authService } from '../../services';
import { useToast } from '../../contexts/ToastContext';

/** Supabase deja pedir el correo de confirmación una vez por minuto por dirección. */
export const ESPERA_SEGUNDOS = 60;

/** Lo que contesta Supabase cuando se pide antes del minuto, o cuando se pasó el tope por hora. */
function esPorEsperar(error) {
  const texto = String(error?.message || '');
  return error?.status === 429 || /rate limit|security purposes|after \d+ seconds/i.test(texto);
}

/**
 * «¿No te llegó? Reenviar el correo». Para la cuenta creada que todavía no tocó el link.
 *
 * <p>El correo sale bien (Resend lo entrega en el mismo minuto), pero Hotmail, Outlook, Yahoo y
 * a veces Gmail mandan a Spam, Promociones o «Correo no deseado» a un remitente nuevo. Sin este
 * botón la persona quedaba trabada: la cuenta existe, no la puede abrir, y no había cómo pedir
 * otro correo (02/11/2026, un posible cliente y un cliente recién instalado).</p>
 *
 * @param {{ email: string, esperaInicial?: number }} props esperaInicial: los segundos hasta poder
 *        pedirlo (en el alta, el correo acaba de salir; en el login, se puede pedir ya)
 */
export default function ReenviarConfirmacion({ email, esperaInicial = ESPERA_SEGUNDOS }) {
  const { showToast } = useToast();
  const [faltan, setFaltan] = useState(esperaInicial);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (faltan <= 0) return undefined;
    const t = setTimeout(() => setFaltan((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [faltan]);

  const reenviar = async () => {
    setEnviando(true);
    try {
      await authService.reenviarConfirmacion(email);
      showToast(`Listo: te mandamos otro correo a ${email}. Mirá también en Spam o Correo no deseado.`, 'success', 8000);
      setFaltan(ESPERA_SEGUNDOS);
    } catch (error) {
      if (esPorEsperar(error)) {
        showToast('Ya se mandó uno hace muy poco. Esperá un minuto y pedí otro.', 'warning');
        setFaltan(ESPERA_SEGUNDOS);
      } else {
        showToast('No se pudo mandar el correo. Probá de nuevo en un rato.', 'error');
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <p className="auth-links">
      ¿No te llegó?{' '}
      <button type="button" className="link-button" onClick={reenviar} disabled={!email || enviando || faltan > 0}>
        {enviando ? 'Mandando…' : faltan > 0 ? `Reenviar el correo (en ${faltan} s)` : 'Reenviar el correo'}
      </button>
    </p>
  );
}
