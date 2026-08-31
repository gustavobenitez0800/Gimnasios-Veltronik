// ============================================
// VELTRONIK - EL CARTEL DEL QR, EN ACCESOS
// ============================================
// Vive acá y no en Ajustes porque es parte de operar la puerta, no de configurar el negocio.
// La recepcionista que maneja los accesos es la que necesita el cartel a mano.
//
// SE DESCARGA UNA IMAGEN, NO UNA HOJA
// Antes esto se imprimía como una A4 entera con títulos y texto. Un dueño no quiere una hoja:
// quiere el código para mandarlo a imprimir del tamaño que se le antoje, plastificarlo, o
// pegarlo en un cartel que ya tiene. Se baja un PNG grande y cuadrado, y él decide el resto.

import { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import apiClient from '../lib/apiClient';
import { portalUrl } from '../lib/portal';
import { useToast } from '../contexts/ToastContext';
import Icon from './Icon';
import { ConfirmDialog } from './Layout';

// Lado del PNG que se descarga. 1024 px alcanza para imprimirlo del tamaño de una hoja sin
// que se vea pixelado, y sigue siendo un archivo liviano.
const LADO_DESCARGA = 1024;

export default function CheckinQrPanel({ puedeAdministrar }) {
  const { showToast } = useToast();
  const [punto, setPunto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [confirmarRotar, setConfirmarRotar] = useState(false);
  const cajaQr = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/gym/checkin-points', { timeout: 8000 });
      setPunto(Array.isArray(data) && data.length > 0 ? data[0] : null);
    } catch {
      setPunto(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { if (puedeAdministrar) cargar(); else setCargando(false); }, [cargar, puedeAdministrar]);

  const crear = async (reemplazar = null) => {
    setTrabajando(true);
    try {
      const { data } = await apiClient.post('/gym/checkin-points', reemplazar ? { reemplazar } : {});
      setPunto(data);
      showToast(reemplazar ? 'Cartel nuevo listo — imprimilo y reemplazá el viejo' : 'Cartel creado', 'success');
    } catch (e) {
      showToast(e.response?.data?.error || 'No pudimos crear el cartel', 'error');
    } finally {
      setTrabajando(false);
      setConfirmarRotar(false);
    }
  };

  /**
   * Baja el QR solo, como PNG cuadrado.
   *
   * <p>Se dibuja en un canvas propio en vez de exportar el que está en pantalla: el de la
   * pantalla es chico (para que entre en el panel) y ampliarlo saldría borroso. Acá se genera
   * grande de una, con fondo blanco — un QR sobre fondo transparente impreso en papel oscuro
   * no lo lee ningún teléfono.</p>
   */
  const descargar = () => {
    const chico = cajaQr.current?.querySelector('canvas');
    if (!chico) return;

    const grande = document.createElement('canvas');
    grande.width = LADO_DESCARGA;
    grande.height = LADO_DESCARGA;
    const ctx = grande.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LADO_DESCARGA, LADO_DESCARGA);
    // Sin suavizado: un QR es una grilla de cuadrados, y el suavizado le come los bordes
    // justo donde la cámara necesita el contraste.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(chico, 0, 0, LADO_DESCARGA, LADO_DESCARGA);

    const a = document.createElement('a');
    a.href = grande.toDataURL('image/png');
    a.download = 'veltronik-qr-entrada.png';
    a.click();
    showToast('Imagen descargada', 'success');
  };

  if (!puedeAdministrar) return null;

  return (
    <div className="qr-panel">
      <div className="qr-panel-head">
        <h3><Icon name="qrCode" size="1em" /> Cartel de entrada</h3>
        <p>
          El socio lo escanea con su celular y queda registrada su entrada o su salida, sin que
          nadie del mostrador tenga que hacer nada.
        </p>
      </div>

      {cargando && <p className="text-muted">Cargando…</p>}

      {!cargando && !punto && (
        <button className="btn btn-primary" disabled={trabajando} onClick={() => crear(null)}>
          {trabajando ? 'Creando…' : 'Crear el cartel'}
        </button>
      )}

      {!cargando && punto && (
        <div className="qr-panel-body">
          <div className="qr-panel-code" ref={cajaQr}>
            {/* Nivel Q de corrección: el cartel va a vivir pegado a una pared y va a juntar
                dedos, humedad y algún raspón. Con nivel Q sigue leyéndose con hasta un cuarto
                del código dañado. */}
            <QRCodeCanvas
              value={portalUrl(`/#/marcar/${punto.token}`)}
              size={200}
              level="Q"
              includeMargin
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>

          <div className="qr-panel-actions">
            <button className="btn btn-primary" onClick={descargar}>
              <Icon name="download" size="1em" /> Descargar imagen
            </button>
            <button className="btn btn-secondary" disabled={trabajando} onClick={() => setConfirmarRotar(true)}>
              Generar uno nuevo
            </button>
            <p className="qr-panel-hint">
              Se baja el código solo, en grande. Imprimilo del tamaño que quieras, plastificalo
              y pegalo donde te sirva.
            </p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmarRotar}
        title="¿Generar un cartel nuevo?"
        message={
          'El cartel que está colgado va a dejar de funcionar apenas confirmes. Vas a tener que '
          + 'imprimir el nuevo y reemplazarlo, o los socios no van a poder marcar.'
        }
        confirmText="Generar y reemplazar"
        onConfirm={() => crear(punto?.id)}
        onCancel={() => setConfirmarRotar(false)}
      />
    </div>
  );
}
