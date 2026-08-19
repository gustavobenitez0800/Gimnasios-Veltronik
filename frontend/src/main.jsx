// Entry point del PORTAL WEB (lo que deploya Vercel). Su gemelo es main.desktop.jsx.
// Lo único que los diferencia es la tabla de rutas que le pasan a <App/>.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import WebRoutes from './routes/WebRoutes.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('No se encontró el elemento #root en el documento.');
}

function render() {
  createRoot(rootEl).render(
    <ErrorBoundary>
      <StrictMode>
        <App routes={<WebRoutes />} />
      </StrictMode>
    </ErrorBoundary>
  );
}

render();
