// Entry point de la APP DE ESCRITORIO (lo que empaqueta electron-builder).
// Gemelo de main.jsx: mismo armazón, distinta tabla de rutas.
//
// Acá está el corte de la Fase 4. Este archivo NO importa WebRoutes, y por eso las
// pantallas de cuenta y cobro —con CardCheckout y el SDK de Mercado Pago detrás— no
// entran al instalador. No están escondidas: no están.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import DesktopRoutes from './routes/DesktopRoutes.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('No se encontró el elemento #root en el documento.');
}

function render() {
  createRoot(rootEl).render(
    <ErrorBoundary>
      <StrictMode>
        <App routes={<DesktopRoutes />} />
      </StrictMode>
    </ErrorBoundary>
  );
}

render();
