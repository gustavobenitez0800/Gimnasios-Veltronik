// ============================================
// VELTRONIK - ELEGIR EL LOGO DEL GIMNASIO
// ============================================
// Aparece en el alta (para que el dueño vea SU marca desde el minuto uno de los 14
// días de prueba) y en Ajustes (para cambiarla después).
//
// Es opcional a propósito: nadie debería quedar trabado en el alta buscando el
// archivo del logo. Si no sube nada, elige un emoji de un toque — y si tampoco hace
// eso, queda el emoji por defecto. El resultado es que NINGÚN gimnasio nace sin cara.

import { useRef, useState } from 'react';
import Icon from './Icon';
import GymLogo from './GymLogo';
import { fileToSquareDataUrl, LOGO_EMOJIS } from '../lib/logo';

/**
 * @param {object}   props
 * @param {string?}  props.logoUrl   data URI de la imagen elegida (o null)
 * @param {string?}  props.logoEmoji emoji elegido (o null)
 * @param {string}   props.name      nombre del gimnasio (para la vista previa)
 * @param {Function} props.onChange  recibe ({ logoUrl, logoEmoji })
 * @param {Function} props.onError   mensaje listo para mostrar (toast)
 */
export default function LogoPicker({ logoUrl, logoEmoji, name = '', onChange, onError }) {
  const inputRef = useRef(null);
  const [processing, setProcessing] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    // El input se limpia SIEMPRE: si no, elegir dos veces el mismo archivo no
    // dispara el evento (el value no cambió) y parece que la app se colgó.
    e.target.value = '';
    if (!file) return;

    setProcessing(true);
    try {
      const { dataUrl, colorDetectado } = await fileToSquareDataUrl(file);
      // Al subir una imagen el emoji se descarta: no hay dos identidades a la vez.
      // colorDetectado viaja como dato: quien recibe decide si lo usa (Ajustes sí,
      // el alta del gimnasio todavía no tiene dónde ponerlo).
      onChange({ logoUrl: dataUrl, logoEmoji: null, colorDetectado });
    } catch (err) {
      onError?.(err.message || 'No pudimos procesar esa imagen.');
    } finally {
      setProcessing(false);
    }
  };

  const pickEmoji = (emoji) => {
    onChange({ logoUrl: null, logoEmoji: emoji });
  };

  return (
    <div className="logo-picker">
      <div className="logo-picker-main">
        <GymLogo logoUrl={logoUrl} logoEmoji={logoEmoji} name={name} size={84} />

        <div className="logo-picker-actions">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => inputRef.current?.click()}
            disabled={processing}
          >
            {processing
              ? <><span className="spinner" /> Procesando…</>
              : <><Icon name="image" size="1em" /> {logoUrl ? 'Cambiar imagen' : 'Subir logo'}</>}
          </button>

          {(logoUrl || logoEmoji) && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => onChange({ logoUrl: null, logoEmoji: null })}
              disabled={processing}
            >
              Quitar
            </button>
          )}

          <p className="logo-picker-hint">Opcional. PNG o JPG — lo recortamos cuadrado solos.</p>
        </div>
      </div>

      <div className="logo-picker-emojis" role="group" aria-label="Elegir un ícono en vez de una imagen">
        <span className="logo-picker-emojis-label">o elegí un ícono</span>
        <div className="logo-picker-emoji-row">
          {LOGO_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={`logo-emoji-option ${!logoUrl && logoEmoji === emoji ? 'selected' : ''}`}
              onClick={() => pickEmoji(emoji)}
              aria-label={`Usar el ícono ${emoji}`}
              aria-pressed={!logoUrl && logoEmoji === emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFile}
        style={{ display: 'none' }}
        tabIndex={-1}
      />
    </div>
  );
}
