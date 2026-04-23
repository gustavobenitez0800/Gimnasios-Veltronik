/**
 * ============================================
 * VELTRONIK - CANCEL SUBSCRIPTION ENDPOINT
 * ============================================
 * 
 * POST /api/cancel-subscription
 * 
 * Cancels a subscription in Mercado Pago and
 * updates the database accordingly.
 * 
 * Body esperado:
 * {
 *   "gym_id": "uuid del gimnasio"
 * }
 */

const {
    preApproval,
    supabase,
    GYM_STATUS,
    SUBSCRIPTION_STATUS,
    jsonResponse,
    errorResponse,
    corsResponse,
    logSecure,
    isValidUUID
} = require('./mercadopago');

module.exports = async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return corsResponse(res, req).status(200).end();
    }

    // Solo POST permitido
    if (req.method !== 'POST') {
        return errorResponse(res, 405, 'Method not allowed', null, req);
    }

    try {
        const { gym_id } = req.body;

        // ============================================
        // VALIDACIÓN DE INPUTS
        // ============================================

        if (!gym_id) {
            return errorResponse(res, 400, 'gym_id es requerido', null, req);
        }

        if (!isValidUUID(gym_id)) {
            logSecure('warn', 'Invalid gym_id format received');
            return errorResponse(res, 400, 'gym_id inválido', null, req);
        }

        // ============================================
        // BUSCAR SUSCRIPCIÓN ACTIVA
        // ============================================

        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select('id, mp_preapproval_id, status')
            .eq('gym_id', gym_id)
            .in('status', [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.PAST_DUE])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (subError) {
            logSecure('error', 'Error fetching subscription');
            return errorResponse(res, 500, 'Error al buscar suscripción', null, req);
        }

        if (!subscription) {
            return jsonResponse(res, 200, {
                success: true,
                message: 'No hay suscripción activa para cancelar'
            }, req);
        }

        // ============================================
        // CANCELAR EN MERCADO PAGO
        // ============================================

        if (subscription.mp_preapproval_id) {
            try {
                await preApproval.update({
                    id: subscription.mp_preapproval_id,
                    body: { status: 'cancelled' }
                });
                logSecure('info', 'MP subscription cancelled successfully');
            } catch (mpError) {
                // Log but don't fail — we still want to cancel in our DB
                logSecure('warn', 'Could not cancel MP subscription (may already be cancelled)');
            }
        }

        // ============================================
        // ACTUALIZAR BASE DE DATOS
        // ============================================

        // Cancel subscription in DB
        const { error: updateSubError } = await supabase
            .from('subscriptions')
            .update({
                status: SUBSCRIPTION_STATUS.CANCELED,
                updated_at: new Date().toISOString()
            })
            .eq('id', subscription.id);

        if (updateSubError) {
            logSecure('error', 'Error updating subscription status');
        }

        // Block gym
        const { error: updateGymError } = await supabase
            .from('gyms')
            .update({
                status: GYM_STATUS.BLOCKED,
                updated_at: new Date().toISOString()
            })
            .eq('id', gym_id);

        if (updateGymError) {
            logSecure('error', 'Error updating gym status');
        }

        logSecure('info', 'Subscription cancelled and gym blocked', { gym_id });

        return jsonResponse(res, 200, {
            success: true,
            message: 'Suscripción cancelada exitosamente'
        }, req);

    } catch {
        logSecure('error', 'Cancel subscription error');
        return errorResponse(res, 500, 'Error al cancelar suscripción', null, req);
    }
};
