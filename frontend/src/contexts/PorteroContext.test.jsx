// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - El portero: la puerta atendida en cualquier pantalla (03/11/2026)
// ============================================
// Antes la puerta vivía en la pantalla Accesos: con el profe cobrando en Pagos, el molinete no
// abría para nadie, la X no sonaba, el lector escribía el llavero en el monto, y al volver a
// Accesos lo que había pasado se daba por visto sin haber sonado. Lo que se defiende acá es lo
// que pasa FUERA de Accesos, en el escritorio. Lo de adentro de Accesos lo prueban
// los AccessPage.*.test (que montan este mismo portero).
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';

const config = vi.hoisted(() => ({ IS_DESKTOP: true, ROUTES: { ACCESS: '/access' } }));
vi.mock('../lib/config', () => ({ default: config }));

const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('./ToastContext', () => ({ useToast: () => toast }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ orgId: 'g1', user: { id: 'u1' } }) }));

const servicios = vi.hoisted(() => ({
  accessService: {
    getMostrador: vi.fn(), checkIn: vi.fn(), anotarRechazo: vi.fn(),
    marcarAvisoVisto: vi.fn(), marcarRechazoVisto: vi.fn(),
  },
  memberService: { buscarPorLlavero: vi.fn(), getMemberById: vi.fn(), searchForAccess: vi.fn() },
  errorService: { getMessage: (e) => String(e?.message || e) },
  planService: { getVigentes: vi.fn() },
  paymentService: { createPayment: vi.fn() },
  llaveroService: { asignar: vi.fn() },
}));
vi.mock('../services', () => servicios);

// Lo que sabe el mostrador. Mutable: cambiarlo y volver a dibujar es "llegó una novedad".
const puerta = vi.hoisted(() => ({ datos: null }));
vi.mock('../hooks', () => ({
  useQueryCache: () => ({ data: puerta.datos, isFetching: false, invalidate: () => {} }),
  useRefrescoAutomatico: () => {},
  useEstaEnLinea: () => true,
  useNovedadesDeLaPuerta: () => {},
}));

vi.mock('../lib/localMembers', () => ({
  prepararSocios: vi.fn(),
  refrescarSocios: vi.fn(() => Promise.resolve()),
  REFRESCO_MS: 999999,
  socioLocalPorId: vi.fn(() => null),
}));
vi.mock('../lib/colaAccesos', () => ({
  resumenDeCola: async () => ({ cuantos: 0, dias: 0, trabada: null }),
  sociosConCobroPendiente: async () => [],
}));
vi.mock('../components/VaciadorDeCola', () => ({ EVENTO_COLA_CAMBIO: 'veltronik-cola-cambio' }));

const sonido = vi.hoisted(() => ({
  sonarVencido: vi.fn(), sonarVencidoDirecto: vi.fn(), sonarEntrada: vi.fn(),
  sonarLlaveroDesconocido: vi.fn(), prepararSonido: vi.fn(),
}));
vi.mock('../lib/alertaSonora', () => sonido);

const cajita = vi.hoisted(() => ({ manda: true, abrirSiPasa: vi.fn(() => true) }));
vi.mock('../lib/cajitaMolinete', () => ({
  abrirSiPasa: cajita.abrirSiPasa,
  laCajitaManda: () => cajita.manda,
  ordenarALaCajita: vi.fn(),
}));
vi.mock('../hooks/useCajitaMolinete', () => ({ useCajitaMolinete: () => ({ fase: 'conectada' }) }));
vi.mock('../components/Icon', () => ({ default: () => null }));

const { PorteroProvider } = await import('./PorteroContext');

const AL_DIA = { id: 'm1', fullName: 'Ana Paz', dni: '30111222', situacion: 'AL_DIA', diasRestantes: 20 };
const VACIO = { adentro: [], avisos: [], rechazos: [], ingresos: [], hoyTotal: 0 };
const ahora = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** Pagos, de mentira: un monto que el profe está escribiendo, y un botón para irse a Accesos. */
function Pagos() {
  const navigate = useNavigate();
  const [monto, setMonto] = useState('15000');
  return (
    <div>
      <input aria-label="monto" value={monto} onChange={(e) => setMonto(e.target.value)} />
      <button type="button" onClick={() => navigate('/access')}>a Accesos</button>
    </div>
  );
}

let root;
let contenedor;

function arbol(ruta) {
  return (
    <MemoryRouter initialEntries={[ruta]}>
      <PorteroProvider>
        <Routes>
          <Route path="/payments" element={<Pagos />} />
          <Route path="/access" element={<div>la pantalla de Accesos</div>} />
        </Routes>
      </PorteroProvider>
    </MemoryRouter>
  );
}

async function esperar() {
  for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); });
}

async function pintar(ruta = '/payments') {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  await act(async () => { root.render(arbol(ruta)); });
  await esperar();
}

/** Llegó una novedad de la puerta: el mismo portero, con datos nuevos. */
async function llega(datos) {
  puerta.datos = { ...puerta.datos, ...datos };
  await act(async () => { root.render(arbol('/payments')); });
  await esperar();
}

const setValorNativo = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

/** El lector escribe en lo que tenga el foco: keydown, y la letra si nadie la frenó. */
async function pasarElLlavero(el, codigo, desde = 10_000) {
  let t = desde;
  await act(async () => {
    for (const c of codigo) {
      const tecla = new KeyboardEvent('keydown', { key: c, bubbles: true, cancelable: true });
      Object.defineProperty(tecla, 'timeStamp', { value: t });
      el.dispatchEvent(tecla);
      if (!tecla.defaultPrevented && 'value' in el) {
        setValorNativo.call(el, el.value + c);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      t += 5;
    }
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(enter, 'timeStamp', { value: t });
    el.dispatchEvent(enter);
  });
  await esperar();
}

const texto = () => contenedor.textContent;
const boton = (que) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.includes(que));
const monto = () => contenedor.querySelector('input[aria-label="monto"]');

beforeEach(() => {
  vi.clearAllMocks();
  config.IS_DESKTOP = true;
  cajita.manda = true;
  puerta.datos = { ...VACIO };
  servicios.accessService.checkIn.mockResolvedValue({ direccion: 'ENTRADA' });
  servicios.accessService.anotarRechazo.mockResolvedValue({ resultado: 'RECHAZADO' });
  servicios.accessService.marcarAvisoVisto.mockResolvedValue();
  servicios.accessService.marcarRechazoVisto.mockResolvedValue();
  servicios.memberService.buscarPorLlavero.mockResolvedValue({ socios: [AL_DIA], ultimaBaja: null });
  servicios.planService.getVigentes.mockResolvedValue([]);
});

afterEach(() => {
  if (root) act(() => root.unmount());
  contenedor?.remove();
  root = null;
  contenedor = null;
});

describe('⭐ el profe está en Pagos y pasan un llavero', () => {
  it('entra, suena el «din-din» y el molinete abre, sin que el profe deje lo que está haciendo', async () => {
    await pintar('/payments');
    await pasarElLlavero(monto(), '0012345678');

    expect(servicios.memberService.buscarPorLlavero).toHaveBeenCalledWith('0012345678');
    expect(servicios.accessService.checkIn).toHaveBeenCalledWith('m1', 'LLAVERO', 'Ana Paz');
    expect(sonido.sonarEntrada).toHaveBeenCalledTimes(1);
    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ pasa: true });
    // Y el cartel, chico, en el rincón.
    expect(texto()).toContain('Ana Paz');
    expect(texto()).toContain('Entrada registrada');
  });

  it('🔴 el número del llavero NO queda en el monto que el profe estaba escribiendo', async () => {
    await pintar('/payments');
    await pasarElLlavero(monto(), '0012345678');
    expect(monto().value).toBe('15000');
  });

  it('el de nadie: el aviso para asignárselo a un socio aparece ahí mismo', async () => {
    servicios.memberService.buscarPorLlavero.mockResolvedValue({ socios: [], ultimaBaja: null });
    await pintar('/payments');
    await pasarElLlavero(monto(), '0099999999');

    expect(texto()).toContain('Llavero sin asignar');
    expect(texto()).toContain('0099999999');
    expect(servicios.accessService.checkIn).not.toHaveBeenCalled();
    expect(sonido.sonarLlaveroDesconocido).toHaveBeenCalledTimes(1);
  });
});

describe('⭐ lo que llega solo, mientras el profe está en otra pantalla', () => {
  const qr = (accesoId, situacion = 'AL_DIA') => ({
    accesoId, socioId: 'm9', nombre: 'Juan Bautista', situacion,
    diasVencido: situacion === 'VENCIDO' ? 3 : 0, diasRestantes: situacion === 'AL_DIA' ? 12 : 0, hora: ahora(),
  });

  it('el que entra por QR abre el molinete y sale en el rincón', async () => {
    await pintar('/payments');
    await llega({ ingresos: [qr('qr1')] });

    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ pasa: true });
    expect(texto()).toContain('Juan Bautista');
    expect(texto()).toContain('Entrada por QR');
  });

  it('el vencido que entra por QR hace sonar la X', async () => {
    await pintar('/payments');
    await llega({ ingresos: [qr('qr2', 'VENCIDO')] });
    expect(sonido.sonarVencido).toHaveBeenCalledTimes(1);
  });

  it('🔴 volver a Accesos no se come lo que pasó, ni lo repite', async () => {
    await pintar('/payments');
    await llega({ ingresos: [qr('qr3')] });
    expect(cajita.abrirSiPasa).toHaveBeenCalledTimes(1);

    await act(async () => { boton('a Accesos').click(); });
    await esperar();
    expect(texto()).toContain('la pantalla de Accesos');
    expect(cajita.abrirSiPasa, 'el mismo QR no vuelve a abrir al cambiar de pantalla').toHaveBeenCalledTimes(1);
  });

  it('lo que ya estaba al arrancar el programa no suena ni abre', async () => {
    puerta.datos = { ...VACIO, ingresos: [qr('viejo')] };
    await pintar('/payments');
    expect(cajita.abrirSiPasa).not.toHaveBeenCalled();
  });
});

describe('⭐ la tarjeta del rincón: quién necesita atención, con «Cobrar»', () => {
  const avisoLlavero = () => ({
    accesoId: 'a1', socioId: 'm1', nombre: 'Ana Paz', estado: 'EN_GRACIA', diasVencido: 2, hora: ahora(), metodo: 'LLAVERO',
  });

  it('dice quién, por dónde entró, y se le cobra ahí mismo', async () => {
    puerta.datos = { ...VACIO, avisos: [avisoLlavero()] };
    await pintar('/payments');

    expect(texto()).toContain('1 socio necesita atención');
    expect(texto()).toContain('entró con el llavero');

    await act(async () => { boton('Cobrar').click(); });
    await esperar();
    expect(texto()).toContain('Cobrar cuota: Ana Paz');
  });

  it('⭐ cobrarle al que frenó la cajita: se le registra la entrada, se le abre y sale de la lista', async () => {
    puerta.datos = {
      ...VACIO,
      rechazos: [{ accesoId: 'r1', socioId: 'm1', nombre: 'Ana Paz', estado: 'VENCIDO', diasVencido: 6, hora: ahora(), delMostrador: true }],
    };
    servicios.paymentService.createPayment.mockResolvedValue({ id: 'p1' });
    servicios.memberService.getMemberById.mockResolvedValue({
      id: 'm1', firstName: 'Ana', lastName: 'Paz', situacion: 'AL_DIA', diasRestantes: 30, membershipEnd: '2026-12-03T00:00:00',
    });
    await pintar('/payments');

    await act(async () => { boton('Cobrar').click(); });
    await esperar();
    const importe = contenedor.querySelector('.cobro-monto');
    await act(async () => {
      setValorNativo.call(importe, '22000');
      importe.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { importe.form.requestSubmit(); });
    await esperar();

    expect(servicios.paymentService.createPayment).toHaveBeenCalledWith(expect.objectContaining({ member_id: 'm1', amount: 22000 }));
    expect(servicios.accessService.marcarRechazoVisto).toHaveBeenCalledWith('r1');
    expect(servicios.accessService.checkIn).toHaveBeenCalledWith('m1', 'LLAVERO', 'Ana Paz');
    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ pasa: true });
  });

  it('al que frenó el molinete FACIAL no se le registra nada: lo vuelve a dejar pasar el equipo', async () => {
    puerta.datos = {
      ...VACIO,
      rechazos: [{ accesoId: 'r2', socioId: 'm1', nombre: 'Ana Paz', estado: 'VENCIDO', diasVencido: 6, hora: ahora(), delMostrador: false }],
    };
    servicios.paymentService.createPayment.mockResolvedValue({ id: 'p2' });
    servicios.memberService.getMemberById.mockResolvedValue({ id: 'm1', firstName: 'Ana', lastName: 'Paz', situacion: 'AL_DIA' });
    await pintar('/payments');

    await act(async () => { boton('Cobrar').click(); });
    await esperar();
    const importe = contenedor.querySelector('.cobro-monto');
    await act(async () => {
      setValorNativo.call(importe, '22000');
      importe.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { importe.form.requestSubmit(); });
    await esperar();

    expect(servicios.accessService.marcarRechazoVisto).toHaveBeenCalledWith('r2');
    expect(servicios.accessService.checkIn).not.toHaveBeenCalled();
  });
});

describe('en la web, la puerta es de Accesos (como siempre)', () => {
  it('fuera de Accesos no escucha el lector ni muestra la tarjeta', async () => {
    config.IS_DESKTOP = false;
    puerta.datos = { ...VACIO, avisos: [{ accesoId: 'a9', socioId: 'm1', nombre: 'Ana Paz', estado: 'VENCIDO', diasVencido: 3, hora: ahora(), metodo: 'QR' }] };
    await pintar('/payments');
    await pasarElLlavero(monto(), '0012345678');

    expect(servicios.memberService.buscarPorLlavero).not.toHaveBeenCalled();
    expect(texto()).not.toContain('necesita atención');
  });
});
