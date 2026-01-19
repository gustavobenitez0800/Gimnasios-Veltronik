/**
 * ============================================
 * VELTRONIK - MERCADO PAGO WEBHOOK
 * ============================================
 * 
 * POST /api/webhook-mercadopago
 * 
 * Procesa eventos de Mercado Pago:
 * - subscription_preapproval: Cambios en suscripciones
 * - subscription_authorized_payment: Pagos de suscripción
 * - payment: Pagos individuales
 * 
 * SECURITY HARDENED VERSION:
 * - Validación de firma HMAC-SHA256
 * - Logs seguros (sin datos sensibles)
 * - Respuestas sanitizadas
 */

const {
    preApproval,
    payment,
    supabase,
    GYM_STATUS,
    SUBSCRIPTION_STATUS,
    MP_STATUS_MAP,
    MP_PAYMENT_STATUS_MAP,
    jsonResponse,
    errorResponse,
    corsResponse,
    validateWebhookSignature,
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

    // ============================================
    // SECURITY: VALIDAR FIRMA DEL WEBHOOK
    // ============================================

    if (!validateWebhookSignature(req)) {
        logSecure('warn', 'Webhook signature validation failed');
        return errorResponse(res, 401, 'Unauthorized - Invalid signature', null, req);
    }

    try {
        const { type, data, action } = req.body;

        logSecure('info', 'Webhook received', { type, action });

        // Validar payload
        if (!type || !data?.id) {
            logSecure('info', 'Invalid payload, ignoring');
            return jsonResponse(res, 200, { received: true, processed: false }, req);
        }

        // Procesar según tipo de evento
        switch (type) {
            case 'subscription_preapproval':
                await handleSubscriptionEvent(data.id);
                break;

            case 'subscription_authorized_payment':
                await handleSubscriptionPayment(data.id);
                break;

            case 'payment':
                await handlePaymentEvent(data.id);
                break;

            default:
                logSecure('info', 'Unhandled event type');
        }

        // Siempre responder 200 para que MP no reintente
        return jsonResponse(res, 200, { received: true, processed: true }, req);

    } catch (error) {
        logSecure('error', 'Webhook processing error');
        // Aún así responder 200 para evitar reintentos infinitos
        return jsonResponse(res, 200, { received: true, processed: false }, req);
    }
};

// ============================================
// HANDLERS DE EVENTOS
// ============================================

/**
 * Manejar evento de suscripción (preapproval)
 * Estados MP: pending, authorized, paused, cancelled
 */
async function handleSubscriptionEvent(preapprovalId) {
    logSecure('info', 'Processing subscription event');

    // Obtener detalles de la suscripción desde MP
    const mpSub = await preApproval.get({ id: preapprovalId });

    logSecure('info', 'MP subscription retrieved', {
        status: mpSub.status,
        hasExternalRef: !!mpSub.external_reference
    });

    const gymId = mpSub.external_reference;

    // Validar que gym_id sea un UUID válido
    if (!gymId || !isValidUUID(gymId)) {
        logSecure('error', 'Invalid gym_id in external_reference');
        return;
    }

    // Mapear estado MP a nuestro sistema
    const internalStatus = MP_STATUS_MAP[mpSub.status] || SUBSCRIPTION_STATUS.PENDING;

    // ============================================
    // ACTUALIZAR SUSCRIPCIÓN EN BD
    // ============================================

    const subscriptionUpdate = {
        mp_preapproval_id: preapprovalId.toString(),
        mp_payer_id: mpSub.payer_id?.toString() || null,
        mp_payer_email: mpSub.payer_email || null,
        status: internalStatus,
        next_payment_date: mpSub.next_payment_date || null,
        updated_at: new Date().toISOString()
    };

    // Upsert: actualizar si existe, crear si no
    const { error: subError } = await supabase
        .from('subscriptions')
        .upsert(
            { gym_id: gymId, ...subscriptionUpdate },
            { onConflict: 'gym_id' }
        );

    if (subError) {
        logSecure('error', 'Error updating subscription');
    }

    // ============================================
    // ACTUALIZAR ESTADO DEL GIMNASIO
    // ============================================

    let gymStatus;

    if (mpSub.status === 'authorized') {
        gymStatus = GYM_STATUS.ACTIVE;
    } else if (mpSub.status === 'paused' || mpSub.status === 'cancelled') {
        gymStatus = GYM_STATUS.BLOCKED;
    } else {
        gymStatus = GYM_STATUS.PENDING;
    }

    const { error: gymError } = await supabase
        .from('gyms')
        .update({
            status: gymStatus,
            updated_at: new Date().toISOString()
        })
        .eq('id', gymId);

    if (gymError) {
        logSecure('error', 'Error updating gym status');
    } else {
        logSecure('info', 'Gym status updated', { status: gymStatus });
    }
}

/**
 * Manejar pago de suscripción
 */
async function handleSubscriptionPayment(paymentId) {
    logSecure('info', 'Processing subscription payment');

    // Obtener detalles del pago
    const mpPayment = await payment.get({ id: paymentId });

    logSecure('info', 'MP payment retrieved', {
        status: mpPayment.status,
        hasExternalRef: !!mpPayment.external_reference
    });

    const gymId = mpPayment.external_reference;

    // Validar que gym_id sea un UUID válido
    if (!gymId || !isValidUUID(gymId)) {
        logSecure('error', 'Invalid gym_id in external_reference');
        return;
    }

    // ============================================
    // IDEMPOTENCIA: Verificar si el pago ya existe
    // ============================================

    const { data: existingPayment } = await supabase
        .from('subscription_payments')
        .select('id')
        .eq('mp_payment_id', paymentId.toString())
        .single();

    if (existingPayment) {
        logSecure('info', 'Payment already processed, skipping');
        return;
    }

    // ============================================
    // GUARDAR PAGO
    // ============================================

    const paymentRecord = {
        gym_id: gymId,
        mp_payment_id: paymentId.toString(),
        amount: mpPayment.transaction_amount,
        currency: mpPayment.currency_id || 'ARS',
        status: MP_PAYMENT_STATUS_MAP[mpPayment.status] || 'pending',
        payment_date: mpPayment.date_approved || new Date().toISOString(),
        created_at: new Date().toISOString()
    };

    const { error: paymentError } = await supabase
        .from('subscription_payments')
        .insert(paymentRecord);

    if (paymentError) {
        logSecure('error', 'Error saving payment');
    } else {
        logSecure('info', 'Payment saved successfully');
    }

    // ============================================
    // ACTUALIZAR SUSCRIPCIÓN CON ÚLTIMO PAGO
    // ============================================

    if (mpPayment.status === 'approved') {
        const { error: subError } = await supabase
            .from('subscriptions')
            .update({
                last_payment_date: mpPayment.date_approved,
                status: SUBSCRIPTION_STATUS.ACTIVE,
                updated_at: new Date().toISOString()
            })
            .eq('gym_id', gymId);

        if (subError) {
            logSecure('error', 'Error updating subscription last payment');
        }

        // Activar gimnasio
        await supabase
            .from('gyms')
            .update({
                status: GYM_STATUS.ACTIVE,
                updated_at: new Date().toISOString()
            })
            .eq('id', gymId);

        logSecure('info', 'Gym activated after payment');

    } else if (mpPayment.status === 'rejected') {
        // Pago rechazado → marcar como past_due
        await supabase
            .from('subscriptions')
            .update({
                status: SUBSCRIPTION_STATUS.PAST_DUE,
                updated_at: new Date().toISOString()
            })
            .eq('gym_id', gymId);

        // Bloquear gimnasio
        await supabase
            .from('gyms')
            .update({
                status: GYM_STATUS.BLOCKED,
                updated_at: new Date().toISOString()
            })
            .eq('id', gymId);

        logSecure('warn', 'Gym blocked due to payment rejection');
    }
}

/**
 * Manejar pago individual (backup)
 */
async function handlePaymentEvent(paymentId) {
    // Reutilizar la misma lógica
    await handleSubscriptionPayment(paymentId);
}
