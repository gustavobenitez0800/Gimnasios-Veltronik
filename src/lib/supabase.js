// ============================================
// VELTRONIK PLATFORM - SUPABASE CLIENT v2
// ============================================

import { createClient } from '@supabase/supabase-js';
import CONFIG from './config';

// Singleton Supabase client
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

export default supabase;

// ============================================
// AUTH FUNCTIONS
// ============================================

export async function signUp(email, password, fullName = '') {
  const baseUrl = window.location.origin;
  const redirectUrl = `${baseUrl}/#/`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: redirectUrl,
    },
  });

  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/#/lobby`,
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  clearPlatformState();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function clearPlatformState() {
  localStorage.removeItem('current_org_id');
  localStorage.removeItem('current_org_role');
  localStorage.removeItem('current_org_name');
  localStorage.removeItem('current_org_type');
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

// ============================================
// PROFILE FUNCTIONS
// ============================================

export async function getProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) throw error;
  return data;
}

export async function updateProfile(updates) {
  const user = await getCurrentUser();
  if (!user) throw new Error('No authenticated user');

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================
// GYM FUNCTIONS
// ============================================

export async function getGym() {
  const profile = await getProfile();
  if (!profile || !profile.gym_id) return null;

  const { data, error } = await supabase
    .from('gyms')
    .select('*')
    .eq('id', profile.gym_id)
    .single();

  if (error) throw error;
  return data;
}

export async function createGym(gymData) {
  const { data, error } = await supabase.rpc('create_gym_for_user', {
    gym_name: gymData.name,
    gym_address: gymData.address || null,
    gym_phone: gymData.phone || null,
    gym_email: gymData.email || null,
  });

  if (error) throw error;
  return data;
}

export async function updateGym(updates) {
  const profile = await getProfile();
  if (!profile || !profile.gym_id) throw new Error('No gym associated');

  const { data, error } = await supabase
    .from('gyms')
    .update(updates)
    .eq('id', profile.gym_id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get all gyms the current user belongs to (via organization_members)
 */
export async function getUserGyms() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('organization_members')
    .select('role, gym_id, gyms(*)')
    .eq('user_id', user.id);

  if (error) {
    console.error('getUserGyms error:', error);
    return [];
  }

  // Flatten the result: each item has { gym, role }
  return (data || [])
    .filter(om => om.gyms) // Filter out any orphaned org members
    .map(om => ({
      ...om.gyms,
      role: om.role || 'owner',
    }));
}

// ============================================
// PLANS & SUBSCRIPTIONS
// ============================================

export async function getPlans() {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .order('price', { ascending: true });

  if (error) throw error;
  return data;
}

export async function getSubscription() {
  const profile = await getProfile();
  if (!profile || !profile.gym_id) return null;

  // Priority: active subscription
  const { data: activeSub, error: activeError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('gym_id', profile.gym_id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (activeSub) return activeSub;
  // Ignore PGRST116 (no rows) on the first query
  if (activeError && activeError.code !== 'PGRST116') throw activeError;

  // Fallback: latest subscription
  const { data: latestSub, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('gym_id', profile.gym_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code === 'PGRST116') return null;
  if (error) throw error;
  return latestSub;
}

// ============================================
// MEMBERS FUNCTIONS
// ============================================

export async function getMembers() {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .order('full_name', { ascending: true });

  if (error) throw error;
  return data;
}

export async function getMembersPaginated(page = 0, pageSize = 50, search = '') {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('members')
    .select('*', { count: 'exact' })
    .order('full_name', { ascending: true })
    .range(from, to);

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,dni.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    data: data || [],
    count: count || 0,
    hasMore: (from + pageSize) < (count || 0),
  };
}

export async function getMember(id) {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createMember(memberData) {
  const profile = await getProfile();
  if (!profile || !profile.gym_id) throw new Error('No gym associated');

  const { data, error } = await supabase
    .from('members')
    .insert({ gym_id: profile.gym_id, ...memberData })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMember(id, updates) {
  const { data, error } = await supabase
    .from('members')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMember(id) {
  const { error } = await supabase
    .from('members')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================
// MEMBER PAYMENTS
// ============================================

export async function getMemberPayments() {
  const { data, error } = await supabase
    .from('member_payments')
    .select(`*, member:members(full_name, dni)`)
    .order('payment_date', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getMemberPaymentsByMember(memberId) {
  const { data, error } = await supabase
    .from('member_payments')
    .select('*')
    .eq('member_id', memberId)
    .order('payment_date', { ascending: false });

  if (error) throw error;
  return data;
}

export async function createMemberPayment(paymentData) {
  const profile = await getProfile();
  if (!profile || !profile.gym_id) throw new Error('No gym associated');

  const { data, error } = await supabase
    .from('member_payments')
    .insert({ gym_id: profile.gym_id, ...paymentData })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMemberPayment(id, updates) {
  const { data, error } = await supabase
    .from('member_payments')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMemberPayment(id) {
  const { error } = await supabase
    .from('member_payments')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================
// CLASSES FUNCTIONS
// ============================================

export async function getClasses() {
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createClass(classData) {
  const profile = await getProfile();
  if (!profile || !profile.gym_id) throw new Error('No gym associated');

  const { data, error } = await supabase
    .from('classes')
    .insert({ gym_id: profile.gym_id, ...classData })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateClass(id, updates) {
  const { data, error } = await supabase
    .from('classes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteClass(id) {
  const { error } = await supabase
    .from('classes')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================
// CLASS BOOKINGS
// ============================================

export async function getBookingsByDate(date) {
  const { data, error } = await supabase
    .from('class_bookings')
    .select(`*, class:classes(name, instructor, start_time, end_time, capacity), member:members(full_name, dni)`)
    .eq('booking_date', date)
    .order('booked_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getBookingsForClass(classId, date) {
  const { data, error } = await supabase
    .from('class_bookings')
    .select(`*, member:members(id, full_name, dni, phone)`)
    .eq('class_id', classId)
    .eq('booking_date', date);

  if (error) throw error;
  return data || [];
}

export async function createBooking(bookingData) {
  const profile = await getProfile();
  if (!profile || !profile.gym_id) throw new Error('No gym associated');

  const { data, error } = await supabase
    .from('class_bookings')
    .insert({ gym_id: profile.gym_id, ...bookingData })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function cancelBooking(id) {
  const { data, error } = await supabase
    .from('class_bookings')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function markAttended(id) {
  const { data, error } = await supabase
    .from('class_bookings')
    .update({ status: 'attended', attended_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================
// ACCESS LOGS
// ============================================

export async function getTodayAccessLogs() {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('access_logs')
    .select(`*, member:members(id, full_name, dni, phone, status, membership_end)`)
    .gte('check_in_at', today)
    .order('check_in_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getAccessLogs(startDate, endDate) {
  const { data, error } = await supabase
    .from('access_logs')
    .select(`*, member:members(id, full_name, dni)`)
    .gte('check_in_at', startDate)
    .lte('check_in_at', endDate + 'T23:59:59')
    .order('check_in_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function checkInMember(memberId, accessMethod = 'manual', notes = null) {
  const profile = await getProfile();
  if (!profile || !profile.gym_id) throw new Error('No gym associated');

  const { data, error } = await supabase
    .from('access_logs')
    .insert({
      gym_id: profile.gym_id,
      member_id: memberId,
      check_in_at: new Date().toISOString(),
      access_method: accessMethod,
      notes,
    })
    .select(`*, member:members(full_name, dni)`)
    .single();

  if (error) throw error;
  return data;
}

export async function checkOutMember(accessLogId) {
  const { data, error } = await supabase
    .from('access_logs')
    .update({ check_out_at: new Date().toISOString() })
    .eq('id', accessLogId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getCurrentlyCheckedIn() {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('access_logs')
    .select(`*, member:members(id, full_name, dni, phone, photo_url)`)
    .gte('check_in_at', today)
    .is('check_out_at', null)
    .order('check_in_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function searchMembersForAccess(query) {
  const { data, error } = await supabase
    .from('members')
    .select('id, full_name, dni, phone, status, photo_url, membership_end')
    .or(`dni.ilike.%${query}%,full_name.ilike.%${query}%`)
    .in('status', ['active', 'expired', 'inactive'])
    .limit(10);

  if (error) throw error;
  return data || [];
}

// ============================================
// DNI VALIDATION
// ============================================

export async function isDniDuplicate(dni, excludeId = null) {
  if (!dni || dni.trim() === '') return false;

  const profile = await getProfile();
  if (!profile || !profile.gym_id) return false;

  let query = supabase
    .from('members')
    .select('id')
    .eq('dni', dni.trim())
    .eq('gym_id', profile.gym_id);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query.limit(1);
  if (error) return false;
  return data && data.length > 0;
}

// ============================================
// ERROR HANDLING
// ============================================

export function getSupabaseErrorMessage(error) {
  if (!error) return 'Error desconocido';
  const message = error.message || error.toString();

  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'Error de conexión. Verifica tu conexión a internet e intenta nuevamente.';
  }
  if (message.includes('timeout') || message.includes('Timeout')) {
    return 'La solicitud tardó demasiado. Intenta nuevamente.';
  }
  if (message.includes('Invalid login credentials')) {
    return 'Email o contraseña incorrectos';
  }
  if (message.includes('User already registered')) {
    return 'Este email ya está registrado';
  }
  if (message.includes('JWT expired')) {
    return 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.';
  }
  if (message.includes('duplicate key') || message.includes('unique constraint')) {
    if (message.includes('dni')) {
      return 'Ya existe un socio con este DNI en tu gimnasio.';
    }
    return 'Este registro ya existe.';
  }
  if (message.includes('violates row-level security')) {
    return 'No tienes permiso para realizar esta acción.';
  }
  if (message.includes('foreign key constraint')) {
    return 'No se puede eliminar porque hay registros relacionados.';
  }
  if (message.includes('not found') || message.includes('No rows')) {
    return 'El registro no fue encontrado.';
  }
  return message;
}
