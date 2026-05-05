/**
 * ============================================
 * VELTRONIK - UPDATE PAYMENT METHOD ENDPOINT
 * ============================================
 * 
 * POST /api/update-payment-method
 * 
 * Generates a new MercadoPago checkout link so the
 * customer can re-enter their card details.
 * 
 * Flow: Cancel old preapproval → Create new one → Return checkout URL
 * 
 * Body esperado:
 * {
 *   "gym_id": "uuid del gimnasio",
 *   "payer_email": "email del pagador"
 * }
 */

const {
    preApproval,
    supabase,
    SUBSCRIPTION_CONFIG,
    SUBSCRIPTION_STATUS,
    GYM_STATUS,
    getSubscriptionPriceForGym,
    jsonResponse,
    errorResponse,
    corsResponse,
    logSecure,
    isValidEmail,
    isValidUUID,
    sanitizeString,
    verifyUserAccess
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
        const { gym_id, payer_email } = req.body;

        // ============================================
        // INPUT VALIDATION & SECURITY
        // ============================================

        if (!gym_id || !isValidUUID(gym_id)) {
            return errorResponse(res, 400, 'gym_id inválido o faltante', null, req);
        }

        // VALIDACIÓN DE AUTENTICACIÓN
        const hasAccess = await verifyUserAccess(req, gym_id);
        if (!hasAccess) {
            return errorResponse(res, 403, 'No tienes permiso para actualizar el método de pago de esta organización', null, req);
        }

        if (!payer_email || !isValidEmail(payer_email)) {
            return errorResponse(res, 400, 'Email inválido o faltante', null, req);
        }

        const sanitizedEmail = payer_email.trim().toLowerCase();

        // ============================================
        // VERIFY GYM EXISTS
        // ============================================

        const { data: gym, error: gymError } = await supabase
            .from('gyms')
            .select('id, name, plan_id, type')
            .eq('id', gym_id)
            .single();

        if (gymError || !gym) {
            return errorResponse(res, 404, 'Gimnasio no encontrado', null, req);
        }

        // ============================================
        // RESOLVE DYNAMIC PRICE
        // ============================================

        const { price, reason } = await getSubscriptionPriceForGym(gym_id, gym.type);

        // ============================================
        // 1. RE-UTILIZACIÓN INTELIGENTE (ANTI RATE-LIMITS)
        // ============================================
        let mpSubscription = null;
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60000).toISOString();
        
        const { data: recentPending } = await supabase
            .from('subscriptions')
            .select('id, mp_preapproval_id')
            .eq('gym_id', gym_id)
            .eq('status', SUBSCRIPTION_STATUS.PENDING)
            .gte('created_at', fifteenMinsAgo)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (recentPending && recentPending.mp_preapproval_id) {
            try {
                const fetchedSub = await preApproval.get({ id: recentPending.mp_preapproval_id });
                if (fetchedSub && (fetchedSub.init_point || fetchedSub.sandbox_init_point) && fetchedSub.status === 'pending') {
                    mpSubscription = fetchedSub;
                    logSecure('info', 'Reusing recent MP subscription for update (Rate-limit saver)', { id: mpSubscription.id });
                }
            } catch (e) {
                logSecure('warn', 'Failed to fetch recent pending subscription, falling back to create new');
            }
        }

        // ============================================
        // 2. CREATE NEW SUBSCRIPTION IN MERCADO PAGO (IF NOT REUSING)
        // ============================================
        
        // NOTE: We no longer cancel old subscriptions here.
        // If the user abandons the checkout, they shouldn't lose their current access.
        // Old subscriptions are now cancelled by the webhook ONLY when the new one is successfully paid.

        if (!mpSubscription) {
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

            logSecure('info', 'Creating new MP subscription for payment method update', { gym_id, price });

            mpSubscription = await preApproval.create({ body: subscriptionData });

            if (!mpSubscription || (!mpSubscription.init_point && !mpSubscription.sandbox_init_point)) {
                throw new Error('Mercado Pago devolvió una respuesta vacía o sin link de pago (init_point).');
            }

            logSecure('info', 'New MP subscription created', {
                hasInitPoint: !!mpSubscription.init_point,
                status: mpSubscription.status
            });
        }

        // ============================================
        // 3. GUARDAR EN BD (Resolución Atómica de Race Condition)
        // ============================================

        // Verificamos si el webhook llegó antes que nosotros (Race condition)
        const { data: existingSubByMp } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('mp_preapproval_id', mpSubscription.id)
            .maybeSingle();

        if (existingSubByMp) {
            // El webhook ya la insertó. Nosotros solo actualizamos los campos faltantes.
            await supabase
                .from('subscriptions')
                .update({
                    plan_id: gym.plan_id || null,
                    mp_payer_email: sanitizedEmail
                })
                .eq('id', existingSubByMp.id);
            logSecure('info', 'Race condition handled in update: Updated existing webhook row');
        } else {
            // Flujo normal: Insertamos
            const subscriptionRecord = {
                gym_id: gym_id,
                plan_id: gym.plan_id || null,
                mp_preapproval_id: mpSubscription.id,
                mp_payer_email: sanitizedEmail,
                status: SUBSCRIPTION_STATUS.PENDING,
                created_at: new Date().toISOString()
            };

            const { error: saveError } = await supabase
                .from('subscriptions')
                .insert(subscriptionRecord);

            if (saveError) {
                logSecure('error', 'Error saving new subscription to DB', { error: saveError.message });
            }
        }

        // ============================================
        // SUCCESS RESPONSE
        // ============================================

        return jsonResponse(res, 200, {
            success: true,
            data: {
                mp_preapproval_id: mpSubscription.id,
                init_point: mpSubscription.init_point,
                sandbox_init_point: mpSubscription.sandbox_init_point,
                status: mpSubscription.status,
                price: price,
            }
        }, req);

    } catch (err) {
        logSecure('error', 'Update payment method error', { message: err?.message });
        return errorResponse(res, 500, 'Error al actualizar método de pago', null, req);
    }
};
