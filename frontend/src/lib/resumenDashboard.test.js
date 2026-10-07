// ============================================
// VELTRONIK - Tests del resumen del Dashboard
// ============================================
// ⭐ LO QUE SE DEFIENDE ACÁ: que el MES EN CURSO se trate como lo que es —un mes que todavía
// no terminó— y que el panel cuente con las mismas palabras y criterios que el resto del
// sistema. Cada test lleva la fecha de HOY escrita (`hoy`), la que manda el servidor: así no
// dependen del día en que se corren, que es la trampa de los tests que fallaban a medianoche.
//
// Los montos son inventados: el repo es público.

import { describe, it, expect } from 'vitest';
import {
  graficoDeIngresos, prediccionDeIngresos, comparacionDelMes, alertasDeVencimiento,
  graficoDeSocios, insightsDelDia, montoCorto, fechaDeHoy,
} from './resumenDashboard';

/** El primer día de un mes, N meses atrás de HOY (para los tests que usan el reloj de la PC). */
const mesAtras = (n) => {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth() - n, 1);
};

/** Un renglón de la serie como lo manda el servidor: "2026-06-01T00:00:00". */
const mes = (clave, total) => ({ mes: `${clave}-01T00:00:00`, total });

describe('el gráfico de ingresos', () => {

  it('un mes sin cobros vale 0 y aparece igual', () => {
    const { labels, data } = graficoDeIngresos([{ mes: mesAtras(0).toISOString(), total: 5000 }], 6);

    expect(labels).toHaveLength(6);
    expect(data).toHaveLength(6);
    expect(data.slice(0, 5), 'los cinco meses sin cobros').toEqual([0, 0, 0, 0, 0]);
    expect(data[5]).toBe(5000);
  });

  it('sin serie no rompe: seis meses en cero', () => {
    expect(graficoDeIngresos(null, 6).data).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('⭐ con historial importado arranca en el primer mes con cobros, no seis meses atrás', () => {
    // Un gimnasio que importó su caja desde enero: el gráfico tiene que mostrar enero.
    const serie = [8, 5, 0].map((n) => ({ mes: mesAtras(n).toISOString(), total: 1000 * (n + 1) }));

    const { labels, data } = graficoDeIngresos(serie, 6, 12);

    expect(labels).toHaveLength(9);
    expect(data[0], 'el mes más viejo, primero').toBe(9000);
    expect(data[8]).toBe(1000);
  });

  it('nunca más de doce meses, y un gimnasio nuevo sigue viendo seis', () => {
    const viejo = [{ mes: mesAtras(20).toISOString(), total: 5000 }, { mes: mesAtras(0).toISOString(), total: 1000 }];
    expect(graficoDeIngresos(viejo, 6, 12).data).toHaveLength(12);

    const nuevo = [{ mes: mesAtras(1).toISOString(), total: 5000 }];
    expect(graficoDeIngresos(nuevo, 6, 12).data).toHaveLength(6);
  });

  it('⭐ el último punto es el mes en curso, y dice en qué día va', () => {
    const r = graficoDeIngresos([mes('2026-08', 100000), mes('2026-09', 30000)], 6, 12, '2026-09-21');

    expect(r.enCurso).toBe(r.data.length - 1);
    expect(r.data[r.enCurso]).toBe(30000);
    expect(r.mesEnCurso).toBe('septiembre');
    expect(r.dia).toBe(21);
  });

  it('⭐ el mes en curso lo dice el SERVIDOR, no el reloj de la PC', () => {
    // Una PC con la zona mal puesta, a las 22:00 del 31 de enero, ya está en febrero.
    const r = graficoDeIngresos([mes('2027-01', 50000)], 6, 12, '2027-01-31');

    expect(r.mesEnCurso).toBe('enero');
    expect(r.data[r.enCurso]).toBe(50000);
  });
});

describe('la predicción de ingresos', () => {

  it('⭐ el mes en curso NO entra: todavía no terminó', () => {
    const serie = [mes('2026-06', 100000), mes('2026-07', 120000), mes('2026-08', 140000), mes('2026-09', 30000)];

    const r = prediccionDeIngresos(serie, { hoy: '2026-09-21' });

    // Con septiembre a medias (30.000 al día 21) la línea se doblaba para abajo. Sin él, la
    // tendencia es la de los meses cerrados: +20.000 por mes → octubre, 180.000.
    expect(r.suficiente).toBe(true);
    expect(r.mes).toBe('octubre');
    expect(r.mesesCerrados).toBe(3);
    expect(r.trend).toBe('up');
    expect(r.predicted).toBe(180000);
  });

  it('⭐ no cambia según el día del mes: el 2 y el 29 dicen lo mismo', () => {
    const cerrados = [mes('2026-06', 100000), mes('2026-07', 120000), mes('2026-08', 140000)];

    const alPrincipio = prediccionDeIngresos([...cerrados, mes('2026-09', 4000)], { hoy: '2026-09-02' });
    const alFinal = prediccionDeIngresos([...cerrados, mes('2026-09', 150000)], { hoy: '2026-09-29' });

    expect(alPrincipio.predicted).toBe(alFinal.predicted);
  });

  /**
   * ⭐ EL ARREGLO DEL 2026-09-03. La serie solo trae meses CON cobros: si el gimnasio cobró
   * en mayo, junio y agosto, julio no venía y la regresión tomaba junio y agosto como
   * consecutivos. El mes malo desaparecía de la cuenta en vez de pesar.
   */
  it('⭐ un mes SIN cobros pesa como cero, no se saltea', () => {
    const conHueco = [mes('2026-05', 90000), mes('2026-06', 90000), mes('2026-08', 90000)];

    const r = prediccionDeIngresos(conHueco, { hoy: '2026-09-10' });

    expect(r.mesesCerrados).toBe(4);
    expect(r.trend, 'un mes en cero tiene que arrastrar la tendencia').toBe('down');
    expect(r.confidence, 'y bajar la confianza: la serie es irregular').toBeLessThan(95);
  });

  it('los meses sin cobros cuentan hasta el mes pasado: el que dejó de cobrar no se ve estable', () => {
    const r = prediccionDeIngresos([mes('2026-06', 100000)], { hoy: '2026-09-10' });

    expect(r.mesesCerrados, 'junio, julio y agosto').toBe(3);
    expect(r.trend).toBe('down');
  });

  it('⭐ el primer mes, si se empezó a cobrar avanzado el mes, no cuenta', () => {
    // Empezó a cobrar el 20 de junio: diez días de junio al lado de meses enteros inventaban
    // un crecimiento que no pasó.
    const serie = [mes('2026-06', 20000), mes('2026-07', 100000), mes('2026-08', 100000)];

    const r = prediccionDeIngresos(serie, { hoy: '2026-09-10', primerCobro: '2026-06-20T10:00:00' });

    expect(r.mesesCerrados).toBe(2);
    expect(r.trend).toBe('neutral');
    expect(r.predicted).toBe(100000);
  });

  it('el primer mes que arrancó en los primeros días sí cuenta', () => {
    const serie = [mes('2026-06', 90000), mes('2026-07', 100000), mes('2026-08', 110000)];

    const r = prediccionDeIngresos(serie, { hoy: '2026-09-10', primerCobro: '2026-06-05T07:17:00' });

    expect(r.mesesCerrados).toBe(3);
  });

  it('con un solo mes cerrado no se inventa una predicción', () => {
    const r = prediccionDeIngresos([mes('2026-08', 50000), mes('2026-09', 10000)], { hoy: '2026-09-10' });

    expect(r.suficiente).toBe(false);
    expect(r.mesesCerrados).toBe(1);
    expect(r.predicted).toBe(0);
  });

  it('sin datos no predice nada', () => {
    expect(prediccionDeIngresos([], { hoy: '2026-09-10' }).suficiente).toBe(false);
    expect(prediccionDeIngresos(null).mesesCerrados).toBe(0);
  });

  it('detecta que los ingresos bajan', () => {
    const r = prediccionDeIngresos(
      [mes('2026-06', 150000), mes('2026-07', 100000), mes('2026-08', 50000)], { hoy: '2026-09-10' });

    expect(r.trend).toBe('down');
  });

  it('cruza el año: en enero predice febrero con los meses de diciembre para atrás', () => {
    const r = prediccionDeIngresos(
      [mes('2026-10', 100000), mes('2026-11', 100000), mes('2026-12', 100000), mes('2027-01', 5000)],
      { hoy: '2027-01-10' });

    expect(r.mes).toBe('febrero');
    expect(r.mesesCerrados).toBe(3);
    expect(r.predicted).toBe(100000);
  });
});

describe('cómo viene el mes', () => {

  it('⭐ se compara contra el MISMO tramo del mes pasado', () => {
    const r = comparacionDelMes({ delMes: 30000, delMismoPeriodoAnterior: 25000 }, '2026-09-21');

    expect(r.cambio).toBe(20);
    expect(r.dia).toBe(21);
    expect(r.mesAnterior).toBe('agosto');
  });

  it('el 31 de marzo compara hasta el 28 de febrero, como el servidor', () => {
    expect(comparacionDelMes({ delMes: 1, delMismoPeriodoAnterior: 1 }, '2026-03-31').dia).toBe(28);
  });

  it('sin el tramo anterior no compara contra el mes entero: no compara', () => {
    expect(comparacionDelMes({ delMes: 30000, delMesAnterior: 90000 }, '2026-09-21')).toBeNull();
  });

  it('sin cobros el mes pasado no hay porcentaje', () => {
    expect(comparacionDelMes({ delMes: 30000, delMismoPeriodoAnterior: 0 }, '2026-09-21').cambio).toBeNull();
  });
});

describe('las alertas de vencimiento', () => {

  it('⭐ dicen CUÁNDO: el que venció ayer no es lo mismo que el que venció hace meses', () => {
    const [ayer, hoy, hace] = alertasDeVencimiento({
      primeros: [
        { socioId: 'a', nombre: 'Rocío Delgado', diasRestantes: -1 },
        { socioId: 'b', nombre: 'Lucas Romero', diasRestantes: 0 },
        { socioId: 'c', nombre: 'María Paz', diasRestantes: -90 },
      ],
    });

    expect(ayer.message).toBe('Rocío Delgado - Venció hace 1 día');
    expect(hoy.message).toBe('Lucas Romero - Venció hoy');
    expect(hace.message).toBe('María Paz - Venció hace 90 días');
    expect([ayer, hoy, hace].every((a) => a.type === 'expired' && a.priority === 'high')).toBe(true);
  });

  it('los umbrales de siempre: hasta 3 días es urgente, hasta 7 es aviso', () => {
    const [uno, tres, seis] = alertasDeVencimiento({
      primeros: [
        { socioId: 'a', nombre: 'Ana', diasRestantes: 1 },
        { socioId: 'b', nombre: 'Beto', diasRestantes: 3 },
        { socioId: 'c', nombre: 'Carla', diasRestantes: 6 },
      ],
    });

    expect(uno.message).toBe('Ana - Vence en 1 día');
    expect(uno.type).toBe('urgent');
    expect(tres.type).toBe('urgent');
    expect(seis.type).toBe('warning');
    expect(seis.priority).toBe('medium');
  });

  it('⭐ cada alerta es de un socio: dos con el mismo nombre no comparten clave', () => {
    const [a, b] = alertasDeVencimiento({
      primeros: [
        { socioId: 's1', nombre: 'Juan Pérez', diasRestantes: -2 },
        { socioId: 's2', nombre: 'Juan Pérez', diasRestantes: -2 },
      ],
    });

    expect(a.id).not.toBe(b.id);
  });

  it('sin vencimientos no inventa alertas', () => {
    expect(alertasDeVencimiento(null)).toEqual([]);
    expect(alertasDeVencimiento({ primeros: [] })).toEqual([]);
  });
});

describe('la torta de socios', () => {

  it('⭐ habla como la tarjeta y como Socios, y los cuatro pedazos suman el total', () => {
    const socios = { total: 10, activos: 5, vencidos: 2, sinFecha: 1, inactivos: 2, suspendidos: 0 };

    const t = graficoDeSocios(socios);

    expect(t.labels).toEqual(['Al día', 'Vencidos', 'Sin cuota', 'Bajas']);
    expect(t.data).toEqual([5, 2, 1, 2]);
    expect(t.data.reduce((a, b) => a + b, 0)).toBe(socios.total);
  });
});

describe('los insights del día', () => {

  const resumenBase = {
    hoy: '2026-09-21',
    socios: { total: 10, activos: 7, inactivos: 1, vencidos: 2, sinFecha: 0 },
    ingresos: { delMes: 120000, delMesAnterior: 300000, delMismoPeriodoAnterior: 100000 },
    vencimientos: { estaSemana: 2 },
    cumplenHoy: [],
  };

  it('dice cuántos vencen esta semana, con plural', () => {
    const [primero] = insightsDelDia(resumenBase);

    expect(primero.title).toBe('Vencen esta semana');
    expect(primero.message).toContain('2 socios');
  });

  it('⭐ "al día" sobre los que SIGUEN siendo socios, no sobre los dados de baja', () => {
    const tasa = insightsDelDia(resumenBase).find((i) => i.title === 'Socios al día');

    expect(tasa.message).toBe('78% de tus socios están al día (7 de 9)');
  });

  it('⭐ compara contra el mismo tramo del mes pasado, no contra el mes entero', () => {
    // Contra agosto entero (300.000) diría "bajaron 60%"; contra el 1 al 21 de agosto, subieron.
    const subio = insightsDelDia(resumenBase).find((i) => i.title === 'Comparativa mensual');
    expect(subio.message).toBe('Ingresos subieron 20% frente al 1 al 21 de agosto');
    expect(subio.type).toBe('success');

    const bajo = insightsDelDia({
      ...resumenBase, ingresos: { delMes: 80000, delMismoPeriodoAnterior: 100000 },
    }).find((i) => i.title === 'Comparativa mensual');
    expect(bajo.message).toBe('Ingresos bajaron 20% frente al 1 al 21 de agosto');
    expect(bajo.type).toBe('warning');
  });

  /** Sin mes anterior no hay con qué comparar: mejor no decir nada que decir "subió 100%". */
  it('el primer mes del gimnasio no muestra comparativa', () => {
    const r = insightsDelDia({ ...resumenBase, ingresos: { delMes: 50000, delMismoPeriodoAnterior: 0 } });

    expect(r.find((i) => i.title === 'Comparativa mensual')).toBeUndefined();
  });

  it('avisa de los socios sin cuota cargada', () => {
    const r = insightsDelDia({ ...resumenBase, socios: { ...resumenBase.socios, sinFecha: 3 } });
    const aviso = r.find((i) => i.title === 'Socios sin cuota');

    expect(aviso.message).toContain('3 socios no tienen vencimiento cargado');
  });

  it('los cumpleaños del día aparecen con los nombres', () => {
    const r = insightsDelDia({ ...resumenBase, cumplenHoy: ['Camila Ferreyra', 'Bruno Paz'] });
    const cumple = r.find((i) => i.title === '¡Cumpleaños hoy!');

    expect(cumple.message).toBe('Camila Ferreyra, Bruno Paz');
  });

  it('un gimnasio recién abierto no muestra insights vacíos', () => {
    const r = insightsDelDia({
      socios: { total: 0, activos: 0 }, ingresos: { delMes: 0, delMismoPeriodoAnterior: 0 },
      vencimientos: { estaSemana: 0 }, cumplenHoy: [],
    });

    expect(r).toEqual([]);
  });
});

describe('los montos del eje', () => {

  it('en castellano y cortos', () => {
    expect(montoCorto(8500000)).toBe('$8,5 M');
    expect(montoCorto(5000000)).toBe('$5 M');
    expect(montoCorto(850000)).toBe('$850 mil');
    expect(montoCorto(900)).toBe('$900');
    expect(montoCorto(0)).toBe('$0');
  });
});

describe('la fecha de hoy', () => {

  it('la del servidor, leída como fecha local (no como medianoche UTC)', () => {
    const f = fechaDeHoy('2026-09-01');

    expect(f.getDate()).toBe(1);
    expect(f.getMonth()).toBe(8);
  });

  it('sin la del servidor, la de la PC', () => {
    expect(fechaDeHoy(undefined).getFullYear()).toBe(new Date().getFullYear());
  });
});
