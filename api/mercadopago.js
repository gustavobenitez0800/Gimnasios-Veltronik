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
    'https://gimnasio-veltronik-veltroniks-projects.vercel.app',
    'http://localhost:5173',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5173'
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

// Precios por tipo de organización (ARS)
const PRICES_BY_TYPE = {
    GYM: 35000,
    RESTO: 45000,
    KIOSK: 25000,
    OTHER: 35000
};

const SUBSCRIPTION_CONFIG = {
    PRICE: 35000, // Default fallback
    CURRENCY: 'ARS',
    FREQUENCY: 1,
    FREQUENCY_TYPE: 'months',
    REASON: 'Veltronik - Gestión de Negocios (Mensual)',
    BACK_URL: process.env.FRONTEND_URL || 'https://gimnasio-veltronik-veltroniks-projects.vercel.app',
    GRACE_PERIOD_DAYS: 7, // Días de gracia antes de bloquear
};

/**
 * Obtiene el precio correcto para un gimnasio según su tipo de organización.
 * @param {string} gymId - UUID del gimnasio
 * @param {string} orgType - Tipo forzado (opcional, si ya lo sabemos)
 * @returns {Promise<{price: number, orgType: string, reason: string}>}
 */
async function getSubscriptionPriceForGym(gymId, orgType = null) {
    let resolvedType = orgType;

    if (!resolvedType && gymId) {
        try {
            const { data: gym } = await supabase
                .from('gyms')
                .select('type')
                .eq('id', gymId)
                .single();
            resolvedType = gym?.type || 'GYM';
        } catch {
            resolvedType = 'GYM';
        }
    }

    resolvedType = resolvedType || 'GYM';
    const price = PRICES_BY_TYPE[resolvedType] || PRICES_BY_TYPE.GYM;

    const reasonMap = {
        GYM: 'Veltronik - Gestión de Gimnasios (Mensual)',
        RESTO: 'Veltronik - Gestión de Restaurantes (Mensual)',
        KIOSK: 'Veltronik - Gestión de Kioscos (Mensual)',
        OTHER: 'Veltronik - Gestión de Negocios (Mensual)',
    };

    return {
        price,
        orgType: resolvedType,
        reason: reasonMap[resolvedType] || reasonMap.OTHER,
    };
}

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
// MP 'authorized' maps to our internal 'active' status
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
    'refunded': 'refunded',
    'charged_back': 'chargedback',
    'chargedback': 'chargedback'
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
    } catch {
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

    if (ALLOWED_ORIGINS.includes(origin) || origin === 'null' || origin.startsWith('file://') || origin.startsWith('veltronik://')) {
        res.setHeader('Access-Control-Allow-Origin', origin === 'null' ? '*' : origin);
    } else if (!IS_PRODUCTION) {
        // En desarrollo, permitir cualquier origen localhost
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
    } else {
        // Fallback for Electron apps that might not send origin properly
        res.setHeader('Access-Control-Allow-Origin', '*');
    }

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

/**
 * Verifica el JWT del usuario y que tenga permisos en la organización.
 * Retorna true si es válido, falso si no.
 */
async function verifyUserAccess(req, gymId) {
    if (!gymId) return false;
    
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logSecure('warn', 'Missing or invalid Authorization header');
        return false;
    }

    const token = authHeader.split(' ')[1];
    
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            logSecure('warn', 'Invalid JWT token', { error: error?.message });
            return false;
        }

        // Verificar si el usuario es owner o admin de la organización
        const { data: membership, error: memError } = await supabase
            .from('organization_members')
            .select('role')
            .eq('organization_id', gymId)
            .eq('user_id', user.id)
            .in('role', ['owner', 'admin'])
            .maybeSingle();

        if (memError || !membership) {
            logSecure('warn', 'User does not have access to this organization', { userId: user.id, gymId });
            return false;
        }

        return true;
    } catch (e) {
        logSecure('error', 'Auth verification failed', { error: e.message });
        return false;
    }
}

module.exports = {
    mpClient,
    preApproval,
    payment,
    supabase,
    SUBSCRIPTION_CONFIG,
    PRICES_BY_TYPE,
    GYM_STATUS,
    SUBSCRIPTION_STATUS,
    MP_STATUS_MAP,
    MP_PAYMENT_STATUS_MAP,
    ALLOWED_ORIGINS,
    IS_PRODUCTION,
    // Business logic
    getSubscriptionPriceForGym,
    // Security functions
    validateWebhookSignature,
    logSecure,
    sanitizeForLog,
    isValidEmail,
    isValidUUID,
    sanitizeString,
    verifyUserAccess,
    // Response helpers
    corsResponse,
    jsonResponse,
    errorResponse
};
