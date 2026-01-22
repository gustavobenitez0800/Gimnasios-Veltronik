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
// MEMBERS FUNCTIONS (OFFLINE-CAPABLE)
// ============================================

/**
 * Get all members for current gym
 * Supports offline mode - returns cached data if offline
 */
async function getMembers() {
    // Check if we're online
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - returning cached members');
        return await OfflineStorage.getAllMembers();
    }

    try {
        const client = getSupabase();
        const { data, error } = await client
            .from('members')
            .select('*')
            .order('full_name', { ascending: true });

        if (error) throw error;

        // Cache the data locally for offline use
        if (data && typeof OfflineStorage !== 'undefined') {
            await OfflineStorage.saveMembers(data);
        }

        return data;
    } catch (error) {
        // If network error, try to return cached data
        if (typeof OfflineStorage !== 'undefined') {
            console.log('[Supabase] Network error - returning cached members');
            const cached = await OfflineStorage.getAllMembers();
            if (cached && cached.length > 0) return cached;
        }
        throw error;
    }
}

/**
 * Get a single member by ID
 * Supports offline mode
 */
async function getMember(id) {
    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - returning cached member');
        return await OfflineStorage.getMemberById(id);
    }

    try {
        const client = getSupabase();
        const { data, error } = await client
            .from('members')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        // Cache locally
        if (data && typeof OfflineStorage !== 'undefined') {
            await OfflineStorage.saveMember(data);
        }

        return data;
    } catch (error) {
        if (typeof OfflineStorage !== 'undefined') {
            const cached = await OfflineStorage.getMemberById(id);
            if (cached) return cached;
        }
        throw error;
    }
}

/**
 * Create a new member
 * Supports offline mode - queues for sync when offline
 */
async function createMember(memberData) {
    const profile = await getProfile();
    if (!profile || !profile.gym_id) throw new Error('No gym associated');

    const fullMemberData = {
        gym_id: profile.gym_id,
        ...memberData
    };

    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - creating member locally');

        // Generate temporary ID
        const tempId = OfflineStorage.generateTempId();
        const offlineMember = {
            ...fullMemberData,
            id: tempId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            _isOffline: true
        };

        // Save locally
        await OfflineStorage.saveMember(offlineMember);

        // Queue for sync
        await OfflineStorage.addToSyncQueue('members', 'create', offlineMember, tempId);

        return offlineMember;
    }

    // Online - proceed normally
    const client = getSupabase();
    const { data, error } = await client
        .from('members')
        .insert(fullMemberData)
        .select()
        .single();

    if (error) throw error;

    // Cache locally
    if (data && typeof OfflineStorage !== 'undefined') {
        await OfflineStorage.saveMember(data);
    }

    return data;
}

/**
 * Update a member
 * Supports offline mode - queues for sync when offline
 */
async function updateMember(id, updates) {
    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - updating member locally');

        // Get existing member
        const existing = await OfflineStorage.getMemberById(id);
        if (!existing) throw new Error('Member not found in local storage');

        const updatedMember = {
            ...existing,
            ...updates,
            updated_at: new Date().toISOString(),
            _isOffline: true
        };

        // Save locally
        await OfflineStorage.saveMember(updatedMember);

        // Queue for sync (only if not a temp ID)
        if (!OfflineStorage.isTempId(id)) {
            await OfflineStorage.addToSyncQueue('members', 'update', updates, id);
        }

        return updatedMember;
    }

    // Online - proceed normally
    const client = getSupabase();
    const { data, error } = await client
        .from('members')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;

    // Cache locally
    if (data && typeof OfflineStorage !== 'undefined') {
        await OfflineStorage.saveMember(data);
    }

    return data;
}

/**
 * Delete a member
 * Supports offline mode - queues for sync when offline
 */
async function deleteMember(id) {
    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - deleting member locally');

        // Delete locally
        await OfflineStorage.deleteMemberLocal(id);

        // Queue for sync (only if not a temp ID - temp records don't exist on server)
        if (!OfflineStorage.isTempId(id)) {
            await OfflineStorage.addToSyncQueue('members', 'delete', null, id);
        }

        return;
    }

    // Online - proceed normally
    const client = getSupabase();
    const { error } = await client
        .from('members')
        .delete()
        .eq('id', id);

    if (error) throw error;

    // Remove from local cache
    if (typeof OfflineStorage !== 'undefined') {
        await OfflineStorage.deleteMemberLocal(id);
    }
}

// ============================================
// MEMBER PAYMENTS FUNCTIONS
// ============================================

/**
 * Get all payments for current gym
 * Supports offline mode - returns cached data when offline
 */
async function getMemberPayments() {
    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - returning cached payments');
        if (typeof OfflineStorage !== 'undefined') {
            return await OfflineStorage.getAllPayments();
        }
        return [];
    }

    // Online - fetch from server
    const client = getSupabase();

    const { data, error } = await client
        .from('member_payments')
        .select(`
            *,
            member:members(full_name, dni)
        `)
        .order('payment_date', { ascending: false });

    if (error) throw error;

    // Cache locally for offline use
    if (data && typeof OfflineStorage !== 'undefined') {
        for (const payment of data) {
            await OfflineStorage.savePayment(payment);
        }
    }

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
 * Supports offline mode - saves locally and queues for sync when offline
 */
async function createMemberPayment(paymentData) {
    const profile = await getProfile();
    if (!profile || !profile.gym_id) throw new Error('No gym associated');

    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - creating payment locally');

        const tempId = OfflineStorage.generateTempId();
        const offlinePayment = {
            id: tempId,
            gym_id: profile.gym_id,
            ...paymentData,
            created_at: new Date().toISOString(),
            _isOffline: true,
            _tempId: tempId
        };

        // Save locally
        await OfflineStorage.savePayment(offlinePayment);

        // Queue for sync
        await OfflineStorage.addToSyncQueue('member_payments', 'create', offlinePayment, tempId);

        return offlinePayment;
    }

    // Online - proceed normally
    const client = getSupabase();

    const { data, error } = await client
        .from('member_payments')
        .insert({
            gym_id: profile.gym_id,
            ...paymentData
        })
        .select()
        .single();

    if (error) throw error;

    // Cache locally
    if (data && typeof OfflineStorage !== 'undefined') {
        await OfflineStorage.savePayment(data);
    }

    return data;
}

/**
 * Update a payment
 * Supports offline mode - updates locally and queues for sync when offline
 */
async function updateMemberPayment(id, updates) {
    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - updating payment locally');

        const existing = await OfflineStorage.getPaymentById(id);
        if (!existing) throw new Error('Payment not found in local storage');

        const updatedPayment = {
            ...existing,
            ...updates,
            updated_at: new Date().toISOString(),
            _isOffline: true
        };

        await OfflineStorage.savePayment(updatedPayment);

        if (!OfflineStorage.isTempId(id)) {
            await OfflineStorage.addToSyncQueue('member_payments', 'update', updates, id);
        }

        return updatedPayment;
    }

    // Online - proceed normally
    const client = getSupabase();

    const { data, error } = await client
        .from('member_payments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;

    if (data && typeof OfflineStorage !== 'undefined') {
        await OfflineStorage.savePayment(data);
    }

    return data;
}

/**
 * Delete a payment
 * Supports offline mode - deletes locally and queues for sync when offline
 */
async function deleteMemberPayment(id) {
    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - deleting payment locally');

        await OfflineStorage.deletePaymentLocal(id);

        if (!OfflineStorage.isTempId(id)) {
            await OfflineStorage.addToSyncQueue('member_payments', 'delete', null, id);
        }

        return;
    }

    // Online - proceed normally
    const client = getSupabase();

    const { error } = await client
        .from('member_payments')
        .delete()
        .eq('id', id);

    if (error) throw error;

    if (typeof OfflineStorage !== 'undefined') {
        await OfflineStorage.deletePaymentLocal(id);
    }
}

// ============================================
// CLASSES FUNCTIONS
// ============================================

/**
 * Get all classes for current gym
 * Supports offline mode - returns cached data when offline
 */
async function getClasses() {
    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - returning cached classes');
        if (typeof OfflineStorage !== 'undefined') {
            return await OfflineStorage.getAllClasses();
        }
        return [];
    }

    // Online - fetch from server
    const client = getSupabase();

    const { data, error } = await client
        .from('classes')
        .select('*')
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

    if (error) throw error;

    // Cache locally for offline use
    if (data && typeof OfflineStorage !== 'undefined') {
        for (const cls of data) {
            await OfflineStorage.saveClass(cls);
        }
    }

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
 * Supports offline mode - saves locally and queues for sync when offline
 */
async function createClass(classData) {
    const profile = await getProfile();
    if (!profile || !profile.gym_id) throw new Error('No gym associated');

    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - creating class locally');

        const tempId = OfflineStorage.generateTempId();
        const offlineClass = {
            id: tempId,
            gym_id: profile.gym_id,
            ...classData,
            status: 'active',
            created_at: new Date().toISOString(),
            _isOffline: true,
            _tempId: tempId
        };

        await OfflineStorage.saveClass(offlineClass);
        await OfflineStorage.addToSyncQueue('classes', 'create', offlineClass, tempId);

        return offlineClass;
    }

    // Online - proceed normally
    const client = getSupabase();

    const { data, error } = await client
        .from('classes')
        .insert({
            gym_id: profile.gym_id,
            ...classData
        })
        .select()
        .single();

    if (error) throw error;

    if (data && typeof OfflineStorage !== 'undefined') {
        await OfflineStorage.saveClass(data);
    }

    return data;
}

/**
 * Update a class
 * Supports offline mode - updates locally and queues for sync when offline
 */
async function updateClass(id, updates) {
    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - updating class locally');

        const existing = await OfflineStorage.getClassById(id);
        if (!existing) throw new Error('Class not found in local storage');

        const updatedClass = {
            ...existing,
            ...updates,
            updated_at: new Date().toISOString(),
            _isOffline: true
        };

        await OfflineStorage.saveClass(updatedClass);

        if (!OfflineStorage.isTempId(id)) {
            await OfflineStorage.addToSyncQueue('classes', 'update', updates, id);
        }

        return updatedClass;
    }

    // Online - proceed normally
    const client = getSupabase();

    const { data, error } = await client
        .from('classes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;

    if (data && typeof OfflineStorage !== 'undefined') {
        await OfflineStorage.saveClass(data);
    }

    return data;
}

/**
 * Delete a class
 * Supports offline mode - deletes locally and queues for sync when offline
 */
async function deleteClass(id) {
    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - deleting class locally');

        await OfflineStorage.deleteClassLocal(id);

        if (!OfflineStorage.isTempId(id)) {
            await OfflineStorage.addToSyncQueue('classes', 'delete', null, id);
        }

        return;
    }

    // Online - proceed normally
    const client = getSupabase();

    const { error } = await client
        .from('classes')
        .delete()
        .eq('id', id);

    if (error) throw error;

    if (typeof OfflineStorage !== 'undefined') {
        await OfflineStorage.deleteClassLocal(id);
    }
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
 * Supports offline mode - returns cached data when offline
 */
async function getTodayAccessLogs() {
    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - returning cached access logs');
        if (typeof OfflineStorage !== 'undefined') {
            return await OfflineStorage.getTodayAccessLogs();
        }
        return [];
    }

    // Online - fetch from server
    const client = getSupabase();
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await client
        .from('access_logs')
        .select(`
            *,
            member:members(id, full_name, dni, phone, status, membership_end)
        `)
        .gte('check_in_at', today)
        .order('check_in_at', { ascending: false });

    if (error) throw error;

    // Cache locally for offline use
    if (data && typeof OfflineStorage !== 'undefined') {
        for (const log of data) {
            await OfflineStorage.saveAccessLog(log);
        }
    }

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
 * Supports offline mode - saves locally and queues for sync when offline
 */
async function checkInMember(memberId, accessMethod = 'manual', notes = null) {
    const profile = await getProfile();
    if (!profile || !profile.gym_id) throw new Error('No gym associated');

    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - creating access log locally');

        const tempId = OfflineStorage.generateTempId();
        const offlineLog = {
            id: tempId,
            gym_id: profile.gym_id,
            member_id: memberId,
            check_in_at: new Date().toISOString(),
            check_out_at: null,
            access_method: accessMethod,
            notes: notes,
            _isOffline: true,
            _tempId: tempId
        };

        // Get member data from cache to include in return
        const member = await OfflineStorage.getMemberById(memberId);
        if (member) {
            offlineLog.member = {
                full_name: member.full_name,
                dni: member.dni
            };
        }

        await OfflineStorage.saveAccessLog(offlineLog);
        await OfflineStorage.addToSyncQueue('access_logs', 'create', offlineLog, tempId);

        return offlineLog;
    }

    // Online - proceed normally
    const client = getSupabase();

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

    if (data && typeof OfflineStorage !== 'undefined') {
        await OfflineStorage.saveAccessLog(data);
    }

    return data;
}

/**
 * Check-out a member (update existing check-in)
 * Supports offline mode - updates locally and queues for sync when offline
 */
async function checkOutMember(accessLogId) {
    // Check if offline
    if (typeof ConnectionMonitor !== 'undefined' && !ConnectionMonitor.isOnline()) {
        console.log('[Supabase] Offline - updating access log locally');

        const existing = await OfflineStorage.getAccessLogById(accessLogId);
        if (!existing) throw new Error('Access log not found in local storage');

        const updatedLog = {
            ...existing,
            check_out_at: new Date().toISOString(),
            _isOffline: true
        };

        await OfflineStorage.saveAccessLog(updatedLog);

        if (!OfflineStorage.isTempId(accessLogId)) {
            await OfflineStorage.addToSyncQueue('access_logs', 'update', { check_out_at: updatedLog.check_out_at }, accessLogId);
        }

        return updatedLog;
    }

    // Online - proceed normally
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

    if (data && typeof OfflineStorage !== 'undefined') {
        await OfflineStorage.saveAccessLog(data);
    }

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
