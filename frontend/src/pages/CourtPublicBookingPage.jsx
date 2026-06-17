// ============================================
// VELTRONIK V2 - RESERVAS ONLINE (PÚBLICO)
// ============================================
// Página que el cliente final abre desde el link de la cancha (sin login).
// Ve disponibilidad real, reserva solo (queda esperando seña) y manda el
// comprobante por WhatsApp. Automatiza el mostrador. Mobile-first.
// No usa contextos de auth: llama a /api/public/** con fetch directo.
// ============================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import CONFIG from '../lib/config';
import { waLink } from '../lib/whatsapp';
import Icon from '../components/Icon';

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const fmtMoney = (v) => (v === null || v === undefined ? null : `$${Number(v).toLocaleString('es-AR')}`);

const api = (path) => `${CONFIG.API_URL}/public/courts/${path}`;

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) {
    let msg = 'Error';
    try { msg = (await r.json()).message || msg; } catch { /* noop */ }
    const e = new Error(msg); e.status = r.status; throw e;
  }
  return r.json();
}

export default function CourtPublicBookingPage() {
  const { token } = useParams();

  const [venue, setVenue] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [date, setDate] = useState(isoOf(new Date()));
  const [avail, setAvail] = useState(null);
  const [loadingAvail, setLoadingAvail] = useState(false);

  const [pick, setPick] = useState(null); // { courtId, court, time }
  const [form, setForm] = useState({ customerName: '', customerPhone: '' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [formErr, setFormErr] = useState('');

  // Próximos 7 días para el selector.
  const days = useMemo(() => {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      out.push({ iso: isoOf(d), label: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : `${DAY_SHORT[d.getDay()]} ${d.getDate()}` });
    }
    return out;
  }, []);

  useEffect(() => {
    getJson(api(token))
      .then(setVenue)
      .catch((e) => setLoadErr(e.message || 'No pudimos cargar la cancha'));
  }, [token]);

  const loadAvail = useCallback((d) => {
    setLoadingAvail(true);
    getJson(api(`${token}/availability?date=${d}`))
      .then(setAvail)
      .catch(() => setAvail(null))
      .finally(() => setLoadingAvail(false));
  }, [token]);

  useEffect(() => { if (venue) loadAvail(date); }, [venue, date, loadAvail]);

  const submit = async (e) => {
    e.preventDefault();
    setFormErr('');
    if (!form.customerName.trim() || !form.customerPhone.trim()) {
      setFormErr('Completá tu nombre y tu WhatsApp.');
      return;
    }
    setSaving(true);
    try {
      const res = await getJsonPost(api(`${token}/book`), {
        courtId: pick.courtId,
        date,
        startTime: pick.time,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
      });
      setResult(res);
      setPick(null);
    } catch (err) {
      setFormErr(err.message || 'No se pudo reservar. Probá otro horario.');
      if (err.status === 409) loadAvail(date); // se ocupó: refrescar
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ───

  if (loadErr) {
    return (
      <div className="pub-wrap"><div className="pub-card pub-center">
        <Icon name="alertTriangle" size="2rem" />
        <h2>Link no disponible</h2>
        <p className="pub-muted">{loadErr}</p>
      </div></div>
    );
  }
  if (!venue) {
    return <div className="pub-wrap"><div className="pub-card pub-center"><span className="spinner" /> Cargando…</div></div>;
  }

  // Confirmación
  if (result) {
    const waText = `¡Hola! Reservé ${result.court} para el ${result.date} a las ${result.startTime}. `
      + `${result.depositAmount != null ? `Te paso el comprobante de la seña de ${fmtMoney(result.depositAmount)}.` : 'Te paso el comprobante de la seña.'}`;
    const wa = result.whatsappNumber ? waLink(result.whatsappNumber, waText) : '';
    return (
      <div className="pub-wrap"><div className="pub-card">
        <div className="pub-ok"><Icon name="checkCircle" size="2.25rem" /></div>
        <h2 className="pub-center">¡Turno reservado!</h2>
        <p className="pub-muted pub-center">Queda <b>esperando tu seña</b>. Tenés {result.expiresInMinutes} minutos para pagarla, si no se libera.</p>

        <div className="pub-summary">
          <div><span>Cancha</span><b>{result.court}</b></div>
          <div><span>Día</span><b>{result.date}</b></div>
          <div><span>Horario</span><b>{result.startTime} – {result.endTime}</b></div>
          {result.depositAmount != null && <div><span>Seña</span><b>{fmtMoney(result.depositAmount)}</b></div>}
          {result.paymentAlias && <div><span>Transferí a</span><b>{result.paymentAlias}</b></div>}
        </div>

        {wa && (
          <a className="btn btn-wa pub-btn" href={wa} target="_blank" rel="noopener noreferrer">
            <Icon name="messageCircle" size="1em" /> Enviar comprobante por WhatsApp
          </a>
        )}
        <button className="btn btn-secondary pub-btn" onClick={() => { setResult(null); loadAvail(date); }}>
          Reservar otro turno
        </button>
      </div></div>
    );
  }

  return (
    <div className="pub-wrap">
      <div className="pub-card">
        <div className="pub-head">
          <Icon name="futbol" size="1.5rem" />
          <div>
            <h1 className="pub-title">{venue.name}</h1>
            <span className="pub-muted">Reservá tu cancha</span>
          </div>
        </div>

        {/* Días */}
        <div className="pub-days">
          {days.map((d) => (
            <button key={d.iso}
              className={`pub-day ${date === d.iso ? 'active' : ''}`}
              onClick={() => { setDate(d.iso); setPick(null); }}>
              {d.label}
            </button>
          ))}
        </div>

        {/* Disponibilidad */}
        {loadingAvail ? (
          <div className="pub-center pub-muted" style={{ padding: '2rem' }}><span className="spinner" /> Buscando horarios…</div>
        ) : !avail || avail.courts.every((c) => c.freeSlots.length === 0) ? (
          <div className="pub-center pub-muted" style={{ padding: '2rem' }}>No hay horarios libres este día. Probá otro.</div>
        ) : (
          avail.courts.filter((c) => c.freeSlots.length > 0).map((c) => (
            <div key={c.courtId} className="pub-court">
              <div className="pub-court-name">{c.court}</div>
              <div className="pub-slots">
                {c.freeSlots.map((t) => (
                  <button key={t}
                    className={`pub-slot ${pick && pick.courtId === c.courtId && pick.time === t ? 'active' : ''}`}
                    onClick={() => { setPick({ courtId: c.courtId, court: c.court, time: t }); setFormErr(''); }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}

        {/* Form de reserva */}
        {pick && (
          <form className="pub-form" onSubmit={submit}>
            <div className="pub-pick">Reservás <b>{pick.court}</b> a las <b>{pick.time}</b></div>
            <input className="form-input" placeholder="Tu nombre"
              value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
            <input className="form-input" type="tel" placeholder="Tu WhatsApp (ej: 376 412-3456)"
              value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} />
            {venue.depositAmount != null && (
              <p className="pub-muted" style={{ fontSize: '0.8rem' }}>
                Para confirmar vas a dejar una seña de {fmtMoney(venue.depositAmount)}{venue.paymentAlias ? ` (alias ${venue.paymentAlias})` : ''}.
              </p>
            )}
            {formErr && <div className="pub-err">{formErr}</div>}
            <button type="submit" className="btn btn-primary pub-btn" disabled={saving}>
              {saving ? <><span className="spinner" /> Reservando…</> : 'Reservar turno'}
            </button>
          </form>
        )}

        <div className="pub-foot pub-muted">Reservas con <b>Veltronik</b></div>
      </div>
    </div>
  );
}

async function getJsonPost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let msg = 'Error';
    try { msg = (await r.json()).message || msg; } catch { /* noop */ }
    const e = new Error(msg); e.status = r.status; throw e;
  }
  return r.json();
}
