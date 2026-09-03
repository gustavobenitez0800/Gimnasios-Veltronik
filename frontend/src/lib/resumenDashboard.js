// ============================================
// VELTRONIK - DEL RESUMEN DEL SERVIDOR A LO QUE PINTA EL DASHBOARD
// ============================================
// El Dashboard se traía TODOS los socios y TODOS los pagos y hacía las cuentas acá. Con 385
// socios y un año de cobros son miles de filas cruzando la conexión del gimnasio para pintar
// cuatro números y dos gráficos: eso es lo que los dueños describen como "va lento".
//
// Ahora el servidor manda el resultado (conteos, una serie por mes y dos listas cortas) y
// este módulo lo convierte a la forma que la pantalla ya sabía dibujar.
//
// ⚠️ LAS FÓRMULAS SON LAS MISMAS, A PROPÓSITO. La regresión de la predicción, los umbrales de
// las alertas (0 / 3 / 7 días) y los textos son los de InsightsService, palabra por palabra.
// Si un número cambiara al mudar la cuenta al servidor, el dueño vería que "el sistema
// empezó a decir otra cosa" y no habría forma de saber cuál de las dos versiones tenía razón.
//
// Vive afuera del controlador para poder probarlo sin montar la pantalla.

/** Los meses tal como los escribe la app: "Sep", "Oct". */
function nombreDeMes(fecha) {
  const n = fecha.toLocaleDateString('es-AR', { month: 'short' });
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** La clave "2026-09" de una fecha, para cruzar contra la serie del servidor. */
function claveDeMes(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

/** La serie del servidor, indexada por mes. */
function porMes(serie) {
  const mapa = new Map();
  (serie || []).forEach((m) => mapa.set(claveDeMes(new Date(m.mes)), Number(m.total) || 0));
  return mapa;
}

/**
 * Ingresos de los últimos N meses para el gráfico.
 *
 * Un mes sin cobros vale 0 y aparece igual: si se saltearan, el gráfico mostraría una línea
 * que se salta los meses malos, que son justo los que hay que ver.
 */
export function graficoDeIngresos(serie, meses = 6) {
  const mapa = porMes(serie);
  const hoy = new Date();
  const labels = [];
  const data = [];

  for (let i = meses - 1; i >= 0; i -= 1) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    labels.push(nombreDeMes(d));
    data.push(mapa.get(claveDeMes(d)) || 0);
  }
  return { labels, data };
}

/**
 * Rellena los meses sin cobros con cero, del primero al último de la serie.
 *
 * ⚠️ ESTO ARREGLA UNA PREDICCIÓN QUE MENTÍA. La serie solo trae los meses que tuvieron
 * ingresos: si el gimnasio cobró en junio, julio y septiembre, agosto simplemente no está, y
 * la regresión tomaba julio y septiembre como consecutivos. O sea: **un mes malo desaparecía
 * de la cuenta en vez de pesar**, y la tendencia salía mejor de lo que fue. Justo el mes que
 * el dueño necesita ver es el que se borraba solo.
 *
 * Con los ceros, agosto vale lo que valió: cero.
 */
function conLosMesesVacios(serie) {
  const meses = (serie || [])
    .map((m) => ({ fecha: new Date(m.mes), total: Number(m.total) || 0 }))
    .filter((m) => !Number.isNaN(m.fecha.getTime()))
    .sort((a, b) => a.fecha - b.fecha);

  if (meses.length < 2) return meses.map((m) => m.total);

  const valores = [];
  const cursor = new Date(meses[0].fecha.getFullYear(), meses[0].fecha.getMonth(), 1);
  const ultimo = meses[meses.length - 1].fecha;
  const porClave = new Map(meses.map((m) => [`${m.fecha.getFullYear()}-${m.fecha.getMonth()}`, m.total]));

  while (cursor <= ultimo) {
    valores.push(porClave.get(`${cursor.getFullYear()}-${cursor.getMonth()}`) || 0);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return valores;
}

/**
 * La predicción del mes que viene: regresión lineal sobre los ingresos mes a mes.
 *
 * Es la misma cuenta que hacía InsightsService.predictNextMonthRevenue —los pasos están en el
 * mismo orden para que el número no cambie— con UNA corrección: los meses sin cobros entran
 * como cero en vez de desaparecer (ver `conLosMesesVacios`).
 */
export function prediccionDeIngresos(serie) {
  const valores = conLosMesesVacios(serie);

  if (valores.length === 0) {
    return { predicted: 0, confidence: 0, trend: 'neutral', percentChange: '0.0' };
  }
  if (valores.length < 2) {
    return { predicted: valores[0], confidence: 30, trend: 'neutral', percentChange: '0.0' };
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
  const predicted = intercept + slope * n;

  const avg = sumY / n;
  const variance = valores.reduce((s, v) => s + ((v - avg) ** 2), 0) / n;
  const coefficient = (Math.sqrt(variance) / avg) || 0;
  const confidence = Math.max(20, Math.min(95, 100 - coefficient * 100));
  const percentChange = avg > 0 ? ((predicted - avg) / avg) * 100 : 0;

  return {
    predicted: Math.max(0, Math.round(predicted)),
    confidence: Math.round(confidence),
    trend: slope > 0 ? 'up' : slope < 0 ? 'down' : 'neutral',
    percentChange: percentChange.toFixed(1),
    lastMonthAvg: Math.round(avg),
  };
}

/**
 * Las alertas de vencimiento, con el mismo texto y los mismos umbrales de siempre.
 *
 * El servidor manda quién y cuántos días le faltan (negativo = ya venció); el texto se arma
 * acá porque es cosa de la pantalla, no del servidor.
 */
export function alertasDeVencimiento(vencimientos) {
  return (vencimientos?.primeros || []).map((a) => {
    const dias = a.diasRestantes;
    if (dias <= 0) {
      return {
        type: 'expired',
        message: `${a.nombre} - Membresía vencida`,
        priority: 'high',
        daysAgo: Math.abs(dias),
      };
    }
    if (dias <= 3) {
      return {
        type: 'urgent',
        message: `${a.nombre} - Vence en ${dias} día${dias > 1 ? 's' : ''}`,
        priority: 'high',
        daysRemaining: dias,
      };
    }
    return {
      type: 'warning',
      message: `${a.nombre} - Vence en ${dias} días`,
      priority: 'medium',
      daysRemaining: dias,
    };
  });
}

/** La torta de estados: el servidor ya los contó, con el mismo criterio que usaba la pantalla. */
export function graficoDeSocios(socios) {
  return {
    labels: ['Activos', 'Inactivos', 'Vencidos', 'Suspendidos'],
    data: [
      Number(socios?.activos) || 0,
      Number(socios?.inactivos) || 0,
      Number(socios?.vencidos) || 0,
      Number(socios?.suspendidos) || 0,
    ],
    colors: ['#22C55E', '#6B7280', '#EF4444', '#F59E0B'],
  };
}

/** Los insights del día: los mismos cuatro, con los números del resumen. */
export function insightsDelDia(resumen) {
  const insights = [];
  const socios = resumen?.socios;
  const ingresos = resumen?.ingresos;
  const porVencer = Number(resumen?.vencimientos?.estaSemana) || 0;

  if (porVencer > 0) {
    insights.push({
      icon: 'clock',
      type: 'warning',
      title: 'Membresías por vencer',
      message: `${porVencer} socio${porVencer > 1 ? 's' : ''} con membresía próxima a vencer esta semana`,
    });
  }

  const total = Number(socios?.total) || 0;
  if (total > 0) {
    const activos = Number(socios?.activos) || 0;
    const tasa = ((activos / total) * 100).toFixed(0);
    insights.push({
      icon: 'chart',
      type: 'info',
      title: 'Socios al día',
      // El MISMO vocabulario que la tarjeta de arriba: si una dice "activos" y la otra
      // "al día" para el mismo número, parecen dos cosas distintas.
      message: `${tasa}% de tus socios están al día (${activos} de ${total})`,
    });
  }

  const esteMes = Number(ingresos?.delMes) || 0;
  const mesAnterior = Number(ingresos?.delMesAnterior) || 0;
  if (mesAnterior > 0) {
    const cambio = (((esteMes - mesAnterior) / mesAnterior) * 100).toFixed(0);
    const subio = esteMes >= mesAnterior;
    insights.push({
      icon: subio ? 'trendingUp' : 'trendingDown',
      type: subio ? 'success' : 'warning',
      title: 'Comparativa mensual',
      message: `Ingresos ${subio ? 'subieron' : 'bajaron'} ${Math.abs(cambio)}% vs mes anterior`,
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
