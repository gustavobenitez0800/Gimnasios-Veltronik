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
// POR QUÉ SE CONSULTA CADA TANTO Y NO EN VIVO
// Un canal en tiempo real (websocket) sería más elegante y traería una conexión permanente
// que mantener, justo en el sistema donde acabamos de sacar a la nube del camino crítico.
// Preguntar cada 20 segundos alcanza de sobra: entre que el socio escanea y llega al
// mostrador pasa más que eso.
//
// Y solo mientras la pestaña está a la vista: un terminal olvidado abierto toda la noche no
// tiene por qué seguir preguntando.

import { useState, useEffect, useCallback, useRef } from 'react';
import { accessService } from '../services';
import Icon from './Icon';

const CADA_MS = 20000;

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

export default function AvisosMostrador() {
  const [avisos, setAvisos] = useState([]);
  const [ocultando, setOcultando] = useState(null);
  const vigente = useRef(true);

  const cargar = useCallback(async () => {
    // Sin pestaña visible no se pregunta: un terminal olvidado abierto toda la noche no
    // tiene por qué seguir consultando.
    if (document.visibilityState !== 'visible') return;
    try {
      const data = await accessService.getAvisos();
      if (vigente.current) setAvisos(Array.isArray(data) ? data : []);
    } catch {
      // En silencio: esto es un extra sobre la pantalla de accesos. Que falle no puede
      // ensuciar el mostrador con un error — la recepcionista no puede hacer nada al
      // respecto y tiene gente esperando.
    }
  }, []);

  useEffect(() => {
    vigente.current = true;
    cargar();
    const t = setInterval(cargar, CADA_MS);
    // Al volver a la pestaña se refresca en el acto, sin esperar el próximo ciclo.
    document.addEventListener('visibilitychange', cargar);
    return () => {
      vigente.current = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', cargar);
    };
  }, [cargar]);

  const atender = async (aviso) => {
    setOcultando(aviso.accesoId);
    // Se saca de la lista en el acto: la recepcionista ya está hablando con el socio y no
    // tiene por qué esperar a que vuelva el servidor para ver que su clic hizo algo.
    setAvisos((prev) => prev.filter((a) => a.accesoId !== aviso.accesoId));
    try {
      await accessService.marcarAvisoVisto(aviso.accesoId);
    } catch {
      // Si falló, vuelve en el próximo ciclo. Mejor que reaparezca a que se pierda.
    } finally {
      setOcultando(null);
    }
  };

  if (avisos.length === 0) return null;

  return (
    <div className="avisos-mostrador">
      <h3 className="avisos-titulo">
        <Icon name="alertTriangle" size="1em" />
        {avisos.length === 1 ? 'Un socio entró y necesita atención' : `${avisos.length} socios entraron y necesitan atención`}
      </h3>

      <ul className="avisos-lista">
        {avisos.map((a) => (
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
