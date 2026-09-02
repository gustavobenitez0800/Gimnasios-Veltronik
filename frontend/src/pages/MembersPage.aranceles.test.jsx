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
// Mutable a propósito: un test cambia el rol para comprobar qué NO ve recepción.
const authEstable = { orgRole: 'owner', profile: { fullName: 'Gustavo' } };

vi.mock('../contexts/ToastContext', () => ({ useToast: () => toastEstable }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authEstable }));
vi.mock('../services', () => ({
  paymentService: { createPayment: vi.fn().mockResolvedValue({}), getPaymentsByMember: vi.fn().mockResolvedValue([]) },
  errorService: { getMessage: (e) => String(e?.message || e) },
}));
const asignarArancelMasivo = vi.fn().mockResolvedValue({ actualizados: 2, pedidos: 2 });
vi.mock('../services/MemberService', () => ({
  memberService: {
    getMemberById: vi.fn().mockResolvedValue({ membershipEnd: '2026-10-23T23:59:59' }),
    asignarArancelMasivo,
  },
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
  asignarArancelMasivo.mockClear();
  asignarArancelMasivo.mockResolvedValue({ actualizados: 2, pedidos: 2 });
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


describe('asignar el arancel a muchos de una vez', () => {

  /** Las casillas de cada fila (la del encabezado queda afuera). */
  const casillas = () => [...container.querySelectorAll('td.col-check input[type="checkbox"]')];
  const casillaDeTodos = () => container.querySelector('th.col-check input[type="checkbox"]');
  /** El desplegable de la barra de selección. */
  const barra = () => container.querySelector('select.seleccion-arancel');
  const botones = () => [...container.querySelectorAll('button')];

  async function marcar(i) {
    await act(async () => { casillas()[i].click(); });
  }

  it('la barra aparece recién cuando hay algo marcado', async () => {
    // Una barra siempre visible diciendo "0 seleccionados" es ruido permanente para una
    // acción que se usa una vez cada tanto.
    await pintar();
    expect(barra()).toBe(null);

    await marcar(0);

    expect(barra()).not.toBe(null);
    expect(container.textContent).toContain('1 seleccionado');
  });

  it('la casilla del encabezado marca todo lo que se está viendo', async () => {
    await pintar();

    await act(async () => { casillaDeTodos().click(); });

    expect(container.textContent).toContain('3 seleccionados');
  });

  // ⭐ ESCRIBIR SOBRE MUCHAS FICHAS NO PUEDE PASAR POR UN CAMBIO DE DESPLEGABLE
  it('elegir el arancel NO lo aplica: pregunta primero', async () => {
    await pintar();
    await marcar(0);

    await elegir(barra(), 'p2');

    expect(asignarArancelMasivo).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Asignar');
  });

  it('al confirmar manda UN pedido con todos los ids', async () => {
    // Y no uno por socio: con 383 serían 383 viajes, y cerrar la pestaña a la mitad dejaría
    // la mitad hecha sin forma de saber cuál.
    await pintar();
    await marcar(0);
    await marcar(1);
    await elegir(barra(), 'p2');

    await act(async () => {
      botones().find((b) => b.textContent.includes('Asignar a todos')).click();
    });
    await act(async () => { await Promise.resolve(); });

    expect(asignarArancelMasivo).toHaveBeenCalledTimes(1);
    const [ids, planId] = asignarArancelMasivo.mock.calls[0];
    expect(ids).toHaveLength(2);
    expect(ids).toContain('s1');
    expect(ids).toContain('s2');
    expect(planId).toBe('p2');
  });

  // ⭐ EL AVISO QUE EVITA PISARLE LA CUOTA A QUIEN YA ESTABA BIEN
  it('avisa cuántos de los marcados YA tenían otro arancel', async () => {
    await pintar();
    // s1 tiene 'p1' y s3 tiene uno dado de baja; s2 no tiene ninguno.
    await act(async () => { casillaDeTodos().click(); });

    await elegir(barra(), 'p2');

    expect(container.textContent).toContain('2 de ellos ya tenían otro arancel');
  });

  it('sin nadie con arancel previo no muestra ese aviso', async () => {
    await pintar();
    await marcar(1); // CAROLINA, sin arancel

    await elegir(barra(), 'p2');

    expect(container.textContent).not.toContain('ya tenían otro arancel');
  });

  it('se les puede SACAR el arancel a todos', async () => {
    // El dueño se equivoca de arancel al aplicarlo a 200 socios y tiene que poder
    // deshacerlo sin abrir 200 fichas.
    await pintar();
    await marcar(0);

    await elegir(barra(), '__sin__');
    await act(async () => {
      botones().find((b) => b.textContent.includes('Sacárselo a todos')).click();
    });
    await act(async () => { await Promise.resolve(); });

    expect(asignarArancelMasivo.mock.calls[0][1]).toBe(null);
  });

  it('cancelar no manda nada', async () => {
    await pintar();
    await marcar(0);
    await elegir(barra(), 'p2');

    await act(async () => {
      botones().find((b) => b.textContent.trim() === 'Cancelar').click();
    });

    expect(asignarArancelMasivo).not.toHaveBeenCalled();
  });

  it('si el servidor tocó menos de los pedidos, lo dice', async () => {
    // Puede pasar: un socio borrado desde la otra terminal mientras esto se armaba ya no
    // existe. Informar "listo, 40" cuando fueron 38 es mentirle al dueño.
    asignarArancelMasivo.mockResolvedValue({ actualizados: 1, pedidos: 2 });
    await pintar();
    await marcar(0);
    await marcar(1);
    await elegir(barra(), 'p2');

    await act(async () => {
      botones().find((b) => b.textContent.includes('Asignar a todos')).click();
    });
    await act(async () => { await Promise.resolve(); });

    expect(toastEstable.showToast).toHaveBeenCalledWith(
      expect.stringContaining('1 de 2'), 'warning');
  });

  it('recepción NO puede asignar en masa', async () => {
    // Cambiar de golpe lo que se le cobra a doscientas personas no es una operación de
    // mostrador. El backend lo verifica igual: esto es solo no ofrecerlo.
    authEstable.orgRole = 'reception';
    await pintar();

    expect(casillas()).toHaveLength(0);
    authEstable.orgRole = 'owner';
  });
});
