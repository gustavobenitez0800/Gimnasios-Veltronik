// ============================================
// VELTRONIK - COBRAR LA CUOTA, SIN IRSE DE SOCIOS
// ============================================
// Antes cobrarle a alguien era: Socios → clic en $ → SALTAR a Pagos → aparece un formulario
// vacío → buscar de nuevo al socio → elegir el arancel → escribir el monto → elegir las
// fechas del período → guardar. Siete pasos y un cambio de pantalla para cobrar una cuota,
// que es la operación más común del gimnasio.
//
// Acá es: clic en $ → confirmar. El arancel ya lo tiene el socio, y el monto sale del
// arancel.
//
// ⚠️ NO SE PIDEN FECHAS, Y ES A PROPÓSITO.
//
// El vencimiento lo corre el BACKEND al aplicar la cobertura. Si además lo calculáramos
// acá habría dos cuentas para lo mismo — y en este proyecto TODA cuenta de fechas duplicada
// terminó estando mal en alguna de sus copias (los días de vencimiento aparecieron en cinco
// lugares, los rangos rápidos en dos, sumar un mes en dos). La pantalla no adivina el
// vencimiento nuevo: lo pide después y muestra el que quedó de verdad.

import { useState, useEffect, useMemo } from 'react';
import Modal, { ModalActions } from './ui/Modal';
import Icon from './Icon';
import { formatCurrency, formatDate } from '../lib/utils';
import { arancelDelSocio } from '../controllers/formSocio';

/** Los mismos nombres y el mismo orden que usa la pantalla de Pagos. */
const METODOS = [
  { valor: 'cash', etiqueta: 'Efectivo' },
  { valor: 'transfer', etiqueta: 'Transferencia' },
  { valor: 'mercadopago', etiqueta: 'Mercado Pago' },
  { valor: 'card', etiqueta: 'Tarjeta' },
];

export default function CobroRapido({ socio, aranceles, abierto, onCerrar, onCobrar }) {
  const [planId, setPlanId] = useState('');
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('cash');
  const [guardando, setGuardando] = useState(false);
  // Lo que el servidor contestó: el vencimiento REAL que quedó, no uno adivinado acá.
  const [resultado, setResultado] = useState(null);

  const situacion = useMemo(() => arancelDelSocio(socio, aranceles), [socio, aranceles]);

  // Al abrir, todo arranca del arancel que ya tiene el socio. Es la diferencia entre
  // "confirmar" y "volver a cargar todo".
  useEffect(() => {
    if (!abierto || !socio) return;
    const suyo = situacion.arancel;
    setPlanId(socio.planId || '');
    setMonto(suyo ? String(suyo.price ?? '') : '');
    setMetodo('cash');
    setResultado(null);
  }, [abierto, socio, situacion.arancel]);

  const elegido = aranceles?.find((a) => a.id === planId) || null;

  const elegirArancel = (id) => {
    setPlanId(id);
    // El monto sigue al arancel, pero se puede pisar a mano: hay descuentos, cuotas partidas
    // y arreglos que ningún catálogo contempla.
    const a = aranceles?.find((x) => x.id === id);
    if (a) setMonto(String(a.price ?? ''));
  };

  const confirmar = async (e) => {
    e?.preventDefault();
    const importe = parseFloat(monto);
    if (!(importe > 0)) return;

    setGuardando(true);
    try {
      const r = await onCobrar({ planId: planId || null, monto: importe, metodo });
      // `r` trae el socio actualizado. Si el backend no lo devolvió, se cierra sin mentir
      // sobre el vencimiento nuevo.
      setResultado(r || {});
    } finally {
      setGuardando(false);
    }
  };

  if (!socio) return null;

  // ─── Ya se cobró: lo que se muestra es lo que dijo el servidor ───
  if (resultado) {
    return (
      <Modal
        isOpen={abierto}
        onClose={onCerrar}
        title="Cobro registrado"
        actions={<button className="btn btn-primary" onClick={onCerrar}>Listo</button>}
      >
        <div className="cobro-hecho">
          <div className="cobro-hecho-tilde"><Icon name="checkCircle" size="2em" /></div>
          <p className="cobro-hecho-quien">
            <strong>{socio.fullName}</strong> pagó {formatCurrency(parseFloat(monto) || 0)}
          </p>
          {resultado.membershipEnd ? (
            <p className="cobro-hecho-vence">
              Ahora vence el <strong>{formatDate(resultado.membershipEnd)}</strong>
            </p>
          ) : (
            /* Sin dato del servidor no se inventa una fecha: decir un vencimiento que no
               es el real es peor que no decir ninguno. */
            <p className="form-hint">El vencimiento se actualizó. Refrescá para verlo.</p>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={abierto}
      onClose={onCerrar}
      title={`Cobrar cuota — ${socio.fullName}`}
    >
      {/* ⚠️ LOS BOTONES VAN ADENTRO DEL <form>.
          El Modal dibuja la ranura `actions` como hermana del contenido, o sea FUERA del
          formulario — y un <button type="submit"> fuera de su form no envía nada. El botón
          quedaba dibujado, con el monto y todo, y al apretarlo no pasaba absolutamente nada. */}
      <form onSubmit={confirmar} noValidate>

        {/* ⚠️ El socio tiene un arancel que ya no se vende. Se avisa ACÁ, que es el momento
            en que importa: si no, el dueño se entera cuando el monto no es el que esperaba. */}
        {situacion.dadoDeBaja && (
          <p className="form-hint cobro-aviso">
            <Icon name="alertTriangle" size="0.9em" />
            {socio.planNombre
              ? ` "${socio.planNombre}" ya no está en la lista de aranceles. Elegí uno vigente.`
              : ' El arancel de este socio ya no está en la lista. Elegí uno vigente.'}
          </p>
        )}

        <div className="form-group">
          <label className="form-label">Arancel</label>
          <select className="form-select" value={planId} onChange={(e) => elegirArancel(e.target.value)}>
            <option value="">Sin arancel (monto a mano)</option>
            {(aranceles || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {formatCurrency(a.price)}
              </option>
            ))}
          </select>
          {elegido && (
            <small className="form-hint">
              {elegido.durationDays > 0 && `Suma ${elegido.durationDays} días`}
              {elegido.durationDays > 0 && elegido.classes ? ' · ' : ''}
              {elegido.classes ? `${elegido.classes} clases` : ''}
              {/* Lo dice el backend cuando aplica la cobertura. Acá NO se calcula la fecha:
                  dos cuentas para lo mismo es exactamente lo que ya salió mal antes. */}
            </small>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Monto</label>
          <input
            type="number" inputMode="decimal" min="0"
            className="form-input cobro-monto"
            value={monto} placeholder="0" autoFocus
            onChange={(e) => setMonto(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Cómo pagó</label>
          <div className="cobro-metodos">
            {METODOS.map((m) => (
              // Botones y no un desplegable: son cuatro opciones y esto se usa veinte veces
              // por día. Un clic contra tres (abrir, buscar, elegir).
              <button
                key={m.valor}
                type="button"
                className={`cobro-metodo ${metodo === m.valor ? 'elegido' : ''}`}
                onClick={() => setMetodo(m.valor)}
              >
                {m.etiqueta}
              </button>
            ))}
          </div>
        </div>

        <p className="form-hint">
          El vencimiento lo corre el sistema según el arancel. No hace falta tocar fechas.
        </p>

        <ModalActions
          onCancel={onCerrar}
          saving={guardando}
          submitText={monto ? `Cobrar ${formatCurrency(parseFloat(monto) || 0)}` : 'Cobrar'}
        />
      </form>
    </Modal>
  );
}
