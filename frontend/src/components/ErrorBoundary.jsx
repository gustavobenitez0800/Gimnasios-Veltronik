// ============================================
// VELTRONIK - ERROR BOUNDARY (Resilience & Auto-Reconnect)
// ============================================

import { Component } from 'react';
import Icon from './Icon';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false,
      countdown: 10,
      isNetworkError: false
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
    
    // Auto-reconnect countdown
    this.timer = setInterval(() => {
      this.setState((prevState) => {
        if (prevState.countdown <= 1) {
          clearInterval(this.timer);
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
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
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
                {this.state.isNetworkError ? <Icon name="wifi-off" /> : '⚠️'}
              </div>

              <h1 className="auth-title" style={{ marginBottom: '0.75rem', fontSize: '1.5rem' }}>
                {this.state.isNetworkError ? 'Pérdida de Conexión' : 'Ocurrió un inconveniente'}
              </h1>
              
              <p className="auth-subtitle" style={{ marginBottom: '2rem', fontSize: '1rem', lineHeight: 1.6 }}>
                {this.state.isNetworkError 
                  ? 'Parece que hubo una interrupción en tu red o en nuestros servidores.' 
                  : 'Hemos detectado un error inesperado en la pantalla actual.'}
                <br /><br />
                El sistema intentará reconectar automáticamente en <strong>{this.state.countdown}</strong> segundos...
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
