/**
 * ============================================
 * VELTRONIK - MERCADO PAGO CONFIGURATION
 * ============================================
 * 
 * Configuración centralizada del SDK de Mercado Pago
 * y cliente de Supabase para las API serverless.
 */

const { MercadoPagoConfig, PreApproval, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');

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
// FUNCIONES HELPER
// ============================================

/**
 * Respuesta CORS para preflight requests
 */
function corsResponse(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res;
}

/**
 * Respuesta JSON estandarizada
 */
function jsonResponse(res, statusCode, data) {
    corsResponse(res);
    res.status(statusCode).json(data);
}

/**
 * Error response
 */
function errorResponse(res, statusCode, message, details = null) {
    corsResponse(res);
    res.status(statusCode).json({
        success: false,
        error: message,
        details: details
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
    corsResponse,
    jsonResponse,
    errorResponse
};
