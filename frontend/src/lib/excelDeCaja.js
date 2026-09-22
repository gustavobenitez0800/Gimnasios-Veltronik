// ============================================
// VELTRONIK - EL EXCEL DE LA CAJA, PARA EL CONTADOR
// ============================================
// Lo que el dueño le manda al contador todos los días. Tres hojas:
//
//   Resumen            los totales por forma de pago, gastos, el neto y los cierres del día
//   Cobros             cada cobro: hora, socio, DNI, arancel, período, forma de pago, quién cobró
//   Gastos e ingresos  lo que salió o entró sin ser un cobro (los anulados, a la vista)
//
// ⭐ LOS TOTALES VIENEN DEL SERVIDOR, no se suman acá: son la misma cuenta del cierre y de la
// pantalla (CajaReporteService). Si el Excel sumara por su lado, el día que las dos cuentas
// difieran el contador y el dueño estarían mirando números distintos. Las filas de total de
// las hojas de detalle sí llevan una fórmula (=SUMA), para que el contador pueda auditar, y con
// el valor ya calculado adentro: un visor que no calcula muestra el número igual.
//
// ⭐ FECHAS Y MONTOS SON NÚMEROS DE VERDAD, con formato. Un "22/09/2026" escrito como texto no se
// ordena ni se filtra, y un "$ 34.000" como texto no se suma. La fecha se convierte a mano al
// número de serie de Excel: dejárselo a la librería mete el huso horario de la PC en el medio.
// ============================================

const FORMATO_PLATA = '"$" #,##0;[Red]-"$" #,##0';
const FORMATO_FECHA = 'dd/mm/yyyy';
const FORMATO_HORA = 'hh:mm';

const NOMBRE_METODO = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mercadopago: 'Mercado Pago',
  mercado_pago: 'Mercado Pago',
  mp: 'Mercado Pago',
  card: 'Tarjeta',
};

/** "cash", "CASH", "MERCADOPAGO"… → cómo se lee. */
export function nombreDelMetodo(metodo) {
  const clave = String(metodo || '').toLowerCase();
  return NOMBRE_METODO[clave] || metodo || '';
}

const EXCEL_CERO = Date.UTC(1899, 11, 30);

/**
 * "2026-09-22" o "2026-09-22T09:15:30" → el número de serie de Excel (días desde 1899-12-30,
 * con la hora como fracción). Sin pasar por Date local: el resultado no depende de la PC.
 */
export function serieDeExcel(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(iso));
  if (!m) return null;
  const [, a, me, d, h = '0', mi = '0', s = '0'] = m;
  const dias = (Date.UTC(Number(a), Number(me) - 1, Number(d)) - EXCEL_CERO) / 86400000;
  return dias + (Number(h) * 3600 + Number(mi) * 60 + Number(s)) / 86400;
}

/** "2026-09-22" → "22/09/2026", para títulos y el nombre del archivo. */
export function fechaCorta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

const num = (v) => Number(v || 0);
const plata = (v) => ({ t: 'n', v: num(v), z: FORMATO_PLATA });
const fecha = (iso) => {
  const v = serieDeExcel(iso);
  return v == null ? { t: 's', v: '' } : { t: 'n', v: Math.floor(v), z: FORMATO_FECHA };
};
const hora = (iso) => {
  const v = serieDeExcel(iso);
  return v == null ? { t: 's', v: '' } : { t: 'n', v: v - Math.floor(v), z: FORMATO_HORA };
};
const texto = (v) => ({ t: 's', v: v == null ? '' : String(v) });
const entero = (v) => ({ t: 'n', v: num(v) });

/** El rango del reporte dicho como se lee: "22/09/2026" o "01/09/2026 al 22/09/2026". */
export function rangoLegible(reporte) {
  const d = fechaCorta(reporte?.desde);
  const h = fechaCorta(reporte?.hasta);
  return d === h ? d : `${d} al ${h}`;
}

/** Nombre del archivo: el gimnasio y el día, sin caracteres que Windows no acepta. */
export function nombreDelArchivo(reporte) {
  const gimnasio = String(reporte?.gimnasio || '').replace(/[\\/:*?"<>|]+/g, '').trim();
  const cuando = rangoLegible(reporte).replace(/\//g, '-');
  return `${gimnasio ? `${gimnasio} - ` : ''}Caja ${cuando}.xlsx`;
}

/** Una hoja a partir de filas de celdas ya tipadas. */
function hoja(XLSX, filas, anchos) {
  const ws = {};
  let maxCol = 0;
  filas.forEach((fila, r) => {
    fila.forEach((celda, c) => {
      if (celda == null) return;
      ws[XLSX.utils.encode_cell({ r, c })] = celda;
      if (c > maxCol) maxCol = c;
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(filas.length - 1, 0), c: maxCol } });
  ws['!cols'] = anchos.map((wch) => ({ wch }));
  return ws;
}

/** =SUMA de una columna de detalle, con el valor ya puesto. */
function suma(XLSX, col, desde, hasta, valor) {
  const letra = XLSX.utils.encode_col(col);
  return { t: 'n', f: `SUM(${letra}${desde + 1}:${letra}${hasta + 1})`, v: num(valor), z: FORMATO_PLATA };
}

function hojaResumen(XLSX, rep) {
  const t = rep.totales || {};
  const filas = [
    [texto(`${rep.gimnasio || 'Gimnasio'} · Caja del ${rangoLegible(rep)}`)],
    [texto('Generado el'), fecha(rep.generado), hora(rep.generado)],
    [],
    [texto('COBROS')],
    [texto('Efectivo'), plata(t.efectivo)],
    [texto('Transferencia'), plata(t.transferencia)],
    [texto('Mercado Pago'), plata(t.mercadopago)],
  ];
  // Tarjeta y "otros" solo si hubo: una fila en cero que nunca se usa es ruido para el contador.
  if (num(t.tarjeta) > 0) filas.push([texto('Tarjeta'), plata(t.tarjeta)]);
  if (num(t.otros) > 0) filas.push([texto('Otros medios'), plata(t.otros)]);
  filas.push(
    [texto('Total cobrado'), plata(t.cobrado)],
    [texto('Cantidad de cobros'), entero(t.cantidadCobros)],
    [],
    [texto('GASTOS E INGRESOS QUE NO SON COBROS')],
    [texto('Ingresos en efectivo'), plata(t.ingresosEfectivo)],
    [texto('Ingresos por otros medios'), plata(t.ingresosOtros)],
    [texto('Gastos pagados en efectivo'), plata(t.egresosEfectivo)],
    [texto('Gastos pagados por otros medios'), plata(t.egresosOtros)],
    [],
    [texto('RESULTADO (todo lo que entró menos todo lo que salió)'), plata(t.neto)],
  );

  const cierres = rep.cierres || [];
  filas.push([], [texto('CIERRES DE CAJA')]);
  if (!cierres.length) {
    filas.push([texto('No se cerró la caja en este período.')]);
  } else {
    filas.push([
      texto('Fecha'), texto('Hora'), texto('Cerró'), texto('Quedaba de antes'), texto('Efectivo cobrado'),
      texto('Otros ingresos en efectivo'), texto('Gastos en efectivo'), texto('Había en el cajón'),
      texto('Retiro'), texto('Quedó en caja'), texto('Transferencia y MP'), texto('Nota'),
    ]);
    cierres.forEach((c) => filas.push([
      fecha(c.hasta), hora(c.hasta), texto(c.cerradoPor), plata(c.fondo), plata(c.efectivo),
      plata(c.ingresosEfectivo), plata(c.egresosEfectivo), plata(c.enElCajon),
      // Un cierre de la época del arqueo a ciegas no tiene retiro: vacío, no un cero que diría
      // que ese día no se retiró nada.
      c.retiro == null ? texto('') : plata(c.retiro),
      c.quedaEnCaja == null ? texto('') : plata(c.quedaEnCaja),
      plata(num(c.transferencia) + num(c.mercadopago)), texto(c.nota),
    ]));
  }
  return hoja(XLSX, filas, [52, 16, 16, 16, 16, 22, 18, 18, 14, 14, 18, 30]);
}

function hojaCobros(XLSX, rep) {
  const cobros = rep.cobros || [];
  const filas = [[
    texto('Fecha'), texto('Hora'), texto('Socio'), texto('DNI'), texto('Arancel'), texto('Período desde'),
    texto('Período hasta'), texto('Forma de pago'), texto('Monto'), texto('Cobró'), texto('Nota'),
  ]];
  cobros.forEach((c) => filas.push([
    fecha(c.fecha), hora(c.fecha), texto(c.socio || 'Sin socio'), texto(c.dni), texto(c.arancel),
    fecha(c.periodoDesde), fecha(c.periodoHasta), texto(nombreDelMetodo(c.metodo)), plata(c.monto),
    texto(c.cobradoPor), texto(c.nota),
  ]));
  if (cobros.length) {
    filas.push([], [texto('Total'), null, null, null, null, null, null, null,
      suma(XLSX, 8, 1, cobros.length, rep.totales?.cobrado)]);
  } else {
    filas.push([texto('No hubo cobros en este período.')]);
  }
  const ws = hoja(XLSX, filas, [12, 8, 30, 13, 26, 13, 13, 15, 13, 16, 30]);
  if (cobros.length) ws['!autofilter'] = { ref: `A1:K${cobros.length + 1}` };
  return ws;
}

function hojaMovimientos(XLSX, rep) {
  const movs = rep.movimientos || [];
  const filas = [[
    texto('Fecha'), texto('Hora'), texto('Tipo'), texto('Rubro'), texto('Detalle'), texto('Forma'),
    texto('¿Salió o entró al cajón?'), texto('Monto'), texto('Anotó'), texto('Estado'),
  ]];
  movs.forEach((m) => filas.push([
    fecha(m.fecha), hora(m.fecha), texto(m.tipo === 'EGRESO' ? 'Gasto' : 'Ingreso'), texto(m.categoria),
    texto(m.detalle), texto(nombreDelMetodo(m.metodo)), texto(m.tocaElCajon ? 'Sí' : 'No'), plata(m.monto),
    texto(m.hechoPor),
    // ⚠️ El anulado se LISTA, no desaparece: un gasto que se puede borrar del reporte es
    // justamente lo que no queremos que se pueda hacer.
    texto(m.anulado
      ? `Anulado${m.anuladoPor ? ` por ${m.anuladoPor}` : ''}${m.motivoAnulacion ? `: ${m.motivoAnulacion}` : ''}`
      : 'Vigente'),
  ]));
  if (!movs.length) {
    filas.push([texto('No hubo gastos ni ingresos sueltos en este período.')]);
  } else {
    const t = rep.totales || {};
    const ultima = movs.length;
    // SUMAR.SI.CONJUNTO: solo los vigentes de cada tipo. Con el valor del servidor adentro.
    const sumaSi = (tipo, valor) => ({
      t: 'n', f: `SUMIFS(H2:H${ultima + 1},C2:C${ultima + 1},"${tipo}",J2:J${ultima + 1},"Vigente")`,
      v: num(valor), z: FORMATO_PLATA,
    });
    filas.push([],
      [texto('Total gastos (sin anulados)'), null, null, null, null, null, null,
        sumaSi('Gasto', num(t.egresosEfectivo) + num(t.egresosOtros))],
      [texto('Total ingresos (sin anulados)'), null, null, null, null, null, null,
        sumaSi('Ingreso', num(t.ingresosEfectivo) + num(t.ingresosOtros))]);
  }
  const ws = hoja(XLSX, filas, [12, 8, 10, 16, 34, 15, 22, 13, 16, 34]);
  if (movs.length) ws['!autofilter'] = { ref: `A1:J${movs.length + 1}` };
  return ws;
}

/** El libro entero. Separado de la descarga para poder probarlo. */
export function armarLibroDeCaja(XLSX, reporte) {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaResumen(XLSX, reporte), 'Resumen');
  XLSX.utils.book_append_sheet(libro, hojaCobros(XLSX, reporte), 'Cobros');
  XLSX.utils.book_append_sheet(libro, hojaMovimientos(XLSX, reporte), 'Gastos e ingresos');
  return libro;
}

/** Arma el Excel y lo descarga. La librería se baja recién acá: pesa y casi nunca se usa. */
export async function descargarExcelDeCaja(reporte) {
  const XLSX = await import('xlsx');
  XLSX.writeFile(armarLibroDeCaja(XLSX, reporte), nombreDelArchivo(reporte));
}
