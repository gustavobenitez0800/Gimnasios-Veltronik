// ============================================
// VELTRONIK - Lo que comparten los tests de la pantalla de la puerta
// ============================================
// No es un test (no termina en .test.jsx): lo importan AccessPage.test.jsx y
// AccessPage.sinConexion.test.jsx. Antes era la cabecera de un solo archivo de 1.001 líneas.
//
// Al importarlo pasan tres cosas, en este orden:
//   1. se registran los mocks (vi.mock) de todo lo que la pantalla usa alrededor;
//   2. se carga la pantalla DESPUÉS de los mocks (el `await import` de abajo), así los toma;
//   3. se registran el beforeEach y el afterEach que dejan cada prueba con el mostrador vacío.
//
// ⚠️ Un cambio acá cambia las pruebas de LOS DOS archivos: correr los dos.

import { vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/** Estables a propósito: un objeto nuevo por render dispara un bucle infinito y cuelga el test. */
export const toastEstable = { showToast: vi.fn() };
// Mutable: el botón del cartel del QR es solo del dueño, así que hay tests de los dos lados.
// El OBJETO es siempre el mismo (uno nuevo por render cuelga el test en un bucle).
export const authEstable = { orgRole: 'reception' };

export const memberService = { searchForAccess: vi.fn(), buscarPorLlavero: vi.fn(), getMemberById: vi.fn() };
export const accessService = {
  getMostrador: vi.fn(), checkIn: vi.fn(), checkOut: vi.fn(),
  anotarRechazo: vi.fn(), marcarAvisoVisto: vi.fn(), marcarRechazoVisto: vi.fn(),
};
const errorService = { getMessage: (e) => String(e?.message || e) };
// Lo que usan el cobro y el aviso del llavero, que ahora viven en el portero (y el portero se
// monta en las pruebas: la pantalla vive adentro de él, como en la app).
export const planService = { getVigentes: vi.fn() };
export const paymentService = { createPayment: vi.fn() };
export const llaveroService = { asignar: vi.fn() };

vi.mock('../contexts/ToastContext', () => ({ useToast: () => toastEstable }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authEstable }));
vi.mock('../services', () => ({
  memberService, accessService, errorService, planService, paymentService, llaveroService,
}));
vi.mock('../lib/localMembers', () => ({
  prepararSocios: vi.fn(),
  refrescarSocios: vi.fn(() => Promise.resolve()),
  REFRESCO_MS: 999999,
  socioLocalPorId: vi.fn(() => null),
}));
vi.mock('../lib/gym', () => ({ GYM: { placeLabel: 'gimnasio', placeLabelCap: 'Gimnasio' } }));

// El caché real dispararía pedidos y temporizadores que no tienen que ver con lo que se
// prueba acá. Se le entrega el dato ya resuelto.
//
// Va dentro de una caja MUTABLE porque el mostrador se refresca solo cada quince segundos, y
// media pantalla reacciona a que ese dato cambie —el cartel del QR, sin ir más lejos—. Con
// un objeto fijo no habría forma de simular "llegó alguien nuevo".
// Objeto común y no vi.hoisted: vitest no deja exportar una variable de vi.hoisted, y no
// hace falta — el mock de ../hooks la lee recién al cargar la pantalla, cuando ya existe.
export const mostrador = {
  datos: { adentro: [], hoy: [], avisos: [], ingresos: [], hoyTotal: 0, hoyPromedioMin: null },
  /** Cuántas veces la pantalla pidió novedades de la puerta. */
  refrescos: 0,
};
// ⚠️ El caché se reemplaza, pero `useRefrescoAutomatico` va REAL: es justo lo que prueba el
// test del latido, y mockearlo lo dejaría verificando nada.
vi.mock('../hooks', async () => {
  const { useRefrescoAutomatico } = await vi.importActual('../hooks/useRefrescoAutomatico');
  // ⚠️ Este va REAL, igual que el latido: el test de "sin red no se insiste" prueba
  // justamente que los dos se hablen. Con un mock verificaría nada.
  const { useEstaEnLinea } = await vi.importActual('../hooks/useEstaEnLinea');
  return {
    useRefrescoAutomatico,
    useEstaEnLinea,
    // La escucha rápida de la puerta tiene sus propios tests (useNovedadesDeLaPuerta.test).
    useNovedadesDeLaPuerta: () => {},
    useQueryCache: () => ({
      data: mostrador.datos,
      loading: false,
      isFetching: false,
      // ⚠️ Nace NUEVA en cada render A PROPÓSITO: así era el `invalidate` que rompía el
      // refresco (ver el test del latido, abajo). La pantalla tiene que aguantarlo igual.
      invalidate: () => { mostrador.refrescos += 1; },
    }),
  };
});

vi.mock('../components/EstadoCopiaLocal', () => ({ default: () => null }));
vi.mock('../components/AvisosMostrador', () => ({ default: () => null }));
vi.mock('../components/CheckinQrPanel', () => ({ default: () => null }));
// El QR para escanear pide su propio dato al servidor: acá solo importa DÓNDE está y a quién
// se le ofrece crearlo.
vi.mock('../components/QrParaEscanear', () => ({
  default: ({ puedeCrear }) => <aside className="access-qr qr-falso" data-puede-crear={String(!!puedeCrear)} />,
}));
vi.mock('../components/Layout', () => ({ PageHeader: () => null }));
vi.mock('../components/Icon', () => ({ default: () => null }));

// La cola: por defecto vacía, que es lo que ve el 99% de los días. Los tests del aviso la
// cambian para simular un gimnasio que hace días no puede subir nada.
export const colaFalsa = { cuantos: 0, dias: 0, trabada: null, sociosConCobro: [] };
vi.mock('../lib/colaAccesos', () => ({
  resumenDeCola: async () => (
    { cuantos: colaFalsa.cuantos, dias: colaFalsa.dias, desde: null, trabada: colaFalsa.trabada }
  ),
  sociosConCobroPendiente: async () => [...colaFalsa.sociosConCobro],
}));

// La X del socio vencido: se verifica CUÁNDO se pide, no el sonido en sí (en un DOM de prueba
// no hay placa de audio). El sonido y la música se prueban en lib/alertaSonora.test.js.
export const sonido = { // común, no vi.hoisted: ver `mostrador`
  sonarVencido: vi.fn(), sonarVencidoDirecto: vi.fn(), sonarEntrada: vi.fn(), sonarLlaveroDesconocido: vi.fn(),
  prepararSonido: vi.fn(),
};
vi.mock('../lib/alertaSonora', () => sonido);

export const { default: AccessPage } = await import('./AccessPage');
// La pantalla es una VISTA del portero de la puerta: en la app lo monta AppLayout, acá se monta
// a mano alrededor de ella (con su ruta, que es lo que le dice que está en Accesos).
const { PorteroProvider } = await import('../contexts/PorteroContext');

export const SOCIO = {
  id: 'm1',
  fullName: 'Lurdes Rollet',
  dni: '24732531',
  situacion: 'AL_DIA',
  diasRestantes: 12,
  clasesRestantes: null,
};
export const OTRO = { ...SOCIO, id: 'm2', fullName: 'Lurdes Romero' };

export let root;
export let container;

/**
 * La pantalla como la monta la app: adentro del portero y en su ruta. Volver a dibujarla con esto
 * (lo que hacen los tests del refresco) conserva al MISMO portero, como pasa de verdad.
 */
export function dibujo() {
  return (
    <MemoryRouter initialEntries={['/access']}>
      <PorteroProvider>
        <AccessPage />
      </PorteroProvider>
    </MemoryRouter>
  );
}

export async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(dibujo()); });
  await act(async () => { await Promise.resolve(); });
  return container;
}

/** El campo del DNI. */
export const campo = () => container.querySelector('.search-input');

/**
 * Escribe en el campo como lo haría una persona.
 *
 * ⚠️ Hay que pasar por el setter NATIVO. React le pone su propio rastreador de valor al
 * input, así que un `el.value = ...` a mano no le parece un cambio y el `onChange` nunca
 * corre: el campo se ve escrito en pantalla pero el estado queda vacío, y el Enter no
 * encuentra nada que buscar.
 */
const setValorNativo = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value',
).set;

export async function tipear(texto) {
  const el = campo();
  await act(async () => {
    setValorNativo.call(el, texto);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export async function apretar(key, target) {
  const destino = target || campo();
  await act(async () => {
    destino.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
  // El Enter encadena promesas —buscar, después registrar, después repintar— así que un
  // solo tick no alcanza: el test vería la pantalla a mitad de camino.
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  // Cada test arranca con el mostrador vacío: si uno dejara un ingreso puesto, el siguiente
  // vería un cartel que no disparó él.
  mostrador.datos = { adentro: [], hoy: [], avisos: [], ingresos: [], hoyTotal: 0, hoyPromedioMin: null };
  mostrador.refrescos = 0;
  colaFalsa.cuantos = 0;
  colaFalsa.dias = 0;
  colaFalsa.trabada = null;
  colaFalsa.sociosConCobro = [];
  accessService.getMostrador.mockResolvedValue(mostrador.datos);
  accessService.checkIn.mockResolvedValue({ direccion: 'ENTRADA' });
  accessService.anotarRechazo.mockResolvedValue({ resultado: 'RECHAZADO' });
  accessService.marcarAvisoVisto.mockResolvedValue();
  accessService.marcarRechazoVisto.mockResolvedValue();
  memberService.searchForAccess.mockResolvedValue([SOCIO]);
  memberService.buscarPorLlavero.mockResolvedValue({ socios: [], ultimaBaja: null });
  planService.getVigentes.mockResolvedValue([]);
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});
