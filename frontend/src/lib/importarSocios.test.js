// ============================================
// LEER UN ARCHIVO DE SOCIOS
// ============================================
//
// Cada archivo de acá se arma como llega de verdad: un xlsx con celdas de fecha, un CSV
// guardado por el Excel en español (punto y coma, Windows-1252), y el "xls" de AccesoGym,
// que es una tabla HTML con esa extensión. El que lleva ⭐ es el que habría cargado fechas
// equivocadas sin un solo error.
// ============================================

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  mapearEncabezados,
  elegirFilaDeEncabezados,
  normalizarEncabezado,
  valorDeCelda,
  decodificarTexto,
  leerArchivo,
  armarPlantilla,
} from './importarSocios';

/** Un xlsx en memoria a partir de celdas ya armadas (así la fecha es exacta, sin zona horaria). */
function archivoXlsx(filas, nombre = 'socios.xlsx') {
  const hoja = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(hoja, filas, { origin: 'A1' });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Hoja1');
  const bytes = XLSX.write(libro, { type: 'array', bookType: 'xlsx' });
  return new File([bytes], nombre);
}

const fechaExcel = (serie) => ({ t: 'n', v: serie, z: 'm/d/yy' }); // el formato 14 de Excel

describe('los títulos de las columnas', () => {
  it('se reconocen sin importar mayúsculas, acentos ni espacios', () => {
    const { detectadas, faltan } = mapearEncabezados(['NOMBRE', 'Apellido', 'D.N.I.', 'Teléfono', 'Fecha de Vencimiento']);
    expect(detectadas.map((d) => d.campo)).toEqual(['nombre', 'apellido', 'documento', 'telefono', 'vencimiento']);
    expect(faltan).toEqual([]);
    expect(normalizarEncabezado('  Fecha de Nacimiento ')).toBe('fechadenacimiento');
  });

  it('lo que no reconoce lo muestra como ignorado, no lo adivina', () => {
    // "Cuota" podría ser el arancel o el importe: no se adivina.
    const { ignoradas } = mapearEncabezados(['Alumno', 'DNI', 'Cuota', 'Saldo']);
    expect(ignoradas).toEqual(['Cuota', 'Saldo']);
  });

  it('avisa si falta el DNI o el nombre', () => {
    expect(mapearEncabezados(['Nombre', 'Vencimiento']).faltan).toEqual(['DNI']);
    expect(mapearEncabezados(['DNI', 'Vencimiento']).faltan).toEqual(['Nombre']);
  });

  it('una columna repetida no pisa a la primera', () => {
    const { porIndice, ignoradas } = mapearEncabezados(['DNI', 'Nombre', 'Documento']);
    expect(porIndice.get(0)).toBe('documento');
    expect(ignoradas).toEqual(['Documento']);
  });

  it('encuentra los títulos aunque arriba haya un renglón de título del listado', () => {
    const matriz = [['Listado de alumnos - 19/09/2026', '', ''], ['', '', ''], ['Alumno', 'DNI', 'Vence']];
    expect(elegirFilaDeEncabezados(matriz)).toBe(2);
  });
});

describe('las celdas', () => {
  it('⭐ una celda de FECHA se manda como 2026-09-30, nunca como el texto yanqui "9/30/26"', () => {
    // 46295 es el 30/09/2026. SheetJS le arma el texto "9/30/26"; mandado así, el 3/4 se
    // leería como 3 de abril siendo 4 de marzo. Se usa el número.
    expect(valorDeCelda(XLSX, fechaExcel(46295))).toBe('2026-09-30');
    expect(valorDeCelda(XLSX, fechaExcel(46085))).toBe('2026-03-04');
  });

  it('un DNI guardado como número sale entero, nunca en notación científica', () => {
    expect(valorDeCelda(XLSX, { t: 'n', v: 30111222, w: '3.01E+07' })).toBe('30111222');
  });

  it('una celda de HORA sale como 07:17, y una de fecha con hora no pierde la hora', () => {
    // El historial de caja: la hora es una fracción de día (07:17 = 0,3035). Leída como fecha
    // daba "1899-12-30", el día cero de Excel.
    expect(valorDeCelda(XLSX, { t: 'n', v: (7 * 60 + 17) / 1440, z: 'hh:mm' })).toBe('07:17');
    expect(valorDeCelda(XLSX, { t: 'n', v: 46027 + (7 * 60 + 17) / 1440, z: 'dd/mm/yyyy hh:mm' })).toBe('2026-01-05 07:17');
  });

  it('una celda vacía o con error de Excel es texto vacío', () => {
    expect(valorDeCelda(XLSX, undefined)).toBe('');
    expect(valorDeCelda(XLSX, { t: 'e', v: 7 })).toBe('');
  });
});

describe('los archivos', () => {
  it('xlsx: fechas, DNI numérico y el número de fila del Excel', async () => {
    const f = archivoXlsx([
      ['Nombre', 'Apellido', 'DNI', 'Vencimiento'],
      ['Ana', 'Gómez', 30111222, fechaExcel(46295)],
      [],
      ['Beto', 'Ríos', '031222333', fechaExcel(46310)],
    ]);

    const r = await leerArchivo(f);

    expect(r.error).toBeUndefined();
    expect(r.filas).toEqual([
      { fila: 2, nombre: 'Ana', apellido: 'Gómez', documento: '30111222', vencimiento: '2026-09-30' },
      // La fila vacía del medio no se manda, pero Beto sigue siendo la fila 4 del Excel.
      { fila: 4, nombre: 'Beto', apellido: 'Ríos', documento: '031222333', vencimiento: '2026-10-15' },
    ]);
  });

  it('CSV del Excel en español: punto y coma y Windows-1252, sin perder el acento ni el cero', async () => {
    const texto = 'Nombre;Apellido;DNI;Vencimiento\r\nJosé;Muñoz;030111222;30/09/2026\r\n';
    // Así lo guarda "CSV (delimitado por comas)" en un Windows en español: un byte por letra.
    const bytes = Uint8Array.from([...texto].map((c) => c.charCodeAt(0)));
    const r = await leerArchivo(new File([bytes], 'socios.csv'));

    expect(r.filas).toEqual([
      { fila: 2, nombre: 'José', apellido: 'Muñoz', documento: '030111222', vencimiento: '30/09/2026' },
    ]);
  });

  it('el "xls" de AccesoGym, que en realidad es una tabla HTML', async () => {
    const html = '<table><tr><td>Alumno</td><td>DNI</td><td>Vence</td></tr>'
      + '<tr><td>ABRIL NOGUEIRA</td><td>40111222</td><td>30/09/2026</td></tr></table>';
    const r = await leerArchivo(new File([html], 'alumnos.xls'));

    expect(r.detectadas.map((d) => d.campo)).toEqual(['nombre', 'documento', 'vencimiento']);
    expect(r.filas[0]).toEqual({ fila: 2, nombre: 'ABRIL NOGUEIRA', documento: '40111222', vencimiento: '30/09/2026' });
  });

  it('sin columna de DNI no manda nada y dice por qué', async () => {
    const r = await leerArchivo(archivoXlsx([['Nombre', 'Vencimiento'], ['Ana', fechaExcel(46295)]]));
    expect(r.error).toMatch(/Falta la columna DNI/);
  });

  it('sin fila de títulos reconocible, lo dice', async () => {
    const r = await leerArchivo(archivoXlsx([['a', 'b'], ['1', '2']]));
    expect(r.error).toMatch(/fila de títulos/);
  });

  it('UTF-8 se lee como UTF-8 (no se confunde con Windows-1252)', () => {
    expect(decodificarTexto(new TextEncoder().encode('José'))).toBe('José');
  });
});

describe('la plantilla', () => {
  it('lo que baja la plantilla lo lee el importador, columna por columna', async () => {
    const bytes = XLSX.write(armarPlantilla(XLSX), { type: 'array', bookType: 'xlsx' });
    const r = await leerArchivo(new File([bytes], 'plantilla.xlsx'));

    expect(r.error).toBeUndefined();
    expect(r.ignoradas).toEqual([]);
    expect(r.filas[0]).toMatchObject({
      nombre: 'Ana', apellido: 'Gómez', documento: '30111222', telefono: '3764123456',
      nacimiento: '1990-05-20', alta: '2025-03-01', vencimiento: '2026-10-15', arancel: 'Pase libre', estado: 'Activo',
    });
    expect(r.filas[1]).toMatchObject({ nombre: 'Roberto Díaz', apellido: '', vencimiento: '2026-09-30' });
  });
});
