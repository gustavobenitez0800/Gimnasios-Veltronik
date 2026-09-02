// ============================================
// VELTRONIK - EL FORMULARIO DE UN SOCIO
// ============================================
// Vive afuera de la pantalla para poder probarlo sin montar el componente entero.
//
// ⚠️ LO QUE NO ESTÁ ACÁ SE BORRA AL GUARDAR.
//
// Este mapeo define el formulario completo, y guardar manda TODOS sus campos al backend.
// Un campo que falte llega vacío y pisa lo que había. Pasó con `planId`: abrir un socio
// para corregirle el teléfono y guardar le BORRABA el arancel — sin aviso, sin error, y
// sin nada que lo delatara hasta el día que le cobraran y no se le aplicara ni el período
// ni las clases.
//
// Antes de sumar un campo editable a la ficha, agregalo también acá.

import { toLocalDateString, addOneMonth } from '../lib/utils';

/** Los campos del formulario. Es la lista que el test vigila. */
export const CAMPOS_DEL_SOCIO = [
  'fullName', 'planId', 'planNombre', 'dni', 'phone', 'email', 'birthDate',
  'membershipStart', 'membershipEnd', 'status', 'notes', 'attendanceDays',
];

/** Un socio nuevo: hoy, con la membresía sugerida a un mes. */
export function getInitialMemberForm() {
  const hoy = toLocalDateString(new Date());
  return {
    fullName: '',
    planId: '',
    planNombre: '',
    dni: '',
    phone: '',
    email: '',
    birthDate: '',
    membershipStart: hoy,
    membershipEnd: addOneMonth(hoy),
    status: 'active',
    notes: '',
    attendanceDays: [],
  };
}

/** Del socio que vino del servidor a los campos del formulario. */
export function mapMemberToForm(m) {
  return {
    fullName: m.fullName || '',
    planId: m.planId || '',
    planNombre: m.planNombre || '',
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
