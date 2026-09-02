// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Los aranceles en la pantalla de Socios
// ============================================
// La función de aranceles existía hace días y NUNCA funcionó: se podían crear, se podían
// elegir, y no pasaba nada. El motivo estaba repartido en dos mapeos que no incluían el
// campo, y desde la pantalla era invisible.
//
// Estos tests dibujan Socios de verdad y comprueban lo que el dueño ve y lo que se manda
// al servidor cuando toca algo.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

const ARANCELES = [
  { id: 'p1', name: 'Mensual', price: 45000, durationDays: 30, isActive: true },
  { id: 'p2', name: 'Pase Libre', price: 60000, durationDays: 30, isActive: true },
];

const SOCIOS = [
  { id: 's1', fullName: 'LURDES ROLLET', dni: '44646377', phone: '3764111111', status: 'active',
    membershipEnd: '2026-09-23', planId: 'p1', planNombre: 'Mensual', attendanceDays: [] },
  { id: 's2', fullName: 'CAROLINA ARRUA', dni: '28889932', phone: '', status: 'active',
    membershipEnd: '2026-10-12', planId: '', planNombre: '', attendanceDays: [] },
  { id: 's3', fullName: 'joaquin bonutti', dni: '39112233', phone: '', status: 'active',
    membershipEnd: '2026-08-25', planId: 'dado-de-baja', planNombre: 'Trimestral', attendanceDays: [] },
];

const saveMember = vi.fn().mockResolvedValue({});
let arancelesDelGimnasio = ARANCELES;

const toastEstable = { showToast: vi.fn() };
const authEstable = { orgRole: 'owner', profile: { fullName: 'Gustavo' } };

vi.mock('../contexts/ToastContext', () => ({ useToast: () => toastEstable }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authEstable }));
vi.mock('../services', () => ({
  paymentService: { createPayment: vi.fn().mockResolvedValue({}), getPaymentsByMember: vi.fn().mockResolvedValue([]) },
  errorService: { getMessage: (e) => String(e?.message || e) },
}));
vi.mock('../services/MemberService', () => ({
  memberService: { getMemberById: vi.fn().mockResolvedValue({ membershipEnd: '2026-10-23T23:59:59' }) },
}));
vi.mock('../services/PlanService', () => ({
  planService: { getVigentes: () => Promise.resolve(arancelesDelGimnasio) },
}));
vi.mock('../controllers/useMemberController', () => ({
  useMemberController: () => ({
    members: SOCIOS,
    loading: false,
    error: null,
    totalRecords: SOCIOS.length,
    loadMembers: vi.fn(),
    refresh: vi.fn(),
    saveMember,
    deleteMember: vi.fn(),
  }),
}));

const { default: MembersPage } = await import('./MembersPage');

let root;
let container;

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // La pantalla usa useSearchParams (el atajo ?action=new del Dashboard), que necesita un Router.
  await act(async () => { root.render(<MemoryRouter><MembersPage /></MemoryRouter>); });
  for (let i = 0; i < 4; i++) {
    await act(async () => { await Promise.resolve(); });
  }
  return container.textContent;
}

/** Los <select> de arancel de la tabla, en el orden de las filas. */
const selectsDeArancel = () => [...container.querySelectorAll('select.arancel-select')];

async function elegir(elemento, valor) {
  // React compara contra el último valor que él puso: hay que usar el setter nativo para
  // que note el cambio y dispare el onChange.
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(elemento, valor);
  await act(async () => { elemento.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  arancelesDelGimnasio = ARANCELES;
  saveMember.mockClear();
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe('los aranceles en Socios', () => {

  it('cada socio muestra su arancel en la lista', async () => {
    // Antes el arancel no se veía en ninguna parte de Socios: había que abrir Pagos para
    // saber qué paga cada uno.
    await pintar();

    const selects = selectsDeArancel();
    expect(selects).toHaveLength(3);
    expect(selects[0].value).toBe('p1');
  });

  it('el que no tiene arancel se distingue de un vistazo', async () => {
    // No es un error, pero es plata que no se está cobrando bien. El dueño tiene que poder
    // verlo recorriendo la lista, sin abrir nada.
    await pintar();

    const sinArancel = selectsDeArancel()[1];
    expect(sinArancel.value).toBe('');
    expect(sinArancel.className).toContain('sin-arancel');
  });

  // ⭐ EL CASO QUE BORRARÍA DATOS SIN QUERER
  it('un arancel dado de baja sigue apareciendo en su fila', async () => {
    // Si el arancel del socio no estuviera entre las opciones, el select se vería vacío —
    // y el primer cambio de cualquier otra cosa se lo borraría sin que nadie lo note.
    await pintar();

    const suyo = selectsDeArancel()[2];
    expect(suyo.value).toBe('dado-de-baja');
    expect(container.textContent).toContain('de baja');
  });

  // ⭐ LO QUE HACE USABLE LA FUNCIÓN CON CIENTOS DE SOCIOS
  it('se puede asignar el arancel desde la lista, sin abrir la ficha', async () => {
    await pintar();

    await elegir(selectsDeArancel()[1], 'p2');

    expect(saveMember).toHaveBeenCalledTimes(1);
    expect(saveMember.mock.calls[0][0]).toMatchObject({ id: 's2', planId: 'p2' });
  });

  it('asignar el arancel NO borra el resto de la ficha', async () => {
    // Guardar manda el formulario entero: si se enviara solo el arancel, el socio perdería
    // el teléfono, las notas y los días de asistencia de un plumazo.
    await pintar();

    await elegir(selectsDeArancel()[0], 'p2');

    const enviado = saveMember.mock.calls[0][0];
    expect(enviado.fullName).toBe('LURDES ROLLET');
    expect(enviado.dni).toBe('44646377');
    expect(enviado.membershipEnd).toBe('2026-09-23');
  });

  it('elegir el mismo arancel que ya tenía no manda nada', async () => {
    // Abrir el desplegable y cerrarlo sin cambiar no puede disparar un guardado: sería una
    // escritura por cada vez que alguien mira.
    await pintar();

    await elegir(selectsDeArancel()[0], 'p1');

    expect(saveMember).not.toHaveBeenCalled();
  });

  it('se le puede SACAR el arancel a un socio', async () => {
    await pintar();

    await elegir(selectsDeArancel()[0], '');

    expect(saveMember.mock.calls[0][0]).toMatchObject({ id: 's1', planId: '' });
  });

  it('hay un filtro para encontrar a los que no tienen arancel', async () => {
    // El dueño acaba de cargar sus aranceles y tiene cientos de socios sin ninguno. Sin
    // este filtro, la única opción es recorrer la lista entera a ojo.
    await pintar();

    expect(container.textContent).toContain('Sin arancel');
  });

  it('un gimnasio sin aranceles no ve la columna', async () => {
    // La función es opcional: quien cobra siempre lo mismo no tiene por qué cargar con una
    // columna vacía.
    arancelesDelGimnasio = [];
    await pintar();

    expect(selectsDeArancel()).toHaveLength(0);
  });
});
