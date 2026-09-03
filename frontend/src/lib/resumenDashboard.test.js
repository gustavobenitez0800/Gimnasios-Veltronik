// ============================================
// VELTRONIK - Tests del resumen del Dashboard
// ============================================
// ⭐ LO QUE SE DEFIENDE ACÁ NO ES QUE "FUNCIONE": es que los números sean LOS MISMOS que
// mostraba la pantalla cuando hacía las cuentas sobre el padrón completo.
//
// El Dashboard se traía todos los socios y todos los pagos y calculaba en el navegador. Ahora
// el servidor manda series y conteos. Si al mudar la cuenta un total cambiara, el dueño vería
// que "el sistema empezó a decir otra cosa" y no habría forma de saber cuál de las dos
// versiones tenía razón — por eso varios de estos tests corren la fórmula vieja
// (InsightsService, sobre datos crudos) y la nueva (sobre el resumen) y exigen que coincidan.

import { describe, it, expect } from 'vitest';
import {
  graficoDeIngresos, prediccionDeIngresos, alertasDeVencimiento, graficoDeSocios, insightsDelDia,
} from './resumenDashboard';
import InsightsService from '../services/InsightsService';

const insights = new InsightsService();

/** El primer día de un mes, N meses atrás. */
const mesAtras = (n) => {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth() - n, 1);
};

/** Un pago como lo devolvía el backend, ya normalizado por el controlador viejo. */
const pago = (fecha, monto) => ({ paymentDate: fecha.toISOString(), amount: monto, status: 'paid' });

describe('el gráfico de ingresos', () => {

  it('⭐ da lo mismo que calculando sobre los pagos crudos', () => {
    const pagos = [
      pago(mesAtras(0), 25000), pago(mesAtras(0), 15000),
      pago(mesAtras(1), 40000),
      pago(mesAtras(3), 12000),
    ];
    const serie = [
      { mes: mesAtras(3).toISOString(), total: 12000 },
      { mes: mesAtras(1).toISOString(), total: 40000 },
      { mes: mesAtras(0).toISOString(), total: 40000 },
    ];

    const viejo = insights.getMonthlyRevenueChartData(pagos, 6);
    const nuevo = graficoDeIngresos(serie, 6);

    expect(nuevo.labels).toEqual(viejo.labels);
    expect(nuevo.data).toEqual(viejo.data);
  });

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
});

describe('la predicción de ingresos', () => {

  it('⭐ da EXACTAMENTE lo mismo que la fórmula vieja sobre los pagos', () => {
    const pagos = [
      pago(mesAtras(2), 100000),
      pago(mesAtras(1), 120000),
      pago(mesAtras(0), 140000),
    ];
    const serie = [
      { mes: mesAtras(2).toISOString(), total: 100000 },
      { mes: mesAtras(1).toISOString(), total: 120000 },
      { mes: mesAtras(0).toISOString(), total: 140000 },
    ];

    const viejo = insights.predictNextMonthRevenue(pagos);
    const nuevo = prediccionDeIngresos(serie);

    expect(nuevo.predicted).toBe(viejo.predicted);
    expect(nuevo.confidence).toBe(viejo.confidence);
    expect(nuevo.trend).toBe(viejo.trend);
    expect(nuevo.percentChange).toBe(viejo.percentChange);
  });

  it('con un solo mes no se inventa una tendencia', () => {
    const r = prediccionDeIngresos([{ mes: mesAtras(0).toISOString(), total: 50000 }]);

    expect(r.predicted).toBe(50000);
    expect(r.confidence, 'poca confianza con un solo dato').toBe(30);
    expect(r.trend).toBe('neutral');
  });

  it('sin datos no predice nada', () => {
    expect(prediccionDeIngresos([]).predicted).toBe(0);
    expect(prediccionDeIngresos(null).confidence).toBe(0);
  });

  it('detecta que los ingresos bajan', () => {
    const r = prediccionDeIngresos([
      { mes: mesAtras(2).toISOString(), total: 150000 },
      { mes: mesAtras(1).toISOString(), total: 100000 },
      { mes: mesAtras(0).toISOString(), total: 50000 },
    ]);

    expect(r.trend).toBe('down');
  });
});

describe('las alertas de vencimiento', () => {

  it('⭐ el texto y el tipo son los mismos que armaba la pantalla', () => {
    const hoy = new Date();
    const enDias = (d) => new Date(hoy.getTime() + d * 86400000).toISOString();
    const socios = [
      { fullName: 'Rocío Delgado', membershipEnd: enDias(-5) },
      { fullName: 'Lucas Romero', membershipEnd: enDias(2) },
      { fullName: 'María Paz', membershipEnd: enDias(6) },
    ];
    const vencimientos = {
      primeros: [
        { nombre: 'Rocío Delgado', diasRestantes: -5 },
        { nombre: 'Lucas Romero', diasRestantes: 2 },
        { nombre: 'María Paz', diasRestantes: 6 },
      ],
    };

    const viejo = insights.getPaymentAlerts(socios);
    const nuevo = alertasDeVencimiento(vencimientos);

    expect(nuevo.map((a) => a.type)).toEqual(viejo.map((a) => a.type));
    expect(nuevo.map((a) => a.message)).toEqual(viejo.map((a) => a.message));
    expect(nuevo.map((a) => a.priority)).toEqual(viejo.map((a) => a.priority));
  });

  it('el singular y el plural de los días están cuidados', () => {
    const [uno, dos] = alertasDeVencimiento({
      primeros: [{ nombre: 'Ana', diasRestantes: 1 }, { nombre: 'Beto', diasRestantes: 2 }],
    });

    expect(uno.message).toContain('Vence en 1 día');
    expect(uno.message).not.toContain('1 días');
    expect(dos.message).toContain('Vence en 2 días');
  });

  it('sin vencimientos no inventa alertas', () => {
    expect(alertasDeVencimiento(null)).toEqual([]);
    expect(alertasDeVencimiento({ primeros: [] })).toEqual([]);
  });
});

describe('la torta de socios', () => {

  it('⭐ cuenta igual que la fórmula vieja sobre el padrón', () => {
    const hoy = new Date();
    const enDias = (d) => new Date(hoy.getTime() + d * 86400000).toISOString();
    const padron = [
      { status: 'active', membershipEnd: enDias(20) },
      { status: 'active', membershipEnd: enDias(10) },
      { status: 'active', membershipEnd: enDias(-3) },   // vencido por fecha
      { status: 'inactive', membershipEnd: enDias(20) },
    ];

    const viejo = insights.getMemberStatusChartData(padron);
    const nuevo = graficoDeSocios({ activos: 2, inactivos: 1, vencidos: 1, suspendidos: 0 });

    expect(nuevo.data).toEqual(viejo.data);
    expect(nuevo.labels).toEqual(viejo.labels);
  });
});

describe('los insights del día', () => {

  const resumenBase = {
    socios: { total: 10, activos: 7, inactivos: 1, vencidos: 2 },
    ingresos: { delMes: 120000, delMesAnterior: 100000 },
    vencimientos: { estaSemana: 2 },
    cumplenHoy: [],
  };

  it('dice cuántos vencen esta semana, con plural', () => {
    const [primero] = insightsDelDia(resumenBase);

    expect(primero.title).toBe('Membresías por vencer');
    expect(primero.message).toContain('2 socios');
  });

  it('la tasa de actividad se lee sin hacer cuentas', () => {
    const tasa = insightsDelDia(resumenBase).find((i) => i.title === 'Tasa de actividad');

    expect(tasa.message).toBe('70% de tus socios están activos (7 de 10)');
  });

  it('compara contra el mes anterior y dice si subió o bajó', () => {
    const subio = insightsDelDia(resumenBase).find((i) => i.title === 'Comparativa mensual');
    expect(subio.message).toBe('Ingresos subieron 20% vs mes anterior');
    expect(subio.type).toBe('success');

    const bajo = insightsDelDia({
      ...resumenBase, ingresos: { delMes: 80000, delMesAnterior: 100000 },
    }).find((i) => i.title === 'Comparativa mensual');
    expect(bajo.message).toBe('Ingresos bajaron 20% vs mes anterior');
    expect(bajo.type).toBe('warning');
  });

  /** Sin mes anterior no hay con qué comparar: mejor no decir nada que decir "subió 100%". */
  it('el primer mes del gimnasio no muestra comparativa', () => {
    const r = insightsDelDia({ ...resumenBase, ingresos: { delMes: 50000, delMesAnterior: 0 } });

    expect(r.find((i) => i.title === 'Comparativa mensual')).toBeUndefined();
  });

  it('los cumpleaños del día aparecen con los nombres', () => {
    const r = insightsDelDia({ ...resumenBase, cumplenHoy: ['Camila Ferreyra', 'Bruno Paz'] });
    const cumple = r.find((i) => i.title === '¡Cumpleaños hoy!');

    expect(cumple.message).toBe('Camila Ferreyra, Bruno Paz');
  });

  it('un gimnasio recién abierto no muestra insights vacíos', () => {
    const r = insightsDelDia({
      socios: { total: 0, activos: 0 }, ingresos: { delMes: 0, delMesAnterior: 0 },
      vencimientos: { estaSemana: 0 }, cumplenHoy: [],
    });

    expect(r).toEqual([]);
  });
});
