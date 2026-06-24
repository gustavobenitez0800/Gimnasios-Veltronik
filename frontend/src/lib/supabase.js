import { createClient } from '@supabase/supabase-js';
import { createResilientFetch } from './resilientFetch';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Toda llamada de auth de Supabase (signIn, getSession, refresh de token) pasa por este
// fetch resiliente: timeout por intento + reintentos con backoff. Antes el cliente se
// creaba sin opciones → sin timeout (la app podía colgarse en redes lentas) y sin
// reintentos (un blip de red = "Error de conexión" en el login). Se inyecta SOLO el
// fetch: el resto de la config de auth queda en los defaults de Supabase.
const resilientFetch = createResilientFetch({
  timeoutMs: 10000,
  retries: 2,
  onRetry: ({ attempt, status, error, delay }) => {
    console.warn(
      `[supabase] reintento ${attempt} en ${delay}ms`,
      status ? `(HTTP ${status})` : `(${error?.message || 'error de red'})`,
    );
  },
});

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: resilientFetch },
});
