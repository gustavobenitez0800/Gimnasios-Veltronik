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
  // Al día: tiene que seguir diciendo Activo y sus días.
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

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter><MembersPage /></MemoryRouter>); });
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
    expect(fila).toContain('Activo');
    expect(fila).toContain('12d');
    expect(fila).not.toContain('Sin cuota');
  });

  it('al dado de baja le sigue diciendo baja, aunque tampoco tenga cuota', async () => {
    // Sin esta distinción, dar de baja a alguien lo mostraría como si le faltara pagar —
    // y aparecería en la lista de "a quién cobrarle" para siempre.
    await pintar();

    const fila = filaDe('CAROLINA ARRUA');
    expect(fila).toContain('Inactivo');
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

  it('"Activos" lo sigue incluyendo — activo es "no está dado de baja"', async () => {
    // Decidido a propósito: si se lo sacara de Activos, un socio recién cargado no aparecería
    // en NINGÚN filtro hasta que se le cobre.
    await pintar();
    await filtrar('active');

    const texto = filas().join(' | ');
    expect(texto).toContain('Jose Luis Benitez');
    expect(texto).toContain('LURDES ROLLET');
    expect(texto).not.toContain('CAROLINA ARRUA');
  });
});
