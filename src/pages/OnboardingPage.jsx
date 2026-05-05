// ============================================
// VELTRONIK V2 - ONBOARDING PAGE (Business setup wizard)
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase, errorService } from '../services';
import CONFIG from '../lib/config';

import gymLogo from '../assets/VeltronikGym.png';
import restoLogo from '../assets/VeltronikRestaurante.png';

const BUSINESS_TYPES = [
  { id: 'GYM', label: 'Gimnasio', desc: 'Socios, cuotas, acceso y clases', icon: gymLogo, isImage: true, gradient: 'transparent', enabled: true },
  { id: 'PILATES', label: 'Pilates & Yoga', desc: 'Clases con cupos y alumnos', icon: '🧘‍♀️', isImage: false, gradient: 'linear-gradient(135deg, #10b981, #059669)', enabled: true },
  { id: 'CLUB', label: 'Club Deportivo', desc: 'Socios plenos y disciplinas', icon: '⚽', isImage: false, gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)', enabled: true },
  { id: 'ACADEMY', label: 'Academia / Dojo', desc: 'Artes marciales y boxeo', icon: '🥋', isImage: false, gradient: 'linear-gradient(135deg, #ef4444, #dc2626)', enabled: true },
  { id: 'RESTO', label: 'Restaurante', desc: 'Mesas, pedidos, cocina y delivery', icon: restoLogo, isImage: true, gradient: 'transparent', enabled: true },
  { id: 'KIOSK', label: 'Kiosco', desc: 'Punto de venta y stock', icon: '🏪', isImage: false, gradient: 'linear-gradient(135deg, #f59e0b, #d97706)', enabled: false },
  { id: 'OTHER', label: 'Otro negocio', desc: 'Veterinarias, clínicas y más', icon: '📱', isImage: false, gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)', enabled: false },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, refreshAuth } = useAuth();

  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState(null);
  const [form, setForm] = useState({ name: '', address: '', phone: '', email: user?.email || '' });
  const [submitting, setSubmitting] = useState(false);
  const [hasExistingOrgs, setHasExistingOrgs] = useState(false);
  const [checkingOrgs, setCheckingOrgs] = useState(true);

  // Check if user already owns businesses (state is declared but unused for blocking)
  useEffect(() => {
    setCheckingOrgs(false);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Ingresá el nombre de tu negocio', 'error'); return; }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('create_organization_with_owner', {
        org_name: form.name.trim(),
        org_type: selectedType || 'GYM',
        org_address: form.address.trim() || null,
        org_phone: form.phone.trim() || null,
        org_email: form.email.trim() || null,
      });

      if (error) throw error;

      if (data) {
        localStorage.setItem('current_org_id', data.id);
        localStorage.setItem('current_org_role', 'owner');
        localStorage.setItem('current_org_name', data.name || form.name);
        localStorage.setItem('current_org_type', data.type || selectedType || 'GYM');
      }

      showToast('¡Negocio creado! Tu prueba gratuita de 30 días ha comenzado.', 'success');
      
      // Navigate to Lobby after a brief delay
      setTimeout(() => {
        navigate(CONFIG.ROUTES.LOBBY);
      }, 1500);
    } catch (error) {
      showToast('Error al crear el negocio: ' + errorService.getMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <div className="auth-card" style={{ maxWidth: 560 }}>
          {/* Progress */}
          <div className="onboarding-progress">
            <div className={`progress-step ${step >= 1 ? (step > 1 ? 'completed' : 'active') : ''}`} />
            <div className={`progress-step ${step >= 2 ? 'active' : ''}`} />
          </div>

          {/* Step 1: Choose Type */}
          {step === 1 && (
            <div className="step-container active" style={{ animation: 'fadeSlideIn 0.4s ease' }}>
              <div className="welcome-text">
                <h2>✨ ¿Qué tipo de negocio tenés?</h2>
                <p style={{ color: 'var(--text-muted)' }}>Elegí el sistema que mejor se adapte</p>
              </div>
              <div className="type-grid">
                {BUSINESS_TYPES.map(t => (
                  <div key={t.id}
                    className={`type-card ${selectedType === t.id ? 'selected' : ''} ${!t.enabled ? 'coming-soon' : ''}`}
                    onClick={() => t.enabled && setSelectedType(t.id)}>
                    {!t.enabled && <span className="coming-soon-badge">Próximamente</span>}
                    {selectedType === t.id && <div className="type-check">✓</div>}
                    <div className="type-icon" style={{ background: t.gradient }}>
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
                <div style={{
                  padding: '1rem', marginBottom: '1rem',
                  background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '0.75rem', textAlign: 'center'
                }}>
                  <p style={{ color: '#10b981', fontWeight: 600, margin: 0, fontSize: '0.875rem' }}>
                    ✨ 30 días de prueba GRATIS • Sin tarjeta de crédito • Cancelá cuando quieras
                  </p>
                </div>
                <button type="submit" className="auth-submit" disabled={submitting}>
                  {submitting ? <><span className="spinner" /> Creando negocio...</> : '🚀 Comenzar mi prueba gratis'}
                </button>
              </form>
              <p className="auth-links" style={{ marginTop: '1.5rem', fontSize: '0.75rem' }}>
                🔒 Tus datos están seguros y podés modificarlos después
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
