// @vitest-environment happy-dom
// ============================================
// LA PANTALLA DE IMPORTAR EL HISTORIAL DE CAJA
// ============================================
//
// El backend decide qué entra; esta pantalla tiene que no mentir y dejar clara la regla:
//
//  1. Antes de guardar se ven los totales MES POR MES: son los que va a mostrar el panel.
//  2. Con una sola fila con error NO hay forma de importar.
//  3. Dice que lo importado no mueve vencimientos ni entra a la caja (ADR-014).
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const toastEstable = { showToast: vi.fn() };
const errorService = { getMessage: (e) => String(e?.message || e) };
const paymentService = {
  analizarHistorial: vi.fn(),
  importarHistorial: vi.fn(),
  ultimoHistorial: vi.fn(),
  deshacerHistorial: vi.fn(),
};
const lector = { leerArchivoDeCaja: vi.fn() };

vi.mock('../contexts/ToastContext', () => ({ useToast: () => toastEstable }));
vi.mock('../services', () => ({ errorService }));
vi.mock('../services/PaymentService', () => ({ paymentService }));
vi.mock('../lib/importarCaja', () => lector);
vi.mock('./Icon', () => ({ default: () => null }));

const { default: ImportarHistorialCaja } = await import('./ImportarHistorialCaja');

const LEIDO = {
  archivo: 'Veltronik-historial-caja.xlsx',
  hoja: 'Caja 2026',
  filas: [{ fila: 2, fecha: '05/01/2026', hora: '07:17', socio: 'ANA', monto: '29000', medio: 'Efectivo' }],
  detectadas: [{ titulo: 'Fecha', campo: 'fecha', etiqueta: 'Fecha' }],
  ignoradas: ['Está en el padrón'],
  faltan: [],
};

const analisis = (extra) => ({
  total: 3, cobros: 2, gastos: 1, yaImportados: 0, yaCobrados: 0, conError: 0,
  totalCobros: 1450000, totalGastos: 3500, conSocio: 1, sinSocio: 1,
  desde: '2026-01-05T07:17:00', hasta: '2026-02-13T18:03:00',
  porMes: [
    { mes: '2026-01', cobros: 48, totalCobros: 1450000, gastos: 0, totalGastos: 0 },
    { mes: '2026-02', cobros: 44, totalCobros: 1320500, gastos: 1, totalGastos: 3500 },
  ],
  avisosGenerales: ['12 cobros son de personas con DNI que no están en el padrón (ex-socios)'],
  filas: [],
  ...extra,
});

const CON_ERROR = analisis({
  conError: 1,
  filas: [{ fila: 47, fecha: '31/02/2026', socio: 'Beto', documento: '', monto: '29000', accion: 'ERROR',
    errores: ['Fecha: «31/02/2026» no existe en el calendario.'], avisos: [] }],
});

let root;
let container;
const onImportado = vi.fn();

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ImportarHistorialCaja abierto onCerrar={() => {}} onImportado={onImportado} />);
  });
  await act(async () => { await Promise.resolve(); });
}

async function elegirArchivo() {
  const input = container.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'caja.xlsx')], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => { await Promise.resolve(); });
}

const boton = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(texto));

beforeEach(() => {
  vi.clearAllMocks();
  paymentService.ultimoHistorial.mockResolvedValue(null);
  lector.leerArchivoDeCaja.mockResolvedValue(LEIDO);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('importar el historial de caja', () => {
  it('⭐ antes de guardar muestra lo que entra mes por mes, y avisa que no toca vencimientos', async () => {
    paymentService.analizarHistorial.mockResolvedValue(analisis());
    await pintar();
    await elegirArchivo();

    expect(container.textContent).toContain('Enero 2026');
    expect(container.textContent).toContain('Febrero 2026');
    expect(container.textContent).toContain('48');
    expect(container.textContent).toContain('no le cambian el vencimiento a ningún socio');
    expect(container.textContent).toContain('ex-socios');
    expect(paymentService.importarHistorial).not.toHaveBeenCalled();
  });

  it('⭐ con una fila con error no hay forma de importar, y dice qué fila y por qué', async () => {
    paymentService.analizarHistorial.mockResolvedValue(CON_ERROR);
    await pintar();
    await elegirArchivo();

    expect(container.textContent).toContain('No se va a importar nada');
    expect(container.textContent).toContain('47');
    expect(container.textContent).toContain('31/02/2026');
    expect(boton('Importar:').disabled).toBe(true);
  });

  it('sin errores: importa, avisa y deja refrescar el panel', async () => {
    paymentService.analizarHistorial.mockResolvedValue(analisis());
    paymentService.importarHistorial.mockResolvedValue({
      ok: true,
      resultado: { importacionId: 'i1', cobros: 2, gastos: 1, totalCobros: 1450000, totalGastos: 3500, yaImportados: 0, yaCobrados: 0 },
    });
    await pintar();
    await elegirArchivo();

    await act(async () => { boton('Importar: 2 cobros y 1 gasto').click(); });
    await act(async () => { await Promise.resolve(); });

    expect(paymentService.importarHistorial).toHaveBeenCalledWith('Veltronik-historial-caja.xlsx', LEIDO.filas);
    expect(container.textContent).toContain('Listo');
    expect(onImportado).toHaveBeenCalled();
  });

  it('si todo ya estaba importado, no hay nada que importar', async () => {
    paymentService.analizarHistorial.mockResolvedValue(analisis({ cobros: 0, gastos: 0, yaImportados: 3, porMes: [] }));
    await pintar();
    await elegirArchivo();

    expect(container.textContent).toContain('ya está cargado');
    expect(boton('Nada para importar').disabled).toBe(true);
  });

  it('un archivo sin columna de monto no viaja al servidor', async () => {
    lector.leerArchivoDeCaja.mockResolvedValue({ ...LEIDO, filas: [], error: 'Falta la columna Monto.' });
    await pintar();
    await elegirArchivo();

    expect(paymentService.analizarHistorial).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Falta la columna Monto');
  });

  it('ofrece deshacer la última importación al abrir', async () => {
    paymentService.ultimoHistorial.mockResolvedValue({
      id: 'i1', cuando: '2026-09-21T10:00:00', archivo: 'caja.xlsx', cobros: 1234, gastos: 2,
      totalCobros: 25300000, totalGastos: 8000, desde: '2026-01-05T07:17:00', hasta: '2026-09-17T21:32:00',
      deshecha: false, sePuedeDeshacer: true, porQueNo: null,
    });
    await pintar();

    expect(container.textContent).toContain('1.234 cobros');
    expect(boton('Deshacer')).toBeTruthy();
  });
});
