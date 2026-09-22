// ============================================
// VELTRONIK - EL QR DE LA ENTRADA, EN LA PANTALLA DEL MOSTRADOR
// ============================================
// Pedido del dueño (2026-09-22): que el socio escanee el QR desde la pantalla de Accesos, sin
// que nadie tenga que abrir el botón "Cartel de entrada". Ocupa el lugar que tenía "En el
// gimnasio ahora" (esa lista sigue en su propia pantalla, "En el gimnasio").
//
// Es el MISMO código que está pegado en la pared: el socio lo escanea con el celular, marca
// desde ahí, y la entrada aparece en el mostrador.
//
// ⭐ LO VE CUALQUIERA DEL EQUIPO, no solo el dueño: el mostrador lo atiende recepción. Lo que
// sigue siendo del dueño es crearlo o cambiarlo (CheckinPointController).
//
// ⭐ SIN INTERNET SE SIGUE MOSTRANDO. El celular del socio tiene su propia conexión, así que
// el QR sirve aunque la PC del mostrador se haya quedado sin red: se guarda el último que se
// vio y se muestra ese.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import apiClient from '../lib/apiClient';
import { portalUrl } from '../lib/portal';
import { useToast } from '../contexts/ToastContext';
import Icon from './Icon';

const clave = () => `veltronik_qr_entrada_${localStorage.getItem('current_org_id') || ''}`;

function leerGuardado() {
  try { return localStorage.getItem(clave()) || null; } catch { return null; }
}

function guardar(token) {
  try {
    if (token) localStorage.setItem(clave(), token);
    else localStorage.removeItem(clave());
  } catch { /* sin almacenamiento: se muestra igual mientras haya conexión */ }
}

export default function QrParaEscanear({ puedeCrear }) {
  const { showToast } = useToast();
  const [token, setToken] = useState(leerGuardado);
  // 'cargando' | 'listo' | 'sin-cartel' | 'sin-conexion'
  const [estado, setEstado] = useState(() => (leerGuardado() ? 'listo' : 'cargando'));
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await apiClient.get('/gym/checkin-points/activo', { timeout: 8000 });
      const nuevo = res.status === 200 ? res.data?.token || null : null;
      setToken(nuevo);
      guardar(nuevo);
      setEstado(nuevo ? 'listo' : 'sin-cartel');
    } catch {
      // Sin red, o un backend viejo: si ya se había visto uno, ese sigue sirviendo.
      setEstado(leerGuardado() ? 'listo' : 'sin-conexion');
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async () => {
    setCreando(true);
    try {
      const { data } = await apiClient.post('/gym/checkin-points', {});
      setToken(data?.token || null);
      guardar(data?.token || null);
      setEstado(data?.token ? 'listo' : 'sin-cartel');
      showToast('Listo: los socios ya pueden escanearlo', 'success');
    } catch (e) {
      showToast(e.response?.data?.error || 'No pudimos crear el QR', 'error');
    } finally {
      setCreando(false);
    }
  };

  return (
    <aside className="card access-qr" aria-label="QR para marcar la entrada">
      {estado === 'listo' && token ? (
        <>
          <div className="access-qr-titulo">
            <Icon name="qrCode" size="1.1em" />
            <span>Escaneá para marcar tu entrada</span>
          </div>
          {/* Nivel Q, como el cartel impreso. En SVG y no en canvas: se agranda con la pantalla
              sin ponerse borroso, y la cámara del celular necesita bordes nítidos. */}
          <div className="access-qr-codigo">
            <QRCodeSVG
              value={portalUrl(`/#/marcar/${token}`)}
              level="Q"
              marginSize={2}
              bgColor="#ffffff"
              fgColor="#000000"
              title="QR de la entrada"
            />
          </div>
          <p className="access-qr-ayuda">Con la cámara del celular. No hace falta instalar nada.</p>
        </>
      ) : estado === 'cargando' ? (
        <p className="text-muted access-qr-vacio"><span className="spinner" /> Cargando el QR…</p>
      ) : estado === 'sin-conexion' ? (
        <p className="text-muted access-qr-vacio">
          Sin conexión: el QR aparece acá apenas vuelva internet.
        </p>
      ) : (
        <div className="access-qr-vacio">
          <Icon name="qrCode" size="2.5em" />
          <p>Todavía no hay un QR de entrada.</p>
          {puedeCrear ? (
            <button className="btn btn-primary" disabled={creando} onClick={crear}>
              {creando ? 'Creando…' : 'Crear el QR'}
            </button>
          ) : (
            <p className="text-muted">Lo crea el dueño desde esta misma pantalla.</p>
          )}
        </div>
      )}
    </aside>
  );
}
