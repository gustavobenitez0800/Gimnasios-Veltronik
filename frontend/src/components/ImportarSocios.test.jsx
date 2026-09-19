// @vitest-environment happy-dom
// ============================================
// LA PANTALLA DE IMPORTAR SOCIOS
// ============================================
//
// El backend decide qué entra; esta pantalla solo tiene que no mentir. Lo que se defiende:
//
//  1. Con una sola fila con error NO hay forma de importar, y se ve qué fila y por qué.
//  2. Un archivo que ni siquiera tiene la columna de DNI no viaja al servidor.
//  3. Si entre la vista previa y el clic aparecen errores (el backend vuelve a analizar),
//     se vuelve a la revisión con el análisis NUEVO, no se muestra "listo".
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const toastEstable = { showToast: vi.fn() };
const errorService = { getMessage: (e) => String(e?.message || e) };
const memberService = {
  analizarImportacion: vi.fn(),
  importar: vi.fn(),
  ultimaImportacion: vi.fn(),
  deshacerImportacion: vi.fn(),
};
const lector = { leerArchivo: vi.fn(), descargarPlantilla: vi.fn() };

vi.mock('../contexts/ToastContext', () => ({ useToast: () => toastEstable }));
vi.mock('../services', () => ({ errorService }));
vi.mock('../services/MemberService', () => ({ memberService }));
vi.mock('../lib/importarSocios', () => lector);
vi.mock('./Icon', () => ({ default: () => null }));

const { default: ImportarSocios } = await import('./ImportarSocios');

const LEIDO = {
  archivo: 'socios.xlsx',
  hoja: 'Hoja1',
  filas: [{ fila: 2, nombre: 'Ana', documento: '30111222', vencimiento: '30/09/2026' }],
  detectadas: [{ titulo: 'Nombre', campo: 'nombre', etiqueta: 'Nombre' }],
  ignoradas: [],
  faltan: [],
  tieneVencimiento: true,
};

const analisis = (extra) => ({
  total: 3, crear: 3, actualizar: 0, sinCambios: 0, conError: 0, conAviso: 0,
  avisosGenerales: [],
  filas: [
    { fila: 2, nombre: 'Ana', documento: '30111222', accion: 'CREAR', errores: [], avisos: [], cambios: [] },
    { fila: 3, nombre: 'Beto', documento: '31222333', accion: 'CREAR', errores: [], avisos: [], cambios: [] },
    { fila: 4, nombre: 'Carla', documento: '32333444', accion: 'CREAR', errores: [], avisos: [], cambios: [] },
  ],
  ...extra,
});

const CON_ERROR = analisis({
  crear: 2, conError: 1,
  filas: [
    { fila: 2, nombre: 'Ana', documento: '30111222', accion: 'CREAR', errores: [], avisos: [], cambios: [] },
    { fila: 47, nombre: 'Beto', documento: '31222333', accion: 'ERROR', errores: ['Vencimiento: «31/02/2026» no existe en el calendario.'], avisos: [], cambios: [] },
  ],
});

let root;
let container;
const onImportado = vi.fn();

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ImportarSocios abierto onCerrar={() => {}} onImportado={onImportado} />);
  });
  await act(async () => { await Promise.resolve(); });
}

async function elegirArchivo() {
  const input = container.querySelector('input[type="file"]');
  const archivo = new File(['x'], 'socios.xlsx');
  Object.defineProperty(input, 'files', { value: [archivo], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => { await Promise.resolve(); });
}

const boton = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(texto));

beforeEach(() => {
  vi.clearAllMocks();
  memberService.ultimaImportacion.mockResolvedValue(null);
  lector.leerArchivo.mockResolvedValue(LEIDO);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('importar socios', () => {
  it('⭐ con una fila con error no hay forma de importar, y dice qué fila y por qué', async () => {
    memberService.analizarImportacion.mockResolvedValue(CON_ERROR);
    await pintar();
    await elegirArchivo();

    expect(container.textContent).toContain('No se va a importar nada');
    expect(container.textContent).toContain('47');
    expect(container.textContent).toContain('31/02/2026');
    expect(boton('Importar:').disabled).toBe(true);
  });

  it('sin errores: el botón dice cuántos, y al importar muestra el resultado', async () => {
    memberService.analizarImportacion.mockResolvedValue(analisis());
    memberService.importar.mockResolvedValue({ ok: true, resultado: { importacionId: 'i1', creados: 3, actualizados: 0, sinCambios: 0 } });
    await pintar();
    await elegirArchivo();

    const importar = boton('Importar: 3 nuevos');
    expect(importar.disabled).toBe(false);
    await act(async () => { importar.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(memberService.importar).toHaveBeenCalledWith('socios.xlsx', LEIDO.filas);
    expect(container.textContent).toContain('3 socios nuevos');
    expect(onImportado).toHaveBeenCalled();
  });

  it('⭐ si al importar aparecen errores, vuelve a la revisión con el análisis nuevo', async () => {
    memberService.analizarImportacion.mockResolvedValue(analisis());
    memberService.importar.mockResolvedValue({ ok: false, analisis: CON_ERROR });
    await pintar();
    await elegirArchivo();

    await act(async () => { boton('Importar: 3 nuevos').click(); });
    await act(async () => { await Promise.resolve(); });

    expect(container.textContent).not.toContain('socios nuevos.');
    expect(container.textContent).toContain('No se va a importar nada');
    expect(onImportado).not.toHaveBeenCalled();
  });

  it('un archivo sin columna de DNI no viaja al servidor', async () => {
    lector.leerArchivo.mockResolvedValue({ ...LEIDO, filas: [], error: 'Falta la columna DNI. Sin ella no se puede reconocer a cada socio.' });
    await pintar();
    await elegirArchivo();

    expect(memberService.analizarImportacion).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Falta la columna DNI');
  });

  it('ofrece deshacer la última importación al abrir', async () => {
    memberService.ultimaImportacion.mockResolvedValue({
      id: 'i1', cuando: '2026-09-19T10:00:00', archivo: 'socios.xlsx', creados: 385, actualizados: 0,
      deshecha: false, sePuedeDeshacer: true, porQueNo: null,
    });
    await pintar();

    expect(container.textContent).toContain('385 nuevos');
    expect(boton('Deshacer')).toBeTruthy();
  });
});
