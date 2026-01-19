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
 * SECURITY HARDENED VERSION:
 * - Validación estricta de inputs
 * - Sanitización de datos
 * - Logs seguros
 * 
 * Body esperado:
 * {
 *   "gym_id": "uuid del gimnasio",
 *   "payer_email": "email del pagador",
 *   "plan_id": "uuid del plan seleccionado (opcional)"
 * }
 */

const {
    preApproval,
    supabase,
    SUBSCRIPTION_CONFIG,
    GYM_STATUS,
    SUBSCRIPTION_STATUS,
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
        const { gym_id, payer_email, plan_id } = req.body;

        // ============================================
        // SECURITY: VALIDACIÓN DE INPUTS
        // ============================================

        // Validar gym_id (obligatorio, debe ser UUID)
        if (!gym_id) {
            return errorResponse(res, 400, 'gym_id es requerido', null, req);
        }

        if (!isValidUUID(gym_id)) {
            logSecure('warn', 'Invalid gym_id format received');
            return errorResponse(res, 400, 'gym_id inválido', null, req);
        }

        // Validar email (obligatorio, formato válido)
        if (!payer_email) {
            return errorResponse(res, 400, 'payer_email es requerido', null, req);
        }

        if (!isValidEmail(payer_email)) {
            logSecure('warn', 'Invalid email format received');
            return errorResponse(res, 400, 'Email inválido', null, req);
        }

        // Sanitizar email (trim y lowercase)
        const sanitizedEmail = payer_email.trim().toLowerCase();

        // Validar plan_id si está presente (debe ser UUID)
        if (plan_id && !isValidUUID(plan_id)) {
            return errorResponse(res, 400, 'plan_id inválido', null, req);
        }

        // ============================================
        // VALIDACIONES DE NEGOCIO
        // ============================================

        // Validar que el gimnasio existe
        const { data: gym, error: gymError } = await supabase
            .from('gyms')
            .select('id, name, status')
            .eq('id', gym_id)
            .single();

        if (gymError || !gym) {
            logSecure('warn', 'Gym not found');
            return errorResponse(res, 404, 'Gimnasio no encontrado', null, req);
        }

        // Verificar si ya tiene una suscripción activa
        const { data: existingSubscription } = await supabase
            .from('subscriptions')
            .select('id, status, mp_preapproval_id')
            .eq('gym_id', gym_id)
            .in('status', ['active', 'pending'])
            .single();

        if (existingSubscription) {
            return errorResponse(res, 400, 'El gimnasio ya tiene una suscripción activa', {
                subscription_id: existingSubscription.id,
                status: existingSubscription.status
            }, req);
        }

        // ============================================
        // CREAR SUSCRIPCIÓN EN MERCADO PAGO
        // ============================================

        const subscriptionData = {
            // Razón de la suscripción (aparece en MP)
            reason: sanitizeString(SUBSCRIPTION_CONFIG.REASON, 100),

            // external_reference: Clave para identificar el gimnasio en webhooks
            external_reference: gym_id,

            // Configuración del pagador
            payer_email: sanitizedEmail,

            // Configuración de pago recurrente
            auto_recurring: {
                frequency: SUBSCRIPTION_CONFIG.FREQUENCY,
                frequency_type: SUBSCRIPTION_CONFIG.FREQUENCY_TYPE,
                transaction_amount: SUBSCRIPTION_CONFIG.PRICE,
                currency_id: SUBSCRIPTION_CONFIG.CURRENCY
            },

            // URL de retorno después del pago
            back_url: `${SUBSCRIPTION_CONFIG.BACK_URL}/payment-callback.html`
        };

        logSecure('info', 'Creating MP subscription', { gym_id });

        const mpSubscription = await preApproval.create({ body: subscriptionData });

        logSecure('info', 'MP subscription created', {
            hasInitPoint: !!mpSubscription.init_point,
            status: mpSubscription.status
        });

        // ============================================
        // GUARDAR EN BASE DE DATOS
        // ============================================

        const subscriptionRecord = {
            gym_id: gym_id,
            plan_id: plan_id || null,
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
            // No falla la respuesta, el webhook corregirá esto
        }

        // Actualizar plan_id del gimnasio si se proporcionó
        if (plan_id) {
            await supabase
                .from('gyms')
                .update({ plan_id: plan_id })
                .eq('id', gym_id);
        }

        // ============================================
        // RESPUESTA EXITOSA
        // ============================================

        return jsonResponse(res, 200, {
            success: true,
            data: {
                subscription_id: savedSubscription?.id || null,
                mp_preapproval_id: mpSubscription.id,
                init_point: mpSubscription.init_point, // URL para redirigir al usuario
                sandbox_init_point: mpSubscription.sandbox_init_point, // URL sandbox
                status: mpSubscription.status
            }
        }, req);

    } catch (error) {
        logSecure('error', 'Create subscription error');

        return errorResponse(res, 500, 'Error al crear suscripción', null, req);
    }
};
