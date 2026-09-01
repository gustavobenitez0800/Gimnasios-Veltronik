// ============================================
// VELTRONIK V2 - APP SHELL (providers + router)
// ============================================
// El armazón que comparten los dos builds: providers, router y nada más. La TABLA DE
// RUTAS llega por prop, porque es lo único que cambia entre el portal web y la app de
// escritorio (Fase 4):
//
//   main.jsx          → <App routes={<WebRoutes />} />       (Vercel: todo)
//   main.desktop.jsx  → <App routes={<DesktopRoutes />} />   (Electron: solo operación)
//
// Recibirla por prop y no elegirla con un `if` acá adentro es deliberado: un condicional
// obligaría a importar las DOS tablas, y entonces el instalador se llevaría igual las
// pantallas de cobro que justamente queremos dejar afuera.
//
// HashRouter (y no BrowserRouter) porque en Electron la app se sirve por file://, donde
// no hay servidor que resuelva rutas.
// ============================================

import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider } from './contexts/AuthContext';

import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App({ routes }) {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
          <ToastProvider>
            <AuthProvider>
              {routes}
            </AuthProvider>
          </ToastProvider>
      </HashRouter>
    </QueryClientProvider>
  );
}
