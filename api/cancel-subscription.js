/**
 * ============================================
 * VELTRONIK - CANCEL SUBSCRIPTION ENDPOINT
 * ============================================
 * 
 * POST /api/cancel-subscription
 * 
 * Cancela una suscripción en Mercado Pago y en la BD.
 * 
 * Body esperado:
 * {
 *   "gym_id": "uuid del gimnasio"
 * }
 */

const {
    preApproval,
    supabase,
    SUBSCRIPTION_STATUS,
    GYM_STATUS,
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

        // Validar gym_id
        if (!gym_id || !isValidUUID(gym_id)) {
            return errorResponse(res, 400, 'gym_id inválido', null, req);
        }

        logSecure('info', 'Cancel subscription request', { gym_id });

        // Buscar suscripción activa
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select('id, mp_preapproval_id, status')
            .eq('gym_id', gym_id)
            .in('status', ['active', 'pending', 'past_due'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (subError || !subscription) {
            return errorResponse(res, 404, 'No se encontró suscripción activa', null, req);
        }

        // ============================================
        // CANCELAR EN MERCADO PAGO
        // ============================================

        let mpCancelled = false;

        if (subscription.mp_preapproval_id) {
            try {
                await preApproval.update({
                    id: subscription.mp_preapproval_id,
                    body: { status: 'cancelled' }
                });
                mpCancelled = true;
                logSecure('info', 'Subscription cancelled in MercadoPago');
            } catch {
                logSecure('error', 'Error cancelling in MercadoPago (may already be cancelled)');
                // Continuar con la cancelación en BD de todos modos
            }
        }

        // ============================================
        // CANCELAR EN BASE DE DATOS
        // ============================================

        await supabase
            .from('subscriptions')
            .update({
                status: SUBSCRIPTION_STATUS.CANCELED,
                updated_at: new Date().toISOString()
            })
            .eq('id', subscription.id);

        // Bloquear gimnasio
        await supabase
            .from('gyms')
            .update({
                status: GYM_STATUS.BLOCKED,
                updated_at: new Date().toISOString()
            })
            .eq('id', gym_id);

        logSecure('info', 'Subscription cancelled successfully', { gym_id, mpCancelled });

        return jsonResponse(res, 200, {
            success: true,
            mp_cancelled: mpCancelled,
            message: 'Suscripción cancelada. Tus datos están seguros.'
        }, req);

    } catch {
        logSecure('error', 'Cancel subscription error');
        return errorResponse(res, 500, 'Error al cancelar suscripción', null, req);
    }
};
