// ============================================
// VELTRONIK - PANTALLA DE CUENTA EN BORRADO
// ============================================
// Lo que ve alguien que pidió borrar su cuenta y todavía está dentro de los 30 días.
//
// ES LA PANTALLA DEL ARREPENTIMIENTO, y está escrita para eso. El sistema está cerrado
// —lo pidió— pero acá adentro lo único que importa es que pueda volver atrás con un clic
// si cambió de idea. Por eso el botón de cancelar es el principal, grande y primero.
//
// La cuenta regresiva no es decoración: es el dato que convierte una decisión abstracta en
// algo concreto. "Faltan 6 días" se entiende; "tu cuenta será eliminada próximamente" no.

import { useState } from 'react';
import { accountService } from '../services/AccountService';
import { useToast } from '../contexts/ToastContext';
import Icon from './Icon';

function fecha(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return ''; }
}

export default function CuentaEnBorrado({ estado, onCancelado }) {
  const { showToast } = useToast();
  const [cancelando, setCancelando] = useState(false);

  const cancelar = async () => {
    setCancelando(true);
    try {
      await accountService.cancelDeletion();
      showToast('Listo, tu cuenta ya no se va a borrar', 'success');
      onCancelado?.();
    } catch {
      showToast('No pudimos cancelar el borrado. Probá de nuevo.', 'error');
      setCancelando(false);
    }
  };

  const dias = estado?.diasRestantes ?? 0;

  return (
    <div className="borrado-page">
      <div className="borrado-card">
        <div className="borrado-icono"><Icon name="alertTriangle" size="2.2rem" /></div>

        <h1 className="borrado-titulo">Tu cuenta se va a borrar</h1>

        <p className="borrado-cuenta">
          <strong>{dias === 0 ? 'Hoy' : dias === 1 ? 'Falta 1 día' : `Faltan ${dias} días`}</strong>
          {estado?.programado && <span> · {fecha(estado.programado)}</span>}
        </p>

        <p className="borrado-texto">
          Ese día se elimina todo de forma definitiva: {estado?.gimnasios === 1
            ? 'tu gimnasio'
            : `tus ${estado?.gimnasios || 0} gimnasios`}, los socios, los pagos, los accesos y
          tu forma de entrar al sistema. No vamos a poder recuperarlo.
        </p>

        <p className="borrado-texto">
          Mientras tanto el sistema queda cerrado. Si te arrepentiste, con este botón vuelve
          todo a la normalidad.
        </p>

        <button className="btn btn-primary borrado-btn" onClick={cancelar} disabled={cancelando}>
          {cancelando ? 'Un momento…' : 'No borrar mi cuenta'}
        </button>

        {/* El dato que el cliente va a preguntar sí o sí, dicho ANTES de que lo descubra
            solo: al pedir el borrado se canceló el cobro en Mercado Pago, y ahí no existe
            "descancelar". Enterarse por un corte de servicio dos semanas después sería
            bastante peor que leerlo acá. */}
        <p className="borrado-nota">
          <Icon name="info" size="0.95em" />
          <span>
            Al pedir el borrado dimos de baja el cobro automático. Si volvés, vas a tener que
            cargar la tarjeta de nuevo para reactivar la suscripción.
          </span>
        </p>
      </div>
    </div>
  );
}
