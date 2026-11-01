// ============================================
// VELTRONIK - LA CAJITA DEL MOLINETE (relé por USB)
// ============================================
// Ajustes → Cajita del molinete. Para el molinete que se traba con un relé (una cajita con una
// Raspberry Pi Pico, enchufada por USB a esta PC): el mostrador le dice «abrí» cuando entra un
// socio al día. Ver lib/cajitaMolinete.js.
//
// No es el molinete facial (MolineteSettings): aquel decide solo y nosotros le mandamos la
// lista; esta no decide nada y abre cuando el mostrador la manda.
// ============================================

import { useState } from 'react';
import { useCajitaMolinete } from '../hooks/useCajitaMolinete';
import { conectarCajita, ordenarALaCajita, APERTURA_MS } from '../lib/cajitaMolinete';
import { useToast } from '../contexts/ToastContext';
import Icon from './Icon';

const TEXTO_DE_LA_FASE = {
  'sin-conectar': 'Todavía no se buscó.',
  buscando: 'Buscando…',
  'sin-cajita': 'No hay ninguna cajita enchufada a esta computadora.',
  muda: 'Hay una placa enchufada, pero no contesta. Puede que otro programa la tenga abierta, o que no tenga el programa de Veltronik adentro.',
  'no-soportado': 'Esta versión no puede hablarle a la cajita.',
};

const nota = { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 };

export default function CajitaMolineteSettings() {
  const { showToast } = useToast();
  const cajita = useCajitaMolinete();
  const [ocupado, setOcupado] = useState(false);

  const buscar = async () => {
    setOcupado(true);
    const ok = await conectarCajita({ conGesto: true });
    setOcupado(false);
    showToast(ok ? 'La cajita contesta.' : 'No se encontró la cajita.', ok ? 'success' : 'error');
  };

  const ordenar = async (orden, aviso) => {
    const ok = await ordenarALaCajita(orden);
    showToast(ok ? aviso : 'La cajita no recibió la orden.', ok ? 'success' : 'error');
  };

  const conectada = cajita.fase === 'conectada';

  return (
    <div className="settings-section">
      <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="doorEnter" size="1.1em" /> Cajita del molinete
      </h2>
      <p style={{ ...nota, marginBottom: '1rem' }}>
        Para el molinete que se traba con la cajita del relé, enchufada por USB a esta computadora.
        Cuando entra un socio al día —con su DNI o con el QR— el molinete se abre {APERTURA_MS / 1000} segundos
        y vuelve a trabarse solo. Con la cuota vencida no se abre, y suena la X como siempre.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...nota, color: conectada ? 'var(--success, #22c55e)' : 'var(--text-muted)' }}>
          {conectada ? `Conectada${cajita.version ? ` · ${cajita.version}` : ''}.` : TEXTO_DE_LA_FASE[cajita.fase]}
        </span>
        {!conectada && (
          <button className="btn btn-secondary" onClick={buscar} disabled={ocupado || cajita.fase === 'buscando'}>
            {ocupado ? 'Buscando…' : 'Buscar la cajita'}
          </button>
        )}
      </div>

      {conectada && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <button className="btn btn-secondary" onClick={() => ordenar('ABRIR', 'Molinete abierto unos segundos.')}>
            Abrir {APERTURA_MS / 1000} segundos
          </button>
          <button className="btn btn-secondary" onClick={() => ordenar('LIBRE', 'Molinete en pase libre.')}>
            Pase libre
          </button>
          <button className="btn btn-secondary" onClick={() => ordenar('TRABAR', 'Molinete trabado.')}>
            Trabar
          </button>
        </div>
      )}

      {!cajita.habilitada && (
        <p style={{ ...nota, marginTop: '1rem' }}>
          <strong style={{ color: 'var(--text-primary)' }}>El control de acceso es del plan Premium.</strong>{' '}
          Con el plan de esta sucursal el molinete no se abre solo con el DNI. Los botones de acá y
          «Abrir molinete» en Accesos andan igual.
        </p>
      )}

      <p style={{ ...nota, marginTop: '1rem' }}>
        Si la computadora se apaga o se desenchufa la cajita, el molinete queda libre: así se
        puede salir siempre. «Pase libre» lo deja abierto hasta que aprietes «Trabar».
      </p>
    </div>
  );
}
