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

    // Rate Limiting (Máx 100 por minuto para webhooks de MP)
    const { isRateLimited } = require('./_rateLimit.js');
    if (isRateLimited(req, 100, 60000)) {
        logSecure('warn', 'Webhook Rate Limited', { ip: req.headers['x-forwarded-for'] });
        return res.status(429).send('Rate Limited');
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

    } catch (err) {
        logSecure('error', 'Webhook processing error', { message: err?.message || 'unknown' });
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

    // Si se autoriza, limpiar gracia y reiniciar retry
    if (mpSub.status === 'authorized') {
        subscriptionUpdate.grace_period_ends_at = null;
        subscriptionUpdate.retry_count = 0;
        // Actualizar período actual con next_payment_date de MP
        if (mpSub.next_payment_date) {
            subscriptionUpdate.current_period_end = mpSub.next_payment_date;
        }
    }

    // UPDATE existing subscription, or INSERT if none exists
    // (upsert with onConflict: 'gym_id' fails silently if no UNIQUE constraint)
    const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('id, status')
        .eq('gym_id', gymId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (existingSub) {
        // PREVENT OVERWRITING ACTIVE WITH PENDING
        // If user is generating a new payment link, it creates a 'pending' subscription.
        // We shouldn't downgrade their active access until they actually pay the new one.
        if (
            (existingSub.status === SUBSCRIPTION_STATUS.ACTIVE || existingSub.status === SUBSCRIPTION_STATUS.PAST_DUE) &&
            internalStatus === SUBSCRIPTION_STATUS.PENDING
        ) {
            logSecure('info', 'Ignoring pending webhook because current subscription is already active/past_due', { gymId });
            return;
        }

        // Update existing subscription
        const { error: subError } = await supabase
            .from('subscriptions')
            .update(subscriptionUpdate)
            .eq('id', existingSub.id);

        if (subError) {
            logSecure('error', 'Error updating subscription');
        } else {
            logSecure('info', 'Subscription updated successfully');
        }
    } else {
        // No subscription found — create new one
        const { error: subError } = await supabase
            .from('subscriptions')
            .insert({ gym_id: gymId, ...subscriptionUpdate });

        if (subError) {
            logSecure('error', 'Error inserting new subscription');
        } else {
            logSecure('info', 'New subscription created from webhook');
        }
    }

    // ============================================
    // ACTUALIZAR ESTADO DEL GIMNASIO
    // ============================================

    let gymStatus;

    if (mpSub.status === 'authorized') {
        // Suscripción autorizada → gym activo
        gymStatus = GYM_STATUS.ACTIVE;
    } else if (mpSub.status === 'cancelled') {
        // Cancelación voluntaria → bloquear
        gymStatus = GYM_STATUS.BLOCKED;
    } else if (mpSub.status === 'paused') {
        // Pausada por MP (problemas de pago) → iniciar gracia de 7 días
        // No bloquear inmediatamente, el cron lo hará si la gracia expira
        const gracePeriodEnd = new Date();
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);

        await supabase
            .from('subscriptions')
            .update({
                status: SUBSCRIPTION_STATUS.PAST_DUE,
                grace_period_ends_at: gracePeriodEnd.toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('gym_id', gymId);

        // Mantener gym activo durante la gracia
        gymStatus = GYM_STATUS.ACTIVE;
        logSecure('info', 'Grace period started (7 days)', { gymId });
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
        statusDetail: mpPayment.status_detail,
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
        .select('id, status')
        .eq('mp_payment_id', paymentId.toString())
        .maybeSingle();

    // If payment exists with same status, skip entirely
    const newStatus = MP_PAYMENT_STATUS_MAP[mpPayment.status] || 'pending';
    if (existingPayment && existingPayment.status === newStatus) {
        logSecure('info', 'Payment already processed with same status, skipping');
        return;
    }

    // If payment exists but status changed (e.g. approved → refunded), update it
    if (existingPayment) {
        await supabase
            .from('subscription_payments')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', existingPayment.id);
        logSecure('info', 'Payment status updated', { from: existingPayment.status, to: newStatus });
    } else {
        // ============================================
        // GUARDAR PAGO NUEVO
        // ============================================
        const paymentRecord = {
            gym_id: gymId,
            mp_payment_id: paymentId.toString(),
            amount: mpPayment.transaction_amount,
            currency: mpPayment.currency_id || 'ARS',
            status: newStatus,
            payment_date: mpPayment.date_approved || new Date().toISOString(),
            created_at: new Date().toISOString()
        };

        const { error: paymentError } = await supabase
            .from('subscription_payments')
            .insert(paymentRecord);

        if (paymentError) {
            logSecure('error', 'Error saving payment', { code: paymentError.code });
        } else {
            logSecure('info', 'Payment saved successfully');
        }
    }

    // ============================================
    // HANDLE: CHARGEBACK / REFUND → Block immediately
    // ============================================

    if (mpPayment.status === 'refunded' || mpPayment.status === 'charged_back' || mpPayment.status === 'chargedback') {
        logSecure('warn', 'CHARGEBACK/REFUND detected — blocking gym', { gymId, status: mpPayment.status });

        // Cancel subscription
        const { data: currentSub } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('gym_id', gymId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (currentSub?.id) {
            await supabase
                .from('subscriptions')
                .update({
                    status: SUBSCRIPTION_STATUS.CANCELED,
                    updated_at: new Date().toISOString()
                })
                .eq('id', currentSub.id);
        }

        // Block the gym
        await supabase
            .from('gyms')
            .update({
                status: GYM_STATUS.BLOCKED,
                updated_at: new Date().toISOString()
            })
            .eq('id', gymId);

        logSecure('warn', 'Gym BLOCKED due to chargeback/refund', { gymId });
        return;
    }

    // ============================================
    // HANDLE: APPROVED → Activate
    // ============================================

    if (mpPayment.status === 'approved') {
        const paymentDate = mpPayment.date_approved ? new Date(mpPayment.date_approved) : new Date();

        let nextPeriodEnd = new Date(paymentDate);
        nextPeriodEnd.setDate(nextPeriodEnd.getDate() + 30);

        const { data: currentSub } = await supabase
            .from('subscriptions')
            .select('id, mp_preapproval_id')
            .eq('gym_id', gymId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (currentSub?.mp_preapproval_id) {
            try {
                const mpSub = await preApproval.get({ id: currentSub.mp_preapproval_id });
                if (mpSub.next_payment_date) {
                    nextPeriodEnd = new Date(mpSub.next_payment_date);
                    logSecure('info', 'Got real next_payment_date from MP preapproval');
                }
            } catch {
                logSecure('warn', 'Could not fetch preapproval for next_payment_date, using fallback +30 days');
            }
        }

        const subscriptionUpdate = {
            last_payment_date: mpPayment.date_approved || paymentDate.toISOString(),
            current_period_start: paymentDate.toISOString(),
            current_period_end: nextPeriodEnd.toISOString(),
            next_payment_date: nextPeriodEnd.toISOString(),
            status: SUBSCRIPTION_STATUS.ACTIVE,
            grace_period_ends_at: null,
            retry_count: 0,
            updated_at: new Date().toISOString()
        };

        if (currentSub?.id) {
            await supabase.from('subscriptions').update(subscriptionUpdate).eq('id', currentSub.id);
        } else {
            await supabase.from('subscriptions').update(subscriptionUpdate).eq('gym_id', gymId);
        }

        // ============================================
        // CLEANUP: Cancel old subscriptions to prevent double-billing
        // ============================================
        const { data: oldSubs } = await supabase
            .from('subscriptions')
            .select('id, mp_preapproval_id')
            .eq('gym_id', gymId)
            .neq('id', currentSub?.id || '00000000-0000-0000-0000-000000000000')
            .in('status', [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PAST_DUE]);

        for (const oldSub of (oldSubs || [])) {
            if (oldSub.mp_preapproval_id) {
                try {
                    await preApproval.update({ id: oldSub.mp_preapproval_id, body: { status: 'cancelled' } });
                    logSecure('info', 'Old MP subscription cancelled to avoid double billing', { oldId: oldSub.mp_preapproval_id });
                } catch {
                    // Ignore, might already be cancelled
                }
            }
            await supabase.from('subscriptions').update({
                status: SUBSCRIPTION_STATUS.CANCELED,
                updated_at: new Date().toISOString()
            }).eq('id', oldSub.id);
        }

        await supabase
            .from('gyms')
            .update({ status: GYM_STATUS.ACTIVE, updated_at: new Date().toISOString() })
            .eq('id', gymId);

        logSecure('info', 'Gym activated after payment', { nextPeriodEnd: nextPeriodEnd.toISOString() });

    } else if (mpPayment.status === 'rejected') {
        // ============================================
        // HANDLE: REJECTED → Grace period / Block
        // ============================================
        const { data: currentSub } = await supabase
            .from('subscriptions')
            .select('id, grace_period_ends_at, retry_count')
            .eq('gym_id', gymId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const retryCount = (currentSub?.retry_count || 0) + 1;
        const now = new Date();
        const graceExpired = currentSub?.grace_period_ends_at && new Date(currentSub.grace_period_ends_at) < now;
        const tooManyRetries = retryCount >= 4;

        if (graceExpired || tooManyRetries) {
            logSecure('warn', 'Blocking gym - grace expired or max retries', { retryCount, graceExpired });

            if (currentSub?.id) {
                await supabase.from('subscriptions')
                    .update({ status: SUBSCRIPTION_STATUS.PAST_DUE, retry_count: retryCount, updated_at: now.toISOString() })
                    .eq('id', currentSub.id);
            }

            await supabase.from('gyms')
                .update({ status: GYM_STATUS.BLOCKED, updated_at: now.toISOString() })
                .eq('id', gymId);

            logSecure('warn', 'Gym blocked after grace expiry / max retries', { gymId });
        } else {
            const updateData = {
                status: SUBSCRIPTION_STATUS.PAST_DUE,
                retry_count: retryCount,
                updated_at: now.toISOString()
            };

            if (!currentSub?.grace_period_ends_at) {
                const gracePeriodEnd = new Date(now);
                gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);
                updateData.grace_period_ends_at = gracePeriodEnd.toISOString();
                logSecure('info', 'Grace period started (7 days) after rejected payment');
            }

            if (currentSub?.id) {
                await supabase.from('subscriptions').update(updateData).eq('id', currentSub.id);
            } else {
                await supabase.from('subscriptions').update(updateData).eq('gym_id', gymId);
            }

            logSecure('warn', 'Payment rejected - grace period active', { retryCount });
        }
    }
    // Other statuses (pending, in_process, cancelled) — payment is saved, no action needed
}

/**
 * Manejar pago individual (backup)
 * Also handles chargebacks that come as 'payment' type events
 */
async function handlePaymentEvent(paymentId) {
    await handleSubscriptionPayment(paymentId);
}
