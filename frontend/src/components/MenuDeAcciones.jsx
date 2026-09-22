// ============================================
// VELTRONIK - EL MENÚ "⋯" DE UNA FILA
// ============================================
// Lo que se usa poco o es peligroso (ver el historial, eliminar) no va como botón suelto en
// cada fila: va acá. Con cinco botones de colores por fila, la de Socios medía 94 px de alto y
// "Eliminar" quedaba a un dedo de "Cobrar".
//
// El menú se dibuja fijo sobre la pantalla (portal al body), no adentro de la tabla: la tabla
// tiene scroll propio y un menú absoluto adentro quedaba cortado en las últimas filas.
// ============================================

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

/**
 * @param {Array<{etiqueta: string, icono?: string, onClick: () => void, peligro?: boolean}>} acciones
 * @param {string} [titulo] lo que dice el botón para quien no ve (y el tooltip)
 */
export default function MenuDeAcciones({ acciones, titulo = 'Más acciones' }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const boton = useRef(null);
  const menu = useRef(null);

  // Se ubica debajo del botón, alineado a su derecha; si no entra abajo, arriba.
  useLayoutEffect(() => {
    if (!abierto || !boton.current) return;
    const r = boton.current.getBoundingClientRect();
    const alto = menu.current?.offsetHeight || 0;
    const ancho = menu.current?.offsetWidth || 180;
    const top = r.bottom + 6 + alto > window.innerHeight ? r.top - 6 - alto : r.bottom + 6;
    setPos({ top: Math.max(8, top), left: Math.max(8, r.right - ancho) });
  }, [abierto]);

  // Se cierra con un clic afuera, con Escape, y al scrollear (quedaría flotando lejos de su fila).
  useEffect(() => {
    if (!abierto) return undefined;
    const afuera = (e) => {
      if (menu.current?.contains(e.target) || boton.current?.contains(e.target)) return;
      setAbierto(false);
    };
    const tecla = (e) => {
      if (e.key === 'Escape') { setAbierto(false); boton.current?.focus(); }
    };
    const cerrar = () => setAbierto(false);
    document.addEventListener('mousedown', afuera);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    // El primer ítem recibe el foco: el menú se usa también con el teclado.
    menu.current?.querySelector('button')?.focus();
    return () => {
      document.removeEventListener('mousedown', afuera);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [abierto]);

  return (
    <>
      <button
        ref={boton}
        type="button"
        className="action-btn-quick action-btn-mas"
        title={titulo}
        aria-label={titulo}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <Icon name="dotsVertical" />
      </button>
      {abierto && createPortal(
        <div ref={menu} className="menu-acciones" role="menu" style={{ top: pos.top, left: pos.left }}>
          {acciones.map((a) => (
            <button
              key={a.etiqueta}
              type="button"
              role="menuitem"
              className={`menu-acciones-item${a.peligro ? ' es-peligro' : ''}`}
              onClick={() => { setAbierto(false); a.onClick(); }}
            >
              {a.icono && <Icon name={a.icono} size="1em" />}
              <span>{a.etiqueta}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
