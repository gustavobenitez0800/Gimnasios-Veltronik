// ============================================
// VELTRONIK - RATE LIMITER (Vercel API)
// ============================================
// Evita ataques de fuerza bruta y spam de peticiones
// ============================================

const requestCounts = new Map();

/**
 * Aplica Rate Limiting basado en la IP del cliente.
 * Vercel Serverless mantiene memoria en frío (warm cache) 
 * por lo que este Map sobrevive entre peticiones rápidas.
 * 
 * @param {import('@vercel/node').VercelRequest} req 
 * @param {number} limit Máximo de peticiones permitidas
 * @param {number} windowMs Ventana de tiempo en milisegundos
 * @returns {boolean} True si está bloqueado, False si está permitido
 */
function isRateLimited(req, limit = 5, windowMs = 60000) {
  // Obtener IP del cliente (Vercel pasa esto en los headers)
  const ip = req.headers['x-forwarded-for'] || 
             req.headers['x-real-ip'] || 
             req.connection?.remoteAddress || 
             'unknown-ip';

  const now = Date.now();
  const userRecord = requestCounts.get(ip);

  if (!userRecord) {
    // Primera petición
    requestCounts.set(ip, { count: 1, resetTime: now + windowMs });
    return false;
  }

  // Si ya pasó la ventana de tiempo, resetear
  if (now > userRecord.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + windowMs });
    return false;
  }

  // Incrementar contador
  userRecord.count++;

  // Si supera el límite, bloquear
  if (userRecord.count > limit) {
    console.warn(`[Rate Limit] Bloqueada IP: ${ip}. Demasiadas peticiones.`);
    return true;
  }

  return false;
}

module.exports = {
  isRateLimited
};
