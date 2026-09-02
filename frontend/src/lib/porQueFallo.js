// ============================================
// VELTRONIK - Por qué no se pudo consultar
// ============================================
// Cuando una pantalla no puede traer sus datos, decir "hubo un error" no sirve para nada:
// ni la recepcionista sabe qué hacer, ni nosotros sabemos qué arreglar. Lo que pasó está
// en el objeto del error; lo único que falta es traducirlo a una frase que alguien pueda
// leerme por teléfono.
//
// Vive aparte de las pantallas para poder probarlo sin montar nada.

/**
 * Traduce un error de red a algo que se pueda leer en voz alta.
 *
 * @returns {{texto: string, detalle: string}} `texto` para la pantalla, `detalle` corto
 *          para que quien atiende nos lo pueda dictar.
 */
export function porQueFallo(error) {
  if (!error) {
    // Sin error y sin datos: el pedido nunca terminó. Es el caso que dejaba el
    // "Cargando..." eterno, y el que más cuesta reconocer porque no deja rastro.
    return { texto: 'El servidor no contestó a tiempo.', detalle: 'sin respuesta' };
  }

  if (error.sinSesion) {
    return { texto: 'La sesión se cerró. Volvé a entrar.', detalle: 'sin sesión' };
  }

  if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')) {
    return { texto: 'El servidor tardó demasiado en contestar.', detalle: 'tiempo agotado' };
  }

  const status = error.response?.status;
  if (status === 401 || status === 403) {
    // No es un problema de red: el servidor contestó que no. En el escritorio suele ser
    // que la terminal perdió a qué sucursal pertenece.
    return { texto: 'El servidor no nos dejó consultar.', detalle: 'permiso ' + status };
  }
  if (status >= 500) {
    return { texto: 'El servidor tuvo un problema.', detalle: 'error ' + status };
  }
  if (status) {
    return { texto: 'El servidor rechazó la consulta.', detalle: 'respuesta ' + status };
  }

  // Sin `response` es que el pedido no llegó a destino: sin internet, DNS, o un antivirus
  // en el medio (ya pasó: por eso existe `resilientFetch` en el login).
  return { texto: 'No hay conexión con el servidor.', detalle: 'no llegó' };
}
