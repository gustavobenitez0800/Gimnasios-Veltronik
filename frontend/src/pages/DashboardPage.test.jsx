// @vitest-environment happy-dom
// ============================================
// EL DASHBOARD, MONTADO ENTERO
// ============================================
// La pantalla real con su controlador real; lo único simulado es el servidor (y el dibujo de
// los gráficos, que en un DOM de prueba no hay dónde pintar). Cada test es un bug que el panel
// tuvo de verdad hasta el 2026-09-21:
//
//  · Las últimas altas decían "Inactivo" para TODOS: la tabla leía un `status` que el
//    servidor no manda.
//  · Si el resumen fallaba, el panel pintaba "0 socios" y "$0" como si fueran datos.
//  · La predicción, la comparativa y el gráfico trataban al mes en curso como un mes cerrado.
//  · Dos socios con el mismo nombre compartían la clave de su alerta.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { clearQueryCache } from '../hooks';
import { formatCurrency } from '../lib/utils';

const servidor = { getResumen: vi.fn() };
const authEstable = { gym: { id: 'gym-test' }, orgRole: 'owner' };

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authEstable }));
vi.mock('../services/DashboardStatsService', () => ({ dashboardStatsService: servidor }));
vi.mock('../components/Icon', () => ({ default: () => null }));
vi.mock('chart.js', () => ({
  Chart: { register: () => {} },
  CategoryScale: {}, LinearScale: {}, PointElement: {}, LineElement: {}, ArcElement: {},
  Filler: {}, Tooltip: {}, Legend: {},
}));
// Los gráficos se reemplazan por lo que reciben: se puede leer qué se le mandó a dibujar.
vi.mock('react-chartjs-2', () => ({
  Line: ({ data }) => <div data-testid="linea">{data.datasets[0].data.join(',')}</div>,
  Doughnut: ({ data }) => <div data-testid="torta">{data.labels.join(',')}</div>,
}));

const { default: DashboardPage } = await import('./DashboardPage');

/** Un gimnasio al 21 de septiembre de 2026, con números inventados. */
const resumen = (extra = {}) => ({
  hoy: '2026-09-21',
  socios: { total: 12, activos: 7, inactivos: 1, vencidos: 3, suspendidos: 0, sinFecha: 1 },
  ingresos: {
    delMes: 30000,
    delMesAnterior: 140000,
    delMismoPeriodoAnterior: 25000,
    primerCobro: '2026-06-02T09:00:00',
    serieMensual: [
      { mes: '2026-06-01T00:00:00', total: 100000 },
      { mes: '2026-07-01T00:00:00', total: 120000 },
      { mes: '2026-08-01T00:00:00', total: 140000 },
      { mes: '2026-09-01T00:00:00', total: 30000 },
    ],
  },
  vencimientos: {
    estaSemana: 1,
    total: 12,
    primeros: [
      { socioId: 's1', nombre: 'Juan Pérez', diasRestantes: -1 },
      { socioId: 's2', nombre: 'Juan Pérez', diasRestantes: 2 },
    ],
  },
  cumplenHoy: [],
  ultimosSocios: [
    { id: 'm1', firstName: 'Beto', lastName: 'Ríos', document: '30111222', active: true, situacion: 'AL_DIA', membershipEnd: '2026-10-21T23:59:59' },
    { id: 'm2', firstName: 'Carla', lastName: 'Paz', document: '31222333', active: true, situacion: 'VENCIDO', membershipEnd: '2026-08-01T23:59:59' },
    { id: 'm3', firstName: 'Dani', lastName: 'Sosa', document: '32333444', active: false, situacion: 'INACTIVO', membershipEnd: '2026-08-01T23:59:59' },
  ],
  ...extra,
});

let root;
let container;

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter><DashboardPage /></MemoryRouter>);
  });
  await act(async () => { await Promise.resolve(); });
}

const texto = () => container.textContent;
const filaDe = (nombre) => [...container.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes(nombre));

beforeEach(() => {
  vi.clearAllMocks();
  clearQueryCache();
  localStorage.setItem('current_org_id', 'gym-test');
  servidor.getResumen.mockResolvedValue(resumen());
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('el Dashboard', () => {
  it('⭐ las últimas altas muestran su estado real, no "Inactivo" para todos', async () => {
    await pintar();

    // Las mismas palabras que Socios (ESTADOS_DEL_SOCIO): Al día, Vencido, Sin cuota, Baja.
    expect(filaDe('Beto Ríos').textContent).toContain('Al día');
    expect(filaDe('Carla Paz').textContent).toContain('Vencido');
    expect(filaDe('Dani Sosa').textContent).toContain('Baja');
  });

  it('⭐ si el resumen no llega, no pinta ceros: dice que falló y deja reintentar', async () => {
    servidor.getResumen.mockRejectedValueOnce(new Error('sin conexión'));
    await pintar();

    expect(texto()).toContain('No se pudo cargar el panel');
    expect(texto()).not.toContain(formatCurrency(0));

    const reintentar = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Reintentar'));
    await act(async () => { reintentar.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(servidor.getResumen).toHaveBeenCalledTimes(2);
    expect(texto()).toContain(formatCurrency(30000));
  });

  it('⭐ la predicción es con meses cerrados, y dice de qué mes', async () => {
    await pintar();

    // Junio, julio y agosto suben de a 20.000: octubre, 180.000. Septiembre a medias no entra.
    expect(texto()).toContain('Predicción de octubre');
    expect(texto()).toContain(formatCurrency(180000));
    expect(texto()).toContain('+50% vs el promedio de 3 meses cerrados');
  });

  it('el porcentaje de la predicción va con coma, como se escribe acá', async () => {
    servidor.getResumen.mockResolvedValue(resumen({
      ingresos: {
        delMes: 30000, delMesAnterior: 125000, delMismoPeriodoAnterior: 25000, primerCobro: '2026-06-02T09:00:00',
        serieMensual: [
          { mes: '2026-06-01T00:00:00', total: 100000 },
          { mes: '2026-07-01T00:00:00', total: 110000 },
          { mes: '2026-08-01T00:00:00', total: 125000 },
          { mes: '2026-09-01T00:00:00', total: 30000 },
        ],
      },
    }));
    await pintar();

    // 100.000, 110.000, 125.000: octubre ≈ 149.167, un 33,6% arriba del promedio (111.667).
    expect(texto()).toContain('33,6%');
    expect(texto()).not.toContain('33.6%');
  });

  it('sin dos meses cerrados no inventa un número', async () => {
    servidor.getResumen.mockResolvedValue(resumen({
      ingresos: {
        delMes: 30000, delMesAnterior: 50000, delMismoPeriodoAnterior: 20000, primerCobro: '2026-08-01T09:00:00',
        serieMensual: [{ mes: '2026-08-01T00:00:00', total: 50000 }, { mes: '2026-09-01T00:00:00', total: 30000 }],
      },
    }));
    await pintar();

    expect(texto()).toContain('Se calcula con dos meses cerrados');
    expect(texto()).not.toContain('confianza');
  });

  it('⭐ "Ingresos del Mes" se compara contra el mismo tramo del mes pasado', async () => {
    await pintar();

    expect(texto()).toContain('+20% frente al 1 al 21 de agosto');
  });

  it('el gráfico muestra el mes en curso, y avisa que no terminó', async () => {
    await pintar();

    expect(container.querySelector('[data-testid="linea"]').textContent.endsWith('30000')).toBe(true);
    expect(texto()).toContain('septiembre en curso, al día 21');
  });

  it('la torta habla como la tarjeta y como Socios', async () => {
    await pintar();

    expect(container.querySelector('[data-testid="torta"]').textContent).toBe('Al día,Vencidos,Sin cuota,Bajas');
  });

  it('⭐ dos socios con el mismo nombre tienen cada uno su alerta, con cuándo', async () => {
    await pintar();

    expect(texto()).toContain('Juan Pérez - Venció hace 1 día');
    expect(texto()).toContain('Juan Pérez - Vence en 2 días');
  });

  it('dice cuántas alertas más hay y lleva a los vencidos de Socios', async () => {
    await pintar();

    expect(texto()).toContain('y 10 más');
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Ver vencidos'));
    expect(link.getAttribute('href')).toContain('estado=vencido');
  });
});
