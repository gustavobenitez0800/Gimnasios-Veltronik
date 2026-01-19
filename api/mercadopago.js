/**
 * ============================================
 * VELTRONIK - MERCADO PAGO CONFIGURATION
 * ============================================
 * 
 * Configuración centralizada del SDK de Mercado Pago
 * y cliente de Supabase para las API serverless.
 * 
 * SECURITY HARDENED VERSION
 */

const { MercadoPagoConfig, PreApproval, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// ============================================
// ENVIRONMENT CHECK
// ============================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ============================================
// ALLOWED ORIGINS (CORS WHITELIST)
// ============================================

const ALLOWED_ORIGINS = [
    'https://gimnasio-veltronik.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];

// ============================================
// CONFIGURACIÓN DE MERCADO PAGO
// ============================================

const mpClient = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN,
    options: {
        timeout: 5000
    }
});

const preApproval = new PreApproval(mpClient);
const payment = new Payment(mpClient);

// ============================================
// CONFIGURACIÓN DE SUPABASE (SERVICE ROLE)
// ============================================

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

// ============================================
// CONFIGURACIÓN DE SUSCRIPCIÓN
// ============================================

const SUBSCRIPTION_CONFIG = {
    PRICE: 35000,
    CURRENCY: 'ARS',
    FREQUENCY: 1,
    FREQUENCY_TYPE: 'months',
    REASON: 'Veltronik - Gestión de Gimnasios (Mensual)',
    BACK_URL: process.env.FRONTEND_URL || 'https://gimnasio-veltronik.vercel.app'
};

// ============================================
// ESTADOS DEL SISTEMA
// ============================================

const GYM_STATUS = {
    ACTIVE: 'active',
    BLOCKED: 'blocked',
    PENDING: 'pending'
};

const SUBSCRIPTION_STATUS = {
    ACTIVE: 'active',
    PAST_DUE: 'past_due',
    CANCELED: 'canceled',
    PENDING: 'pending'
};

// Mapeo de estados MP → Sistema interno
const MP_STATUS_MAP = {
    'authorized': SUBSCRIPTION_STATUS.ACTIVE,
    'pending': SUBSCRIPTION_STATUS.PENDING,
    'paused': SUBSCRIPTION_STATUS.PAST_DUE,
    'cancelled': SUBSCRIPTION_STATUS.CANCELED
};

const MP_PAYMENT_STATUS_MAP = {
    'approved': 'approved',
    'pending': 'pending',
    'in_process': 'pending',
    'rejected': 'rejected',
    'cancelled': 'rejected',
    'refunded': 'refunded'
};

// ============================================
// SECURITY: WEBHOOK SIGNATURE VALIDATION
// ============================================

/**
 * Valida la firma del webhook de Mercado Pago
 * @param {object} req - Request object
 * @returns {boolean} - True si la firma es válida
 */
function validateWebhookSignature(req) {
    const secret = process.env.MP_WEBHOOK_SECRET;

    // Si no hay secreto configurado, rechazar en producción
    if (!secret) {
        if (IS_PRODUCTION) {
            logSecure('error', 'MP_WEBHOOK_SECRET not configured');
            return false;
        }
        // En desarrollo, permitir sin firma (con warning)
        logSecure('warn', 'Webhook signature validation skipped (dev mode)');
        return true;
    }

    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];

    if (!xSignature || !xRequestId) {
        logSecure('warn', 'Missing signature headers');
        return false;
    }

    // Parsear x-signature: "ts=timestamp,v1=hash"
    const signatureParts = {};
    xSignature.split(',').forEach(part => {
        const [key, value] = part.split('=');
        signatureParts[key] = value;
    });

    const timestamp = signatureParts.ts;
    const receivedHash = signatureParts.v1;

    if (!timestamp || !receivedHash) {
        logSecure('warn', 'Invalid signature format');
        return false;
    }

    // Construir el manifest para firmar
    // Formato: "id:[data.id];request-id:[x-request-id];ts:[timestamp];"
    const dataId = req.body?.data?.id || '';
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${timestamp};`;

    // Calcular HMAC-SHA256
    const expectedHash = crypto
        .createHmac('sha256', secret)
        .update(manifest)
        .digest('hex');

    // Comparación segura contra timing attacks
    try {
        return crypto.timingSafeEqual(
            Buffer.from(receivedHash, 'hex'),
            Buffer.from(expectedHash, 'hex')
        );
    } catch (e) {
        logSecure('warn', 'Signature comparison failed');
        return false;
    }
}

// ============================================
// SECURITY: SECURE LOGGING
// ============================================

/**
 * Log seguro que no expone datos sensibles en producción
 */
function logSecure(level, message, data = null) {
    // En producción, solo logear errores y warnings sin datos
    if (IS_PRODUCTION) {
        if (level === 'error' || level === 'warn') {
            console[level](`[VELTRONIK] ${message}`);
        }
        return;
    }

    // En desarrollo, logear todo pero sanitizado
    const sanitizedData = data ? sanitizeForLog(data) : null;
    if (sanitizedData) {
        console[level](`[VELTRONIK] ${message}`, sanitizedData);
    } else {
        console[level](`[VELTRONIK] ${message}`);
    }
}

/**
 * Sanitiza datos para logs (oculta información sensible)
 */
function sanitizeForLog(data) {
    if (!data || typeof data !== 'object') return data;

    const sanitized = { ...data };
    const sensitiveKeys = ['email', 'payer_email', 'access_token', 'password', 'dni', 'phone'];

    for (const key of sensitiveKeys) {
        if (sanitized[key]) {
            sanitized[key] = '***REDACTED***';
        }
    }

    return sanitized;
}

// ============================================
// SECURITY: INPUT VALIDATION
// ============================================

/**
 * Valida formato de email
 */
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email) && email.length <= 254;
}

/**
 * Valida formato UUID v4
 */
function isValidUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

/**
 * Sanitiza string para prevenir inyecciones
 */
function sanitizeString(str, maxLength = 255) {
    if (!str || typeof str !== 'string') return '';
    return str
        .slice(0, maxLength)
        .replace(/[<>'"`;\\]/g, '') // Remove dangerous characters
        .trim();
}

// ============================================
// FUNCIONES HELPER - CORS SEGURO
// ============================================

/**
 * Respuesta CORS segura (solo orígenes permitidos)
 */
function corsResponse(res, req = null) {
    const origin = req?.headers?.origin || '';

    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!IS_PRODUCTION) {
        // En desarrollo, permitir cualquier origen localhost
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
    }
    // Si no está permitido, simplemente no agregamos el header

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');

    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    return res;
}

/**
 * Respuesta JSON estandarizada
 */
function jsonResponse(res, statusCode, data, req = null) {
    corsResponse(res, req);
    res.status(statusCode).json(data);
}

/**
 * Error response
 */
function errorResponse(res, statusCode, message, details = null, req = null) {
    corsResponse(res, req);

    // En producción, no enviar detalles de errores internos
    const safeDetails = IS_PRODUCTION && statusCode >= 500 ? null : details;

    res.status(statusCode).json({
        success: false,
        error: message,
        details: safeDetails
    });
}

module.exports = {
    mpClient,
    preApproval,
    payment,
    supabase,
    SUBSCRIPTION_CONFIG,
    GYM_STATUS,
    SUBSCRIPTION_STATUS,
    MP_STATUS_MAP,
    MP_PAYMENT_STATUS_MAP,
    ALLOWED_ORIGINS,
    IS_PRODUCTION,
    // Security functions
    validateWebhookSignature,
    logSecure,
    sanitizeForLog,
    isValidEmail,
    isValidUUID,
    sanitizeString,
    // Response helpers
    corsResponse,
    jsonResponse,
    errorResponse
};
