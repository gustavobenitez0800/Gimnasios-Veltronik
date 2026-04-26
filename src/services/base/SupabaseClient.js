// ============================================
// VELTRONIK - SUPABASE CLIENT SINGLETON
// ============================================
// Punto único de acceso al cliente Supabase.
// Todos los servicios importan desde aquí.
// ============================================

import { createClient } from '@supabase/supabase-js';
import CONFIG from '../../lib/config';

// ============================================
// RESILIENCE: FETCH CON EXPONENTIAL BACKOFF
// ============================================
// Si el usuario sufre un micro-corte de WiFi o Supabase
// devuelve un error 500/429, reintenta automáticamente
// sin mostrar el error en pantalla de inmediato.
const fetchWithRetry = async (url, options) => {
  const maxRetries = 3;
  const baseDelay = 500; // milisegundos

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      
      // Solo reintentar si es error de servidor (5xx) o Rate Limit (429)
      if (!response.ok && (response.status >= 500 || response.status === 429)) {
        throw new Error(`Server status: ${response.status}`);
      }
      
      return response;
    } catch (error) {
      // Si es el último intento, dejar que el error suba a la UI
      if (i === maxRetries - 1) throw error;
      
      // Exponential backoff: 500ms, 1000ms, 2000ms...
      const delay = baseDelay * Math.pow(2, i);
      console.warn(`[Veltronik Network] Fallo de conexión. Reintentando en ${delay}ms... (Intento ${i + 1}/${maxRetries})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  global: {
    fetch: fetchWithRetry,
  },
});

export default supabase;
