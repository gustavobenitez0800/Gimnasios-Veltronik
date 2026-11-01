// @vitest-environment happy-dom
// ============================================
// EL RANGO QUE VA AL SERVIDOR (useRangoDeFechas → pedible)
// ============================================
// Pagos pedía con cada tecla del año: el campo de fecha de Chrome pasa por 0002, 0020 y 0202
// antes de llegar a 2026, y con «0002» traía todos los cobros desde el año 2, por un instante,
// en cada gimnasio que escribía una fecha a mano.
// ============================================

import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useRangoDeFechas } from './useRangoDeFechas';

function montar(inicial) {
  const renders = [];
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  function Sonda() {
    renders.push(useRangoDeFechas(inicial));
    return null;
  }
  act(() => { root.render(<Sonda />); });
  return () => renders[renders.length - 1];
}

describe('useRangoDeFechas: el rango que se puede pedir', () => {
  it('⭐ mientras se escribe el año queda el último rango completo, y cambia recién al terminar', () => {
    const ultimo = montar('month');
    const delMes = { desde: ultimo().desde, hasta: ultimo().hasta };
    expect(ultimo().pedible).toEqual(delMes);

    for (const aMedias of ['0002-09-01', '0020-09-01', '0202-09-01']) {
      act(() => ultimo().cambiarDesde(aMedias));
      expect(ultimo().problema).not.toBeNull();
      expect(ultimo().pedible).toEqual(delMes);
    }

    act(() => ultimo().cambiarDesde('2026-09-01'));
    act(() => ultimo().cambiarHasta('2026-09-30'));
    expect(ultimo().pedible).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
  });

  it('un rango al revés tampoco se pide', () => {
    const ultimo = montar('month');
    const antes = { ...ultimo().pedible };
    act(() => ultimo().cambiarDesde('2099-01-01'));
    expect(ultimo().problema).not.toBeNull();
    expect(ultimo().pedible).toEqual(antes);
  });

  it('un atajo cambia lo que se pide en el acto', () => {
    const ultimo = montar('month');
    act(() => ultimo().elegirPeriodo('today'));
    expect(ultimo().pedible).toEqual({ desde: ultimo().desde, hasta: ultimo().hasta });
    expect(ultimo().pedible.desde).toBe(ultimo().pedible.hasta);
  });
});
