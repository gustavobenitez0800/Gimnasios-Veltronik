// ============================================
// VELTRONIK - LA RUEDA DEL MOUSE NO TOCA LOS NÚMEROS
// ============================================
// En Chrome (y en Electron), girar la rueda con el cursor arriba de un campo numérico que
// tiene el foco le suma o le resta uno. En una app de plata eso es un monto que cambia solo:
// quien escribió 45000 y bajó la página con la rueda cobró 44997 sin enterarse.
//
// La salida conocida: al primer giro sobre el campo enfocado, se le saca el foco. La página
// scrollea como siempre y el número queda como estaba. Uno solo para toda la app (lo arma
// App.jsx), en vez de acordarse de poner un onWheel en cada campo.
// ============================================

/** @returns {() => void} para desarmarlo */
export function frenarRuedaEnNumeros(doc = document) {
  const alGirar = (e) => {
    const campo = e.target;
    if (campo instanceof HTMLInputElement && campo.type === 'number' && campo === doc.activeElement) {
      campo.blur();
    }
  };
  // Pasivo: no frena el scroll de la página, solo le saca el foco al campo.
  doc.addEventListener('wheel', alGirar, { passive: true });
  return () => doc.removeEventListener('wheel', alGirar);
}
