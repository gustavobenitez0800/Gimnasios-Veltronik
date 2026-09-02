// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests de la pantalla de la puerta
// ============================================
// Esta pantalla se usa como un MOLINETE: el socio teclea su DNI o su nombre, aprieta Enter,
// entra, y el campo queda vacío esperando al que sigue. Nadie toca el mouse entre una
// persona y la otra. Todo lo que se prueba acá defiende ese flujo.
//
//   1. EL TECLADO NO SE APAGA. El foco se perdía por motivos que nadie en un mostrador puede
//      adivinar (alguien tocó la pantalla en un lugar vacío, volvió de otra sección) y a
//      partir de ahí las teclas caían en la nada y el sistema parecía colgado.
//   2. PERO NO SE LO ROBA A NADIE. Si alguien está escribiendo en otro campo, arrancarle el
//      teclado de las manos sería el mismo bug al revés.
//   3. ENTER REGISTRA Y LIMPIA. Y con varios resultados NO elige por nadie: registrarle la
//      entrada a la persona equivocada deja DOS datos mal, uno que entró sin estar y otro
//      que estaba sin figurar.
//   4. EL AVISO NO TAPA LA PANTALLA. Antes era un overlay de pantalla completa: tres
//      segundos por persona en los que nadie podía tipear, justo cuando había cola.
//
// ⚠️ Lo que NO se puede probar acá: que la tecla que se roba el foco ADEMÁS se escriba. Eso
// depende de que el navegador entregue el keydown al elemento recién enfocado, y un DOM de
// mentira no lo reproduce. Se verifica en un navegador de verdad.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/** Estables a propósito: un objeto nuevo por render dispara un bucle infinito y cuelga el test. */
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

// El caché real dispararía pedidos y temporizadores que no tienen que ver con lo que se
// prueba acá. Se le entrega el dato ya resuelto.
const datosMostrador = { adentro: [], hoy: [], avisos: [], hoyTotal: 0, hoyPromedioMin: null };
vi.mock('../hooks', () => ({
  useQueryCache: () => ({ data: datosMostrador, loading: false, invalidate: vi.fn() }),
}));

vi.mock('../components/EstadoCopiaLocal', () => ({ default: () => null }));
vi.mock('../components/AvisosMostrador', () => ({ default: () => null }));
vi.mock('../components/CheckinQrPanel', () => ({ default: () => null }));
vi.mock('../components/Layout', () => ({ PageHeader: () => null }));
vi.mock('../components/Icon', () => ({ default: () => null }));

const { default: AccessPage } = await import('./AccessPage');

const SOCIO = {
  id: 'm1',
  fullName: 'Lurdes Rollet',
  dni: '24732531',
  situacion: 'AL_DIA',
  diasRestantes: 12,
  clasesRestantes: null,
};
const OTRO = { ...SOCIO, id: 'm2', fullName: 'Lurdes Romero' };

let root;
let container;

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<AccessPage />); });
  await act(async () => { await Promise.resolve(); });
  return container;
}

/** El campo del DNI. */
const campo = () => container.querySelector('.search-input');

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

async function tipear(texto) {
  const el = campo();
  await act(async () => {
    setValorNativo.call(el, texto);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function apretar(key, target) {
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
  accessService.getMostrador.mockResolvedValue(datosMostrador);
  accessService.checkIn.mockResolvedValue({ direccion: 'ENTRADA' });
  memberService.searchForAccess.mockResolvedValue([SOCIO]);
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe('la puerta se maneja con el teclado', () => {

  it('el campo del DNI arranca con el foco', async () => {
    await pintar();
    expect(document.activeElement).toBe(campo());
  });

  it('una tecla suelta con el foco en la nada se lo lleva al campo', async () => {
    await pintar();
    // El foco se fue: alguien tocó la pantalla en un lugar vacío.
    await act(async () => { campo().blur(); });
    expect(document.activeElement).not.toBe(campo());

    await apretar('2', document.body);

    expect(
      document.activeElement,
      'sin esto las teclas caen en la nada y el sistema parece colgado',
    ).toBe(campo());
  });

  it('NO le roba el teclado a otro campo de texto', async () => {
    await pintar();
    const ajeno = document.createElement('input');
    document.body.appendChild(ajeno);
    ajeno.focus();

    await apretar('2', ajeno);

    expect(
      document.activeElement,
      'alguien puede estar escribiendo en otro lado: arrancarle el teclado es el mismo bug al reves',
    ).toBe(ajeno);
    ajeno.remove();
  });

  it('las teclas de navegación no se roban el foco', async () => {
    await pintar();
    await act(async () => { campo().blur(); });

    await apretar('Tab', document.body);

    expect(
      document.activeElement,
      'Tab, las flechas y F5 siguen siendo del navegador',
    ).not.toBe(campo());
  });
});

describe('Enter registra y deja lugar al siguiente', () => {

  it('con un solo resultado registra, limpia el campo y le devuelve el foco', async () => {
    await pintar();
    await tipear('24732531');

    await apretar('Enter');

    expect(accessService.checkIn).toHaveBeenCalledWith('m1', 'manual');
    expect(campo().value, 'el campo queda vacío para el que sigue').toBe('');
    expect(document.activeElement, 'y con el foco puesto: nadie agarra el mouse').toBe(campo());
  });

  it('con VARIOS resultados no elige por nadie', async () => {
    memberService.searchForAccess.mockResolvedValue([SOCIO, OTRO]);
    await pintar();
    await tipear('Lurdes');

    await apretar('Enter');

    expect(
      accessService.checkIn,
      'registrarle la entrada al equivocado deja DOS datos mal, no uno',
    ).not.toHaveBeenCalled();
    // Y se comprueba que SÍ llegó a buscar: si no, este test pasaría por no haber hecho
    // nada, que es la forma más fácil de que un test verde no signifique nada.
    expect(memberService.searchForAccess).toHaveBeenCalledWith('Lurdes');
    expect(container.querySelectorAll('.search-result-item').length, 'muestra la lista para elegir')
      .toBe(2);
  });

  it('cuando no encuentra a nadie lo DICE', async () => {
    memberService.searchForAccess.mockResolvedValue([]);
    await pintar();
    await tipear('99999999');

    await apretar('Enter');

    expect(accessService.checkIn).not.toHaveBeenCalled();
    expect(
      toastEstable.showToast,
      'sin aviso, quien atiende no sabe si no lo encontró o si no la escuchó',
    ).toHaveBeenCalled();
  });

  it('no registra con menos de dos caracteres', async () => {
    await pintar();
    await tipear('2');

    await apretar('Enter');

    expect(accessService.checkIn).not.toHaveBeenCalled();
  });
});

describe('el aviso de entrada', () => {

  it('sale al costado y NO tapa la pantalla', async () => {
    await pintar();
    await tipear('24732531');
    await apretar('Enter');

    expect(container.querySelector('.acceso-aviso'), 'el aviso aparece').toBeTruthy();
    expect(
      document.querySelector('.access-popup-overlay'),
      'el overlay de pantalla completa se fue: trababa el teclado 3 s por persona',
    ).toBeNull();
    expect(
      document.activeElement,
      'y el foco sigue en el campo aunque el aviso esté puesto',
    ).toBe(campo());
  });

  it('dice QUÉ se registró, no solo a quién', async () => {
    accessService.checkIn.mockResolvedValue({ direccion: 'SALIDA' });
    await pintar();
    await tipear('24732531');
    await apretar('Enter');

    const aviso = container.querySelector('.acceso-aviso');
    expect(aviso.textContent).toContain('Lurdes Rollet');
    expect(
      aviso.textContent,
      'la dirección la decide el servidor: sin esto se aprieta "entrada" y se graba una salida',
    ).toContain('Salida');
  });
});
