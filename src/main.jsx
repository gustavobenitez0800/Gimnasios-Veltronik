import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('No se encontró el elemento #root en el documento.');
}

createRoot(rootEl).render(
  <ErrorBoundary>
    <StrictMode>
      <App />
    </StrictMode>
  </ErrorBoundary>
);
