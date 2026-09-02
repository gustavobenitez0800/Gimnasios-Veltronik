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
export function porQueFallo(error, { esperando = false, demoraMs = null } = {}) {
  const cuanto = demoraMs == null ? '' : ` · ${(demoraMs / 1000).toFixed(1)} s`;

  if (!error) {
    // ⚠️ "Todavía está yendo" y "no volvió nunca" NO son lo mismo, y confundirlos manda a
    // buscar el problema donde no está.
    //
    // El techo del "cargando" son 12 segundos, pero un pedido puede tardar legítimamente
    // hasta 25 (5 s esperando la sesión + 20 s de timeout). O sea que a los 12 segundos
    // todavía no hay error PORQUE TODAVÍA NO FALLÓ. Decir ahí "no contestó" es apurar un
    // veredicto: si se espera, el error real aparece y dice qué pasó de verdad.
    if (esperando) {
      return { texto: 'Está tardando más de lo normal. Seguimos esperando.', detalle: 'en camino' + cuanto };
    }
    return { texto: 'El servidor no contestó.', detalle: 'sin respuesta' + cuanto };
  }

  if (error.sinSesion) {
    return { texto: 'La sesión se cerró. Volvé a entrar.', detalle: 'sin sesión' + cuanto };
  }

  if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')) {
    return { texto: 'El servidor tardó demasiado en contestar.', detalle: 'tiempo agotado' + cuanto };
  }

  const status = error.response?.status;
  if (status === 401 || status === 403) {
    // No es un problema de red: el servidor contestó que no. En el escritorio suele ser
    // que la terminal perdió a qué sucursal pertenece.
    return { texto: 'El servidor no nos dejó consultar.', detalle: 'permiso ' + status + cuanto };
  }
  if (status >= 500) {
    return { texto: 'El servidor tuvo un problema.', detalle: 'error ' + status + cuanto };
  }
  if (status) {
    return { texto: 'El servidor rechazó la consulta.', detalle: 'respuesta ' + status + cuanto };
  }

  // Sin `response` es que el pedido no llegó a destino: sin internet, DNS, o un antivirus
  // en el medio (ya pasó: por eso existe `resilientFetch` en el login).
  return { texto: 'No hay conexión con el servidor.', detalle: 'no llegó' + cuanto };
}
