// ============================================
// VELTRONIK - ERROR SERVICE
// ============================================
// Mapeo centralizado de errores de Supabase
// a mensajes amigables en español.
// ============================================

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
}

export const errorService = new ErrorService();
