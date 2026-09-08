// ============================================
// VELTRONIK - EL FORMULARIO DE UN SOCIO
// ============================================
// Vive afuera de la pantalla para poder probarlo sin montar el componente entero, y para
// que exista UN solo lugar donde se declara qué campos tiene la ficha.
//
// ⚠️ LO QUE NO ESTÁ ACÁ NO SE PUEDE EDITAR, Y PEOR: PUEDE BORRARSE SOLO.
//
// Guardar manda al backend lo que arme este módulo. Un campo que falte en `mapMemberToForm`
// pero exista en el formulario llega vacío y pisa lo que había. Ya pasó con el arancel:
// abrías un socio para corregirle el teléfono, guardabas, y le borrabas la cuota — sin
// aviso, sin error, y sin nada que lo delatara hasta el día que le cobraban y no se le
// aplicaba ni el período ni las clases.
//
// El test `formSocio.test.js` recorre CAMPOS_DEL_SOCIO y falla si alguno no sobrevive la
// vuelta completa (servidor → formulario). Antes de sumar un campo editable a la ficha,
// agregalo también a esa lista.

import { toLocalDateString } from '../lib/utils';

/** Los campos del formulario. Es la lista que el test vigila. */
export const CAMPOS_DEL_SOCIO = [
  'fullName', 'planId', 'dni', 'phone', 'email', 'birthDate',
  'membershipStart', 'membershipEnd', 'status', 'notes', 'attendanceDays',
];

/** Un socio nuevo: empieza hoy y SIN cobertura — la crea el cobro, no el alta. */
export function getInitialMemberForm() {
  const hoy = toLocalDateString(new Date());
  return {
    fullName: '',
    planId: '',
    dni: '',
    phone: '',
    email: '',
    birthDate: '',
    membershipStart: hoy,

    // ⭐⭐ EL ALTA NO REGALA UN MES. VACÍO A PROPÓSITO (ADR-013).
    //
    // Acá decía `addOneMonth(hoy)`, y eso significaba que **dar de alta a un socio le daba un
    // mes de cobertura sin que hubiera pagado nada**. En producción, cada alta nueva regalaba
    // un mes, en silencio.
    //
    // Y contradecía de frente la regla del negocio: "lo que hace que el alumno venza es el mes
    // que paga". Si el alta ya le da un mes, la cobertura no la está creando el pago.
    //
    // Así se descubrió: se dio de alta a un socio y se le cobró UNA vez, y quedó con 62 días.
    // El dueño lo leyó como "le cobró dos veces". Eran 31 regalados por el alta más 31
    // pagados — el cobro estaba bien, el alta no.
    //
    // El socio nuevo queda SIN FECHA hasta que se le cobre, que en el mostrador son diez
    // segundos: se lo da de alta y se le cobra en el mismo acto. El campo sigue estando en
    // "Más datos" para cargar una fecha a mano cuando haga falta —un socio que ya venía
    // pagado, una corrección—, pero deja de venir con un mes puesto.
    membershipEnd: '',
    status: 'active',
    notes: '',
    attendanceDays: [],
  };
}

/** Del socio que vino del servidor a los campos del formulario. */
export function mapMemberToForm(m) {
  return {
    fullName: m.fullName || '',
    // Cadena vacía y no `undefined`: un <select> con undefined pasa a no controlado y React
    // se queja, y al guardar viaja distinto que "".
    planId: m.planId || '',
    dni: m.dni || '',
    phone: m.phone || '',
    email: m.email || '',
    birthDate: m.birthDate || '',
    membershipStart: m.membershipStart || '',
    membershipEnd: m.membershipEnd || '',
    status: m.status || 'active',
    notes: m.notes || '',
    attendanceDays: m.attendanceDays || [],
  };
}

/**
 * El arancel de un socio, resuelto contra la lista de aranceles del gimnasio.
 *
 * <p>Devuelve también el caso incómodo: el socio tiene un arancel que el dueño dio de baja.
 * Ese socio sigue pagando algo que ya no se vende, y si no se dice en ninguna parte, se
 * entera el día que le cobran y el monto no es el que esperaba.</p>
 *
 * @returns {{arancel: object|null, dadoDeBaja: boolean}}
 */
export function arancelDelSocio(socio, aranceles) {
  if (!socio?.planId) return { arancel: null, dadoDeBaja: false };
  const encontrado = (aranceles || []).find((a) => a.id === socio.planId) || null;
  return {
    arancel: encontrado,
    // No está entre los vigentes pero el socio lo tiene: es uno que se dio de baja.
    dadoDeBaja: encontrado ? encontrado.isActive === false : true,
  };
}
