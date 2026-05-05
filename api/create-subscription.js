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
    sanitizeString,
    verifyUserAccess
} = require('./mercadopago');

module.exports = async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return corsResponse(res, req).status(200).end();
    }

    const { isRateLimited } = require('./_rateLimit.js');
    if (isRateLimited(req, 10, 60000)) { // 10 peticiones por minuto máximo
        return errorResponse(res, 429, 'Demasiadas peticiones. Intenta más tarde.', null, req);
    }

    // Solo POST permitido
    if (req.method !== 'POST') {
        return errorResponse(res, 405, 'Method not allowed', null, req);
    }

    try {
        const { gym_id, payer_email, plan_id, org_type } = req.body;

        // ============================================
        // SECURITY: VALIDACIÓN DE INPUTS & AUTH
        // ============================================

        if (!gym_id) {
            return errorResponse(res, 400, 'gym_id es requerido', null, req);
        }

        if (!isValidUUID(gym_id)) {
            logSecure('warn', 'Invalid gym_id format received');
            return errorResponse(res, 400, 'gym_id inválido', null, req);
        }

        // VALIDACIÓN DE AUTENTICACIÓN
        const hasAccess = await verifyUserAccess(req, gym_id);
        if (!hasAccess) {
            return errorResponse(res, 403, 'No tienes permiso para crear una suscripción en esta organización', null, req);
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
            try {
                const { data: defaultPlan } = await supabase
                    .from('plans')
                    .select('id')
                    .eq('name', 'Profesional')
                    .maybeSingle();

                if (defaultPlan) {
                    resolvedPlanId = defaultPlan.id;
                } else {
                    const { data: firstPlan } = await supabase
                        .from('plans')
                        .select('id')
                        .order('price', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (firstPlan) resolvedPlanId = firstPlan.id;
                }
            } catch (err) {
                logSecure('warn', 'Error resolviendo plan_id por defecto', { error: err.message });
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
                    logSecure('info', 'Reusing recent MP subscription (Rate-limit saver)', { id: mpSubscription.id });
                }
            } catch (e) {
                logSecure('warn', 'Failed to fetch recent pending subscription, falling back to create new');
            }
        }

        // ============================================
        // 2. HANDLE EXISTING SUBSCRIPTIONS (CLEANUP)
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

            // Ignorar la que estamos reutilizando
            if (mpSubscription && sub.mp_preapproval_id === mpSubscription.id) {
                continue;
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
        // 3. CREATE NEW SUBSCRIPTION IN MP (IF NOT REUSING)
        // ============================================

        if (!mpSubscription) {
            if (!price || price <= 0) {
                return errorResponse(res, 400, 'El precio de la suscripción es inválido.', null, req);
            }

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

            logSecure('info', 'Creating MP subscription', { gym_id, price, email: sanitizedEmail });

            mpSubscription = await preApproval.create({ body: subscriptionData });

            if (!mpSubscription || (!mpSubscription.init_point && !mpSubscription.sandbox_init_point)) {
                throw new Error('Mercado Pago devolvió una respuesta vacía o sin link de pago (init_point).');
            }

            logSecure('info', 'MP subscription created', {
                hasInitPoint: !!mpSubscription.init_point,
                status: mpSubscription.status
            });
        }

        // ============================================
        // 4. GUARDAR EN BD (Resolución Atómica de Race Condition)
        // ============================================

        // Verificamos si el webhook llegó antes que nosotros (Race condition)
        const { data: existingSubByMp } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('mp_preapproval_id', mpSubscription.id)
            .maybeSingle();

        if (existingSubByMp) {
            // El webhook ya la insertó. Nosotros solo actualizamos los campos faltantes (plan_id, email)
            await supabase
                .from('subscriptions')
                .update({
                    plan_id: resolvedPlanId || null,
                    mp_payer_email: sanitizedEmail
                })
                .eq('id', existingSubByMp.id);
            logSecure('info', 'Race condition handled: Updated existing webhook row');
        } else {
            // Flujo normal: Insertamos
            const subscriptionRecord = {
                gym_id: gym_id,
                plan_id: resolvedPlanId || null,
                mp_preapproval_id: mpSubscription.id,
                mp_payer_email: sanitizedEmail,
                status: SUBSCRIPTION_STATUS.PENDING,
                created_at: new Date().toISOString()
            };

            const { error: saveError } = await supabase
                .from('subscriptions')
                .insert(subscriptionRecord);

            if (saveError) {
                logSecure('error', 'Error saving subscription to DB', { error: saveError.message });
            }
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
                subscription_id: existingSubByMp?.id || null,
                mp_preapproval_id: mpSubscription.id,
                init_point: mpSubscription.init_point,
                sandbox_init_point: mpSubscription.sandbox_init_point,
                status: mpSubscription.status,
                price: price,
            }
        }, req);

    } catch (error) {
        logSecure('error', 'Create subscription error', { error: error.message, stack: error.stack });
        console.error("🔥 ACTUAL ERROR:", error);
        
        let statusCode = 500;
        let userMessage = 'Error al crear suscripción en el procesador de pagos.';
        
        // Extraer detalles reales de MP (El SDK v2 de MP suele anidar el error en 'cause' o 'response')
        let mpErrorDetail = error.message;
        if (error.cause && error.cause.length > 0) {
            mpErrorDetail = error.cause[0]?.description || error.cause[0]?.message || error.message;
        } else if (error.response && error.response.message) {
            mpErrorDetail = error.response.message;
        }

        // Traducir errores comunes al español para el frontend
        const errorStr = (mpErrorDetail || '').toLowerCase();
        
        if (errorStr.includes('collector_id') || errorStr.includes('payer_id') || errorStr.includes('cannot be the same') || errorStr.includes('mismo email')) {
            statusCode = 400; // 400 permite que el detail viaje al frontend en producción
            userMessage = 'Error de Prueba: No puedes suscribirte usando el mismo email de la cuenta dueña de Mercado Pago.';
        } else if (error.status === 400 || error.status === 401 || error.status === 403) {
            statusCode = error.status;
            userMessage = 'Mercado Pago rechazó la operación. Por favor revisa tus datos.';
        }

        return errorResponse(res, statusCode, userMessage, { details: mpErrorDetail }, req);
    }
};
