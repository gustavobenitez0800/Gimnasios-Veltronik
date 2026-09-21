// ============================================
// VELTRONIK — LEER UN HISTORIAL DE CAJA
// ============================================
// El export de caja del sistema anterior (ControlFit, AccesoGym…) convertido en filas con los
// valores COMO TEXTO, y qué columna es qué. Nada más: igual que con los socios, interpretar
// una fecha, un monto o un medio de pago es trabajo del backend (ImportacionCajaService).
//
// Se apoya en lib/importarSocios para lo que es igual en cualquier planilla: leer el Excel,
// las fechas por su número de serie y el CSV en Windows-1252.
// ============================================

import { decodificarTexto, esBinario, matrizDeHoja, normalizarEncabezado } from './importarSocios';

/** Lo que el backend entiende, con los títulos con que lo escriben los otros sistemas. */
export const COLUMNAS_CAJA = [
  { campo: 'fecha', etiqueta: 'Fecha', sinonimos: ['fecha', 'fechadepago', 'fechapago', 'dia', 'fechayhora', 'fechahora'] },
  { campo: 'hora', etiqueta: 'Hora', sinonimos: ['hora', 'horario'] },
  { campo: 'socio', etiqueta: 'Socio', sinonimos: ['socio', 'nombre', 'cliente', 'alumno', 'nombreyapellido', 'apellidoynombre', 'apellidoynombres', 'nombrecompleto'] },
  { campo: 'documento', etiqueta: 'DNI', sinonimos: ['dni', 'documento', 'doc', 'nrodoc', 'nrodocumento', 'dniid', 'nrodni'] },
  { campo: 'concepto', etiqueta: 'Concepto', sinonimos: ['concepto', 'tipo', 'motivo', 'tipodemovimiento', 'movimiento'] },
  { campo: 'medio', etiqueta: 'Medio de pago', sinonimos: ['medio', 'mediodepago', 'formadepago', 'metodo', 'metododepago'] },
  { campo: 'monto', etiqueta: 'Monto', sinonimos: ['monto', 'importe', 'total', 'valor', 'montototal'] },
  { campo: 'nota', etiqueta: 'Nota', sinonimos: ['nota', 'notas', 'observaciones', 'observacion', 'obs', 'comentario', 'comentarios'] },
  { campo: 'detalle', etiqueta: 'Detalle', sinonimos: ['detalle', 'detalleoriginal', 'descripcion'] },
];

/** Tope de filas: el mismo que el backend (ImportacionCajaService.MAXIMO_FILAS). */
export const MAXIMO_FILAS_CAJA = 20000;

const CAMPO_POR_SINONIMO = new Map(COLUMNAS_CAJA.flatMap((c) => c.sinonimos.map((s) => [s, c.campo])));
const ETIQUETA = Object.fromEntries(COLUMNAS_CAJA.map((c) => [c.campo, c.etiqueta]));

/** Qué columna es qué. Solo por igualdad exacta del título normalizado, como con los socios. */
export function mapearEncabezadosCaja(encabezados) {
  const porIndice = new Map();
  const detectadas = [];
  const ignoradas = [];
  const usados = new Set();

  encabezados.forEach((titulo, indice) => {
    const texto = String(titulo ?? '').trim();
    if (!texto) return;
    const campo = CAMPO_POR_SINONIMO.get(normalizarEncabezado(texto));
    if (campo && !usados.has(campo)) {
      usados.add(campo);
      porIndice.set(indice, campo);
      detectadas.push({ titulo: texto, campo, etiqueta: ETIQUETA[campo] });
    } else {
      ignoradas.push(texto);
    }
  });

  const faltan = [];
  if (!usados.has('fecha')) faltan.push('Fecha');
  if (!usados.has('monto')) faltan.push('Monto');
  if (!usados.has('medio')) faltan.push('Medio de pago');
  return { porIndice, detectadas, ignoradas, faltan };
}

/** La fila de títulos: la de más columnas reconocidas entre las primeras. */
function elegirFilaDeEncabezados(matriz) {
  let mejor = -1;
  let reconocidas = 0;
  for (let i = 0; i < Math.min(matriz.length, 15); i++) {
    const n = (matriz[i] || []).filter((t) => CAMPO_POR_SINONIMO.has(normalizarEncabezado(t))).length;
    if (n > reconocidas) {
      reconocidas = n;
      mejor = i;
    }
  }
  return reconocidas >= 2 ? mejor : -1;
}

/**
 * De la hoja como matriz a las filas que se mandan. Separado de la lectura del archivo para
 * poder probarlo sin un Excel.
 */
export function filasDeCaja(matriz, primeraFila = 1) {
  const base = { filas: [], detectadas: [], ignoradas: [], faltan: [] };
  const iEncabezado = elegirFilaDeEncabezados(matriz);
  if (iEncabezado < 0) {
    return { ...base, error: 'No encontré la fila de títulos. La primera fila tiene que decir qué es cada columna: Fecha, Monto, Medio…' };
  }

  const mapeo = mapearEncabezadosCaja(matriz[iEncabezado]);
  const filas = [];
  for (let i = iEncabezado + 1; i < matriz.length; i++) {
    const celdas = matriz[i];
    if (celdas.every((v) => !String(v).trim())) continue;
    const fila = { fila: primeraFila + i };
    mapeo.porIndice.forEach((campo, indice) => {
      fila[campo] = celdas[indice] ?? '';
    });
    filas.push(fila);
  }

  const resultado = { ...base, filas, detectadas: mapeo.detectadas, ignoradas: mapeo.ignoradas, faltan: mapeo.faltan };
  if (mapeo.faltan.length) {
    return { ...resultado, error: `Falta la columna ${mapeo.faltan.join(', ')}. Sin ella no se puede cargar un movimiento de caja.` };
  }
  if (filas.length === 0) {
    return { ...resultado, error: 'El archivo tiene los títulos pero ningún movimiento debajo.' };
  }
  if (filas.length > MAXIMO_FILAS_CAJA) {
    return { ...resultado, error: `El archivo tiene ${filas.length} movimientos y el máximo por vez es ${MAXIMO_FILAS_CAJA}. Dividilo por fecha.` };
  }
  return resultado;
}

/**
 * Lee el archivo y devuelve las filas listas para mandar, más qué se reconoció.
 *
 * @returns {Promise<{archivo, hoja, filas, detectadas, ignoradas, faltan, error?}>}
 */
export async function leerArchivoDeCaja(file) {
  const XLSX = await import('xlsx');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const libro = esBinario(bytes)
    ? XLSX.read(bytes, { type: 'array', cellNF: true, cellDates: false })
    : XLSX.read(decodificarTexto(bytes), { type: 'string', raw: true });

  const hoja = libro.SheetNames[0];
  const { matriz, primeraFila } = matrizDeHoja(XLSX, libro.Sheets[hoja]);
  return { archivo: file.name, hoja, ...filasDeCaja(matriz, primeraFila) };
}
