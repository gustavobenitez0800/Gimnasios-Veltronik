// ============================================
// VELTRONIK - AVISOS DEL MOSTRADOR
// ============================================
// La otra punta del check-in por QR.
//
// EL PROBLEMA QUE RESUELVE
// Cuando un socio vencido escanea el cartel, el aviso aparece en SU teléfono — que es lo
// correcto, así nadie más se entera de que debe la cuota. Pero ahí moría: la recepcionista
// solo lo habría sabido mirando la lista de accesos y cruzando a mano el estado de cada
// uno, o sea nunca. El socio entraba, entrenaba y se iba, y la deuda seguía.
//
// LOS DATOS LLEGAN DE AFUERA, NO LOS PIDE
// Antes este componente consultaba por su cuenta cada 20 segundos, sumando un tercer viaje
// de ida y vuelta a una pantalla que ya hacía dos. Ahora los avisos vienen en el mismo
// pedido que el resto del mostrador: menos red, y los tres datos siempre coherentes entre
// sí (antes podían llegar con segundos de diferencia y mostrar a alguien en una lista y no
// en la otra).

import { useState } from 'react';
import { accessService } from '../services';
import Icon from './Icon';

/** Qué decirle a la recepcionista, según la situación del socio. */
const TEXTO = {
  VENCIDO: (a) => `tiene la cuota vencida hace ${a.diasVencido} días`,
  EN_GRACIA: (a) => `se le venció la cuota hace ${a.diasVencido === 1 ? '1 día' : `${a.diasVencido} días`}`,
  INACTIVO: () => 'figura dado de baja',
  SIN_DATOS: () => 'no tiene fecha de vencimiento cargada en su ficha',
};

function hora(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function AvisosMostrador({ avisos = [], onAtendido }) {
  const [ocultando, setOcultando] = useState(null);
  // Los que la recepcionista acaba de resolver: se sacan en el acto, sin esperar al
  // servidor. Ella ya está hablando con el socio y no tiene por qué mirar cómo el aviso
  // sigue ahí mientras vuelve la respuesta.
  const [atendidos, setAtendidos] = useState([]);

  const visibles = avisos.filter((a) => !atendidos.includes(a.accesoId));

  const atender = async (aviso) => {
    setOcultando(aviso.accesoId);
    setAtendidos((prev) => [...prev, aviso.accesoId]);
    try {
      await accessService.marcarAvisoVisto(aviso.accesoId);
      onAtendido?.();
    } catch {
      // Si falló, vuelve en el próximo refresco. Mejor que reaparezca a que se pierda:
      // un aviso que se traga silenciosamente es un socio al que nadie le habló.
      setAtendidos((prev) => prev.filter((id) => id !== aviso.accesoId));
    } finally {
      setOcultando(null);
    }
  };

  if (visibles.length === 0) return null;

  return (
    <div className="avisos-mostrador">
      <h3 className="avisos-titulo">
        <Icon name="alertTriangle" size="1em" />
        {visibles.length === 1 ? 'Un socio entró y necesita atención' : `${visibles.length} socios entraron y necesitan atención`}
      </h3>

      <ul className="avisos-lista">
        {visibles.map((a) => (
          <li key={a.accesoId} className={`aviso ${a.estado === 'SIN_DATOS' ? 'is-dato' : 'is-plata'}`}>
            <div className="aviso-info">
              <strong>{a.nombre}</strong>
              <span> {(TEXTO[a.estado] || (() => 'necesita atención'))(a)}</span>
              <span className="aviso-hora"> · entró {hora(a.hora)}</span>
            </div>
            <button
              className="btn btn-secondary aviso-btn"
              onClick={() => atender(a)}
              disabled={ocultando === a.accesoId}
            >
              Ya lo hablé
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
