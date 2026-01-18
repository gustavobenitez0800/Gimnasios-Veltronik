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
 * IMPORTANTE:
 * - Este endpoint debe ser IDEMPOTENTE
 * - Usa external_reference para identificar el gym_id
 * - Actualiza gyms.status basado en el estado de la suscripción
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
        const { type, data, action } = req.body;

        console.log('=== WEBHOOK RECEIVED ===');
        console.log('Type:', type);
        console.log('Action:', action);
        console.log('Data:', JSON.stringify(data));

        // Validar payload
        if (!type || !data?.id) {
            console.log('Invalid payload, ignoring');
            return jsonResponse(res, 200, { received: true, processed: false });
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
                console.log('Unhandled event type:', type);
        }

        // Siempre responder 200 para que MP no reintente
        return jsonResponse(res, 200, { received: true, processed: true });

    } catch (error) {
        console.error('Webhook error:', error);
        // Aún así responder 200 para evitar reintentos infinitos
        return jsonResponse(res, 200, { received: true, processed: false, error: error.message });
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
    console.log('Processing subscription event:', preapprovalId);

    // Obtener detalles de la suscripción desde MP
    const mpSub = await preApproval.get({ id: preapprovalId });

    console.log('MP Subscription details:', {
        id: mpSub.id,
        status: mpSub.status,
        external_reference: mpSub.external_reference,
        payer_email: mpSub.payer_email
    });

    const gymId = mpSub.external_reference;

    if (!gymId) {
        console.error('No gym_id in external_reference');
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
        console.error('Error updating subscription:', subError);
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
        console.error('Error updating gym status:', gymError);
    } else {
        console.log(`Gym ${gymId} status updated to: ${gymStatus}`);
    }
}

/**
 * Manejar pago de suscripción
 */
async function handleSubscriptionPayment(paymentId) {
    console.log('Processing subscription payment:', paymentId);

    // Obtener detalles del pago
    const mpPayment = await payment.get({ id: paymentId });

    console.log('MP Payment details:', {
        id: mpPayment.id,
        status: mpPayment.status,
        external_reference: mpPayment.external_reference,
        transaction_amount: mpPayment.transaction_amount
    });

    const gymId = mpPayment.external_reference;

    if (!gymId) {
        console.error('No gym_id in external_reference');
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
        console.log('Payment already processed, skipping');
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
        console.error('Error saving payment:', paymentError);
    } else {
        console.log('Payment saved successfully');
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
            console.error('Error updating subscription last payment:', subError);
        }

        // Activar gimnasio
        await supabase
            .from('gyms')
            .update({
                status: GYM_STATUS.ACTIVE,
                updated_at: new Date().toISOString()
            })
            .eq('id', gymId);

        console.log(`Gym ${gymId} activated after payment`);

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

        console.log(`Gym ${gymId} blocked due to payment rejection`);
    }
}

/**
 * Manejar pago individual (backup)
 */
async function handlePaymentEvent(paymentId) {
    // Reutilizar la misma lógica
    await handleSubscriptionPayment(paymentId);
}
