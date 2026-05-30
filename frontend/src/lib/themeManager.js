// ============================================
// VELTRONIK - DYNAMIC THEME MANAGER (White-Label)
// ============================================
// Permite "blanquear" la plataforma cambiando
// los tokens CSS nativos en tiempo de ejecución.
// ============================================

/**
 * Convierte un color HEX a RGB para usar en rgba()
 */
function hexToRgb(hex) {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = "0x" + hex[1] + hex[1];
    g = "0x" + hex[2] + hex[2];
    b = "0x" + hex[3] + hex[3];
  } else if (hex.length === 7) {
    r = "0x" + hex[1] + hex[2];
    g = "0x" + hex[3] + hex[4];
    b = "0x" + hex[5] + hex[6];
  }
  return `${+r}, ${+g}, ${+b}`;
}

/**
 * Ajusta la luminosidad de un HEX (para generar la paleta completa)
 */
function adjustColor(color, amount) {
    return '#' + color.replace(/^#/, '').replace(/../g, color => ('0'+Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
}

/**
 * Aplica un color primario personalizado a toda la aplicación
 * @param {string} baseColorHex - Color Hexadecimal (ej: #FF0000 para rojo)
 */
export function applyOrganizationTheme(baseColorHex) {
  if (!baseColorHex) return;

  const root = document.documentElement;
  
  // Generar la paleta a partir del color base
  const primary500 = baseColorHex;
  const primary400 = adjustColor(baseColorHex, 20);
  const primary600 = adjustColor(baseColorHex, -20);
  const primary900 = adjustColor(baseColorHex, -60);
  
  // Inyectar CSS Variables globalmente
  root.style.setProperty('--primary-400', primary400);
  root.style.setProperty('--primary-500', primary500);
  root.style.setProperty('--primary-600', primary600);
  root.style.setProperty('--primary-900', primary900);
  
  // Adaptar sombras dinámicas
  const rgb = hexToRgb(primary500);
  root.style.setProperty('--shadow-glow', `0 0 20px rgba(${rgb}, 0.15)`);
  
  // Notificar por consola para debugging
  console.log(`%c[Veltronik Theme] White-Label activado: ${baseColorHex}`, `color: ${baseColorHex}; font-weight: bold;`);
}

/**
 * Restaura el tema original de Veltronik
 */
export function resetTheme() {
  const root = document.documentElement;
  root.style.removeProperty('--primary-400');
  root.style.removeProperty('--primary-500');
  root.style.removeProperty('--primary-600');
  root.style.removeProperty('--primary-900');
  root.style.removeProperty('--shadow-glow');
}
