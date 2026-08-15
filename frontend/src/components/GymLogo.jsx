// ============================================
// VELTRONIK - LOGO DEL GIMNASIO (presentación)
// ============================================
// Un solo componente decide cómo se ve la identidad de un gimnasio en toda la app.
// Antes cada card del lobby dibujaba el logo de VELTRONIK (uno viejo, además) para
// todos los gimnasios por igual: el dueño de tres sucursales veía tres veces el
// mismo dibujo ajeno donde debería estar su marca.
//
// Cascada, de más propio a más genérico:
//   1. La imagen que subió el dueño.
//   2. El emoji que eligió.
//   3. La inicial del nombre del gimnasio.
// Nunca el logo de Veltronik: la marca de la plataforma vive en el header, no
// haciéndose pasar por la marca del cliente.

import { DEFAULT_LOGO_EMOJI } from '../lib/logo';

export default function GymLogo({ logoUrl, logoEmoji, name = '', size = 72, className = '' }) {
  const boxStyle = { width: size, height: size, fontSize: Math.round(size * 0.46) };

  if (logoUrl) {
    return (
      <span className={`gym-logo ${className}`} style={boxStyle}>
        <img src={logoUrl} alt={name ? `Logo de ${name}` : 'Logo del gimnasio'} className="gym-logo-img" />
      </span>
    );
  }

  const emoji = logoEmoji || (name ? null : DEFAULT_LOGO_EMOJI);
  if (emoji) {
    return (
      <span className={`gym-logo ${className}`} style={boxStyle} role="img" aria-label="Logo del gimnasio">
        {emoji}
      </span>
    );
  }

  // Sin imagen ni emoji: la inicial del nombre. Se ve intencional, no vacío.
  return (
    <span className={`gym-logo gym-logo-initial ${className}`} style={boxStyle} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
