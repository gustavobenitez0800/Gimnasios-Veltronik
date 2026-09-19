// ============================================
// VELTRONIK — LEER UN ARCHIVO DE SOCIOS
// ============================================
// Convierte el Excel (o CSV, o el "xls" que es una tabla HTML) en filas con los valores
// COMO TEXTO, y reconoce qué columna es qué. Nada más.
//
// ⚠️ ESTO NO VALIDA NI "ARREGLA" NINGÚN DATO. Interpretar una fecha, limpiar un documento
// o decidir qué significa "Baja" es trabajo del backend (ValorImportado.java), que es el
// único que decide qué entra a la base. Si la pantalla corrigiera algo antes de mandarlo,
// habría dos criterios, y el día que no coincidan el error sería invisible.
//
// La única excepción es la que sigue, y es justamente para NO interpretar.
//
// ⭐ LAS FECHAS DE EXCEL NO SE LEEN POR SU TEXTO. Una celda de fecha tiene dos caras: el
// número de serie (46295) y el texto que muestra. SheetJS arma ese texto en formato
// yanqui: la misma celda sale "9/30/26". Mandar eso haría que el backend —que lee
// día/mes/año, como corresponde en Argentina— leyera "3/4/26" (4 de marzo) como 3 de
// abril, sin ningún error. Por eso de una celda de fecha se toma el número y se manda
// "2026-09-30", que no es ambiguo en ningún país.
// ============================================

/** Lo que el backend entiende, con los títulos con que la gente lo escribe. */
export const COLUMNAS = [
  { campo: 'nombre', etiqueta: 'Nombre', sinonimos: ['nombre', 'nombres', 'firstname', 'name', 'nombreyapellido', 'nombreapellido', 'nombrecompleto', 'apellidoynombre', 'apellidoynombres', 'apellidonombre', 'fullname', 'socio', 'alumno', 'cliente'] },
  { campo: 'apellido', etiqueta: 'Apellido', sinonimos: ['apellido', 'apellidos', 'lastname', 'surname'] },
  { campo: 'documento', etiqueta: 'DNI', sinonimos: ['dni', 'documento', 'doc', 'nrodoc', 'nrodocumento', 'nrodedocumento', 'numerodocumento', 'numerodedocumento', 'nrodni', 'document', 'dnipasaporte', 'pasaporte', 'cuil', 'cuit'] },
  { campo: 'telefono', etiqueta: 'Teléfono', sinonimos: ['telefono', 'tel', 'telefonos', 'celular', 'cel', 'movil', 'whatsapp', 'phone', 'telefonocelular', 'nrotelefono'] },
  { campo: 'email', etiqueta: 'Email', sinonimos: ['email', 'mail', 'correo', 'correoelectronico', 'emailaddress'] },
  { campo: 'nacimiento', etiqueta: 'Fecha de nacimiento', sinonimos: ['fechadenacimiento', 'fechanacimiento', 'nacimiento', 'fnac', 'fechanac', 'fnacimiento', 'cumpleanos', 'birthdate'] },
  { campo: 'alta', etiqueta: 'Alta', sinonimos: ['alta', 'fechadealta', 'fechaalta', 'inicio', 'fechadeinicio', 'fechainicio', 'ingreso', 'fechadeingreso', 'fechaingreso', 'sociodesde', 'desde'] },
  { campo: 'vencimiento', etiqueta: 'Vencimiento', sinonimos: ['vencimiento', 'vence', 'venceel', 'venc', 'vto', 'fechadevencimiento', 'fechavencimiento', 'fechavto', 'hasta', 'validohasta', 'proximovencimiento'] },
  { campo: 'arancel', etiqueta: 'Arancel', sinonimos: ['arancel', 'plan', 'abono', 'actividad', 'membresia', 'tipodeabono', 'servicio'] },
  { campo: 'estado', etiqueta: 'Estado', sinonimos: ['estado', 'situacion', 'condicion', 'activo'] },
  { campo: 'notas', etiqueta: 'Notas', sinonimos: ['notas', 'nota', 'observaciones', 'observacion', 'obs', 'comentarios', 'comentario'] },
  { campo: 'direccion', etiqueta: 'Dirección', sinonimos: ['direccion', 'domicilio', 'address'] },
  { campo: 'contactoEmergencia', etiqueta: 'Contacto de emergencia', sinonimos: ['contactodeemergencia', 'contactoemergencia', 'encasodeemergencia', 'emergencia'] },
  { campo: 'telefonoEmergencia', etiqueta: 'Teléfono de emergencia', sinonimos: ['telefonodeemergencia', 'telefonoemergencia', 'telemergencia'] },
  { campo: 'genero', etiqueta: 'Género', sinonimos: ['genero', 'sexo', 'gender'] },
];

/** Tope de filas: el mismo que el backend (ImportacionSociosService.MAXIMO_FILAS). */
export const MAXIMO_FILAS = 5000;

/** "Fecha de Vencimiento" → "fechadevencimiento". Sin acentos, sin espacios, sin signos. */
export function normalizarEncabezado(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const CAMPO_POR_SINONIMO = new Map(
  COLUMNAS.flatMap((c) => c.sinonimos.map((s) => [s, c.campo]))
);
const ETIQUETA = Object.fromEntries(COLUMNAS.map((c) => [c.campo, c.etiqueta]));

/**
 * Qué columna del archivo es qué campo. Solo por igualdad exacta del título normalizado:
 * adivinar parecidos ("Cuota" → ¿arancel o importe?) es cómo una columna termina cargada
 * donde no va. Lo que no se reconoce se muestra como ignorado, para que se vea.
 */
export function mapearEncabezados(encabezados) {
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
  if (!usados.has('documento')) faltan.push('DNI');
  if (!usados.has('nombre') && !usados.has('apellido')) faltan.push('Nombre');

  return { porIndice, detectadas, ignoradas, faltan, tieneVencimiento: usados.has('vencimiento') };
}

/**
 * Cuál de las primeras filas es la de títulos. Muchos exports traen antes un renglón tipo
 * "Listado de alumnos — 19/09/2026": se elige la fila con más columnas reconocidas.
 */
export function elegirFilaDeEncabezados(matriz) {
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

// ── De celda a texto ────────────────────────────────────────────────────────

const dosCifras = (n) => String(n).padStart(2, '0');

/** El valor de una celda, como texto. Ver arriba por qué las fechas son la excepción. */
export function valorDeCelda(XLSX, celda) {
  if (!celda || celda.t === 'z' || celda.t === 'e') return '';
  if (celda.t === 'd' && celda.v instanceof Date) {
    const d = celda.v;
    return `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`;
  }
  if (celda.t === 'n') {
    if (celda.z && XLSX.SSF.is_date(celda.z)) {
      const p = XLSX.SSF.parse_date_code(celda.v);
      if (p) return `${p.y}-${dosCifras(p.m)}-${dosCifras(p.d)}`;
    }
    // Un DNI o un teléfono guardado como número: el número entero, nunca "3.01E+07".
    if (Number.isInteger(celda.v)) return String(celda.v);
    return celda.w ?? String(celda.v);
  }
  if (celda.t === 'b') return celda.v ? 'Sí' : 'No';
  return String(celda.v ?? '');
}

/** La hoja como matriz de textos, y en qué fila del Excel empieza. */
export function matrizDeHoja(XLSX, hoja) {
  if (!hoja || !hoja['!ref']) return { matriz: [], primeraFila: 1 };
  const rango = XLSX.utils.decode_range(hoja['!ref']);
  const matriz = [];
  for (let r = rango.s.r; r <= rango.e.r; r++) {
    const fila = [];
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      fila.push(valorDeCelda(XLSX, hoja[XLSX.utils.encode_cell({ r, c })]));
    }
    matriz.push(fila);
  }
  return { matriz, primeraFila: rango.s.r + 1 };
}

// ── De archivo a filas ──────────────────────────────────────────────────────

/**
 * Texto de un archivo que no es un Excel binario (CSV, o el "xls" que es HTML).
 *
 * El Excel en español guarda los CSV en Windows-1252, no en UTF-8: leído como UTF-8,
 * "José" llega como "Jos�". Se prueba UTF-8 estricto y, si no es válido, Windows-1252.
 */
export function decodificarTexto(bytes) {
  try {
    const texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // El BOM que agrega el Bloc de notas al guardar en UTF-8: no es parte del primer título.
    return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** ¿Es un Excel de verdad (xlsx = zip, xls = OLE) o texto disfrazado? */
function esBinario(bytes) {
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  return zip || ole;
}

/**
 * Lee el archivo y devuelve las filas listas para mandar, más qué se reconoció.
 *
 * @returns {Promise<{archivo, hoja, filas, detectadas, ignoradas, faltan, tieneVencimiento, error?}>}
 */
export async function leerArchivo(file) {
  const XLSX = await import('xlsx');
  const bytes = new Uint8Array(await file.arrayBuffer());

  const libro = esBinario(bytes)
    ? XLSX.read(bytes, { type: 'array', cellNF: true, cellDates: false })
    // raw: el CSV y el HTML quedan como texto tal cual. Sin esto, SheetJS convierte
    // "030111222" en el número 30111222 (se pierde el cero) y adivina fechas a su manera.
    : XLSX.read(decodificarTexto(bytes), { type: 'string', raw: true });

  const hoja = libro.SheetNames[0];
  const { matriz, primeraFila } = matrizDeHoja(XLSX, libro.Sheets[hoja]);

  const base = { archivo: file.name, hoja, filas: [], detectadas: [], ignoradas: [], faltan: [], tieneVencimiento: false };
  const iEncabezado = elegirFilaDeEncabezados(matriz);
  if (iEncabezado < 0) {
    return { ...base, error: 'No encontré la fila de títulos. La primera fila tiene que decir qué es cada columna: Nombre, DNI, Vencimiento…' };
  }

  const mapeo = mapearEncabezados(matriz[iEncabezado]);
  const filas = [];
  for (let i = iEncabezado + 1; i < matriz.length; i++) {
    const celdas = matriz[i];
    if (celdas.every((v) => !String(v).trim())) continue;
    // El número de fila del EXCEL, no el índice: el error tiene que decir "fila 47" y que
    // en el Excel sea la 47.
    const fila = { fila: primeraFila + i };
    mapeo.porIndice.forEach((campo, indice) => {
      fila[campo] = celdas[indice] ?? '';
    });
    filas.push(fila);
  }

  const resultado = { ...base, filas, detectadas: mapeo.detectadas, ignoradas: mapeo.ignoradas, faltan: mapeo.faltan, tieneVencimiento: mapeo.tieneVencimiento };
  if (mapeo.faltan.length) {
    return { ...resultado, error: `Falta la columna ${mapeo.faltan.join(' y ')}. Sin ella no se puede reconocer a cada socio.` };
  }
  if (filas.length === 0) {
    return { ...resultado, error: 'El archivo tiene los títulos pero ningún socio debajo.' };
  }
  if (filas.length > MAXIMO_FILAS) {
    return { ...resultado, error: `El archivo tiene ${filas.length} socios y el máximo por vez es ${MAXIMO_FILAS}. Dividilo en dos.` };
  }
  return resultado;
}

// ── La plantilla ────────────────────────────────────────────────────────────

const TITULOS_PLANTILLA = ['Nombre', 'Apellido', 'DNI', 'Teléfono', 'Email', 'Fecha de nacimiento', 'Alta', 'Vencimiento', 'Arancel', 'Estado', 'Notas'];

const INSTRUCCIONES = [
  ['Cómo llenar la planilla de socios'],
  [''],
  ['1. Una fila por socio. No cambies los títulos de la primera fila de la hoja "Socios".'],
  ['2. Obligatorios: Nombre y DNI. Muy recomendado: Vencimiento (sin él, el socio no aparece en vencidos).'],
  ['3. Si tenés nombre y apellido juntos en una sola columna, ponelos en "Nombre" y dejá "Apellido" vacío.'],
  ['4. Las fechas van día/mes/año: 30/09/2026.'],
  ['5. DNI y Teléfono: mejor con formato Texto, para que Excel no les saque el cero ni los convierta en 3,01E+07.'],
  ['6. Arancel: el nombre tal cual está en Veltronik (no importan mayúsculas ni acentos). Si no existe, el socio entra sin arancel.'],
  ['7. Estado: "Activo" o "Baja". Vacío es Activo.'],
  [''],
  ['Antes de guardar nada, Veltronik te muestra qué va a pasar con cada fila.'],
  ['Podés subir el mismo archivo dos veces: no duplica a nadie. Una celda vacía no borra lo que ya estaba cargado.'],
  ['¿Venís de otro sistema? Podés subir directamente el Excel que te baja: Veltronik reconoce las columnas más comunes.'],
];

/** Número de serie de Excel de una fecha, sin pasar por la zona horaria del navegador. */
function serieExcel(anio, mes, dia) {
  return (Date.UTC(anio, mes - 1, dia) - Date.UTC(1899, 11, 30)) / 86400000;
}

/** El libro de la plantilla. Separado de la descarga para poder testearlo. */
export function armarPlantilla(XLSX) {
  const fecha = (a, m, d) => ({ t: 'n', v: serieExcel(a, m, d), z: 'dd/mm/yyyy' });
  const texto = (v) => ({ t: 's', v });
  const ejemplos = [
    [texto('Ana'), texto('Gómez'), texto('30111222'), texto('3764123456'), texto('ana@mail.com'), fecha(1990, 5, 20), fecha(2025, 3, 1), fecha(2026, 10, 15), texto('Pase libre'), texto('Activo'), texto('')],
    [texto('Roberto Díaz'), texto(''), texto('28999888'), texto(''), texto(''), texto(''), texto(''), fecha(2026, 9, 30), texto(''), texto(''), texto('Nombre y apellido juntos: va entero en "Nombre"')],
  ];

  const socios = XLSX.utils.aoa_to_sheet([TITULOS_PLANTILLA]);
  XLSX.utils.sheet_add_aoa(socios, ejemplos, { origin: 'A2' });
  socios['!cols'] = TITULOS_PLANTILLA.map((t) => ({ wch: Math.max(12, t.length + 4) }));

  const ayuda = XLSX.utils.aoa_to_sheet(INSTRUCCIONES);
  ayuda['!cols'] = [{ wch: 110 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, socios, 'Socios');
  XLSX.utils.book_append_sheet(libro, ayuda, 'Cómo llenarla');
  return libro;
}

export async function descargarPlantilla() {
  const XLSX = await import('xlsx');
  XLSX.writeFile(armarPlantilla(XLSX), 'Veltronik - plantilla de socios.xlsx');
}
