// ============================================
// VELTRONIK - EL CARTEL DEL CHECK-IN (Ajustes)
// ============================================
// Donde el dueño saca el QR que va pegado en la puerta. Se imprime y se cuelga: eso es todo
// el hardware que necesita la entrada automática en el plan básico.

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import apiClient from '../lib/apiClient';
import { portalUrl } from '../lib/portal';
import { useToast } from '../contexts/ToastContext';
import Icon from './Icon';
import { ConfirmDialog } from './Layout';

export default function CheckinQrSettings() {
  const { showToast } = useToast();
  const [puntos, setPuntos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [rotarId, setRotarId] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/gym/checkin-points');
      setPuntos(Array.isArray(data) ? data : []);
    } catch {
      setPuntos([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async (reemplazar = null) => {
    setCreando(true);
    try {
      await apiClient.post('/gym/checkin-points', reemplazar ? { reemplazar } : {});
      await cargar();
      showToast(reemplazar ? 'Cartel nuevo listo — imprimilo y reemplazá el viejo' : 'Cartel creado', 'success');
    } catch (e) {
      showToast(e.response?.data?.error || 'No pudimos crear el cartel', 'error');
    } finally {
      setCreando(false);
      setRotarId(null);
    }
  };

  const activo = puntos[0];
  // La URL que viaja adentro del QR. HashRouter, así que la ruta va después del #.
  const url = activo ? portalUrl(`/#/marcar/${activo.token}`) : '';

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">
        <Icon name="qrCode" size="1.1em" /> Entrada por QR
      </h3>
      <p className="settings-section-desc">
        Imprimí este cartel y pegalo en la entrada. El socio lo escanea con su celular y queda
        registrada su entrada o su salida, sin que nadie del mostrador tenga que hacer nada.
      </p>

      {cargando && <p className="text-muted">Cargando…</p>}

      {!cargando && !activo && (
        <button className="btn btn-primary" disabled={creando} onClick={() => crear(null)}>
          {creando ? 'Creando…' : 'Crear el cartel'}
        </button>
      )}

      {!cargando && activo && (
        <>
          <div className="qr-poster">
            <p className="qr-poster-title">Marcá tu entrada</p>
            <p className="qr-poster-sub">Escaneá con la cámara de tu celular</p>
            {/* Nivel Q de corrección: el cartel va a vivir pegado a una pared, y va a
                juntar dedos, humedad y algún raspón. Con nivel Q sigue leyéndose con
                hasta un cuarto del código dañado. */}
            <QRCodeSVG value={url} size={220} level="Q" includeMargin />
            <p className="qr-poster-foot">La primera vez te va a pedir tu documento. Después es un toque.</p>
          </div>

          <div className="settings-actions" style={{ marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={() => window.print()}>
              <Icon name="download" size="1em" /> Imprimir
            </button>
            <button className="btn btn-secondary" onClick={() => setRotarId(activo.id)}>
              Generar uno nuevo
            </button>
          </div>

          <p className="settings-hint" style={{ marginTop: '0.75rem' }}>
            Generá uno nuevo si sospechás que alguien le sacó una foto al cartel para marcar
            entrada desde afuera. El viejo deja de funcionar en el momento.
          </p>
        </>
      )}

      <ConfirmDialog
        open={!!rotarId}
        title="¿Generar un cartel nuevo?"
        message={
          'El cartel que está colgado va a dejar de funcionar apenas confirmes. ' +
          'Vas a tener que imprimir el nuevo y reemplazarlo, o los socios no van a poder marcar.'
        }
        confirmText="Generar y reemplazar"
        onConfirm={() => crear(rotarId)}
        onCancel={() => setRotarId(null)}
      />
    </div>
  );
}
