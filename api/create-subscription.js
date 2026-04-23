/**
 * ============================================
 * VELTRONIK - CREATE SUBSCRIPTION ENDPOINT
 * ============================================
 * 
 * POST /api/create-subscription
 * 
 * Crea una suscripción mensual en Mercado Pago
 * usando la API de Preapproval.
 * 
 * NETFLIX-LEVEL: Handles all edge cases:
 * - New subscription
 * - Reactivation after cancellation
 * - Retry after rejected payment (past_due)
 * - Dynamic pricing by org type
 * 
 * Body esperado:
 * {
 *   "gym_id": "uuid del gimnasio",
 *   "payer_email": "email del pagador",
 *   "plan_id": "uuid del plan seleccionado (opcional)",
 *   "org_type": "GYM|RESTO|KIOSK|OTHER (opcional)"
 * }
 */

const {
    preApproval,
    supabase,
    SUBSCRIPTION_CONFIG,
    GYM_STATUS,
    SUBSCRIPTION_STATUS,
    getSubscriptionPriceForGym,
    jsonResponse,
    errorResponse,
    corsResponse,
    logSecure,
    isValidEmail,
    isValidUUID,
    sanitizeString
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
        const { gym_id, payer_email, plan_id, org_type } = req.body;

        // ============================================
        // SECURITY: VALIDACIÓN DE INPUTS
        // ============================================

        if (!gym_id) {
            return errorResponse(res, 400, 'gym_id es requerido', null, req);
        }

        if (!isValidUUID(gym_id)) {
            logSecure('warn', 'Invalid gym_id format received');
            return errorResponse(res, 400, 'gym_id inválido', null, req);
        }

        if (!payer_email) {
            return errorResponse(res, 400, 'payer_email es requerido', null, req);
        }

        if (!isValidEmail(payer_email)) {
            logSecure('warn', 'Invalid email format received');
            return errorResponse(res, 400, 'Email inválido', null, req);
        }

        const sanitizedEmail = payer_email.trim().toLowerCase();

        if (plan_id && !isValidUUID(plan_id)) {
            return errorResponse(res, 400, 'plan_id inválido', null, req);
        }

        // ============================================
        // RESOLVE DYNAMIC PRICE BY ORG TYPE
        // ============================================

        const { price, reason } = await getSubscriptionPriceForGym(gym_id, org_type);

        logSecure('info', 'Resolved subscription price', { price, org_type: org_type || 'auto' });

        // ============================================
        // AUTO-ASSIGN DEFAULT PLAN IF NOT PROVIDED
        // ============================================

        let resolvedPlanId = plan_id;
        if (!resolvedPlanId) {
            const { data: defaultPlan } = await supabase
                .from('plans')
                .select('id')
                .eq('name', 'Profesional')
                .single();

            if (defaultPlan) {
                resolvedPlanId = defaultPlan.id;
            } else {
                const { data: firstPlan } = await supabase
                    .from('plans')
                    .select('id')
                    .order('price', { ascending: false })
                    .limit(1)
                    .single();

                if (firstPlan) resolvedPlanId = firstPlan.id;
            }
        }

        // ============================================
        // VALIDATE GYM EXISTS
        // ============================================

        const { data: gym, error: gymError } = await supabase
            .from('gyms')
            .select('id, name, status')
            .eq('id', gym_id)
            .single();

        if (gymError || !gym) {
            logSecure('warn', 'Gym not found');
            return errorResponse(res, 404, 'Gimnasio no encontrado', null, req);
        }

        // ============================================
        // HANDLE EXISTING SUBSCRIPTIONS
        // ============================================

        // Check for ANY non-cancelled subscription (active, pending, or past_due)
        const { data: existingSubs } = await supabase
            .from('subscriptions')
            .select('id, status, mp_preapproval_id')
            .eq('gym_id', gym_id)
            .in('status', [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.PAST_DUE])
            .order('created_at', { ascending: false });

        for (const sub of (existingSubs || [])) {
            if (sub.status === SUBSCRIPTION_STATUS.ACTIVE) {
                // Truly active → don't create another
                return jsonResponse(res, 200, {
                    success: false,
                    error: 'Ya tenés una suscripción activa. No es necesario crear una nueva.',
                    already_active: true
                }, req);
            }

            // Cancel pending or past_due subscriptions in MP + DB to allow fresh start
            if (sub.mp_preapproval_id) {
                try {
                    await preApproval.update({
                        id: sub.mp_preapproval_id,
                        body: { status: 'cancelled' }
                    });
                } catch {
                    logSecure('warn', 'Could not cancel old MP subscription');
                }
            }

            await supabase
                .from('subscriptions')
                .update({ status: SUBSCRIPTION_STATUS.CANCELED, updated_at: new Date().toISOString() })
                .eq('id', sub.id);

            logSecure('info', 'Cleaned up old subscription', { oldStatus: sub.status });
        }

        // ============================================
        // CREATE SUBSCRIPTION IN MERCADO PAGO
        // ============================================

        const subscriptionData = {
            reason: sanitizeString(reason, 100),
            external_reference: gym_id,
            payer_email: sanitizedEmail,
            auto_recurring: {
                frequency: SUBSCRIPTION_CONFIG.FREQUENCY,
                frequency_type: SUBSCRIPTION_CONFIG.FREQUENCY_TYPE,
                transaction_amount: price,
                currency_id: SUBSCRIPTION_CONFIG.CURRENCY
            },
            back_url: `${SUBSCRIPTION_CONFIG.BACK_URL}/#/payment-callback`
        };

        logSecure('info', 'Creating MP subscription', { gym_id, price });

        const mpSubscription = await preApproval.create({ body: subscriptionData });

        logSecure('info', 'MP subscription created', {
            hasInitPoint: !!mpSubscription.init_point,
            status: mpSubscription.status
        });

        // ============================================
        // SAVE TO DATABASE
        // ============================================

        const subscriptionRecord = {
            gym_id: gym_id,
            plan_id: resolvedPlanId || null,
            mp_preapproval_id: mpSubscription.id,
            mp_payer_email: sanitizedEmail,
            status: SUBSCRIPTION_STATUS.PENDING,
            created_at: new Date().toISOString()
        };

        const { data: savedSubscription, error: saveError } = await supabase
            .from('subscriptions')
            .insert(subscriptionRecord)
            .select()
            .single();

        if (saveError) {
            logSecure('error', 'Error saving subscription to DB');
        }

        // Update gym plan_id + unblock if blocked
        await supabase
            .from('gyms')
            .update({
                plan_id: resolvedPlanId || null,
                // Don't activate yet — webhook will do it after payment
                updated_at: new Date().toISOString()
            })
            .eq('id', gym_id);

        // ============================================
        // SUCCESS RESPONSE
        // ============================================

        return jsonResponse(res, 200, {
            success: true,
            data: {
                subscription_id: savedSubscription?.id || null,
                mp_preapproval_id: mpSubscription.id,
                init_point: mpSubscription.init_point,
                sandbox_init_point: mpSubscription.sandbox_init_point,
                status: mpSubscription.status,
                price: price,
            }
        }, req);

    } catch {
        logSecure('error', 'Create subscription error');
        return errorResponse(res, 500, 'Error al crear suscripción', null, req);
    }
};
