// ============================================
// VELTRONIK — ARANCELES (Ajustes)
// ============================================
// El catálogo de lo que vende el gimnasio: un nombre, un precio y CUÁNTOS DÍAS cubre.
//
// ⛔ EL CUPO DE CLASES SE DIO DE BAJA (2026-09-02). La cobertura la decide solo la fecha:
// se paga el mes y se entra, se vence y hay que renovar. El arancel sigue siendo la
// ETIQUETA de qué pagó el socio —para saber quién está en qué plan y cuánto se le cobra—
// pero ya no descuenta visitas. Contar clases hacía que un socio al día con la plata
// apareciera bloqueado, que es una discusión que nadie quiere tener en el mostrador.
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
// Lo que cubre un arancel, en las palabras de un dueño de gimnasio (ADR-013). La lista y su
// traducción viven en un solo lugar porque Pagos y el cobro rápido dicen lo mismo.
import { COBERTURAS, claveCobertura, etiquetaCobertura } from '../lib/cobertura';

/** El default es UN MES, y es el corazón de la decisión: sin pensar nada, la cuota corre. */
const FORM_VACIO = { name: '', price: '', cobertura: '1|MES' };

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


    setGuardando(true);
    try {
      const cuerpo = {
        name: form.name.trim(),
        price: parseFloat(form.price) || 0,
        coberturaCantidad: parseInt(form.cobertura.split('|')[0], 10),
        coberturaUnidad: form.cobertura.split('|')[1],
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
      // Un arancel viejo que todavía no tenga cobertura cargada se muestra como un mes, que
      // es el default: es lo que la migración le puso a todos.
      cobertura: claveCobertura(p),
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

  return (
    <div className="settings-section">
      <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="cash" size="1.2em" /> Aranceles
      </h2>
      <p className="text-muted" style={{ fontSize: '.9rem', marginTop: '-.5rem' }}>
        Lo que vende el gimnasio. Al cobrar se elige uno y el sistema aplica solo los días
        que corresponden, sin escribir fechas a mano.
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
            <label className="form-label">Cuánto cubre</label>
            <select className="form-input" value={form.cobertura}
              onChange={(e) => setForm(f => ({ ...f, cobertura: e.target.value }))}>
              {COBERTURAS.map((c) => (
                <option key={c.valor} value={c.valor}>{c.etiqueta}</option>
              ))}
            </select>
            <small className="form-hint">
              Un mes vence el mismo día del mes que viene. El arancel dice qué entrena el
              socio; el tiempo lo corre el sistema.
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
                <span className="spinner" /> Cargando...</td></tr>
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
                <td data-label="Otorga">{etiquetaCobertura(p)}</td>
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
