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
    corsResponse
} = require('./mercadopago');

module.exports = async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return corsResponse(res).status(200).end();
    }

    // Solo POST permitido
    if (req.method !== 'POST') {
        return errorResponse(res, 405, 'Method not allowed');
    }

    try {
        const { gym_id, payer_email, plan_id } = req.body;

        // ============================================
        // VALIDACIONES
        // ============================================

        if (!gym_id) {
            return errorResponse(res, 400, 'gym_id es requerido');
        }

        if (!payer_email) {
            return errorResponse(res, 400, 'payer_email es requerido');
        }

        // Validar que el gimnasio existe
        const { data: gym, error: gymError } = await supabase
            .from('gyms')
            .select('id, name, status')
            .eq('id', gym_id)
            .single();

        if (gymError || !gym) {
            return errorResponse(res, 404, 'Gimnasio no encontrado');
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
            });
        }

        // ============================================
        // CREAR SUSCRIPCIÓN EN MERCADO PAGO
        // ============================================

        const subscriptionData = {
            // Razón de la suscripción (aparece en MP)
            reason: SUBSCRIPTION_CONFIG.REASON,

            // external_reference: Clave para identificar el gimnasio en webhooks
            external_reference: gym_id,

            // Configuración del pagador
            payer_email: payer_email,

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

        console.log('Creating MP subscription:', subscriptionData);

        const mpSubscription = await preApproval.create({ body: subscriptionData });

        console.log('MP Subscription created:', mpSubscription);

        // ============================================
        // GUARDAR EN BASE DE DATOS
        // ============================================

        const subscriptionRecord = {
            gym_id: gym_id,
            plan_id: plan_id || null,
            mp_preapproval_id: mpSubscription.id,
            mp_payer_email: payer_email,
            status: SUBSCRIPTION_STATUS.PENDING,
            created_at: new Date().toISOString()
        };

        const { data: savedSubscription, error: saveError } = await supabase
            .from('subscriptions')
            .insert(subscriptionRecord)
            .select()
            .single();

        if (saveError) {
            console.error('Error saving subscription:', saveError);
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
        });

    } catch (error) {
        console.error('Create subscription error:', error);

        return errorResponse(res, 500, 'Error al crear suscripción', {
            message: error.message,
            cause: error.cause?.message || null
        });
    }
};
