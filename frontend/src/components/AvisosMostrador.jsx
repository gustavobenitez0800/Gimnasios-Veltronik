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
import { horaDe } from '../lib/utils';

/** Qué decirle a la recepcionista, según la situación del socio. */
const TEXTO = {
  VENCIDO: (a) => `tiene la cuota vencida hace ${a.diasVencido === 1 ? '1 día' : `${a.diasVencido} días`}`,
  EN_GRACIA: (a) => `se le venció la cuota hace ${a.diasVencido === 1 ? '1 día' : `${a.diasVencido} días`}`,
  INACTIVO: () => 'figura dado de baja',
  SIN_DATOS: () => 'no tiene fecha de vencimiento cargada en su ficha',
};


/**
 * El estado del rechazado se recalcula al mostrarlo, así que puede haberse resuelto solo entre
 * que la puerta lo frenó y que alguien mire la lista — típicamente porque pagó en el mostrador.
 *
 * <p>Ese caso es el MÁS común de todos y con el texto genérico quedaba como "revisá su ficha",
 * que no dice nada. Es justo al revés: es la buena noticia, y lo único que hay que hacer es
 * avisarle que ya puede pasar.</p>
 */
const TEXTO_RECHAZO = {
  ...TEXTO,
  AL_DIA: () => 'ya está al día. Si acaba de pagar, avisale que puede volver a pasar',
};

/**
 * Encabezados y texto según de dónde viene el aviso.
 *
 * <p>QR y molinete resuelven el mismo problema —un socio que necesita que alguien le hable—
 * pero cuentan cosas distintas: al del QR <b>lo dejó entrar</b> el sistema; al del molinete
 * <b>la puerta lo frenó</b>. Mezclarlos en un solo texto haría que la recepcionista no sepa si
 * el socio está adentro o se quedó en la vereda.</p>
 */
/**
 * Por dónde entró, dicho en el aviso (03/11/2026). Antes los avisos eran solo del QR; ahora
 * también avisa el que pasó el llavero o el que reconoció el molinete facial, y quien atiende
 * tiene que saber cuál fue. Un backend viejo no manda el método: el aviso dice la hora, como antes.
 */
const POR_DONDE = {
  QR: 'con el QR',
  LLAVERO: 'con el llavero',
  FACIAL: 'por el molinete',
};

const VARIANTES = {
  entrada: {
    titulo: (n) => (n === 1 ? 'Un socio entró y necesita atención' : `${n} socios entraron y necesitan atención`),
    marcar: (id) => accessService.marcarAvisoVisto(id),
    frase: (a) => ` ${(TEXTO[a.estado] || (() => 'necesita atención'))(a)} · entró ${POR_DONDE[a.metodo] ? `${POR_DONDE[a.metodo]}, ` : ''}${horaDe(a.hora)}`,
  },
  rechazo: {
    titulo: (n) => (n === 1 ? 'La puerta frenó a un socio' : `La puerta frenó a ${n} socios`),
    marcar: (id) => accessService.marcarRechazoVisto(id),
    // Al rechazado la puerta NO lo dejó pasar, así que el texto es sobre por qué se lo frenó.
    frase: (a) => ` quiso entrar por el molinete y no pudo: ${(TEXTO_RECHAZO[a.estado] || (() => 'revisá su ficha'))(a)} · ${horaDe(a.hora)}`,
  },
};

/**
 * La lista de socios que necesitan atención en el mostrador.
 *
 * @param variante 'entrada' (entró solo y no está al día) o 'rechazo' (la puerta lo frenó). El
 *                 único cambio real es el encabezado, el texto y a qué endpoint se le avisa "visto".
 * @param onCobrar ⭐ cobrarle ahí mismo (03/11/2026): sin esto, el «OK» era lo único que había y
 *                 para cobrarle había que irse a Socios a buscarlo. Recibe el aviso y su variante.
 * @param compacto la versión chica, la de la tarjeta que flota en las otras pantallas
 */
export default function AvisosMostrador({ avisos = [], onAtendido, onCobrar, variante = 'entrada', compacto = false }) {
  const v = VARIANTES[variante] || VARIANTES.entrada;
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
      await v.marcar(aviso.accesoId);
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
    <div className={`avisos-mostrador${compacto ? ' is-compacto' : ''}`}>
      <h3 className="avisos-titulo">
        <Icon name="alertTriangle" size="1em" />
        {v.titulo(visibles.length)}
      </h3>

      <ul className="avisos-lista">
        {visibles.map((a) => (
          <li key={a.accesoId} className={`aviso ${a.estado === 'SIN_DATOS' ? 'is-dato' : 'is-plata'}`}>
            <div className="aviso-info">
              <strong>{a.nombre}</strong>
              <span>{v.frase(a)}</span>
            </div>
            <div className="aviso-acciones">
              {/* Al que ya está al día (pagó entre que lo frenaron y ahora) no hay nada que cobrarle. */}
              {onCobrar && a.estado !== 'AL_DIA' && (
                <button
                  className="btn btn-primary aviso-btn"
                  onClick={() => onCobrar(a, variante)}
                  disabled={ocultando === a.accesoId}
                >
                  Cobrar
                </button>
              )}
              <button
                className="btn btn-secondary aviso-btn"
                onClick={() => atender(a)}
                disabled={ocultando === a.accesoId}
              >
                OK
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
