// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Ajustes → Suscripción → "Cambiar la tarjeta"
// ============================================
// El bug que se cuida (visto por el dueño el 2026-10-22): arriba decía "Monto mensual
// $ 145.000" y el formulario de tarjeta cobraba $ 55.000, porque no le llegaba el plan. Peor:
// el backend, sin plan, cobra el básico, así que una sucursal Premium que cambiaba la tarjeta
// pasaba a Básico sin enterarse.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// El formulario real se prueba en CardCheckout.test.jsx; acá importa QUÉ plan le llega.
const recibido = vi.hoisted(() => ({ props: null }));
vi.mock('../CardCheckout', () => ({
  default: (props) => { recibido.props = props; return <div data-formulario />; },
}));
vi.mock('../Icon', () => ({ default: () => null }));

const { default: SubscriptionActionsWeb } = await import('./SubscriptionActionsWeb');

let root;
let container;

async function pintar(props) {
  recibido.props = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <SubscriptionActionsWeb
        plan="Veltronik Premium"
        statusLabel="Activo"
        blocked={false}
        nextPayment="05/10/2027"
        monthlyAmountLabel="$ 145.000"
        hasSubscription
        verifying={false}
        onVerify={() => {}}
        onCardSuccess={async () => {}}
        {...props}
      />,
    );
  });
}

async function abrirCambiarTarjeta() {
  const boton = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Cambiar la tarjeta'));
  await act(async () => { boton.click(); });
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('Cambiar la tarjeta', () => {
  it('⭐ al formulario le llega el plan de la sucursal, no un monto suelto', async () => {
    await pintar({ planCode: 'PREMIUM' });
    await abrirCambiarTarjeta();

    expect(recibido.props.plan).toBe('PREMIUM');
    // El monto no viaja aparte: el formulario lo saca del plan, igual que el backend.
    expect(recibido.props.amount).toBeUndefined();
  });

  it('una suscripción sin plan grabado le pasa null: el formulario la resuelve como el backend', async () => {
    await pintar({ planCode: null });
    await abrirCambiarTarjeta();
    expect(recibido.props.plan).toBeNull();
  });
});

// Visto por el dueño el 2026-10-28 en una cuenta nueva: "Próximo cobro 5/11/2026 (8 días de
// prueba restantes)". En la prueba no hay tarjeta cargada: ese día no se cobra nada, termina la
// prueba.
describe('En la prueba gratis', () => {
  it('⭐ no promete un cobro: dice cuándo termina la prueba y que no se cobra nada', async () => {
    await pintar({
      hasSubscription: false,
      nextPayment: '--',
      prueba: { termina: '05/11/2026', dias: 8 },
    });
    const texto = container.textContent;

    expect(texto).not.toContain('Próximo cobro');
    expect(texto).toContain('Fin de la prueba');
    expect(texto).toContain('05/11/2026');
    expect(texto).toContain('Durante la prueba no se cobra nada');
  });

  it('con suscripción sigue diciendo el próximo cobro', async () => {
    await pintar({ prueba: null });
    const texto = container.textContent;

    expect(texto).toContain('Próximo cobro');
    expect(texto).toContain('05/10/2027');
    expect(texto).not.toContain('Fin de la prueba');
  });
});
