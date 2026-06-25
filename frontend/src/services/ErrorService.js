// ============================================
// VELTRONIK - ERROR SERVICE
// ============================================
// Mapeo centralizado de errores de Supabase
// a mensajes amigables en español.
// ============================================

import { CONNECTIVITY } from '../lib/connectivity';

// Mensajes por resultado del diagnóstico de conectividad. Centralizados acá para que
// haya UNA sola fuente de verdad del texto que ve el usuario ante un fallo de red.
const CONNECTIVITY_MESSAGES = {
  [CONNECTIVITY.ONLINE]: 'Hubo un problema momentáneo de conexión. Intentá nuevamente.',
  [CONNECTIVITY.OFFLINE]: 'Sin conexión a internet. Revisá tu red (WiFi o cable) e intentá de nuevo.',
  [CONNECTIVITY.AUTH_UNREACHABLE]:
    'No pudimos conectar con el servidor de acceso. Suele estar bloqueado por el antivirus o el firewall (escaneo HTTPS/SSL). Probá desactivar ese escaneo, agregar una excepción para Veltronik, o conectarte a otra red.',
  [CONNECTIVITY.BACKEND_UNREACHABLE]:
    'No pudimos conectar con el servidor de Veltronik. Puede ser un bloqueo de red/antivirus o una caída temporal del servicio. Reintentá en unos minutos.',
};

class ErrorService {
  constructor() {
    this.errorMap = [
      {
        match: (msg) => msg.includes('Failed to fetch') || msg.includes('NetworkError'),
        message: 'Error de conexión. Verifica tu conexión a internet e intenta nuevamente.',
      },
      {
        match: (msg) => msg.includes('timeout') || msg.includes('Timeout'),
        message: 'La solicitud tardó demasiado. Intenta nuevamente.',
      },
      {
        match: (msg) => msg.includes('Invalid login credentials'),
        message: 'Email o contraseña incorrectos',
      },
      {
        match: (msg) => msg.includes('User already registered'),
        message: 'Este email ya está registrado',
      },
      {
        match: (msg) => msg.includes('JWT expired'),
        message: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
      },
      {
        match: (msg) => msg.includes('Cannot coerce') || msg.includes('PGRST116') || msg.includes('JSON object'),
        message: 'Error de datos: el registro no fue encontrado o ya fue modificado. Recargá la página.',
      },
      {
        match: (msg) => msg.includes('duplicate key') || msg.includes('unique constraint'),
        message: (msg) =>
          msg.includes('dni')
            ? 'Ya existe un socio con este DNI en tu negocio.'
            : 'Este registro ya existe.',
      },
      {
        match: (msg) => msg.includes('violates row-level security'),
        message: 'No tienes permiso para realizar esta acción.',
      },
      {
        match: (msg) => msg.includes('foreign key constraint'),
        message: 'No se puede eliminar porque hay registros relacionados.',
      },
      {
        match: (msg) => msg.includes('not found') || msg.includes('No rows'),
        message: 'El registro no fue encontrado.',
      },
    ];
  }

  /**
   * Convert a Supabase error to a user-friendly Spanish message.
   * @param {Error|object|string} error
   * @returns {string}
   */
  getMessage(error) {
    if (!error) return 'Error desconocido';

    // 1) Errores HTTP del backend (axios): priorizar el status y el mensaje real del
    //    GlobalExceptionHandler. ANTES, un 402/403/500 podía caer en "Error de conexión"
    //    genérico y confundir (ej: el dueño veía "revisá tu internet" cuando en realidad
    //    su pago estaba vencido).
    const status = error.response?.status;
    const backendMsg = error.response?.data?.message || error.response?.data?.error;
    if (status) {
      switch (status) {
        case 401: return 'Tu sesión expiró. Iniciá sesión nuevamente.';
        case 402: return backendMsg || 'Tu suscripción venció. Reactivala para seguir usando el sistema.';
        case 403: return backendMsg || 'No tenés permiso para realizar esta acción.';
        case 404: return backendMsg || 'No encontramos lo que buscás.';
        case 409: return backendMsg || 'El registro ya existe o está en conflicto.';
        case 422: return backendMsg || 'Los datos enviados no son válidos.';
        case 500:
        case 502:
        case 503:
          return backendMsg || 'El servidor tuvo un problema. Intentá de nuevo en unos minutos.';
        default:
          if (backendMsg) return backendMsg;
      }
    }

    // 2) Errores sin respuesta HTTP (Supabase, red real, etc.): mapeo por texto.
    const message = error.message || error.toString();
    for (const rule of this.errorMap) {
      if (rule.match(message)) {
        return typeof rule.message === 'function' ? rule.message(message) : rule.message;
      }
    }

    return message;
  }

  /**
   * ¿Es un fallo de TRANSPORTE (no llegó respuesta HTTP)? Cubre el fetch del navegador
   * ("Failed to fetch" / "NetworkError"), el "Network Error" de axios y el timeout que
   * normaliza nuestro resilientFetch. Clave: un error CON `error.response` es una
   * decisión del backend (4xx/5xx), NO un fallo de red.
   */
  isNetworkError(error) {
    if (!error || error.response) return false;
    const msg = (error.message || error.toString?.() || '').toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network error') ||
      msg.includes('timeout') ||
      error.code === 'ECONNABORTED' || // axios timeout
      error.code === 'ERR_NETWORK'
    );
  }

  /** Mensaje accionable según el resultado de diagnoseConnectivity(). */
  messageForDiagnosis(code) {
    return CONNECTIVITY_MESSAGES[code] || CONNECTIVITY_MESSAGES[CONNECTIVITY.ONLINE];
  }
}

export const errorService = new ErrorService();
