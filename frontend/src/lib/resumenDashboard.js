// ============================================
// VELTRONIK - DEL RESUMEN DEL SERVIDOR A LO QUE PINTA EL DASHBOARD
// ============================================
// El servidor manda el resultado ya contado (el padrón por situación, una serie de ingresos
// por mes, las alertas más urgentes) y este módulo lo convierte a lo que la pantalla dibuja.
// Vive afuera del controlador para poder probarlo sin montar la pantalla.
//
// ⭐ EL MES EN CURSO TODAVÍA NO TERMINÓ, Y TODO LO DE ACÁ LO TRATA ASÍ.
//
// Hasta el 2026-09-21 el mes en curso entraba en todas las cuentas como si fuera un mes
// cerrado, y eso mentía de tres maneras:
//   · La PREDICCIÓN hacía la regresión con septiembre "a medias" (21 días de 30) al final:
//     un mes flojo inventado que arrastraba la tendencia. El día 1 se desplomaba y a fin de
//     mes se recuperaba: el número se movía por el calendario, no por el negocio.
//   · La COMPARATIVA decía "bajaron 2% vs mes anterior" comparando 21 días contra un mes
//     entero. El día 1 decía siempre "bajaron 95%".
//   · El GRÁFICO dibujaba el último punto igual que los demás.
//
// Ahora: la predicción usa solo meses CERRADOS; la comparativa es contra el MISMO tramo del mes
// pasado (del 1 al 21 contra del 1 al 21); y el gráfico sigue mostrando el mes en curso —el
// dueño quiere ver cómo viene el mes—, pero marcado como lo que es.
//
// ⚠️ Proyectar el mes ("van 21 días, a este ritmo cierra en tanto") NO es la solución: en un
// gimnasio la plata no entra pareja, la mayoría paga los primeros días. Una proyección lineal a
// mitad de mes da de más, y el día 3 da muchísimo de más.
// ============================================

/** Un mes que arrancó a cobrar después de este día no es un mes entero. */
const DIA_LIMITE_PRIMER_MES = 7;

/** Los meses como los escribe la app en el gráfico: "Sep", "Oct". */
function nombreDeMes(fecha) {
  const n = fecha.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** "septiembre", "octubre": para las frases. */
function nombreLargoDeMes(fecha) {
  return fecha.toLocaleDateString('es-AR', { month: 'long' });
}

/** La clave "2026-09" de una fecha, para cruzar contra la serie del servidor. */
function claveDeMes(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

/** La serie del servidor, indexada por mes. */
function porMes(serie) {
  const mapa = new Map();
  (serie || []).forEach((m) => {
    const fecha = new Date(m.mes);
    if (!Number.isNaN(fecha.getTime())) mapa.set(claveDeMes(fecha), Number(m.total) || 0);
  });
  return mapa;
}

/**
 * Qué día es hoy PARA EL GIMNASIO. El servidor lo manda en hora de Argentina ("2026-09-21");
 * si no viene (un servidor viejo), el reloj de la PC.
 *
 * <p>⚠️ No se usa el reloj de la PC cuando el servidor lo dice: una computadora con la zona mal
 * puesta, a las 22:00 del 30, ya estaba en el mes siguiente y corría el gráfico un lugar.</p>
 */
export function fechaDeHoy(hoy) {
  if (typeof hoy === 'string' && /^\d{4}-\d{2}-\d{2}/.test(hoy)) {
    const [anio, mes, dia] = hoy.slice(0, 10).split('-').map(Number);
    return new Date(anio, mes - 1, dia);
  }
  return new Date();
}

/** Una fecha que viene del servidor ("2026-01-05T07:17:00"), o null. */
function fechaDelServidor(texto) {
  if (!texto) return null;
  const f = new Date(texto);
  return Number.isNaN(f.getTime()) ? null : f;
}

// ── El gráfico ──────────────────────────────────────────────────────────────

/**
 * Ingresos de los últimos meses para el gráfico: al menos `minimo`, y hasta `maximo` si hay
 * cobros más viejos. El ÚLTIMO punto es el mes en curso, y se devuelve cuál es para dibujarlo
 * distinto.
 *
 * Un mes sin cobros vale 0 y aparece igual: si se saltearan, el gráfico mostraría una línea
 * que se salta los meses malos, que son justo los que hay que ver.
 *
 * Se estira hasta el mes más viejo con cobros: un gimnasio que importó su historial (ADR-014)
 * tiene cobros desde enero, y con seis meses fijos el dueño no veía el primer trimestre. Un
 * gimnasio nuevo sigue viendo seis, no doce con seis ceros adelante.
 */
export function graficoDeIngresos(serie, minimo = 6, maximo = minimo, hoy = undefined) {
  const mapa = porMes(serie);
  const fecha = fechaDeHoy(hoy);
  const labels = [];
  const data = [];

  // Cuántos meses atrás está el cobro más viejo. Se mira la serie entera, no solo la ventana:
  // con cobros de hace dos años y un hueco en el medio, igual corresponden los doce.
  let masViejo = 0;
  (serie || []).forEach((m) => {
    const f = new Date(m.mes);
    if (Number.isNaN(f.getTime()) || !(Number(m.total) > 0)) return;
    masViejo = Math.max(masViejo, (fecha.getFullYear() - f.getFullYear()) * 12 + fecha.getMonth() - f.getMonth());
  });
  const meses = Math.min(maximo, Math.max(minimo, masViejo + 1));

  for (let i = meses - 1; i >= 0; i -= 1) {
    const d = new Date(fecha.getFullYear(), fecha.getMonth() - i, 1);
    labels.push(nombreDeMes(d));
    data.push(mapa.get(claveDeMes(d)) || 0);
  }
  return {
    labels,
    data,
    // El último punto es el mes en curso: la pantalla lo dibuja hueco y con la línea punteada.
    enCurso: data.length - 1,
    mesEnCurso: nombreLargoDeMes(fecha),
    dia: fecha.getDate(),
  };
}

/**
 * El monto del eje del gráfico, corto y en castellano: "$8,5 M", "$850 mil", "$900".
 * Antes decía "$8500.0k": cuatro cifras con un punto y una "k" en inglés.
 */
export function montoCorto(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1_000_000) {
    return `$${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  }
  if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000).toLocaleString('es-AR')} mil`;
  return `$${Math.round(n)}`;
}

// ── La predicción ───────────────────────────────────────────────────────────

/**
 * Los ingresos de los meses CERRADOS, del primero al anterior al de hoy, con los meses sin
 * cobros en cero.
 *
 * <ul>
 *   <li><b>Sin el mes en curso</b>: todavía no terminó.</li>
 *   <li><b>Sin el primer mes si arrancó tarde</b>: un gimnasio que empezó a cobrar un 20 tiene
 *       un primer mes de diez días, y contarlo entero inventa un crecimiento que no pasó.</li>
 *   <li><b>Con los huecos en cero</b> (el arreglo del 2026-09-03): si la serie trae junio,
 *       julio y septiembre, agosto vale cero. Salteándolo, la regresión tomaba julio y
 *       septiembre como consecutivos y el mes malo desaparecía de la cuenta en vez de pesar.</li>
 * </ul>
 */
function ingresosDeMesesCerrados(serie, fecha, primerCobro) {
  const mapa = porMes(serie);
  const conCobros = [...mapa.keys()].sort();
  if (conCobros.length === 0) return [];

  const [anio, mes] = conCobros[0].split('-').map(Number);
  const cursor = new Date(anio, mes - 1, 1);
  const primero = fechaDelServidor(primerCobro);
  if (primero && claveDeMes(primero) === conCobros[0] && primero.getDate() > DIA_LIMITE_PRIMER_MES) {
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const mesEnCurso = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  const valores = [];
  while (cursor < mesEnCurso) {
    valores.push(mapa.get(claveDeMes(cursor)) || 0);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return valores;
}

/**
 * La predicción del mes que viene: regresión lineal sobre los meses cerrados.
 *
 * Los meses cerrados son x = 0…n−1, el mes en curso es x = n y el que se predice —el que viene—
 * es x = n + 1. Hacen falta dos meses cerrados: con uno no hay tendencia, y mostrar un número
 * ahí sería inventarlo.
 *
 * @param {Array} serie la serie mensual del servidor
 * @param {{hoy?: string, primerCobro?: string}} contexto lo que manda el resumen
 * @returns {{suficiente, mes, mesesCerrados, predicted, confidence, trend, percentChange, lastMonthAvg?}}
 */
export function prediccionDeIngresos(serie, { hoy, primerCobro } = {}) {
  const fecha = fechaDeHoy(hoy);
  const valores = ingresosDeMesesCerrados(serie, fecha, primerCobro);
  const base = {
    mes: nombreLargoDeMes(new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1)),
    mesesCerrados: valores.length,
  };

  if (valores.length < 2) {
    return { ...base, suficiente: false, predicted: 0, confidence: 0, trend: 'neutral', percentChange: '0.0' };
  }

  const n = valores.length;
  let sumX = 0; let sumY = 0; let sumXY = 0; let sumX2 = 0;
  valores.forEach((y, x) => {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const predicted = intercept + slope * (n + 1);

  const avg = sumY / n;
  const variance = valores.reduce((s, v) => s + ((v - avg) ** 2), 0) / n;
  const coefficient = (Math.sqrt(variance) / avg) || 0;
  const confidence = Math.max(20, Math.min(95, 100 - coefficient * 100));
  const percentChange = avg > 0 ? ((predicted - avg) / avg) * 100 : 0;

  return {
    ...base,
    suficiente: true,
    predicted: Math.max(0, Math.round(predicted)),
    confidence: Math.round(confidence),
    trend: slope > 0 ? 'up' : slope < 0 ? 'down' : 'neutral',
    percentChange: percentChange.toFixed(1),
    lastMonthAvg: Math.round(avg),
  };
}

// ── El mes en curso contra el mismo tramo del mes pasado ────────────────────

/**
 * Cómo viene el mes: lo cobrado hasta hoy contra lo cobrado el mes pasado hasta el mismo día.
 *
 * @returns {{actual, anterior, cambio, dia, mesAnterior} | null} null si el servidor no manda
 *   el tramo anterior: comparar contra el mes entero es justo lo que no hay que hacer.
 */
export function comparacionDelMes(ingresos, hoy) {
  if (ingresos?.delMismoPeriodoAnterior == null) return null;
  const actual = Number(ingresos.delMes) || 0;
  const anterior = Number(ingresos.delMismoPeriodoAnterior) || 0;
  const fecha = fechaDeHoy(hoy);
  const mesAnterior = new Date(fecha.getFullYear(), fecha.getMonth() - 1, 1);
  const diasDelMesAnterior = new Date(fecha.getFullYear(), fecha.getMonth(), 0).getDate();
  return {
    actual,
    anterior,
    // Sin cobros el mes pasado no hay porcentaje: "subió infinito" no le dice nada a nadie.
    cambio: anterior > 0 ? Math.round(((actual - anterior) / anterior) * 100) : null,
    // El 31 de marzo se compara hasta el 28 de febrero: el servidor recorta igual.
    dia: Math.min(fecha.getDate(), diasDelMesAnterior),
    mesAnterior: nombreLargoDeMes(mesAnterior),
  };
}

// ── Alertas ─────────────────────────────────────────────────────────────────

const dias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;

/**
 * Las alertas de vencimiento. El servidor manda quién y cuántos días le faltan (negativo = ya
 * venció), ya ordenadas de la más cercana a hoy a la más lejana; el texto se arma acá.
 *
 * Los umbrales son los de siempre: vencido (rojo), vence en 3 días o menos (urgente), en 7 o
 * menos (aviso). El texto dice CUÁNDO: "vencida" a secas no distinguía al que venció ayer
 * —hay que llamarlo hoy— del que venció hace tres meses.
 */
export function alertasDeVencimiento(vencimientos) {
  return (vencimientos?.primeros || []).map((a) => {
    const d = a.diasRestantes;
    const id = a.socioId ?? a.nombre;
    if (d <= 0) {
      return {
        id,
        type: 'expired',
        message: `${a.nombre} - ${d === 0 ? 'Venció hoy' : `Venció hace ${dias(Math.abs(d))}`}`,
        priority: 'high',
        daysAgo: Math.abs(d),
      };
    }
    return {
      id,
      type: d <= 3 ? 'urgent' : 'warning',
      message: `${a.nombre} - Vence en ${dias(d)}`,
      priority: d <= 3 ? 'high' : 'medium',
      daysRemaining: d,
    };
  });
}

// ── El padrón ───────────────────────────────────────────────────────────────

/**
 * La torta del padrón, con las palabras de la tarjeta de arriba: "al día", no "activos".
 *
 * Los cuatro pedazos suman el total. "Suspendidos" (que viajó siempre en cero) se reemplazó por
 * "Sin cuota" —la palabra de la lista de Socios—: el socio que sigue en el padrón sin
 * vencimiento cargado, que antes se contaba como al día aunque nadie supiera si pagó.
 */
export function graficoDeSocios(socios) {
  return {
    labels: ['Al día', 'Vencidos', 'Sin cuota', 'Bajas'],
    data: [
      Number(socios?.activos) || 0,
      Number(socios?.vencidos) || 0,
      Number(socios?.sinFecha) || 0,
      Number(socios?.inactivos) || 0,
    ],
    colors: ['#22C55E', '#EF4444', '#F59E0B', '#6B7280'],
  };
}

// ── Insights ────────────────────────────────────────────────────────────────

/** Los insights del día, con los números del resumen. */
export function insightsDelDia(resumen) {
  const insights = [];
  const socios = resumen?.socios;
  const porVencer = Number(resumen?.vencimientos?.estaSemana) || 0;

  if (porVencer > 0) {
    insights.push({
      icon: 'clock',
      type: 'warning',
      title: 'Membresías por vencer',
      message: `${porVencer} socio${porVencer > 1 ? 's' : ''} con membresía próxima a vencer esta semana`,
    });
  }

  // Sobre los socios que SIGUEN SIÉNDOLO: contar a los dados de baja en el total bajaba el
  // porcentaje con gente que ya no viene, y el número dejaba de decir cómo está el padrón.
  const vigentes = (Number(socios?.total) || 0) - (Number(socios?.inactivos) || 0);
  if (vigentes > 0) {
    const activos = Number(socios?.activos) || 0;
    const tasa = ((activos / vigentes) * 100).toFixed(0);
    insights.push({
      icon: 'chart',
      type: 'info',
      title: 'Socios al día',
      // El MISMO vocabulario que la tarjeta de arriba: si una dice "activos" y la otra
      // "al día" para el mismo número, parecen dos cosas distintas.
      message: `${tasa}% de tus socios están al día (${activos} de ${vigentes})`,
    });
  }

  const sinFecha = Number(socios?.sinFecha) || 0;
  if (sinFecha > 0) {
    insights.push({
      icon: 'alertTriangle',
      type: 'warning',
      title: 'Socios sin cuota',
      message: `${sinFecha} socio${sinFecha > 1 ? 's no tienen' : ' no tiene'} vencimiento cargado: no aparece${sinFecha > 1 ? 'n' : ''} en vencidos ni en los avisos del mostrador`,
    });
  }

  const mes = comparacionDelMes(resumen?.ingresos, resumen?.hoy);
  if (mes && mes.cambio !== null) {
    const subio = mes.cambio >= 0;
    insights.push({
      icon: subio ? 'trendingUp' : 'trendingDown',
      type: subio ? 'success' : 'warning',
      title: 'Comparativa mensual',
      message: `Ingresos ${subio ? 'subieron' : 'bajaron'} ${Math.abs(mes.cambio)}% frente al 1 al ${mes.dia} de ${mes.mesAnterior}`,
    });
  }

  const cumplen = resumen?.cumplenHoy || [];
  if (cumplen.length > 0) {
    insights.push({
      icon: 'cake',
      type: 'celebration',
      title: '¡Cumpleaños hoy!',
      message: cumplen.join(', '),
    });
  }

  return insights;
}
