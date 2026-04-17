// ============================================
// VELTRONIK - SUPABASE CLIENT SINGLETON
// ============================================
// Punto único de acceso al cliente Supabase.
// Todos los servicios importan desde aquí.
// ============================================

import { createClient } from '@supabase/supabase-js';
import CONFIG from '../../lib/config';

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

export default supabase;
