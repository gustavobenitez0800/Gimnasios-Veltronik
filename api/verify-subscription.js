/**
 * ============================================
 * VELTRONIK - VERIFY SUBSCRIPTION ENDPOINT
 * ============================================
 * 
 * POST /api/verify-subscription
 * 
 * Checks the real subscription status from
 * MercadoPago and syncs with our database.
 * 
 * Body: { "gym_id": "uuid" }
 */

const {
    preApproval,
    supabase,
    GYM_STATUS,
    SUBSCRIPTION_STATUS,
    MP_STATUS_MAP,
    jsonResponse,
    errorResponse,
    corsResponse,
    logSecure,
    isValidUUID
} = require('./mercadopago');

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return corsResponse(res, req).status(200).end();
    }

    if (req.method !== 'POST') {
        return errorResponse(res, 405, 'Method not allowed', null, req);
    }

    try {
        const { gym_id } = req.body;

        if (!gym_id || !isValidUUID(gym_id)) {
            return errorResponse(res, 400, 'gym_id inválido o faltante', null, req);
        }

        // Get current subscription from DB
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('gym_id', gym_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!subscription) {
            return jsonResponse(res, 200, {
                success: true,
                synced: false,
                message: 'No hay suscripción registrada',
                db_status: null,
                mp_status: null
            }, req);
        }

        // If no MP preapproval ID, can't verify with MP
        if (!subscription.mp_preapproval_id) {
            return jsonResponse(res, 200, {
                success: true,
                synced: false,
                message: 'Suscripción sin ID de MercadoPago',
                db_status: subscription.status,
                mp_status: null
            }, req);
        }

        // Fetch real status from MercadoPago
        let mpSub;
        try {
            mpSub = await preApproval.get({ id: subscription.mp_preapproval_id });
        } catch (err) {
            logSecure('warn', 'Could not fetch subscription from MP', { error: err?.message });
            return jsonResponse(res, 200, {
                success: true,
                synced: false,
                message: 'No se pudo consultar MercadoPago. Puede que la suscripción ya no exista.',
                db_status: subscription.status,
                mp_status: null
            }, req);
        }

        const mpStatus = mpSub.status;
        const internalStatus = MP_STATUS_MAP[mpStatus] || SUBSCRIPTION_STATUS.PENDING;
        const dbStatus = subscription.status;

        // Check if sync is needed
        if (dbStatus === internalStatus) {
            return jsonResponse(res, 200, {
                success: true,
                synced: true,
                message: 'Suscripción sincronizada correctamente',
                db_status: dbStatus,
                mp_status: mpStatus,
                changed: false
            }, req);
        }

        // Sync: update DB to match MP
        logSecure('info', 'Syncing subscription status', { from: dbStatus, to: internalStatus, mpStatus });

        const updateData = {
            status: internalStatus,
            updated_at: new Date().toISOString()
        };

        if (mpStatus === 'authorized') {
            updateData.grace_period_ends_at = null;
            updateData.retry_count = 0;
            if (mpSub.next_payment_date) {
                updateData.current_period_end = mpSub.next_payment_date;
                updateData.next_payment_date = mpSub.next_payment_date;
            }
        }

        await supabase
            .from('subscriptions')
            .update(updateData)
            .eq('id', subscription.id);

        // Update gym status accordingly
        let gymStatus;
        if (mpStatus === 'authorized') {
            gymStatus = GYM_STATUS.ACTIVE;
        } else if (mpStatus === 'cancelled') {
            gymStatus = GYM_STATUS.BLOCKED;
        } else if (mpStatus === 'paused') {
            gymStatus = GYM_STATUS.ACTIVE; // Grace period
        } else {
            gymStatus = GYM_STATUS.PENDING;
        }

        await supabase
            .from('gyms')
            .update({ status: gymStatus, updated_at: new Date().toISOString() })
            .eq('id', gym_id);

        return jsonResponse(res, 200, {
            success: true,
            synced: true,
            message: `Estado sincronizado: ${dbStatus} → ${internalStatus}`,
            db_status: internalStatus,
            mp_status: mpStatus,
            gym_status: gymStatus,
            changed: true
        }, req);

    } catch (err) {
        logSecure('error', 'Verify subscription error', { message: err?.message });
        return errorResponse(res, 500, 'Error al verificar suscripción', null, req);
    }
};
