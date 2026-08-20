// ============================================
// VELTRONIK — IDENTIDAD DEL PRODUCTO (fuente única)
// ============================================
// Veltronik es un sistema para GIMNASIOS. No es una plataforma multi-rubro con el
// gimnasio adentro: es el sistema del gimnasio.
//
// Este módulo reemplaza al viejo `lib/verticals.js`, que era un REGISTRO de rubros
// (gimnasio, club, pilates, academia, "otro"): cada pantalla preguntaba "¿de qué tipo
// es este negocio?" para decidir cómo llamar a un socio, qué ícono dibujar y qué
// paleta aplicar. Esa pregunta ya no existe —hay un solo rubro— y mantenerla viva
// costaba caro:
//   · el dueño tenía que elegir "tipo de negocio" en el alta para elegir la única
//     opción que había,
//   · media app decía "negocio" en vez de "gimnasio" porque el texto salía de una
//     tabla genérica,
//   · y quedaban cuatro paletas CSS y un guard de rutas manteniéndose para rubros
//     que se dieron de baja.
//
// Si algún día hay un segundo rubro, se vuelve a introducir el registro A PROPÓSITO,
// con su módulo detrás. Lo que no se hace es dejar la maquinaria encendida "por si
// acaso": eso fue exactamente lo que dejó pantallas a medio construir esperando
// clientes que nunca llegaron.

/** Cómo se llaman las cosas en un gimnasio. Único lugar donde se decide. */
export const GYM = Object.freeze({
  /** Nombre del rubro, para badges y títulos. */
  label: 'Gimnasio',
  /** Cómo se llama al cliente del gimnasio, en plural y en singular. */
  membersLabel: 'Socios',
  memberLabel: 'Socio',
  /** El local, en minúscula, para meterlo en una frase ("En el gimnasio"). */
  placeLabel: 'gimnasio',
  /** El local con mayúscula inicial, para arrancar una frase o un título. */
  placeLabelCap: 'Gimnasio',
});

// ─── Roles ───

export const ROLE_LABELS = {
  owner: 'Dueño', admin: 'Administrador', staff: 'Staff', reception: 'Recepción', member: 'Miembro',
};

/** Etiqueta legible del rol; cae al propio valor si llega uno inesperado. */
export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}
