import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { initConnection } from './lib/connection';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('No se encontró el elemento #root en el documento.');
}

function render() {
  createRoot(rootEl).render(
    <ErrorBoundary>
      <StrictMode>
        <App />
      </StrictMode>
    </ErrorBoundary>
  );
}

// Resolver la conexión (nube vs cerebro local) ANTES de renderizar, así el apiClient
// habla contra el backend correcto desde la primera request. En la web el probe ni
// corre (no hay window.electronAPI) → nube instantánea; en Electron sin cerebro el
// probe falla rápido (connection refused). Pase lo que pase, se renderiza.
initConnection().finally(render);
