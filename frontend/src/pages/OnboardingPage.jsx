// ============================================
// VELTRONIK V2 - ONBOARDING PAGE (Business setup wizard)
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';
import { gymService } from '../services';
import CONFIG from '../lib/config';

import Icon from '../components/Icon';

// Veltronik hoy ofrece UN solo sistema real: Gimnasio. No listamos rubros que el backend
// no soporta — antes "Club Deportivo" mandaba CLUB y el backend (solo acepta GYM) lo rechazaba.
// FUTURO: el `icon` puede pasar a un Lordicon animado por rubro.
const BUSINESS_TYPES = [
  { id: 'GYM', label: 'Gimnasio', desc: 'Socios, cuotas, acceso y clases', icon: <Icon name="dumbbell" />, isImage: false, gradient: 'color-mix(in srgb, var(--primary-500) 14%, transparent)', enabled: true },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, refreshAuth } = useAuth();

  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState('GYM'); // único tipo real → preseleccionado
  const [form, setForm] = useState({ name: '', address: '', phone: '', email: user?.email || '' });
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

  const monthlyPrice = (CONFIG.PRICES_BY_TYPE?.GYM || CONFIG.SUBSCRIPTION_PRICE || 80000).toLocaleString('es-AR');


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Ingresá el nombre de tu negocio', 'error'); return; }

    setSubmitting(true);
    try {
      const businessType = selectedType || 'GYM';
      // Mandamos businessType (enum) Y type (string): el backend arma el tipo desde `type`,
      // así que sin esto el negocio se crearía con tipo nulo. Con ambos campos funciona
      // sin importar cuál lea el backend.
      const response = await apiClient.post('/core/setup/tenant', {
        name: form.name.trim(),
        businessType,
        type: businessType,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      });

      const data = response.data;

      // El backend responde { tenant_id, ... }. Guardamos contexto optimista; el Lobby
      // recarga la lista real al volver, así que esto es solo para ir más rápido.
      if (data?.tenant_id) {
        localStorage.setItem('current_org_id', data.tenant_id);
        localStorage.setItem('current_org_role', 'owner');
        localStorage.setItem('current_org_name', form.name.trim());
        localStorage.setItem('current_org_type', businessType);
      }

      // El backend confirma si fue la primera sucursal (autoritativo). Solo la 1ª arranca trial.
      const createdFirst = data?.is_first_branch ?? isFirstBranch;
      showToast(
        createdFirst
          ? '¡Negocio creado! Tu prueba gratuita de 14 días ha comenzado.'
          : '¡Sucursal creada! Activá tu suscripción para empezar a usarla.',
        'success'
      );

      // Navigate to Lobby after a brief delay
      setTimeout(() => {
        navigate(CONFIG.ROUTES.LOBBY);
      }, 1500);
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Intentá de nuevo';
      showToast('Error al crear el negocio: ' + msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <div className="auth-card onboarding-card" style={{ maxWidth: 560 }}>
          {/* Progress */}
          <div className="onboarding-progress">
            <div className={`progress-step ${step >= 1 ? (step > 1 ? 'completed' : 'active') : ''}`} />
            <div className={`progress-step ${step >= 2 ? 'active' : ''}`} />
          </div>

          {/* Step 1: Choose Type */}
          {step === 1 && (
            <div className="step-container active" style={{ animation: 'fadeSlideIn 0.4s ease' }}>
              <div className="welcome-text">
                <h2><Icon name="sparkles" size="1em" /> ¿Qué tipo de negocio tenés?</h2>
                <p style={{ color: 'var(--text-muted)' }}>Elegí el sistema que mejor se adapte</p>
              </div>
              <div className="type-grid">
                {BUSINESS_TYPES.map(t => (
                  <div key={t.id}
                    className={`type-card ${selectedType === t.id ? 'selected' : ''} ${!t.enabled ? 'coming-soon' : ''}`}
                    onClick={() => t.enabled && setSelectedType(t.id)}>
                    {!t.enabled && <span className="coming-soon-badge">Próximamente</span>}
                    {selectedType === t.id && <div className="type-check"><Icon name="check" size="1em" /></div>}
                    <div className="type-icon" style={{ background: t.gradient, color: 'var(--primary-400)' }}>
                      {t.isImage ? <img src={t.icon} alt={t.label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : t.icon}
                    </div>
                    <h4>{t.label}</h4>
                    <p>{t.desc}</p>
                  </div>
                ))}
              </div>
              <button className="auth-submit" disabled={!selectedType} onClick={() => setStep(2)}>Continuar</button>
              <p className="auth-links" style={{ marginTop: '1rem' }}>
                <a href="#/lobby" style={{ color: 'var(--text-muted)' }}>← Volver al inicio</a>
              </p>
            </div>
          )}

          {/* Step 2: Business Details */}
          {step === 2 && (
            <div className="step-container active" style={{ animation: 'fadeSlideIn 0.4s ease' }}>
              <button className="back-btn" onClick={() => setStep(1)}>← Cambiar tipo</button>
              <div className="welcome-text">
                <div className="selected-type-badge" style={{
                  background: (selectedType === 'GYM' || selectedType === 'PILATES' || selectedType === 'CLUB' || selectedType === 'ACADEMY') ? 'rgba(139,92,246,0.15)' : 'rgba(6,182,212,0.15)',
                  color: (selectedType === 'GYM' || selectedType === 'PILATES' || selectedType === 'CLUB' || selectedType === 'ACADEMY') ? '#a78bfa' : '#22d3ee'
                }}>
                  {BUSINESS_TYPES.find(t => t.id === selectedType)?.isImage ? (
                    <img src={BUSINESS_TYPES.find(t => t.id === selectedType)?.icon} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                  ) : (
                    BUSINESS_TYPES.find(t => t.id === selectedType)?.icon
                  )} {BUSINESS_TYPES.find(t => t.id === selectedType)?.label}
                </div>
                <h2>Datos de tu negocio</h2>
                <p style={{ color: 'var(--text-muted)' }}>Completá la información básica. Podés modificarla después.</p>
              </div>
              <form className="auth-form" onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Nombre del negocio *</label>
                  <input type="text" className="form-input" placeholder="Ej: CrossFit Buenos Aires"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus />
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
                  <input type="email" className="form-input" placeholder="contacto@tunegocio.com"
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
                    ? <><span className="spinner" /> {isFirstBranch ? 'Creando negocio...' : 'Creando sucursal...'}</>
                    : (isFirstBranch
                        ? <><Icon name="rocket" size="1em" /> Comenzar mi prueba gratis</>
                        : <><Icon name="rocket" size="1em" /> Crear sucursal</>)}
                </button>
              </form>
              <p className="auth-links" style={{ marginTop: '1.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Icon name="lock" size="1em" /> Tus datos están seguros y podés modificarlos después
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
