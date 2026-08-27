// ============================================
// VELTRONIK V2 - ALTA DE UN GIMNASIO
// ============================================
// Un solo paso. Antes eran dos: el primero preguntaba "¿qué tipo de negocio tenés?"
// y mostraba UNA tarjeta ("Gimnasio") que había que tocar para poder continuar, más
// un botón "← Cambiar tipo" en el paso siguiente que insinuaba que había otras
// opciones. Era un trámite para responder algo que el producto ya sabe: Veltronik es
// el sistema del gimnasio. Ese paso se dio de baja de punta a punta (pantalla,
// contrato de la API y esquema), no solo se ocultó.
//
// Lo que sí se ganó en ese lugar: el dueño elige el logo de su gimnasio acá mismo.
// Es lo primero que va a ver en el lobby, y que la prueba gratis arranque con SU
// marca en pantalla (y no con un logo ajeno) es la diferencia entre "estoy probando
// un software" y "este es mi sistema".

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';
import { gymService } from '../services';
import CONFIG from '../lib/config';
import { DEFAULT_LOGO_EMOJI } from '../lib/logo';

import Icon from '../components/Icon';
import LogoPicker from '../components/LogoPicker';
import { useMonthlyPriceLabel } from '../hooks/useMonthlyPrice';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [form, setForm] = useState({ name: '', address: '', phone: '', email: user?.email || '' });
  const [logo, setLogo] = useState({ logoUrl: null, logoEmoji: DEFAULT_LOGO_EMOJI });
  const [submitting, setSubmitting] = useState(false);

  // ¿Es la PRIMERA sucursal del usuario? Solo la 1ª incluye prueba gratis; las adicionales
  // se activan pagando. Lo consultamos para no prometer un trial que no aplica (2ª en adelante).
  const [isFirstBranch, setIsFirstBranch] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const gyms = await gymService.getUserGyms();
        if (active) setIsFirstBranch((gyms || []).length === 0);
      } catch { /* ante la duda asumimos primera (muestra el trial) */ }
    })();
    return () => { active = false; };
  }, []);

  const monthlyPrice = useMonthlyPriceLabel(); // lo dice el backend, no el build

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Ingresá el nombre de tu gimnasio', 'error'); return; }

    setSubmitting(true);
    try {
      // Sin `businessType` ni `type`: el backend sabe que lo que se da de alta es un
      // gimnasio. Mandarlo desde el navegador era pedirle al cliente que informe un
      // dato que el servidor no puede dejar que el cliente elija.
      const response = await apiClient.post('/core/setup/tenant', {
        name: form.name.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        logoUrl: logo.logoUrl,
        logoEmoji: logo.logoEmoji,
      });

      const data = response.data;

      // El backend responde { tenant_id, ... }. Guardamos contexto optimista; el Lobby
      // recarga la lista real al volver, así que esto es solo para ir más rápido.
      if (data?.tenant_id) {
        localStorage.setItem('current_org_id', data.tenant_id);
        localStorage.setItem('current_org_role', 'owner');
        localStorage.setItem('current_org_name', form.name.trim());
      }

      // El backend confirma si fue la primera sucursal (autoritativo). Solo la 1ª arranca trial.
      const createdFirst = data?.is_first_branch ?? isFirstBranch;
      showToast(
        createdFirst
          ? '¡Gimnasio creado! Tu prueba gratuita de 14 días ha comenzado.'
          : '¡Sucursal creada! Activá tu suscripción para empezar a usarla.',
        'success'
      );

      setTimeout(() => {
        navigate(CONFIG.ROUTES.LOBBY);
      }, 1500);
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Intentá de nuevo';
      showToast('Error al crear el gimnasio: ' + msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <div className="auth-card onboarding-card" style={{ maxWidth: 560 }}>
          <div className="step-container">
            <div className="welcome-text">
              <h2><Icon name="sparkles" size="1em" /> {isFirstBranch ? 'Registrá tu Gimnasio' : 'Nueva sucursal'}</h2>
              <p style={{ color: 'var(--text-muted)' }}>Completá la información básica. Podés modificarla después.</p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre del gimnasio *</label>
                <input type="text" className="form-input" placeholder="Ej: CrossFit Buenos Aires"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus />
              </div>

              <div className="form-group">
                <label className="form-label">Logo del gimnasio</label>
                <LogoPicker
                  logoUrl={logo.logoUrl}
                  logoEmoji={logo.logoEmoji}
                  name={form.name}
                  onChange={setLogo}
                  onError={(msg) => showToast(msg, 'error')}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Dirección</label>
                <input type="text" className="form-input" placeholder="Ej: Av. Corrientes 1234"
                  value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono de contacto</label>
                <input type="tel" className="form-input" placeholder="Ej: 11-1234-5678"
                  value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Email de contacto</label>
                <input type="email" className="form-input" placeholder="contacto@tugimnasio.com"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>

              {isFirstBranch ? (
                <div style={{
                  padding: '1rem', marginBottom: '1rem',
                  background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '0.75rem', textAlign: 'center'
                }}>
                  <p style={{ color: '#10b981', fontWeight: 600, margin: 0, fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Icon name="sparkles" size="1em" /> 14 días de prueba GRATIS • Sin tarjeta de crédito • Cancelá cuando quieras
                  </p>
                </div>
              ) : (
                <div style={{
                  padding: '1rem', marginBottom: '1rem',
                  background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '0.75rem', textAlign: 'center'
                }}>
                  <p style={{ color: '#f59e0b', fontWeight: 600, margin: 0, fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Icon name="creditCard" size="1em" /> Sucursal adicional • Se activa al pagar • ${monthlyPrice}/mes por sucursal
                  </p>
                </div>
              )}

              <button type="submit" className="auth-submit" disabled={submitting}>
                {submitting
                  ? <><span className="spinner" /> {isFirstBranch ? 'Creando gimnasio...' : 'Creando sucursal...'}</>
                  : (isFirstBranch
                      ? <><Icon name="rocket" size="1em" /> Comenzar mi prueba gratis</>
                      : <><Icon name="rocket" size="1em" /> Crear sucursal</>)}
              </button>
            </form>

            <p className="auth-links" style={{ marginTop: '1.25rem' }}>
              <a href="#/lobby" style={{ color: 'var(--text-muted)' }}>← Volver al inicio</a>
            </p>

            <p className="auth-links" style={{ marginTop: '0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Icon name="lock" size="1em" /> Tus datos están seguros y podés modificarlos después
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
