// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests de la pantalla de Reportes
// ============================================
// Lo que se cuida: que cada descarga pida EXACTAMENTE el rango que está puesto en el selector
// —a mano, con cada atajo, un día solo— y que el archivo lo lleve en el nombre. Qué filas trae
// cada reporte lo deciden el servidor (con sus tests de rango) y lib/reportesDelGimnasio.
//
// La hora es fija: el 30/09/2026 a las 23:30, el último día del mes y de noche. Un test de
// fechas que depende de cuándo se corre se cae solo de madrugada, y ya pasó en este proyecto.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const toastEstable = { showToast: vi.fn() };
const memberService = { getAllMembers: vi.fn() };
const accessService = { getLogsByDateRange: vi.fn() };
const cajaService = { reporte: vi.fn() };
const exportar = vi.hoisted(() => ({ downloadExcel: vi.fn(), downloadPDF: vi.fn() }));
const excel = vi.hoisted(() => ({ descargarExcelDeCaja: vi.fn() }));

vi.mock('../services', () => ({
  memberService, accessService, errorService: { getMessage: (e) => String(e?.message || e) },
}));
vi.mock('../services/CajaService', () => ({ cajaService, default: cajaService }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => toastEstable }));
vi.mock('../lib/reportExport', () => exportar);
vi.mock('../lib/excelDeCaja', () => excel);
// El título real trae el menú y la sesión: acá no importan.
vi.mock('../components/Layout', () => ({ PageHeader: ({ title }) => <h1>{title}</h1> }));

const { default: ReportsPage } = await import('./ReportsPage');

const REPORTE = { gimnasio: 'Gimnasio', totales: {}, cobros: [], movimientos: [], cierres: [] };

let root;
let container;

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<ReportsPage />); });
}

async function esperar() {
  for (let i = 0; i < 4; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

async function clic(elemento) {
  await act(async () => { elemento.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperar();
}

/** El botón de un reporte: `boton('Ingresos', 'Excel')`. */
const boton = (titulo, formato) => {
  const tarjeta = [...container.querySelectorAll('.report-card')]
    .find((c) => c.querySelector('.report-title').textContent === titulo);
  return [...tarjeta.querySelectorAll('button')].find((b) => b.textContent.includes(formato));
};

const atajo = (texto) => [...container.querySelectorAll('.selector-fechas-atajos button')]
  .find((b) => b.textContent === texto);

const fechas = () => [...container.querySelectorAll('.selector-fechas input[type="date"]')];

/** Escribe en un input pasando por el setter nativo (si no, React no ve el cambio). */
const setValorNativo = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

async function ponerFechas(desde, hasta) {
  const [inDesde, inHasta] = fechas();
  for (const [input, valor] of [[inDesde, desde], [inHasta, hasta]]) {
    await act(async () => {
      setValorNativo.call(input, valor);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 30, 23, 30));
  localStorage.clear();
  memberService.getAllMembers.mockResolvedValue([]);
  accessService.getLogsByDateRange.mockResolvedValue([]);
  cajaService.reporte.mockResolvedValue(REPORTE);
  exportar.downloadExcel.mockResolvedValue(undefined);
  exportar.downloadPDF.mockResolvedValue(undefined);
  excel.descargarExcelDeCaja.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('⭐ cada descarga baja el rango que está puesto', () => {
  it('arranca en el mes en curso', async () => {
    await pintar();
    expect(fechas().map((i) => i.value)).toEqual(['2026-09-01', '2026-09-30']);
  });

  it.each([
    ['Hoy', '2026-09-30', '2026-09-30'],
    // El 30/09/2026 es miércoles: la semana arranca el lunes 28.
    ['Semana', '2026-09-28', '2026-09-30'],
    ['Mes', '2026-09-01', '2026-09-30'],
    ['Año', '2026-01-01', '2026-09-30'],
  ])('el atajo %s baja del %s al %s', async (nombre, desde, hasta) => {
    await pintar();
    await clic(atajo('Hoy')); // sale del atajo con que arranca, para que el elegido cambie algo
    await clic(atajo(nombre));

    await clic(boton('Ingresos', 'Excel'));
    expect(cajaService.reporte).toHaveBeenLastCalledWith(desde, hasta);
    expect(excel.descargarExcelDeCaja).toHaveBeenCalledWith(REPORTE);

    await clic(boton('Asistencia', 'Excel'));
    expect(accessService.getLogsByDateRange).toHaveBeenLastCalledWith(desde, hasta);
    expect(exportar.downloadExcel).toHaveBeenLastCalledWith(
      `asistencia_${desde}_${hasta}.xlsx`, expect.any(Array), expect.any(Array));
  });

  it('⭐ un rango a medida: lo mismo en Excel, en PDF y en el resumen', async () => {
    await pintar();
    await ponerFechas('2026-08-15', '2026-09-10');

    await clic(boton('Ingresos', 'PDF'));
    expect(cajaService.reporte).toHaveBeenLastCalledWith('2026-08-15', '2026-09-10');
    const [titulo, archivo] = exportar.downloadPDF.mock.calls.at(-1);
    expect(titulo).toMatch(/^Ingresos del 15\/0?8\/2026 al 10\/0?9\/2026$/);
    expect(archivo).toBe('ingresos_2026-08-15_2026-09-10.pdf');

    await clic(boton('Resumen', 'Excel'));
    expect(cajaService.reporte).toHaveBeenLastCalledWith('2026-08-15', '2026-09-10');
    expect(accessService.getLogsByDateRange).toHaveBeenLastCalledWith('2026-08-15', '2026-09-10');
    expect(exportar.downloadExcel.mock.calls.at(-1)[0]).toBe('resumen_2026-08-15_2026-09-10.xlsx');

    // Ningún pedido salió con otras fechas.
    for (const [d, h] of [...cajaService.reporte.mock.calls, ...accessService.getLogsByDateRange.mock.calls]) {
      expect([d, h]).toEqual(['2026-08-15', '2026-09-10']);
    }
  });

  it('un día solo', async () => {
    await pintar();
    await ponerFechas('2026-09-15', '2026-09-15');

    await clic(boton('Asistencia', 'PDF'));

    expect(accessService.getLogsByDateRange).toHaveBeenCalledWith('2026-09-15', '2026-09-15');
    expect(exportar.downloadPDF.mock.calls.at(-1)[0]).toMatch(/^Asistencia del 15\/0?9\/2026$/);
  });

  it('un rango al revés no baja nada, y lo dice', async () => {
    await pintar();
    await ponerFechas('2026-09-20', '2026-09-10');

    await clic(boton('Ingresos', 'Excel'));

    expect(cajaService.reporte).not.toHaveBeenCalled();
    expect(excel.descargarExcelDeCaja).not.toHaveBeenCalled();
    expect(toastEstable.showToast).toHaveBeenCalledWith('La fecha «Desde» es posterior a «Hasta».', 'error');
    expect(container.querySelector('.selector-fechas-aviso').textContent).toMatch(/posterior/);
  });

  it('más de un año no se pide (el servidor lo rechazaría), y lo dice', async () => {
    await pintar();
    await ponerFechas('2025-01-01', '2026-09-30');

    await clic(boton('Asistencia', 'Excel'));

    expect(accessService.getLogsByDateRange).not.toHaveBeenCalled();
    expect(toastEstable.showToast).toHaveBeenCalledWith('Elegí un rango de hasta un año.', 'error');
  });

  it('el padrón de socios es el de hoy: no depende de las fechas', async () => {
    await pintar();
    await ponerFechas('2026-08-15', '2026-09-10');

    await clic(boton('Socios', 'Excel'));

    expect(memberService.getAllMembers).toHaveBeenCalled();
    expect(exportar.downloadExcel.mock.calls.at(-1)[0]).toBe('socios_2026-09-30.xlsx');
  });
});

describe('pasada la medianoche', () => {
  it('con un atajo puesto, el rango sigue a hoy (el terminal que queda prendido)', async () => {
    await pintar();
    await clic(atajo('Hoy'));

    vi.setSystemTime(new Date(2026, 9, 1, 0, 10));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await clic(boton('Ingresos', 'Excel'));

    expect(cajaService.reporte).toHaveBeenLastCalledWith('2026-10-01', '2026-10-01');
  });

  it('con fechas puestas a mano, son de quien las puso: no se mueven', async () => {
    await pintar();
    // Distintas de las del atajo puesto: si fueran las mismas, no habría nada que cambiar.
    await ponerFechas('2026-09-02', '2026-09-29');

    vi.setSystemTime(new Date(2026, 9, 1, 0, 10));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await clic(boton('Ingresos', 'Excel'));

    expect(cajaService.reporte).toHaveBeenLastCalledWith('2026-09-02', '2026-09-29');
  });
});
