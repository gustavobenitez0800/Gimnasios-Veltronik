// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - El mostrador abre el molinete (la cajita del relé)
// ============================================
// El molinete abre con el MISMO veredicto que pinta el cartel y hace sonar la X: si el cartel
// dice "al día", abre; si dice "vencido", no. No hay una segunda cuenta de fechas.
// La cajita en sí (puerto, PING, órdenes) se prueba en lib/cajitaMolinete.test.js; acá importa
// CUÁNDO el mostrador le pide que abra.
//
// La preparación copia la de AccessPage.test.jsx (ese archivo ya pasa las 1000 líneas).
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const toastEstable = { showToast: vi.fn() };
const authEstable = { orgRole: 'reception' };
const memberService = { searchForAccess: vi.fn() };
const accessService = { getMostrador: vi.fn(), checkIn: vi.fn(), checkOut: vi.fn() };
const errorService = { getMessage: (e) => String(e?.message || e) };

vi.mock('../contexts/ToastContext', () => ({ useToast: () => toastEstable }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authEstable }));
vi.mock('../services', () => ({ memberService, accessService, errorService }));
vi.mock('../lib/localMembers', () => ({
  prepararSocios: vi.fn(),
  refrescarSocios: vi.fn(() => Promise.resolve()),
  REFRESCO_MS: 999999,
}));
vi.mock('../lib/gym', () => ({ GYM: { placeLabel: 'gimnasio', placeLabelCap: 'Gimnasio' } }));

const mostrador = vi.hoisted(() => ({
  datos: { adentro: [], hoy: [], avisos: [], ingresos: [], hoyTotal: 0, hoyPromedioMin: null },
}));
vi.mock('../hooks', async () => {
  const { useRefrescoAutomatico } = await vi.importActual('../hooks/useRefrescoAutomatico');
  const { useEstaEnLinea } = await vi.importActual('../hooks/useEstaEnLinea');
  return {
    useRefrescoAutomatico,
    useEstaEnLinea,
    useNovedadesDeLaPuerta: () => {},
    useQueryCache: () => ({ data: mostrador.datos, loading: false, isFetching: false, invalidate: () => {} }),
  };
});
vi.mock('../components/EstadoCopiaLocal', () => ({ default: () => null }));
vi.mock('../components/AvisosMostrador', () => ({ default: () => null }));
vi.mock('../components/CheckinQrPanel', () => ({ default: () => null }));
vi.mock('../components/QrParaEscanear', () => ({ default: () => null }));
vi.mock('../components/Layout', () => ({ PageHeader: () => null }));
vi.mock('../components/Icon', () => ({ default: () => null }));

const colaFalsa = { sociosConCobro: [] };
vi.mock('../lib/colaAccesos', () => ({
  resumenDeCola: async () => ({ cuantos: 0, dias: 0, desde: null, trabada: null }),
  sociosConCobroPendiente: async () => [...colaFalsa.sociosConCobro],
}));
vi.mock('../lib/alertaSonora', () => ({ sonarVencido: vi.fn() }));

// La cajita: lo que importa es qué le pide el mostrador.
const cajita = vi.hoisted(() => ({
  estado: { fase: 'conectada', version: 'veltronik-molinete 1', habilitada: true },
  abrirSiPasa: vi.fn(() => true),
  ordenarALaCajita: vi.fn(async () => true),
}));
vi.mock('../lib/cajitaMolinete', () => ({
  abrirSiPasa: cajita.abrirSiPasa,
  ordenarALaCajita: cajita.ordenarALaCajita,
}));
vi.mock('../hooks/useCajitaMolinete', () => ({ useCajitaMolinete: () => cajita.estado }));

const { default: AccessPage } = await import('./AccessPage');

const SOCIO = { id: 'm1', fullName: 'Lurdes Rollet', dni: '24732531', situacion: 'AL_DIA', diasRestantes: 12 };
const VENCIDO = { ...SOCIO, situacion: 'VENCIDO', diasVencido: 5, diasRestantes: 0 };

let root;
let container;

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<AccessPage />); });
  await act(async () => { await Promise.resolve(); });
}

const setValorNativo = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

/** Teclea el DNI y aprieta Enter, como el socio en la puerta. */
async function entrar(dni = '24732531') {
  const el = container.querySelector('.search-input');
  await act(async () => {
    setValorNativo.call(el, dni);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

const boton = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(texto));

beforeEach(() => {
  vi.clearAllMocks();
  mostrador.datos = { adentro: [], hoy: [], avisos: [], ingresos: [], hoyTotal: 0, hoyPromedioMin: null };
  colaFalsa.sociosConCobro = [];
  cajita.estado = { fase: 'conectada', version: 'veltronik-molinete 1', habilitada: true };
  accessService.getMostrador.mockResolvedValue(mostrador.datos);
  accessService.checkIn.mockResolvedValue({ direccion: 'ENTRADA' });
  memberService.searchForAccess.mockResolvedValue([SOCIO]);
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe('⭐ el molinete abre con el mismo veredicto que el cartel', () => {
  it('entra al día: abre', async () => {
    await pintar();
    await entrar();
    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ pasa: true });
  });

  it('entra con la cuota vencida: no abre', async () => {
    memberService.searchForAccess.mockResolvedValue([VENCIDO]);
    await pintar();
    await entrar();
    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ pasa: false });
  });

  it('⭐ vencido pero acaba de pagar (el cobro todavía no subió): abre', async () => {
    memberService.searchForAccess.mockResolvedValue([VENCIDO]);
    colaFalsa.sociosConCobro = ['m1'];
    await pintar();
    await entrar();
    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ pasa: true });
  });

  it('sin fecha cargada: no abre (lo decide quien atiende, con el botón)', async () => {
    memberService.searchForAccess.mockResolvedValue([{ ...SOCIO, situacion: 'SIN_DATOS' }]);
    await pintar();
    await entrar();
    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ pasa: false });
  });

  it('el que SALE no abre el molinete: la salida es por la puerta', async () => {
    accessService.checkIn.mockResolvedValue({ direccion: 'SALIDA' });
    await pintar();
    await entrar();
    expect(cajita.abrirSiPasa).not.toHaveBeenCalled();
  });

  it('un rebote (ya estaba marcado) no abre de nuevo: pasarían dos con el mismo DNI', async () => {
    accessService.checkIn.mockResolvedValue({ direccion: 'REBOTE' });
    await pintar();
    await entrar();
    expect(cajita.abrirSiPasa).not.toHaveBeenCalled();
  });

  it('⭐ sin internet abre igual: decide la copia local, la misma que pinta el cartel', async () => {
    accessService.checkIn.mockResolvedValue({ encolado: true });
    await pintar();
    await entrar();
    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ pasa: true });
  });

  it('entra por QR al día: abre', async () => {
    await pintar();
    mostrador.datos = {
      ...mostrador.datos,
      ingresos: [{ accesoId: 'qr1', socioId: 'm9', nombre: 'Juan Bautista', situacion: 'AL_DIA', diasRestantes: 20, hora: '2026-11-01T19:00:00' }],
    };
    await act(async () => { root.render(<AccessPage />); });
    for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ pasa: true });
  });
});

describe('el botón «Abrir molinete» de quien atiende', () => {
  it('con la cajita conectada está, y abre sin registrar a nadie', async () => {
    await pintar();
    await act(async () => { boton('Abrir molinete').click(); });
    expect(cajita.ordenarALaCajita).toHaveBeenCalledWith('ABRIR');
    expect(accessService.checkIn).not.toHaveBeenCalled();
  });

  it('sin cajita no se dibuja: un botón que no puede andar hace que lo aprieten tres veces', async () => {
    cajita.estado = { fase: 'sin-cajita', version: null, habilitada: true };
    await pintar();
    expect(boton('Abrir molinete')).toBeUndefined();
  });
});
