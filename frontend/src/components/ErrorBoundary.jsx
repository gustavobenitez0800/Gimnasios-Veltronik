// ============================================
// VELTRONIK - ERROR BOUNDARY (Resilience & Anti-Loop)
// ============================================

import { Component } from 'react';
import Icon from './Icon';

// Si volvió a crashear MENOS de 30s después de un auto-reload, es un loop: dejamos de
// auto-recargar y ofrecemos reintento manual (antes recargaba cada 10s para siempre → "crasheos").
const LOOP_KEY = 'veltronik_eb_lastAutoReload';
const LOOP_WINDOW_MS = 30000;

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      countdown: 10,
      isNetworkError: false,
      loopDetected: false,
    };
    this.timer = null;
  }

  static getDerivedStateFromError(error) {
    // Check if it's a network/fetch error
    const isNetworkError = error.message?.toLowerCase().includes('fetch') ||
                           error.message?.toLowerCase().includes('network') ||
                           error.message?.includes('Failed to fetch');
    return { hasError: true, isNetworkError };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Veltronik ErrorBoundary]:', error, errorInfo);

    // Anti-loop: si auto-recargamos hace muy poco y volvió a romper, NO recargar de nuevo.
    let lastAuto = 0;
    try { lastAuto = Number(sessionStorage.getItem(LOOP_KEY) || 0); } catch { /* sessionStorage no disponible */ }
    if (Date.now() - lastAuto < LOOP_WINDOW_MS) {
      this.setState({ loopDetected: true });
      return;
    }

    // Inline (una página/módulo): NO recargamos toda la app — el resto sigue operando y el
    // usuario reintenta solo ese módulo. (Antes un error de página recargaba todo a los 10s.)
    if (this.props.inline) return;

    // Pantalla completa: UNA auto-recarga, dejando marca para detectar loops al volver.
    this.timer = setInterval(() => {
      this.setState((prevState) => {
        if (prevState.countdown <= 1) {
          clearInterval(this.timer);
          try { sessionStorage.setItem(LOOP_KEY, String(Date.now())); } catch { /* noop */ }
          window.location.reload();
          return { countdown: 0 };
        }
        return { countdown: prevState.countdown - 1 };
      });
    }, 1000);
  }

  componentWillUnmount() {
    if (this.timer) clearInterval(this.timer);
  }

  handleManualRetry = () => {
    if (this.timer) clearInterval(this.timer);
    // El usuario reintenta a propósito → limpiamos la marca para no confundir con un loop.
    try { sessionStorage.removeItem(LOOP_KEY); } catch { /* noop */ }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.inline) {
        return (
          <div className="card" style={{ padding: '3rem 2rem', textAlign: 'center', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--error-500)', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 64, height: 64, background: 'rgba(239,68,68,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
                <Icon name="alertTriangle" />
              </div>
            </div>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Módulo no disponible</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
              Ocurrió un error al cargar esta sección. El resto de la plataforma sigue funcionando normalmente.
            </p>
            <button className="btn btn-primary" onClick={this.handleManualRetry}>
              Intentar nuevamente
            </button>
          </div>
        );
      }

      const loop = this.state.loopDetected;
      return (
        <div className="auth-wrapper" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="auth-container" style={{ maxWidth: 460, textAlign: 'center' }}>
            <div className="auth-card" style={{ padding: '3rem 2rem', position: 'relative', overflow: 'hidden' }}>

              {/* Animación de pulso si es error de red */}
              {this.state.isNetworkError && (
                <div style={{
                  position: 'absolute', top: '-50px', right: '-50px',
                  width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(239,68,68,0.1) 0%, transparent 70%)',
                  borderRadius: '50%', animation: 'pulse 2s infinite'
                }} />
              )}

              <div style={{
                width: 72, height: 72,
                background: this.state.isNetworkError ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                color: this.state.isNetworkError ? '#ef4444' : '#f59e0b',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2rem', margin: '0 auto 1.5rem auto'
              }}>
                {this.state.isNetworkError ? <Icon name="wifiOff" /> : <Icon name="alertTriangle" />}
              </div>

              <h1 className="auth-title" style={{ marginBottom: '0.75rem', fontSize: '1.5rem' }}>
                {this.state.isNetworkError ? 'Pérdida de Conexión' : 'Ocurrió un inconveniente'}
              </h1>

              <p className="auth-subtitle" style={{ marginBottom: '2rem', fontSize: '1rem', lineHeight: 1.6 }}>
                {loop ? (
                  <>No pudimos recuperar la pantalla automáticamente. Probá reintentar; si sigue, cerrá y volvé a abrir la app.</>
                ) : (
                  <>
                    {this.state.isNetworkError
                      ? 'Parece que hubo una interrupción en tu red o en nuestros servidores.'
                      : 'Hemos detectado un error inesperado en la pantalla actual.'}
                    <br /><br />
                    El sistema intentará reconectar automáticamente en <strong>{this.state.countdown}</strong> segundos...
                  </>
                )}
              </p>

              <button
                className="btn btn-primary"
                style={{ width: '100%', height: '48px', fontSize: '1rem' }}
                onClick={this.handleManualRetry}
              >
                Reconectar ahora
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
