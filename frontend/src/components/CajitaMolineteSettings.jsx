// ============================================
// VELTRONIK - LA CAJITA DEL MOLINETE (relé por USB)
// ============================================
// Ajustes → Cajita del molinete. Para cualquier molinete con traba eléctrica o con entrada de
// "abrir": la cajita (una Raspberry Pi Pico con un relé, enchufada por USB a esta PC) lo abre
// cuando entra alguien que puede pasar. Ver lib/cajitaMolinete.js y docs/molinete/cajita.md.
//
// Acá se la busca, se le instala o actualiza el programa, se elige cómo está cableada al
// molinete y cuánto tiempo abre, y si esta PC abre también en la salida.
//
// No es el molinete facial (MolineteSettings): aquel decide solo y nosotros le mandamos la
// lista; esta no decide nada y abre cuando el mostrador la manda.
// ============================================

import { useState, useEffect } from 'react';
import { useCajitaMolinete } from '../hooks/useCajitaMolinete';
import {
  conectarCajita, ordenarALaCajita, configurarCajita, programarCajita, fijarAbrirEnLaSalida,
  MODOS, VERSION_DEL_PROGRAMA,
} from '../lib/cajitaMolinete';
import { useToast } from '../contexts/ToastContext';
import { formatDate } from '../lib/utils';
import Icon from './Icon';

const TEXTO_DE_LA_FASE = {
  'sin-conectar': 'Todavía no se buscó.',
  buscando: 'Buscando…',
  programando: 'Instalando el programa… no la desenchufes.',
  'sin-cajita': 'No hay ninguna cajita enchufada a esta computadora.',
  muda: 'Hay una placa enchufada, pero no contesta: no tiene el programa de Veltronik, o lo tiene abierto otro programa.',
  'no-soportado': 'Esta versión no puede hablarle a la cajita.',
};

const COMO_ESTA_CABLEADA = {
  [MODOS.SOSTENER]: {
    titulo: 'El relé sostiene la traba',
    detalle: 'El molinete se traba mientras la cajita tiene el relé prendido, y se suelta para que pase alguien. Si se corta la luz o se apaga la PC, queda libre.',
    tiempo: 'Segundos abierto',
    sugerido: 5,
  },
  [MODOS.PULSO]: {
    titulo: 'Pulso para abrir',
    detalle: 'El molinete tiene su propia placa y abre con una señal en su entrada de «abrir» (la del botón). La cajita manda un pulso y el molinete hace el resto.',
    tiempo: 'Segundos del pulso',
    sugerido: 0.5,
  },
};

const nota = { color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 };

export default function CajitaMolineteSettings() {
  const { showToast } = useToast();
  const cajita = useCajitaMolinete();
  const [ocupado, setOcupado] = useState(false);
  // El tiempo se escribe en segundos y se guarda en la cajita en milisegundos.
  const [segundos, setSegundos] = useState('');
  useEffect(() => {
    if (cajita.abrirMs) setSegundos(String(cajita.abrirMs / 1000));
  }, [cajita.abrirMs]);

  const conectada = cajita.fase === 'conectada';
  const sabeConfigurarse = conectada && cajita.versionNumero >= 2;

  const buscar = async () => {
    setOcupado(true);
    const ok = await conectarCajita({ conGesto: true });
    setOcupado(false);
    showToast(ok ? 'La cajita contesta.' : 'No se encontró la cajita.', ok ? 'success' : 'error');
  };

  const programar = async () => {
    setOcupado(true);
    const r = await programarCajita({ conGesto: true });
    setOcupado(false);
    showToast(r.ok ? 'Programa instalado. La cajita contesta.' : r.motivo, r.ok ? 'success' : 'error');
  };

  const ordenar = async (orden, aviso) => {
    const ok = await ordenarALaCajita(orden);
    showToast(ok ? aviso : 'La cajita no recibió la orden.', ok ? 'success' : 'error');
  };

  const elegirModo = async (modo) => {
    // Cada modo tiene su tiempo de siempre: 5 s de traba suelta, medio segundo de pulso.
    const abrirMs = COMO_ESTA_CABLEADA[modo].sugerido * 1000;
    const ok = await configurarCajita({ modo, abrirMs });
    showToast(ok ? 'Guardado en la cajita.' : 'La cajita no guardó el cambio.', ok ? 'success' : 'error');
  };

  const guardarTiempo = async () => {
    const s = Number(String(segundos).replace(',', '.'));
    if (!(s >= 0.1 && s <= 30)) {
      showToast('Elegí entre 0,1 y 30 segundos.', 'error');
      return;
    }
    const ok = await configurarCajita({ abrirMs: Math.round(s * 1000) });
    showToast(ok ? 'Guardado en la cajita.' : 'La cajita no guardó el cambio.', ok ? 'success' : 'error');
  };

  const cableado = COMO_ESTA_CABLEADA[cajita.modo];

  return (
    <div className="settings-section">
      <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="doorEnter" size="1.1em" /> Cajita del molinete
      </h2>
      <p style={{ ...nota, marginBottom: '1rem' }}>
        Para un molinete con traba eléctrica o con entrada de «abrir»: la cajita va enchufada por
        USB a esta computadora y cableada al molinete. Cuando entra alguien que puede pasar —con su
        DNI o con el QR— el molinete se abre. Con la cuota vencida no se abre, y suena la X como
        siempre. Pasan los mismos que en el molinete facial: al día, en gracia o sin fecha cargada.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...nota, color: conectada ? 'var(--success, #22c55e)' : 'var(--text-muted)' }}>
          {conectada ? `Conectada${cajita.version ? ` · ${cajita.version}` : ''}.` : TEXTO_DE_LA_FASE[cajita.fase]}
        </span>
        {!conectada && cajita.fase !== 'programando' && (
          <button className="btn btn-secondary" onClick={buscar} disabled={ocupado || cajita.fase === 'buscando'}>
            {ocupado ? 'Buscando…' : 'Buscar la cajita'}
          </button>
        )}
        {/* Una cajita nueva (MicroPython sin nuestro programa) aparece como «muda»; una de la
            primera versión, conectada pero desactualizada. A las dos se les instala lo mismo. */}
        {(cajita.fase === 'muda' || (conectada && cajita.desactualizada)) && (
          <button className="btn btn-primary" onClick={programar} disabled={ocupado}>
            {cajita.fase === 'muda' ? 'Instalarle el programa' : `Actualizar el programa (versión ${VERSION_DEL_PROGRAMA})`}
          </button>
        )}
      </div>

      {conectada && cajita.desactualizada && (
        <p style={{ ...nota, marginTop: '0.75rem' }}>
          Tiene un programa viejo: abre y traba igual, pero para elegir cómo está cableada y cuánto
          tiempo abre hay que actualizarlo. Tarda unos segundos y no cambia nada más.
        </p>
      )}

      {sabeConfigurarse && (
        <div style={{ marginTop: '1rem' }}>
          <p className="form-label" style={{ marginBottom: '0.5rem' }}>Cómo está cableada al molinete</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {Object.entries(COMO_ESTA_CABLEADA).map(([modo, c]) => (
              <label key={modo} style={{ flex: '1 1 16rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="radio" name="cajita-modo" checked={cajita.modo === modo} onChange={() => elegirModo(modo)} />
                <span>
                  <strong>{c.titulo}</strong>
                  <span style={{ ...nota, display: 'block' }}>{c.detalle}</span>
                </span>
              </label>
            ))}
          </div>

          {cableado && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '1rem' }}>
              <div style={{ flex: '0 1 10rem' }}>
                <label className="form-label" htmlFor="cajita-segundos">{cableado.tiempo}</label>
                <input
                  id="cajita-segundos" className="form-input" inputMode="decimal"
                  value={segundos} onChange={(e) => setSegundos(e.target.value)}
                />
              </div>
              <button className="btn btn-secondary" onClick={guardarTiempo}>Guardar</button>
            </div>
          )}
        </div>
      )}

      {conectada && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <button className="btn btn-secondary" onClick={() => ordenar('ABRIR', 'Molinete abierto.')}>
            Abrir
          </button>
          <button className="btn btn-secondary" onClick={() => ordenar('LIBRE', 'Molinete en pase libre.')}>
            Pase libre
          </button>
          <button className="btn btn-secondary" onClick={() => ordenar('TRABAR', 'Molinete trabado.')}>
            Trabar
          </button>
        </div>
      )}

      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: '1rem', cursor: 'pointer' }}>
        <input
          type="checkbox" checked={cajita.abrirEnLaSalida}
          onChange={(e) => fijarAbrirEnLaSalida(e.target.checked)}
        />
        <span style={nota}>
          <strong style={{ color: 'var(--text-primary)' }}>Abrir también al registrar la salida.</strong>{' '}
          Para cuando por el molinete también se sale. Si se sale por otra puerta, dejalo sin marcar.
        </span>
      </label>

      {!cajita.habilitada && (
        <p style={{ ...nota, marginTop: '1rem' }}>
          <strong style={{ color: 'var(--text-primary)' }}>El control de acceso es del plan Premium.</strong>{' '}
          Con el plan de esta sucursal el molinete no se abre solo. Los botones de acá y
          «Abrir molinete» en Accesos andan igual.
        </p>
      )}

      {/* La prueba gratis incluye el molinete. Que deje de abrir solo el día que termina no
          puede ser una sorpresa: se avisa desde el primer día, con la fecha. */}
      {cajita.habilitada && cajita.pruebaHasta && (
        <p style={{ ...nota, marginTop: '1rem' }}>
          <strong style={{ color: 'var(--text-primary)' }}>
            Incluido en la prueba gratis, hasta el {formatDate(cajita.pruebaHasta)}.
          </strong>{' '}
          Después, para que el molinete siga abriendo solo, la sucursal tiene que estar en el plan
          Premium. Los botones de acá y «Abrir molinete» andan con cualquier plan.
        </p>
      )}

      <p style={{ ...nota, marginTop: '1rem' }}>
        «Pase libre» lo deja abierto hasta que aprietes «Trabar». Cómo armar e instalar una cajita
        nueva: la guía está en docs/molinete/cajita.md.
      </p>
    </div>
  );
}
