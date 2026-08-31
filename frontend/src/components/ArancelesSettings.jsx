// ============================================
// VELTRONIK — ARANCELES (Ajustes)
// ============================================
// El catálogo de lo que vende el gimnasio. Cada arancel otorga DOS cosas, y puede otorgar
// las dos a la vez:
//
//   · DÍAS   → cuánto tiempo cubre
//   · CLASES → cuántas visitas incluye
//
// La cobertura del socio se agota por lo que pase primero. Un "1 mes / 12 clases" cubre un
// mes, o doce visitas.
//
// Por qué existe esta pantalla: antes, cobrar era escribir el monto y las fechas a mano en
// cada cobro. Vender un trimestral y olvidarse de correr el "período hasta" dejaba al socio
// con un mes, y nadie se enteraba hasta que no lo dejaban entrar.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { planService, errorService } from '../services';
import { useToast } from '../contexts/ToastContext';
import { formatCurrency } from '../lib/utils';
import { ConfirmDialog } from './Layout';
import Icon from './Icon';

const FORM_VACIO = { name: '', price: '', durationDays: '', classes: '' };

export default function ArancelesSettings() {
  const { showToast } = useToast();
  const [planes, setPlanes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(FORM_VACIO);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aDarDeBaja, setADarDeBaja] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setPlanes(await planService.getAll());
    } catch (e) {
      showToast(errorService.getMessage(e), 'error');
    } finally {
      setCargando(false);
    }
  }, [showToast]);

  useEffect(() => { cargar(); }, [cargar]);

  const limpiar = () => { setForm(FORM_VACIO); setEditando(null); };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Ponele un nombre al arancel', 'error'); return; }

    const dias = parseInt(form.durationDays, 10) || 0;
    // Vacío y cero son cosas distintas: vacío es "este arancel no cuenta visitas", cero
    // sería un arancel que no deja entrar nunca. Se manda null para el primero.
    const clases = form.classes === '' ? null : (parseInt(form.classes, 10) || 0);

    if (dias === 0 && (clases === null || clases === 0)) {
      showToast('El arancel tiene que dar días, clases, o las dos cosas', 'error');
      return;
    }

    setGuardando(true);
    try {
      const cuerpo = {
        name: form.name.trim(),
        price: parseFloat(form.price) || 0,
        durationDays: dias,
        classes: clases,
      };
      if (editando) await planService.update(editando, cuerpo);
      else await planService.create(cuerpo);
      showToast(editando ? 'Arancel actualizado' : 'Arancel creado', 'success');
      limpiar();
      cargar();
    } catch (e) {
      showToast(errorService.getMessage(e), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const editar = (p) => {
    setEditando(p.id);
    setForm({
      name: p.name || '',
      price: p.price ?? '',
      durationDays: p.durationDays ?? '',
      classes: p.classes ?? '',
    });
  };

  const confirmarBaja = async () => {
    try {
      await planService.darDeBaja(aDarDeBaja.id);
      showToast('Arancel dado de baja', 'success');
      cargar();
    } catch (e) {
      showToast(errorService.getMessage(e), 'error');
    } finally {
      setADarDeBaja(null);
    }
  };

  const reactivar = async (p) => {
    try {
      await planService.reactivar(p.id);
      showToast('Arancel reactivado', 'success');
      cargar();
    } catch (e) {
      showToast(errorService.getMessage(e), 'error');
    }
  };

  /** "1 mes y 30 clases", "12 clases", "7 días" — en criollo, no en campos. */
  const queOtorga = (p) => {
    const partes = [];
    if (p.durationDays > 0) {
      partes.push(p.durationDays % 30 === 0 && p.durationDays >= 30
        ? `${p.durationDays / 30} ${p.durationDays === 30 ? 'mes' : 'meses'}`
        : `${p.durationDays} ${p.durationDays === 1 ? 'día' : 'días'}`);
    }
    if (p.classes != null) partes.push(`${p.classes} ${p.classes === 1 ? 'clase' : 'clases'}`);
    return partes.join(' y ') || '—';
  };

  return (
    <div className="settings-section">
      <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="wallet" size="1.2em" /> Aranceles
      </h2>
      <p className="text-muted" style={{ fontSize: '.9rem', marginTop: '-.5rem' }}>
        Lo que vende el gimnasio. Al cobrar se elige uno y el sistema aplica solo los días y
        las clases que corresponden — sin escribir fechas a mano.
      </p>

      <form onSubmit={guardar} style={{ marginTop: '1rem' }}>
        <div className="modal-form">
          <div className="form-group full-width">
            <label className="form-label">Nombre *</label>
            <input className="form-input" value={form.name} placeholder="Pase libre"
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Precio</label>
            <input type="number" className="form-input" value={form.price} placeholder="45000"
              onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Días que cubre</label>
            <input type="number" className="form-input" value={form.durationDays} placeholder="30"
              onChange={(e) => setForm(f => ({ ...f, durationDays: e.target.value }))} />
            <small className="form-hint">Un mes son 30. Dejalo en 0 si es un pack de clases sueltas.</small>
          </div>
          <div className="form-group">
            <label className="form-label">Clases que incluye</label>
            <input type="number" className="form-input" value={form.classes} placeholder="30"
              onChange={(e) => setForm(f => ({ ...f, classes: e.target.value }))} />
            <small className="form-hint">
              <strong>Dejalo vacío si este plan no cuenta visitas.</strong> Vacío y 0 no son lo
              mismo: 0 sería un plan que no deja entrar nunca.
            </small>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.6rem', marginTop: '1rem' }}>
          <button type="submit" className="btn btn-primary" disabled={guardando}>
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Agregar arancel'}
          </button>
          {editando && <button type="button" className="btn btn-secondary" onClick={limpiar}>Cancelar</button>}
        </div>
      </form>

      <div className="table-container" style={{ marginTop: '1.5rem' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Arancel</th><th>Precio</th><th>Otorga</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan="4" className="text-center text-muted" style={{ padding: '2rem' }}>
                <span className="spinner" /> Cargando…</td></tr>
            ) : planes.length === 0 ? (
              <tr><td colSpan="4" className="text-center text-muted" style={{ padding: '2rem' }}>
                Todavía no cargaste ningún arancel</td></tr>
            ) : planes.map(p => (
              <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                <td data-label="Arancel">
                  <strong>{p.name}</strong>
                  {!p.active && <small className="text-muted" style={{ display: 'block' }}>dado de baja</small>}
                </td>
                <td data-label="Precio">{formatCurrency(p.price)}</td>
                <td data-label="Otorga">{queOtorga(p)}</td>
                <td data-label="Acciones">
                  <div style={{ display: 'flex', gap: '.4rem' }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => editar(p)}>Editar</button>
                    {p.active
                      ? <button className="btn btn-sm btn-secondary" onClick={() => setADarDeBaja(p)}>Dar de baja</button>
                      : <button className="btn btn-sm btn-secondary" onClick={() => reactivar(p)}>Reactivar</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!aDarDeBaja}
        title="¿Dar de baja este arancel?"
        message={`"${aDarDeBaja?.name}" deja de aparecer al cobrar, pero no se borra: los pagos que ya se hicieron con él lo siguen nombrando. Se puede reactivar cuando quieras.`}
        confirmText="Dar de baja"
        onConfirm={confirmarBaja}
        onCancel={() => setADarDeBaja(null)}
      />
    </div>
  );
}
