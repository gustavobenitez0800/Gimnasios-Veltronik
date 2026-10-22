// ============================================
// VELTRONIK - LA TARJETA QUE SE COMPLETA MIENTRAS SE ESCRIBE
// ============================================
// El dibujo de la tarjeta en el cobro (CardCheckout): muestra lo que el dueño va cargando,
// se ilumina en la parte que está llenando y se da vuelta cuando va al código de seguridad.
//
// Solo dibuja: todo lo que muestra llega por props, y es lo que Mercado Pago deja saber
// (ver lib/tarjeta). Es decorativa para un lector de pantalla: los datos de verdad están en
// los campos del formulario, con sus etiquetas.

import marcaVeltronik from '../../assets/marca-veltronik.svg';
import {
  numeroEnLaTarjeta, nombreEnLaTarjeta, vencimientoEnLaTarjeta, codigoEnLaTarjeta,
} from '../../lib/tarjeta';

// Cómo se escribe cada marca en el plástico. Las débito llevan el mismo logo que su crédito.
const LOGOS = {
  visa: 'VISA', debvisa: 'VISA',
  master: 'mastercard', debmaster: 'mastercard',
  amex: 'AMEX', naranja: 'Naranja X', cabal: 'cabal', debcabal: 'cabal',
  maestro: 'maestro', argencard: 'argencard', cencosud: 'cencosud', diners: 'Diners',
};

/**
 * @param {'escribiendo'|'pagando'|'aprobada'|'rechazada'} estado
 * @param {object|null} marca       lo que devuelve marcaDeLaTarjeta()
 * @param {string|null} bin         primeros dígitos que avisó Mercado Pago
 * @param {string|null} ultimos4    los últimos 4, cuando ya hay token
 * @param {string}      nombre      el titular, tal como se está escribiendo
 * @param {object}      vencimiento { valido, mes, anio }
 * @param {boolean}     dadaVuelta  el dorso a la vista (foco en el código)
 * @param {'numero'|'nombre'|'vencimiento'|null} foco  la parte que se está llenando
 */
export default function TarjetaEnVivo({
  estado = 'escribiendo', marca = null, bin = null, ultimos4 = null, nombre = '',
  vencimiento = {}, dadaVuelta = false, foco = null,
}) {
  const logo = marca ? (LOGOS[marca.id] || marca.nombre) : '';
  const tipo = marca ? (marca.debito ? 'DÉBITO' : 'CRÉDITO') : '';
  const numero = numeroEnLaTarjeta({ bin, ultimos4, largo: marca?.largo });

  return (
    <div
      className={`tarjeta-en-vivo${dadaVuelta ? ' dada-vuelta' : ''}`}
      data-estado={estado}
      data-marca={marca?.id || 'ninguna'}
      data-foco={foco || undefined}
      aria-hidden="true"
    >
      <div className="tarjeta-giro">
        <div className="tarjeta-cara tarjeta-frente">
          <div className="tarjeta-fila">
            <img className="tarjeta-logo" src={marcaVeltronik} alt="" />
            <span className="tarjeta-tipo">{tipo}</span>
          </div>

          <div className="tarjeta-fila tarjeta-fila-chip">
            <span className="tarjeta-chip" />
            {/* El símbolo de pago sin contacto: tres arcos. */}
            <svg className="tarjeta-contactless" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M8.5 8.5a5 5 0 0 1 0 7" />
              <path d="M12 6a8.5 8.5 0 0 1 0 12" />
              <path d="M15.5 3.5a12 12 0 0 1 0 17" />
            </svg>
          </div>

          <div className="tarjeta-numero tarjeta-zona" data-zona="numero">{numero}</div>

          <div className="tarjeta-fila tarjeta-fila-abajo">
            <div className="tarjeta-dato tarjeta-zona" data-zona="nombre">
              <small>Titular</small>
              <span>{nombreEnLaTarjeta(nombre)}</span>
            </div>
            <div className="tarjeta-dato tarjeta-zona" data-zona="vencimiento">
              <small>Vence</small>
              <span>{vencimientoEnLaTarjeta(vencimiento)}</span>
            </div>
            <span className="tarjeta-marca">{logo}</span>
          </div>
        </div>

        <div className="tarjeta-cara tarjeta-dorso">
          <div className="tarjeta-banda" />
          <div className="tarjeta-firma">
            <span className="tarjeta-codigo">{codigoEnLaTarjeta(marca?.largoCodigo)}</span>
          </div>
          <p className="tarjeta-leyenda">
            Mercado Pago procesa esta tarjeta. Veltronik no ve ni guarda sus datos.
          </p>
          <span className="tarjeta-marca">{logo}</span>
        </div>
      </div>
    </div>
  );
}
