// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests del formulario de un socio
// ============================================
// ⭐ EL BUG QUE ESTO IMPIDE: el mapeo que carga el formulario no incluía `planId`. Como
// guardar manda todos los campos del formulario, el que faltaba llegaba vacío y pisaba lo
// que había.
//
// En el mostrador se veía así: abrís un socio para corregirle el teléfono, guardás, y le
// BORRÁS el arancel. Sin aviso, sin error, sin nada que lo delate — hasta el día que le
// cobran y no se le aplica ni el período ni las clases.
//
// La regla: TODO campo editable de la ficha tiene que sobrevivir la vuelta completa
// (servidor → formulario). Lo que no sobrevive, se borra solo.

import { describe, it, expect } from 'vitest';
import {
  CAMPOS_DEL_SOCIO,
  getInitialMemberForm,
  mapMemberToForm,
  arancelDelSocio,
} from './formSocio';

/** Un socio como lo devuelve el servidor, con todos los campos con valor. */
const socio = {
  id: 'socio-1',
  fullName: 'PAULA UDAQUIOLA',
  planId: 'plan-pase-libre',
  dni: '45374169',
  phone: '3764000000',
  email: 'paula@mail.com',
  birthDate: '1998-04-12',
  membershipStart: '2026-09-01',
  membershipEnd: '2026-09-30',
  status: 'active',
  notes: 'Abono: Pase libre',
  attendanceDays: ['lun', 'mie'],
};

describe('el formulario no puede perder campos', () => {

  // ⭐ EL TEST DEL BUG
  it('el arancel sobrevive la vuelta al formulario', () => {
    // Sin esto, editar un socio le borra la cuota que paga.
    expect(mapMemberToForm(socio).planId).toBe('plan-pase-libre');
  });

  it('NINGÚN campo editable se pierde en el camino', () => {
    // Este es el guardián de verdad: si mañana alguien agrega un campo a la ficha y se
    // olvida del mapeo, ese campo se va a borrar solo cada vez que alguien guarde. Acá se
    // rompe antes de llegar al gimnasio.
    const form = mapMemberToForm(socio);
    for (const campo of CAMPOS_DEL_SOCIO) {
      expect(form, `"${campo}" no llega al formulario: guardar lo va a borrar`).toHaveProperty(campo);
    }
  });

  it('el formulario tiene exactamente los campos declarados, ni más ni menos', () => {
    // Un campo de más tampoco es inocente: viaja al backend en cada guardado.
    expect(Object.keys(mapMemberToForm(socio)).sort()).toEqual([...CAMPOS_DEL_SOCIO].sort());
  });

  it('un socio nuevo arranca con los mismos campos', () => {
    // Si el alta y la edición tuvieran formas distintas, un campo existiría solo en una de
    // las dos y se borraría al pasar por la otra.
    expect(Object.keys(getInitialMemberForm()).sort()).toEqual([...CAMPOS_DEL_SOCIO].sort());
  });

  it('un socio sin arancel llega como cadena vacía, no como undefined', () => {
    // `undefined` en un <select> lo vuelve no controlado y React se queja; y al guardar
    // viaja distinto que "".
    expect(mapMemberToForm({ fullName: 'X' }).planId).toBe('');
  });

  it('el alta sugiere un mes de membresía', () => {
    const f = getInitialMemberForm();
    expect(f.membershipStart).toBeTruthy();
    expect(f.membershipEnd > f.membershipStart).toBe(true);
  });
});

describe('el arancel de un socio', () => {

  const vigentes = [
    { id: 'p1', name: 'Mensual', price: 45000, isActive: true },
    { id: 'p2', name: 'Pase Libre', price: 60000, isActive: true },
  ];

  it('encuentra el arancel del socio', () => {
    expect(arancelDelSocio({ planId: 'p2' }, vigentes).arancel.name).toBe('Pase Libre');
  });

  it('un socio sin arancel no rompe nada', () => {
    expect(arancelDelSocio({ planId: null }, vigentes)).toEqual({ arancel: null, dadoDeBaja: false });
    expect(arancelDelSocio(null, vigentes).arancel).toBe(null);
  });

  // ⭐ EL CASO INCÓMODO
  it('avisa cuando el socio tiene un arancel que ya no se vende', () => {
    // El dueño dio de baja "Pase Libre" pero hay socios que lo tienen. Si no se dice en
    // ninguna parte, se enteran el día que les cobran y el monto no es el que esperaban.
    expect(arancelDelSocio({ planId: 'viejo' }, vigentes).dadoDeBaja).toBe(true);
  });

  it('un arancel marcado inactivo también cuenta como dado de baja', () => {
    const conBaja = [...vigentes, { id: 'p3', name: 'Trimestral', isActive: false }];
    expect(arancelDelSocio({ planId: 'p3' }, conBaja).dadoDeBaja).toBe(true);
  });

  it('sin lista de aranceles no explota', () => {
    // Pasa mientras cargan, y en un gimnasio que todavía no configuró ninguno.
    expect(arancelDelSocio({ planId: 'p1' }, undefined).arancel).toBe(null);
  });
});
