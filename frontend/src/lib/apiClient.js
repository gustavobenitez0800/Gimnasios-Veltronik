import axios from 'axios';

// Instancia base de Axios apuntando al backend de Java (Fase 3)
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

import { supabase } from './supabase';

// Interceptor de REQUEST: Inyectar el Token JWT en cada petición
apiClient.interceptors.request.use(
  async (config) => {
    // Obtener sesión activa de Supabase
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
    
    // Inyectar el Tenant seleccionado (Gimnasio)
    const orgId = localStorage.getItem('current_org_id');
    if (orgId) {
      config.headers['X-Tenant-ID'] = orgId;
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor de RESPONSE: Manejar errores globales (ej: 401 Unauthorized, 402 Payment Required)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token expirado o inválido: Forzar logout visual
      supabase.auth.signOut();
      
      // Emitir un evento global para que AuthContext reaccione
      window.dispatchEvent(new Event('auth-unauthorized'));
    } else if (error.response && error.response.status === 402) {
      // Kill Switch Activado: Sucursal inactiva por falta de pago
      window.dispatchEvent(new Event('auth-payment-required'));
    }
    return Promise.reject(error);
  }
);

export default apiClient;
