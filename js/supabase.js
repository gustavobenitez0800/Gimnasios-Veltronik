// ============================================
// GIMNASIO VELTRONIK - SUPABASE CLIENT
// ============================================

// Import Supabase from CDN (loaded in HTML)
// Using the global supabase object from @supabase/supabase-js

let supabaseClient = null;

/**
 * Initialize the Supabase client
 */
function initSupabase() {
    if (supabaseClient) return supabaseClient;

    if (typeof supabase === 'undefined') {
        console.error('Supabase library not loaded. Make sure to include the CDN script.');
        return null;
    }

    supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    return supabaseClient;
}

/**
 * Get the current Supabase client instance
 */
function getSupabase() {
    if (!supabaseClient) {
        return initSupabase();
    }
    return supabaseClient;
}

// ============================================
// AUTH FUNCTIONS
// ============================================

/**
 * Sign up with email and password
 */
async function signUp(email, password, fullName = '') {
    const client = getSupabase();

    // Determine the redirect URL based on environment
    // In production (Vercel), use the production URL
    // In development, allow localhost
    const baseUrl = window.location.origin;
    const redirectUrl = baseUrl + '/index.html';

    const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName
            },
            emailRedirectTo: redirectUrl
        }
    });

    if (error) throw error;
    return data;
}

/**
 * Sign in with email and password
 */
async function signIn(email, password) {
    const client = getSupabase();

    const { data, error } = await client.auth.signInWithPassword({
        email,
        password
    });

    if (error) throw error;
    return data;
}

/**
 * Sign in with Google OAuth
 */
async function signInWithGoogle() {
    const client = getSupabase();

    const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/onboarding.html'
        }
    });

    if (error) throw error;
    return data;
}

/**
 * Sign out current user
 */
async function signOut() {
    const client = getSupabase();

    const { error } = await client.auth.signOut();
    if (error) throw error;

    window.location.href = CONFIG.ROUTES.LOGIN;
}

/**
 * Get current user
 */
async function getCurrentUser() {
    const client = getSupabase();

    const { data: { user }, error } = await client.auth.getUser();
    if (error) throw error;

    return user;
}

/**
 * Get current session
 */
async function getSession() {
    const client = getSupabase();

    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;

    return session;
}

/**
 * Listen to auth state changes
 */
function onAuthStateChange(callback) {
    const client = getSupabase();

    return client.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });
}

// ============================================
// PROFILE FUNCTIONS
// ============================================

/**
 * Get current user's profile
 */
async function getProfile() {
    const client = getSupabase();
    const user = await getCurrentUser();

    if (!user) return null;

    const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update current user's profile
 */
async function updateProfile(updates) {
    const client = getSupabase();
    const user = await getCurrentUser();

    if (!user) throw new Error('No authenticated user');

    const { data, error } = await client
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

/**
 * Get current user's gym
 */
async function getGym() {
    const client = getSupabase();
    const profile = await getProfile();

    if (!profile || !profile.gym_id) return null;

    const { data, error } = await client
        .from('gyms')
        .select('*')
        .eq('id', profile.gym_id)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Create a new gym using RPC function (bypasses RLS)
 * This also sets up the 30-day trial period
 */
async function createGym(gymData) {
    const client = getSupabase();
    const user = await getCurrentUser();

    if (!user) throw new Error('No authenticated user');

    // Call the RPC function that handles gym creation with SECURITY DEFINER
    const { data, error } = await client.rpc('create_gym_for_user', {
        gym_name: gymData.name,
        gym_address: gymData.address || null,
        gym_phone: gymData.phone || null,
        gym_email: gymData.email || null
    });

    if (error) throw error;

    // The RPC function returns a JSONB object with the gym data
    return data;
}

/**
 * Update gym data
 */
async function updateGym(updates) {
    const client = getSupabase();
    const profile = await getProfile();

    if (!profile || !profile.gym_id) throw new Error('No gym associated');

    const { data, error } = await client
        .from('gyms')
        .update(updates)
        .eq('id', profile.gym_id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ============================================
// PLANS FUNCTIONS
// ============================================

/**
 * Get all active plans
 */
async function getPlans() {
    const client = getSupabase();

    const { data, error } = await client
        .from('plans')
        .select('*')
        .eq('active', true)
        .order('price', { ascending: true });

    if (error) throw error;
    return data;
}

// ============================================
// MEMBERS FUNCTIONS
// ============================================

/**
 * Get all members for current gym
 */
async function getMembers() {
    const client = getSupabase();

    const { data, error } = await client
        .from('members')
        .select('*')
        .order('full_name', { ascending: true });

    if (error) throw error;
    return data;
}

/**
 * Get a single member by ID
 */
async function getMember(id) {
    const client = getSupabase();

    const { data, error } = await client
        .from('members')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Create a new member
 */
async function createMember(memberData) {
    const client = getSupabase();
    const profile = await getProfile();

    if (!profile || !profile.gym_id) throw new Error('No gym associated');

    const { data, error } = await client
        .from('members')
        .insert({
            gym_id: profile.gym_id,
            ...memberData
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update a member
 */
async function updateMember(id, updates) {
    const client = getSupabase();

    const { data, error } = await client
        .from('members')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Delete a member
 */
async function deleteMember(id) {
    const client = getSupabase();

    const { error } = await client
        .from('members')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// ============================================
// MEMBER PAYMENTS FUNCTIONS
// ============================================

/**
 * Get all payments for current gym
 */
async function getMemberPayments() {
    const client = getSupabase();

    const { data, error } = await client
        .from('member_payments')
        .select(`
            *,
            member:members(full_name, dni)
        `)
        .order('payment_date', { ascending: false });

    if (error) throw error;
    return data;
}

/**
 * Get payments for a specific member
 */
async function getMemberPaymentsByMember(memberId) {
    const client = getSupabase();

    const { data, error } = await client
        .from('member_payments')
        .select('*')
        .eq('member_id', memberId)
        .order('payment_date', { ascending: false });

    if (error) throw error;
    return data;
}

/**
 * Create a payment
 */
async function createMemberPayment(paymentData) {
    const client = getSupabase();
    const profile = await getProfile();

    if (!profile || !profile.gym_id) throw new Error('No gym associated');

    const { data, error } = await client
        .from('member_payments')
        .insert({
            gym_id: profile.gym_id,
            ...paymentData
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update a payment
 */
async function updateMemberPayment(id, updates) {
    const client = getSupabase();

    const { data, error } = await client
        .from('member_payments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Delete a payment
 */
async function deleteMemberPayment(id) {
    const client = getSupabase();

    const { error } = await client
        .from('member_payments')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// ============================================
// CLASSES FUNCTIONS
// ============================================

/**
 * Get all classes for current gym
 */
async function getClasses() {
    const client = getSupabase();

    const { data, error } = await client
        .from('classes')
        .select('*')
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * Get a single class by ID
 */
async function getClass(id) {
    const client = getSupabase();

    const { data, error } = await client
        .from('classes')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Create a new class
 */
async function createClass(classData) {
    const client = getSupabase();
    const profile = await getProfile();

    if (!profile || !profile.gym_id) throw new Error('No gym associated');

    const { data, error } = await client
        .from('classes')
        .insert({
            gym_id: profile.gym_id,
            ...classData
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update a class
 */
async function updateClass(id, updates) {
    const client = getSupabase();

    const { data, error } = await client
        .from('classes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Delete a class
 */
async function deleteClass(id) {
    const client = getSupabase();

    const { error } = await client
        .from('classes')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// ============================================
// CLASS BOOKINGS FUNCTIONS
// ============================================

/**
 * Get all bookings for a specific date
 */
async function getBookingsByDate(date) {
    const client = getSupabase();

    const { data, error } = await client
        .from('class_bookings')
        .select(`
            *,
            class:classes(name, instructor, start_time, end_time, capacity),
            member:members(full_name, dni)
        `)
        .eq('booking_date', date)
        .order('booked_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * Get bookings for a class on a specific date
 */
async function getBookingsForClass(classId, date) {
    const client = getSupabase();

    const { data, error } = await client
        .from('class_bookings')
        .select(`
            *,
            member:members(id, full_name, dni, phone)
        `)
        .eq('class_id', classId)
        .eq('booking_date', date);

    if (error) throw error;
    return data || [];
}

/**
 * Create a booking
 */
async function createBooking(bookingData) {
    const client = getSupabase();
    const profile = await getProfile();

    if (!profile || !profile.gym_id) throw new Error('No gym associated');

    const { data, error } = await client
        .from('class_bookings')
        .insert({
            gym_id: profile.gym_id,
            ...bookingData
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update booking status
 */
async function updateBooking(id, updates) {
    const client = getSupabase();

    const { data, error } = await client
        .from('class_bookings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Cancel a booking
 */
async function cancelBooking(id) {
    return updateBooking(id, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
    });
}

/**
 * Mark booking as attended
 */
async function markAttended(id) {
    return updateBooking(id, {
        status: 'attended',
        attended_at: new Date().toISOString()
    });
}

/**
 * Delete a booking
 */
async function deleteBooking(id) {
    const client = getSupabase();

    const { error } = await client
        .from('class_bookings')
        .delete()
        .eq('id', id);

    if (error) throw error;
}
// ============================================
// ACCESS LOGS FUNCTIONS
// ============================================

/**
 * Get today's access logs
 */
async function getTodayAccessLogs() {
    const client = getSupabase();
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await client
        .from('access_logs')
        .select(`
            *,
            member:members(id, full_name, dni, phone, status)
        `)
        .gte('check_in_at', today)
        .order('check_in_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * Get access logs for a date range
 */
async function getAccessLogs(startDate, endDate) {
    const client = getSupabase();

    const { data, error } = await client
        .from('access_logs')
        .select(`
            *,
            member:members(id, full_name, dni)
        `)
        .gte('check_in_at', startDate)
        .lte('check_in_at', endDate + 'T23:59:59')
        .order('check_in_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * Check-in a member
 */
async function checkInMember(memberId, accessMethod = 'manual', notes = null) {
    const client = getSupabase();
    const profile = await getProfile();

    if (!profile || !profile.gym_id) throw new Error('No gym associated');

    const { data, error } = await client
        .from('access_logs')
        .insert({
            gym_id: profile.gym_id,
            member_id: memberId,
            check_in_at: new Date().toISOString(),
            access_method: accessMethod,
            notes: notes
        })
        .select(`
            *,
            member:members(full_name, dni)
        `)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Check-out a member (update existing check-in)
 */
async function checkOutMember(accessLogId) {
    const client = getSupabase();

    const { data, error } = await client
        .from('access_logs')
        .update({
            check_out_at: new Date().toISOString()
        })
        .eq('id', accessLogId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Get members currently checked in (no check-out yet)
 */
async function getCurrentlyCheckedIn() {
    const client = getSupabase();
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await client
        .from('access_logs')
        .select(`
            *,
            member:members(id, full_name, dni, phone, photo_url)
        `)
        .gte('check_in_at', today)
        .is('check_out_at', null)
        .order('check_in_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * Get member's attendance history
 */
async function getMemberAttendance(memberId, limit = 30) {
    const client = getSupabase();

    const { data, error } = await client
        .from('access_logs')
        .select('*')
        .eq('member_id', memberId)
        .order('check_in_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

/**
 * Search members by DNI or name (for check-in)
 */
async function searchMembersForAccess(query) {
    const client = getSupabase();

    const { data, error } = await client
        .from('members')
        .select('id, full_name, dni, phone, status, photo_url, membership_end')
        .or(`dni.ilike.%${query}%,full_name.ilike.%${query}%`)
        .eq('status', 'active')
        .limit(10);

    if (error) throw error;
    return data || [];
}

/**
 * Get access statistics (requires RPC function in database)
 */
async function getAccessStats(daysBack = 30) {
    const client = getSupabase();
    const profile = await getProfile();

    if (!profile || !profile.gym_id) throw new Error('No gym associated');

    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - daysBack);

    // Get basic stats from access_logs
    const { data: logs, error } = await client
        .from('access_logs')
        .select('check_in_at')
        .gte('check_in_at', startDate.toISOString());

    if (error) throw error;

    // Calculate stats locally
    const hourlyStats = {};
    const dailyStats = {};

    (logs || []).forEach(log => {
        const date = new Date(log.check_in_at);
        const hour = date.getHours();
        const day = date.getDay();

        hourlyStats[hour] = (hourlyStats[hour] || 0) + 1;
        dailyStats[day] = (dailyStats[day] || 0) + 1;
    });

    return {
        totalVisits: logs?.length || 0,
        hourlyStats,
        dailyStats
    };
}

// Initialize Supabase on load
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
});

// ============================================
// ERROR HANDLING UTILITIES
// ============================================

/**
 * Get user-friendly error message from Supabase error
 * @param {Error} error - The error object
 * @returns {string} - User-friendly error message
 */
function getSupabaseErrorMessage(error) {
    if (!error) return 'Error desconocido';

    const message = error.message || error.toString();

    // Network errors
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        return 'Error de conexión. Verifica tu conexión a internet e intenta nuevamente.';
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('Timeout')) {
        return 'La solicitud tardó demasiado. Intenta nuevamente.';
    }

    // Auth errors
    if (message.includes('Invalid login credentials')) {
        return 'Email o contraseña incorrectos';
    }
    if (message.includes('User already registered')) {
        return 'Este email ya está registrado';
    }
    if (message.includes('JWT expired')) {
        return 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.';
    }

    // Database errors
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

    // Generic errors
    if (message.includes('not found') || message.includes('No rows')) {
        return 'El registro no fue encontrado.';
    }

    return message;
}

/**
 * Check if user is online
 * @returns {boolean}
 */
function isOnline() {
    return navigator.onLine;
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} delay - Initial delay in ms (default: 1000)
 * @returns {Promise<any>}
 */
async function retryWithBackoff(fn, maxRetries = 3, delay = 1000) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Don't retry on auth errors or validation errors
            const message = error.message || '';
            if (message.includes('Invalid login') ||
                message.includes('duplicate key') ||
                message.includes('violates')) {
                throw error;
            }

            // Wait before retrying (exponential backoff)
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
            }
        }
    }

    throw lastError;
}

/**
 * Check if DNI already exists in the gym
 * @param {string} dni - DNI to check
 * @param {string} excludeId - Member ID to exclude (for editing)
 * @returns {Promise<boolean>} - True if DNI exists
 */
async function isDniDuplicate(dni, excludeId = null) {
    if (!dni || dni.trim() === '') return false;

    const client = getSupabase();

    let query = client
        .from('members')
        .select('id')
        .eq('dni', dni.trim());

    if (excludeId) {
        query = query.neq('id', excludeId);
    }

    const { data, error } = await query.limit(1);

    if (error) {
        console.error('DNI check error:', error);
        return false; // Fail open - let the database constraint handle it
    }

    return data && data.length > 0;
}

/**
 * Create member with DNI validation
 * @param {object} memberData - Member data
 * @returns {Promise<object>} - Created member
 */
async function createMemberSafe(memberData) {
    // Check for duplicate DNI first
    if (memberData.dni) {
        const isDuplicate = await isDniDuplicate(memberData.dni);
        if (isDuplicate) {
            throw new Error('Ya existe un socio con este DNI en tu gimnasio.');
        }
    }

    return createMember(memberData);
}

/**
 * Update member with DNI validation
 * @param {string} id - Member ID
 * @param {object} updates - Updates to apply
 * @returns {Promise<object>} - Updated member
 */
async function updateMemberSafe(id, updates) {
    // Check for duplicate DNI first (excluding current member)
    if (updates.dni) {
        const isDuplicate = await isDniDuplicate(updates.dni, id);
        if (isDuplicate) {
            throw new Error('Ya existe un socio con este DNI en tu gimnasio.');
        }
    }

    return updateMember(id, updates);
}

// ============================================
// OFFLINE DETECTION
// ============================================

/**
 * Setup offline/online listeners
 */
function setupConnectivityListeners() {
    window.addEventListener('online', () => {
        if (typeof showToast === 'function') {
            showToast('Conexión restaurada', 'success');
        }
    });

    window.addEventListener('offline', () => {
        if (typeof showToast === 'function') {
            showToast('Sin conexión a internet', 'warning', 5000);
        }
    });
}

// Setup connectivity listeners when DOM is ready
document.addEventListener('DOMContentLoaded', setupConnectivityListeners);
