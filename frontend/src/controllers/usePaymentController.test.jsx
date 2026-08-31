// @vitest-environment happy-dom
// Reproduce el reporte: "la sección de Pagos no funciona ni muestra".

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const getAllPayments = vi.fn();
vi.mock('../services/PaymentService', () => ({
  paymentService: {
    getAllPayments: (...a) => getAllPayments(...a),
    createPayment: vi.fn(),
    update: vi.fn(),
    deletePayment: vi.fn(),
  },
}));

const { usePaymentController } = await import('./usePaymentController');
const { clearQueryCache } = await import('../hooks');

function montar(useHook) {
  const renders = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  function Sonda() { renders.push(useHook()); return null; }
  act(() => { root.render(<Sonda />); });
  return { renders, ultimo: () => renders[renders.length - 1], desmontar: () => act(() => { root.unmount(); }) };
}

const esperar = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const UN_PAGO = {
  id: 'p1',
  amount: 5000,
  paymentDate: '2026-08-15T00:00:00',
  paymentMethod: 'CASH',
  status: 'PAID',
  member: { id: 'm1', firstName: 'Ana', lastName: 'Gómez', document: '30111222' },
};

describe('usePaymentController', () => {
  beforeEach(() => {
    clearQueryCache();
    getAllPayments.mockReset();
    window.localStorage.setItem('current_org_id', 'org-1');
  });

  it('trae los pagos del rango y los deja listos para la tabla', async () => {
    getAllPayments.mockResolvedValue([UN_PAGO]);

    const vista = montar(() => usePaymentController({
      dateFrom: '2026-08-01', dateTo: '2026-08-31', search: '', method: '', status: '',
    }));
    await esperar();

    expect(getAllPayments).toHaveBeenCalledWith('2026-08-01', '2026-08-31');
    expect(vista.ultimo().payments).toHaveLength(1);
    expect(vista.ultimo().payments[0].member.fullName).toBe('Ana Gómez');
    expect(vista.ultimo().payments[0].status).toBe('paid');
    vista.desmontar();
  });

  it('los filtros se aplican sin volver a pedir al servidor', async () => {
    getAllPayments.mockResolvedValue([UN_PAGO]);

    const vista = montar(() => usePaymentController({
      dateFrom: '2026-08-01', dateTo: '2026-08-31', search: 'ana', method: '', status: '',
    }));
    await esperar();

    expect(getAllPayments).toHaveBeenCalledTimes(1);
    expect(vista.ultimo().payments).toHaveLength(1);
    vista.desmontar();
  });
});

describe('usePaymentController — el negocio que llega tarde', () => {
  beforeEach(() => {
    clearQueryCache();
    getAllPayments.mockReset();
    window.localStorage.removeItem('current_org_id');
  });

  // Si la pantalla se abre ANTES de que el negocio esté resuelto, el controller no puede
  // guardar "no hay pagos" como si fuera la verdad: eso queda cacheado y la tabla dice
  // "No se encontraron pagos" para siempre, aunque el gimnasio tenga cientos.
  it('no cachea una lista vacía cuando todavía no hay negocio', async () => {
    getAllPayments.mockResolvedValue([UN_PAGO]);

    // Primer render sin negocio (el contexto todavía no resolvió).
    const vista = montar(() => usePaymentController({
      dateFrom: '2026-08-01', dateTo: '2026-08-31', search: '', method: '', status: '',
    }));
    await esperar();

    expect(vista.ultimo().payments).toHaveLength(0);
    expect(getAllPayments).not.toHaveBeenCalled();

    // Llega el negocio. Al volver a montar (o re-renderizar), TIENE que pedir de verdad.
    window.localStorage.setItem('current_org_id', 'org-1');
    vista.desmontar();

    const segunda = montar(() => usePaymentController({
      dateFrom: '2026-08-01', dateTo: '2026-08-31', search: '', method: '', status: '',
    }));
    await esperar();

    expect(getAllPayments).toHaveBeenCalledTimes(1);
    expect(segunda.ultimo().payments).toHaveLength(1);
    segunda.desmontar();
  });

  // Y si el pedido FALLA, la pantalla no puede decir "no hay pagos": no lo sabe.
  it('avisa que el pedido falló en vez de mostrar una tabla vacía', async () => {
    window.localStorage.setItem('current_org_id', 'org-1');
    getAllPayments.mockRejectedValue(new Error('500 del servidor'));

    const vista = montar(() => usePaymentController({
      dateFrom: '2026-08-01', dateTo: '2026-08-31', search: '', method: '', status: '',
    }));
    await esperar();

    expect(vista.ultimo().payments).toHaveLength(0);
    expect(vista.ultimo().error).toBeTruthy();
    vista.desmontar();
  });
});
