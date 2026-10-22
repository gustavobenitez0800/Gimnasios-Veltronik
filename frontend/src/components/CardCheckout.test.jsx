// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests del cobro con tarjeta
// ============================================
// El formulario real con un Mercado Pago de mentira: los campos seguros son objetos que
// guardan sus eventos, y el test los dispara como lo haría el SDK.
//
// Lo que se cuida: que al servidor le llegue lo mismo que mandaba el Brick (token, email y
// plan, nunca el precio), que el token salga con los datos del titular, y que la tarjeta
// dibujada muestre solo lo que Mercado Pago deja saber.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthContext } from '../contexts/AuthContext';

// vi.hoisted: el import de AuthContext de arriba arrastra los servicios ANTES de que corra el
// resto del archivo, y el mock tiene que encontrar este objeto ya armado.
const servidor = vi.hoisted(() => ({ subscribeWithCard: vi.fn(), getBillingStatus: vi.fn() }));
vi.mock('../services/SubscriptionService', () => ({ subscriptionService: servidor }));
vi.mock('../lib/paymentConfig', () => ({ getMpPublicKey: async () => 'APP_USR-clave-de-mentira' }));
vi.mock('@mercadopago/sdk-js', () => ({ loadMercadoPago: async () => {} }));
// El catálogo de planes que devolvería /public/plans. La regla para elegir (planQueSeCobra) es
// la real: es justo lo que se prueba.
const catalogo = vi.hoisted(() => ({ planes: [] }));
vi.mock('../lib/planes', async (importOriginal) => ({
  ...(await importOriginal()),
  obtenerPlanes: () => Promise.resolve(catalogo.planes),
}));
const CATALOGO = [
  { code: 'BASICO', name: 'Veltronik', price: 55000 },
  { code: 'PREMIUM', name: 'Veltronik Premium', price: 145000 },
];

const { default: CardCheckout } = await import('./CardCheckout');

/** Un campo seguro de mentira: junta sus escuchas y registra lo que le piden. */
function campoDeMentira(tipo) {
  const escuchas = {};
  return {
    tipo,
    escuchas,
    actualizado: [],
    mount() { return this; },
    unmount: vi.fn(),
    on(evento, fn) { escuchas[evento] = fn; return this; },
    update(props) { this.actualizado.push(props); return this; },
    async emitir(evento, datos) { await act(async () => { await escuchas[evento]?.(datos); }); },
  };
}

let mp;
function instalarMercadoPago({ token } = {}) {
  mp = {
    creados: [],
    fields: {
      create: vi.fn((tipo) => { const c = campoDeMentira(tipo); mp.creados.push(c); return c; }),
      createCardToken: vi.fn(async () => token ?? {
        id: 'tok_1', last_four_digits: '3704', first_six_digits: '450995',
        expiration_month: 11, expiration_year: 2030,
      }),
    },
    getPaymentMethods: vi.fn(async () => ({
      results: [{
        id: 'visa', name: 'Visa', payment_type_id: 'credit_card',
        settings: [{ card_number: { length: 16, validation: 'standard' }, security_code: { length: 3, mode: 'mandatory' } }],
      }],
    })),
    getIdentificationTypes: vi.fn(async () => [{ id: 'DNI', name: 'DNI' }, { id: 'CI', name: 'Cédula' }]),
  };
  window.MercadoPago = function MercadoPago() { return mp; };
}

/** Los tres campos de la vuelta vigente (al reintentar se crean otros). */
const campo = (tipo) => [...mp.creados].reverse().find((c) => c.tipo === tipo);

let root;
let container;
let alPagar;

async function pintar(props = {}) {
  alPagar = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <AuthContext.Provider value={{ user: { email: 'duenio@fenix.gym' } }}>
        <CardCheckout plan="PREMIUM" onSuccess={alPagar} {...props} />
      </AuthContext.Provider>,
    );
  });
  // Clave, SDK y montaje de los campos.
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

async function todoListo() {
  for (const t of ['cardNumber', 'expirationDate', 'securityCode']) await campo(t).emitir('ready', { field: t });
}

async function tarjetaValida() {
  for (const t of ['cardNumber', 'expirationDate', 'securityCode']) {
    await campo(t).emitir('validityChange', { field: t, errorMessages: [] });
  }
}

async function escribir(elemento, valor) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(elemento, valor);
  await act(async () => { elemento.dispatchEvent(new Event('input', { bubbles: true })); });
}

const botonPagar = () => container.querySelector('.cobro-pagar');
const tarjeta = () => container.querySelector('.tarjeta-en-vivo');
const inputTitular = () => container.querySelector('input[autocomplete="cc-name"]');
const inputDocumento = () => container.querySelector('.cobro-documento input');

async function pagar() {
  await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.useRealTimers();
  catalogo.planes = CATALOGO;
  servidor.subscribeWithCard.mockReset().mockResolvedValue({ ok: true, state: 'processing' });
  servidor.getBillingStatus.mockReset().mockResolvedValue({ state: 'processing' });
  instalarMercadoPago();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('CardCheckout', () => {
  it('monta los tres campos seguros y habilita Pagar recién cuando están listos', async () => {
    await pintar();
    expect(mp.fields.create.mock.calls.map((c) => c[0])).toEqual(['cardNumber', 'expirationDate', 'securityCode']);
    expect(botonPagar().disabled).toBe(true);

    await todoListo();
    expect(botonPagar().disabled).toBe(false);
    expect(botonPagar().textContent).toContain('Pagar $');
    expect(botonPagar().textContent).toContain('145.000');
    // El resumen dice qué se paga: el plan del catálogo para ese código.
    expect(container.querySelector('.cobro-resumen').textContent).toContain('Veltronik Premium');
  });

  it('⭐ sin plan, la pantalla dice el básico y al backend va BASICO: lo mismo que cobraría', async () => {
    await pintar({ plan: undefined });
    await todoListo();
    expect(botonPagar().textContent).toContain('55.000');
    expect(container.querySelector('.cobro-resumen').textContent).toContain('Veltronik');
    expect(container.querySelector('.cobro-resumen').textContent).not.toContain('Premium');

    await tarjetaValida();
    await escribir(inputTitular(), 'María López');
    await escribir(inputDocumento(), '30111222');
    await pagar();
    expect(servidor.subscribeWithCard).toHaveBeenCalledWith(expect.objectContaining({ plan: 'BASICO' }));
  });

  it('⭐ sin la lista de planes no hay precio: no deja pagar y lo dice', async () => {
    catalogo.planes = [];
    await pintar();
    await todoListo();
    expect(botonPagar().disabled).toBe(true);
    expect(botonPagar().textContent).not.toContain('$');
    expect(container.textContent).toContain('No pudimos confirmar el precio del plan');

    await pagar();
    expect(mp.fields.createCardToken).not.toHaveBeenCalled();
    expect(servidor.subscribeWithCard).not.toHaveBeenCalled();
  });

  it('la tarjeta dibujada muestra la marca y los primeros dígitos, nunca más', async () => {
    await pintar();
    await todoListo();
    await campo('cardNumber').emitir('binChange', { bin: '45099535', field: 'cardNumber' });

    expect(mp.getPaymentMethods).toHaveBeenCalledWith({ bin: '45099535' });
    expect(tarjeta().dataset.marca).toBe('visa');
    expect(tarjeta().textContent).toContain('4509 9535 •••• ••••');
    // Y ajusta los campos a lo que pide la marca.
    expect(campo('cardNumber').actualizado).toEqual([{ settings: { length: 16, validation: 'standard' } }]);
  });

  it('se da vuelta cuando se va al código de seguridad', async () => {
    await pintar();
    await todoListo();
    expect(tarjeta().classList.contains('dada-vuelta')).toBe(false);
    await campo('securityCode').emitir('focus', { field: 'securityCode' });
    expect(tarjeta().classList.contains('dada-vuelta')).toBe(true);
    await campo('securityCode').emitir('blur', { field: 'securityCode' });
    expect(tarjeta().classList.contains('dada-vuelta')).toBe(false);
  });

  it('el titular aparece en la tarjeta mientras se escribe', async () => {
    await pintar();
    await todoListo();
    await escribir(inputTitular(), 'maría lópez');
    expect(tarjeta().textContent).toContain('MARÍA LÓPEZ');
  });

  it('⭐ con datos de menos no se pide token ni se cobra: se marca qué falta', async () => {
    await pintar();
    await todoListo();
    await pagar();

    expect(mp.fields.createCardToken).not.toHaveBeenCalled();
    expect(servidor.subscribeWithCard).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Revisá los datos marcados.');
    expect(container.textContent).toContain('Escribí el nombre como figura en la tarjeta.');
  });

  it('⭐ al servidor le llega el token, el email y el PLAN — nunca el precio', async () => {
    await pintar();
    await todoListo();
    await tarjetaValida();
    await escribir(inputTitular(), '  María López ');
    await escribir(inputDocumento(), '30.111.222');
    await pagar();

    expect(mp.fields.createCardToken).toHaveBeenCalledWith({
      cardholderName: 'María López',
      identificationType: 'DNI',
      identificationNumber: '30111222',
    });
    expect(servidor.subscribeWithCard).toHaveBeenCalledWith({
      card_token: 'tok_1',
      payer_email: 'duenio@fenix.gym',
      plan: 'PREMIUM',
    });
    // Recién con el token se ven los últimos 4 y el vencimiento.
    expect(tarjeta().textContent).toContain('3704');
    expect(tarjeta().textContent).toContain('11/30');
    expect(tarjeta().dataset.estado).toBe('pagando');
  });

  it('cuando el cobro entra: "Pagado", la tarjeta en verde, y después avisa', async () => {
    await pintar();
    await todoListo();
    await tarjetaValida();
    await escribir(inputTitular(), 'María López');
    await escribir(inputDocumento(), '30111222');
    vi.useFakeTimers();
    servidor.getBillingStatus.mockResolvedValue({ state: 'active' });
    await pagar();

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(tarjeta().dataset.estado).toBe('aprobada');
    expect(container.textContent).toContain('Pagado');
    expect(container.textContent).toContain('terminada en 3704');
    expect(alPagar).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
    expect(alPagar).toHaveBeenCalledTimes(1);
  });

  it('rechazado: dice el motivo y "Probar con otra tarjeta" arma campos nuevos', async () => {
    await pintar();
    await todoListo();
    await tarjetaValida();
    await escribir(inputTitular(), 'María López');
    await escribir(inputDocumento(), '30111222');
    vi.useFakeTimers();
    servidor.getBillingStatus.mockResolvedValue({ state: 'rejected', detail: 'cc_rejected_insufficient_amount' });
    await pagar();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

    expect(tarjeta().dataset.estado).toBe('rechazada');
    expect(container.textContent).toContain('El cobro fue rechazado');
    expect(container.textContent).toContain('no tiene cupo');

    vi.useRealTimers();
    const antes = mp.fields.create.mock.calls.length;
    const reintentar = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Probar con otra tarjeta'));
    await act(async () => { reintentar.click(); });
    for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
    expect(mp.fields.create.mock.calls.length).toBe(antes + 3);
    // El titular queda: lo común es probar otra tarjeta de la misma persona.
    expect(inputTitular().value).toBe('María López');
  });

  it('si Mercado Pago no da el token, vuelve al formulario y no cobra', async () => {
    mp.fields.createCardToken.mockRejectedValueOnce(new Error('bad_request'));
    await pintar();
    await todoListo();
    await tarjetaValida();
    await escribir(inputTitular(), 'María López');
    await escribir(inputDocumento(), '30111222');
    await pagar();

    expect(servidor.subscribeWithCard).not.toHaveBeenCalled();
    expect(botonPagar().disabled).toBe(false);
    expect(container.textContent).toContain('Mercado Pago no aceptó los datos de la tarjeta');
  });
});
