// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - El socio que nunca pagó, en la pantalla de Socios
// ============================================
// El reporte fue "no muestra los días que le quedan": un socio recién dado de alta mostraba
// un guion en DÍAS y un chip verde que decía ACTIVO. O sea, exactamente igual que uno al día.
//
// El estado lo introdujimos nosotros: hasta el ADR-013 el alta regalaba un mes, así que un
// socio sin ninguna cobertura casi no existía. Al sacar el mes regalado pasó a ser el estado
// de TODOS los socios nuevos, y la pantalla no lo sabía decir.
//
// Estos tests dibujan Socios de verdad y comprueban las cuatro cosas que lo muestran: el chip,
// la columna de días, el filtro y el CSV.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

const SOCIOS = [
  // Recién dado de alta: activo, sin ninguna cobertura. El caso del reporte.
  { id: 's1', fullName: 'Jose Luis Benitez', dni: '30111222', phone: '', status: 'active',
    situacion: 'SIN_DATOS', diasRestantes: 0, diasVencido: 0, membershipEnd: null,
    planId: '', attendanceDays: [] },
  // Al día: tiene que seguir diciendo Al día y sus días.
  { id: 's2', fullName: 'LURDES ROLLET', dni: '44646377', phone: '', status: 'active',
    situacion: 'AL_DIA', diasRestantes: 12, diasVencido: 0, membershipEnd: '2026-09-20',
    planId: '', attendanceDays: [] },
  // Dado de baja SIN fecha de vencimiento: no tiene cuota, pero lo que corresponde decir
  // es "baja". El que ya no es socio no debe nada.
  { id: 's3', fullName: 'CAROLINA ARRUA', dni: '28889932', phone: '', status: 'inactive',
    situacion: 'INACTIVO', diasRestantes: 0, diasVencido: 0, membershipEnd: null,
    planId: '', attendanceDays: [] },
];

const toastEstable = { showToast: vi.fn() };
const authEstable = { orgRole: 'owner', profile: { fullName: 'Gustavo' } };

vi.mock('../contexts/ToastContext', () => ({ useToast: () => toastEstable }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authEstable }));
vi.mock('../services', () => ({
  paymentService: { createPayment: vi.fn().mockResolvedValue({}), getPaymentsByMember: vi.fn().mockResolvedValue([]) },
  errorService: { getMessage: (e) => String(e?.message || e) },
}));
vi.mock('../services/MemberService', () => ({
  memberService: {
    getMemberById: vi.fn().mockResolvedValue({}),
    asignarArancelMasivo: vi.fn().mockResolvedValue({ actualizados: 0, pedidos: 0 }),
  },
}));
vi.mock('../services/PlanService', () => ({
  planService: { getVigentes: () => Promise.resolve([]) },
}));
vi.mock('../controllers/useMemberController', () => ({
  useMemberController: () => ({
    members: SOCIOS,
    loading: false,
    error: null,
    totalRecords: SOCIOS.length,
    loadMembers: vi.fn(),
    refresh: vi.fn(),
    saveMember: vi.fn().mockResolvedValue({}),
    deleteMember: vi.fn(),
  }),
}));

const { default: MembersPage } = await import('./MembersPage');

let root;
let container;

async function pintar(url = '/') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter initialEntries={[url]}><MembersPage /></MemoryRouter>); });
  for (let i = 0; i < 4; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

/** Las filas de la tabla de socios, como texto. */
const filas = () => [...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
const filaDe = (nombre) => filas().find((t) => t.includes(nombre)) || '';

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  toastEstable.showToast.mockClear();
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe('el socio sin cuota en la lista', () => {
  it('⭐ el chip dice "Sin cuota", no "Activo"', async () => {
    await pintar();

    const fila = filaDe('Jose Luis Benitez');
    expect(fila).toContain('Sin cuota');
    // Y el punto entero del arreglo: deja de verse igual que uno al día.
    expect(fila).not.toContain('Activo');
  });

  it('la columna de días también lo dice, en vez de un guion', async () => {
    await pintar();
    expect(filaDe('Jose Luis Benitez')).toContain('sin cuota');
  });

  it('el chip es ámbar, no rojo: no debe nada, todavía no se le cobró', async () => {
    await pintar();

    const fila = [...container.querySelectorAll('tbody tr')]
      .find((tr) => tr.textContent.includes('Jose Luis Benitez'));
    const chip = [...fila.querySelectorAll('.badge')].find((b) => b.textContent === 'Sin cuota');
    expect(chip).toBeTruthy();
    expect(chip.className).toContain('badge-warning');
  });

  it('al que está al día no le cambia nada', async () => {
    await pintar();

    const fila = filaDe('LURDES ROLLET');
    expect(fila).toContain('Al día');
    expect(fila).toContain('12d');
    expect(fila).not.toContain('Sin cuota');
  });

  it('al dado de baja le sigue diciendo baja, aunque tampoco tenga cuota', async () => {
    // Sin esta distinción, dar de baja a alguien lo mostraría como si le faltara pagar —
    // y aparecería en la lista de "a quién cobrarle" para siempre.
    await pintar();

    const fila = filaDe('CAROLINA ARRUA');
    expect(fila).toContain('Baja');
    expect(fila).toContain('baja');
    expect(fila).not.toContain('Sin cuota');
  });
});

describe('el filtro "Sin cuota"', () => {
  const filtrar = async (valor) => {
    const select = [...container.querySelectorAll('select')]
      .find((s) => [...s.options].some((o) => o.value === 'sin_cuota'));
    expect(select).toBeTruthy();
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, valor);
    await act(async () => { select.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });
  };

  it('⭐ deja solo a los que hay que cobrarles', async () => {
    await pintar();
    await filtrar('sin_cuota');

    const texto = filas().join(' | ');
    expect(texto).toContain('Jose Luis Benitez');
    expect(texto).not.toContain('LURDES ROLLET');
    // El dado de baja no está en la lista de cobrar: ya no es socio.
    expect(texto).not.toContain('CAROLINA ARRUA');
  });

  it('⭐ cada socio está en UN filtro de estado, y ninguno queda afuera de todos', async () => {
    // Antes "Activos" incluía al sin cuota para que un socio recién cargado apareciera en
    // algún filtro. Ahora los cuatro estados son los de la pantalla (Al día, Vencidos, Sin
    // cuota, Bajas): el recién cargado está en "Sin cuota", y en ningún otro.
    await pintar();
    const en = {};
    for (const estado of ['al_dia', 'vencido', 'sin_cuota', 'baja']) {
      await filtrar(estado);
      en[estado] = filas().join(' | ');
    }
    expect(en.al_dia).toContain('LURDES ROLLET');
    expect(en.al_dia).not.toContain('Jose Luis Benitez');
    expect(en.sin_cuota).toContain('Jose Luis Benitez');
    expect(en.baja).toContain('CAROLINA ARRUA');
    expect(en.baja).not.toContain('LURDES ROLLET');
  });

  it('un enlace viejo con ?estado=inactive sigue abriendo el filtro que corresponde', async () => {
    // El "Ver vencidos" del tablero mandaba ?estado=expired; un marcador guardado no se rompe.
    await pintar('/?estado=inactive');
    const select = [...container.querySelectorAll('select')]
      .find((s) => [...s.options].some((o) => o.value === 'sin_cuota'));
    expect(select.value).toBe('baja');
    const texto = filas().join(' | ');
    expect(texto).toContain('CAROLINA ARRUA');
    expect(texto).not.toContain('LURDES ROLLET');
  });
});
