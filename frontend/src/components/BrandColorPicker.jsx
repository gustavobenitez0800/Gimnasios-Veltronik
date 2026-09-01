// ============================================
// VELTRONIK - COLOR DEL SISTEMA (elección del dueño)
// ============================================
// El dueño elige UN color y de ahí sale la paleta entera. No se le piden diez
// tonos: nadie que atiende un gimnasio va a elegir diez que combinen, y si los
// elige mal la app queda ilegible. Se pide el color de su marca —el del cartel—
// y la curva del diseño hace el resto.

import { COLORES_SUGERIDOS, COLOR_VELTRONIK, derivarPaleta } from '../lib/brandColor';

export default function BrandColorPicker({ value, onChange, disabled = false }) {
  const elegido = value || null;
  const paleta = derivarPaleta(elegido || COLOR_VELTRONIK);

  return (
    <div className="brand-color">
      <div className="brand-color-swatches">
        {COLORES_SUGERIDOS.map(({ nombre, hex }) => (
          <button
            key={hex}
            type="button"
            className={`brand-color-swatch ${elegido?.toLowerCase() === hex ? 'is-selected' : ''}`}
            style={{ '--swatch': hex }}
            onClick={() => onChange(hex)}
            disabled={disabled}
            title={nombre}
            aria-label={`Usar el color ${nombre}`}
            aria-pressed={elegido?.toLowerCase() === hex}
          />
        ))}

        {/* Cualquier otro color. El <input type="color"> abre el selector del sistema
            operativo, que ya sabe de ruedas cromáticas y de pegar un código hex. */}
        <label
          className={`brand-color-swatch brand-color-custom ${
            elegido && !COLORES_SUGERIDOS.some((c) => c.hex === elegido.toLowerCase()) ? 'is-selected' : ''
          }`}
          title="Otro color"
        >
          <input
            type="color"
            value={elegido || COLOR_VELTRONIK}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-label="Elegir otro color"
          />
        </label>
      </div>

      {/* La muestra: los pasos que el sistema realmente usa, para que la decisión
          se tome viendo el resultado y no imaginándolo. */}
      <div className="brand-color-preview" style={paleta}>
        <span className="brand-color-preview-btn">Cobrar cuota</span>
        <span className="brand-color-preview-chip">Al día</span>
        <span className="brand-color-preview-link">Ver socios</span>
      </div>

      <p className="brand-color-hint">
        {elegido ? (
          <>
            Pinta el sistema: botones, íconos y resaltados. <strong>No cambia el lobby ni la
            pantalla de ingreso</strong>, que son de Veltronik.{' '}
            <button type="button" className="brand-color-reset" onClick={() => onChange(null)} disabled={disabled}>
              Volver al original
            </button>
          </>
        ) : (
          <>Está con el color original de Veltronik. Elegí uno para que el sistema use el de tu gimnasio.</>
        )}
      </p>
    </div>
  );
}
