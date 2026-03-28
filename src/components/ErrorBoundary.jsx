// ============================================
// VELTRONIK - ERROR BOUNDARY (producción)
// Evita pantalla en blanco ante errores de renderizado
// ============================================

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="auth-wrapper"
          style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div className="auth-container" style={{ maxWidth: 420, textAlign: 'center' }}>
            <div className="auth-card">
              <h1 className="auth-title" style={{ marginBottom: '0.75rem' }}>
                Algo salió mal
              </h1>
              <p className="auth-subtitle" style={{ marginBottom: '1.5rem' }}>
                Ocurrió un error inesperado. Podés recargar la página para intentar de nuevo.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => window.location.reload()}
              >
                Recargar página
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
