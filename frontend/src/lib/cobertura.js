// ============================================
// VELTRONIK - LO QUE CUBRE UN ARANCEL, EN PALABRAS
// ============================================
// ⭐ LA ÚNICA TRADUCCIÓN de `coberturaCantidad` + `coberturaUnidad` (ADR-013) a lo que lee
// un dueño de gimnasio: "1 mes", "1 semana", "1 año".
//
// Había TRES copias —Ajustes, Pagos y el cobro rápido de Socios— y no decían lo mismo:
// Ajustes decía "1 semana" y el cobro rápido "7 días" para el mismo arancel, y Pagos seguía
// leyendo `durationDays`, que dejó de mandarse en la V65. Desde el 2026-09-07 todo arancel
// nuevo tiene `durationDays = 0`, así que en el selector de Pagos aparecían sin período, y
// los viejos mostraban el de antes de la migración (un Pase Anual decía "360 días").
//
// ⚠️ ACÁ NO SE CALCULA NINGUNA FECHA. Solo se nombra lo que el arancel ya declara: el
// vencimiento lo corre el backend, y dos cuentas para lo mismo es el error que este proyecto
// ya cometió.

/**
 * Las opciones del selector de Ajustes, en el orden en que se ofrecen.
 *
 * <p>Antes esto era un campo de número libre que decía "días que cubre", con 0 por defecto —y
 * 0 significaba "no corre la fecha", así que el valor por defecto era el que rompía, en
 * silencio—. Ahora es una lista: no hay ningún número que escribir ni que traducir. "Pase
 * Semanal" se elige diciendo una semana, no 7.</p>
 *
 * <p><b>⚠️ Esta lista salió del catálogo REAL de los clientes, no de la cabeza de nadie.</b> La
 * primera versión era solo de meses (1/3/6/12) y le rompía tres de los once aranceles que vende
 * HaA Fitness: Pase Diario, Pase Semanal y Pase Bimestral.</p>
 */
export const COBERTURAS = [
  { valor: '1|DIA', etiqueta: '1 día' },
  { valor: '7|DIA', etiqueta: '1 semana' },
  { valor: '15|DIA', etiqueta: '15 días' },
  { valor: '1|MES', etiqueta: '1 mes' },
  { valor: '2|MES', etiqueta: '2 meses' },
  { valor: '3|MES', etiqueta: '3 meses' },
  { valor: '6|MES', etiqueta: '6 meses' },
  { valor: '12|MES', etiqueta: '1 año' },
  { valor: '0|DIA', etiqueta: 'No cubre tiempo (clase suelta)' },
];

/**
 * La clave de la lista para un arancel: "3|MES".
 *
 * <p>Sin cobertura cargada vale un mes: es el default de la columna y lo que la migración le
 * puso a todos.</p>
 */
export function claveCobertura(plan) {
  return `${plan?.coberturaCantidad ?? 1}|${plan?.coberturaUnidad || 'MES'}`;
}

/**
 * "1 mes", "3 meses", "1 semana" — la misma etiqueta que se eligió al crearlo.
 * `null` = el arancel no corre el vencimiento.
 */
export function queCubre(plan) {
  const n = plan?.coberturaCantidad ?? 1;
  if (!(n > 0)) return null;

  const conocida = COBERTURAS.find((c) => c.valor === claveCobertura(plan));
  if (conocida) return conocida.etiqueta;

  // Un valor que no está en la lista: se muestra tal cual en vez de forzarlo a la opción más
  // parecida. La migración conserva como días lo que no mapea, y un arancel que nadie previó
  // no puede cambiar de significado por comodidad de esta función.
  return (plan?.coberturaUnidad || 'MES') === 'MES'
    ? `${n} ${n === 1 ? 'mes' : 'meses'}`
    : `${n} ${n === 1 ? 'día' : 'días'}`;
}

/** Como {@link queCubre}, pero siempre dice algo: para una columna o un selector. */
export function etiquetaCobertura(plan) {
  return queCubre(plan) ?? 'No cubre tiempo';
}
