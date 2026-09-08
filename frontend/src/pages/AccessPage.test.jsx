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
// Mutable: el botón del cartel del QR es solo del dueño, así que hay tests de los dos lados.
// El OBJETO es siempre el mismo (uno nuevo por render cuelga el test en un bucle).
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
//
// Va dentro de una caja MUTABLE porque el mostrador se refresca solo cada quince segundos, y
// media pantalla reacciona a que ese dato cambie —el cartel del QR, sin ir más lejos—. Con
// un objeto fijo no habría forma de simular "llegó alguien nuevo".
const mostrador = vi.hoisted(() => ({
  datos: { adentro: [], hoy: [], avisos: [], ingresos: [], hoyTotal: 0, hoyPromedioMin: null },
  /** Cuántas veces la pantalla pidió novedades de la puerta. */
  refrescos: 0,
}));
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
vi.mock('../components/Layout', () => ({ PageHeader: () => null }));
vi.mock('../components/Icon', () => ({ default: () => null }));

// La cola: por defecto vacía, que es lo que ve el 99% de los días. Los tests del aviso la
// cambian para simular un gimnasio que hace días no puede subir nada.
const colaFalsa = { cuantos: 0, dias: 0, sociosConCobro: [] };
vi.mock('../lib/colaAccesos', () => ({
  resumenDeCola: async () => ({ cuantos: colaFalsa.cuantos, dias: colaFalsa.dias }),
  sociosConCobroPendiente: async () => [...colaFalsa.sociosConCobro],
}));

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
  // Cada test arranca con el mostrador vacío: si uno dejara un ingreso puesto, el siguiente
  // vería un cartel que no disparó él.
  mostrador.datos = { adentro: [], hoy: [], avisos: [], ingresos: [], hoyTotal: 0, hoyPromedioMin: null };
  mostrador.refrescos = 0;
  colaFalsa.cuantos = 0;
  colaFalsa.dias = 0;
  colaFalsa.sociosConCobro = [];
  accessService.getMostrador.mockResolvedValue(mostrador.datos);
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

    // El nombre viaja para que la cola pueda mostrar de quién es el acceso que espera, sin
    // depender de que el socio siga en el espejo cuando se vacíe.
    expect(accessService.checkIn).toHaveBeenCalledWith('m1', 'manual', expect.any(String));
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

  // ⚠️ ESCRITO DESPUÉS DE VERLO EN UNA MÁQUINA DE VERDAD, con el Wi-Fi apagado. Buscar al
  // socio ya funciona sin internet (sale de la copia local), pero registrar el paso todavía
  // no: la cola de accesos es la fase que viene. Lo que se veía mientras tanto era el
  // "Network Error" crudo de axios, en inglés — que no le dice nada a una recepcionista, y
  // sobre todo no le dice lo único que importa: que esa entrada se perdió.
  //
  // La regla de esta pantalla es que el cartel no miente. Si no se registró, se dice.
  it('sin conexión avisa que la entrada NO se registró, y en castellano', async () => {
    const sinRed = new Error('Network Error'); // un error de transporte no trae `response`
    accessService.checkIn.mockRejectedValue(sinRed);
    await pintar();
    await tipear('24732531');

    await apretar('Enter');

    const mensaje = toastEstable.showToast.mock.calls.at(-1)?.[0] || '';
    expect(mensaje).toContain('Sin conexión');
    expect(mensaje, 'tiene que decir que NO quedó registrada, no solo que falló').toMatch(/no se registró/i);
    expect(mensaje, 'nadie en un mostrador sabe qué es un "Network Error"').not.toContain('Network Error');
  });

  it('un rechazo DEL SERVIDOR se muestra tal cual: dice algo real del socio', async () => {
    const rechazo = new Error('Este socio está dado de baja');
    rechazo.response = { status: 409 };
    accessService.checkIn.mockRejectedValue(rechazo);
    await pintar();
    await tipear('24732531');

    await apretar('Enter');

    const mensaje = toastEstable.showToast.mock.calls.at(-1)?.[0] || '';
    expect(mensaje).toContain('dado de baja');
    expect(mensaje, 'no es un problema de conexión y no hay que fingir que lo es').not.toContain('Sin conexión');
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

  it('⭐ el número va SEPARADO del texto, para poder mostrarlo enorme', async () => {
    // Es el motivo de que el cartel sea grande: el socio pasa, mira, y ya sabe cuánto le
    // queda sin acercarse ni preguntarle a nadie. Si el número viniera pegado dentro de una
    // frase ("28d restantes") no habría forma de agrandarlo solo a él.
    await pintar();
    await tipear('24732531');
    await apretar('Enter');

    const cifra = container.querySelector('.acceso-aviso-cifra');
    expect(cifra, 'el bloque del número existe').toBeTruthy();
    expect(cifra.querySelector('strong').textContent, 'solo el número, sin unidad pegada').toBe('12');
    expect(cifra.querySelector('span').textContent).toContain('días');
  });

  it('al que se VA no se le muestra el número', async () => {
    // Ya entrenó. Un vencimiento gigante en la cara al salir es un reclamo a destiempo: el
    // cartel de salida es una confirmación y nada más.
    accessService.checkIn.mockResolvedValue({ direccion: 'SALIDA' });
    await pintar();
    await tipear('24732531');
    await apretar('Enter');

    expect(container.querySelector('.acceso-aviso'), 'el cartel sale igual').toBeTruthy();
    expect(container.querySelector('.acceso-aviso-cifra')).toBeNull();
  });
});

describe('entrar por QR levanta el mismo cartel', () => {

  const ingreso = (accesoId, nombre, extra = {}) => ({
    accesoId, socioId: 'm9', nombre, situacion: 'AL_DIA',
    diasVencido: 0, diasRestantes: 25, clasesRestantes: null,
    hora: '2026-09-02T10:00:00', ...extra,
  });

  /** Simula el refresco del mostrador: llegan datos nuevos y la pantalla se vuelve a pintar. */
  async function llegaRefresco(datos) {
    mostrador.datos = { ...mostrador.datos, ...datos };
    await act(async () => { root.render(<AccessPage />); });
    for (let i = 0; i < 6; i += 1) {
      await act(async () => { await Promise.resolve(); });
    }
  }

  it('un socio que escanea aparece en la pantalla del mostrador', async () => {
    // Sin esto, escanear no mostraba NADA acá: la confirmación va al teléfono del socio y
    // ahí moría. El que estaba al día era invisible para el mostrador.
    await pintar();
    await llegaRefresco({ ingresos: [ingreso('qr1', 'Lucía Fernández')] });

    const aviso = container.querySelector('.acceso-aviso');
    expect(aviso, 'el cartel aparece solo, sin que nadie toque nada').toBeTruthy();
    expect(aviso.textContent).toContain('Lucía Fernández');
    expect(aviso.textContent).toContain('Entrada por QR');
    expect(aviso.querySelector('.acceso-aviso-cifra strong').textContent).toBe('25');
  });

  it('⚠️ abrir la pantalla NO dispara los ingresos de los últimos minutos', async () => {
    // La ventana del backend es de 5 minutos. Sin esta guarda, entrar al módulo levantaría
    // de golpe los carteles de todos los que pasaron hace rato, como si acabaran de llegar.
    mostrador.datos = {
      ...mostrador.datos,
      ingresos: [ingreso('viejo1', 'Alguien'), ingreso('viejo2', 'Otro')],
    };
    await pintar();

    expect(container.querySelector('.acceso-aviso'), 'ninguno se anuncia al abrir').toBeNull();
  });

  it('no repite el cartel en cada refresco', async () => {
    // El mostrador se refresca cada quince segundos y el ingreso sigue viniendo hasta que
    // pasan los 5 minutos. Sin recordar los ya anunciados, el mismo socio parpadearía en
    // pantalla veinte veces.
    await pintar();
    await llegaRefresco({ ingresos: [ingreso('qr1', 'Lucía Fernández')] });
    expect(container.querySelectorAll('.acceso-aviso').length).toBe(1);

    await llegaRefresco({ ingresos: [ingreso('qr1', 'Lucía Fernández')] });
    expect(
      container.querySelectorAll('.acceso-aviso').length,
      'el mismo acceso no se anuncia dos veces',
    ).toBe(1);
  });

  it('un socio vencido que escanea sale en rojo, con los días que debe', async () => {
    await pintar();
    await llegaRefresco({
      ingresos: [ingreso('qr2', 'Pedro Gómez', {
        situacion: 'VENCIDO', diasVencido: 9, diasRestantes: 0,
      })],
    });

    const aviso = container.querySelector('.acceso-aviso');
    expect(aviso.className).toContain('error');
    expect(aviso.querySelector('.acceso-aviso-cifra strong').textContent).toBe('9');
    expect(aviso.textContent).toContain('vencido');
  });
});

describe('el mostrador se entera solo de lo que pasa en la puerta', () => {

  // ⚠️⚠️ ESTE TEST ES LA QUEJA "POR QR TARDA BASTANTE", CONVERTIDA EN PRUEBA.
  //
  // A mano el cartel lo pinta el propio handler, con la respuesta del POST: instantáneo,
  // siempre. Por QR el que marca es el socio desde su celular, así que la pantalla se
  // entera SOLO por este latido. Y el latido colgaba de `invalidate`, que nacía nueva en
  // cada render: cada tecla del DNI y cada cartel que se iba lo reiniciaban de cero. Con
  // alguien usando el mostrador, la cuenta no llegaba al final nunca.
  //
  // Por eso el mock de arriba devuelve una `invalidate` nueva en cada render: si el efecto
  // vuelve a depender de su identidad, este test se pone rojo.
  it('⚠️ sigue preguntando aunque la pantalla renderice sin parar', async () => {
    vi.useFakeTimers();
    try {
      await pintar();
      mostrador.refrescos = 0;

      // Veinte segundos de mostrador vivo: renders todo el tiempo mientras corre el reloj.
      for (let i = 0; i < 20; i += 1) {
        await act(async () => { root.render(<AccessPage />); });
        await act(async () => { vi.advanceTimersByTime(1000); });
      }

      expect(
        mostrador.refrescos,
        'en 20 segundos el mostrador tiene que haber preguntado por la puerta',
      ).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('quién está adentro, sin salir del mostrador', () => {

  const visitaAbierta = (id, nombre) => ({
    id,
    member: { id: 'm-' + id, fullName: nombre, dni: '30111222' },
    checkInAt: new Date(Date.now() - 20 * 60000).toISOString(),
    checkOutAt: null,
  });

  /**
   * ⭐ EL PEDIDO DEL DUEÑO, TAL CUAL: "esta sección también tiene que estar en accesos, para
   * que recepción pueda dar de baja a los alumnos sin tener que desplazarse por todos lados".
   *
   * La misma lista vive en "En el gimnasio" —la pantalla para MIRAR— y acá, que es la de
   * TRABAJAR. Comparten el pedido y la caché, así que marcar de un lado deja el otro al día.
   */
  it('⭐ la lista de quién está adentro está en Acceso', async () => {
    mostrador.datos = { ...mostrador.datos, adentro: [visitaAbierta('a1', 'Matias Benitez')] };

    const texto = (await pintar()).textContent;

    expect(texto).toContain('Matias Benitez');
    expect(texto).toContain('En el Gimnasio ahora');
  });

  it('y se le puede marcar la salida desde ahí mismo', async () => {
    accessService.checkOut.mockResolvedValue({});
    mostrador.datos = { ...mostrador.datos, adentro: [visitaAbierta('a1', 'Matias Benitez')] };
    await pintar();

    const salida = container.querySelector('.checkout-btn');
    expect(salida, 'el botón de salida tiene que estar en el mostrador').toBeTruthy();
    await act(async () => {
      salida.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // ⚠️ Y CON EL ID DEL SOCIO. Sin él, sin conexión no hay a quién encolarle la salida y el
    // botón vuelve a no hacer nada — que es justo lo que reportó el dueño: "si me doy salida
    // no responde y tira network error".
    expect(accessService.checkOut).toHaveBeenCalledWith('a1', 'm-a1', 'Matias Benitez');
  });

  it('sin conexión la salida se guarda, y el cartel no dice "salió"', async () => {
    // "Salió" lo confirma el servidor. Sin conexión lo único cierto es que quedó guardado.
    accessService.checkOut.mockResolvedValue({ encolado: true, clientRef: 'x' });
    mostrador.datos = { ...mostrador.datos, adentro: [visitaAbierta('a1', 'Matias Benitez')] };
    await pintar();

    await act(async () => {
      container.querySelector('.checkout-btn').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const [mensaje, tipo] = toastEstable.showToast.mock.calls.at(-1);
    expect(mensaje).toContain('guardada sin conexión');
    expect(mensaje).not.toContain('salió');
    expect(tipo).toBe('warning');
  });

  it('y si falla de verdad, el error se entiende: nada de "Network Error"', async () => {
    const corte = new Error('Network Error'); // sin `response`: no contestó el servidor
    accessService.checkOut.mockRejectedValue(corte);
    mostrador.datos = { ...mostrador.datos, adentro: [visitaAbierta('a1', 'Matias Benitez')] };
    await pintar();

    await act(async () => {
      container.querySelector('.checkout-btn').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const [mensaje, tipo] = toastEstable.showToast.mock.calls.at(-1);
    expect(mensaje).toContain('Sin conexión');
    expect(mensaje, 'y dice qué hacer').toContain('Anotala a mano');
    expect(mensaje).not.toContain('Network Error');
    expect(tipo).toBe('error');
  });

  it('sin nadie adentro lo dice, en vez de dejar un hueco', async () => {
    const texto = (await pintar()).textContent;

    expect(texto).toContain('Nadie en el gimnasio');
  });

  /**
   * La pantalla tiene que entrar de una: es la que se usa parada y con gente esperando.
   * El cartel del QR se imprime UNA vez y se pega en la puerta, así que vive detrás de un
   * botón en vez de ocupar media pantalla todos los días.
   */
  it('el cartel del QR no ocupa la pantalla: está detrás de un botón', async () => {
    authEstable.orgRole = 'owner';
    try {
      await pintar();

      const botones = [...container.querySelectorAll('button')].map((b) => b.textContent);
      expect(botones.some((t) => t.includes('Cartel de entrada'))).toBe(true);
    } finally {
      authEstable.orgRole = 'reception';
    }
  });

  it('y a recepción ni siquiera se le ofrece: no es cosa suya', async () => {
    await pintar();

    const botones = [...container.querySelectorAll('button')].map((b) => b.textContent);
    expect(botones.some((t) => t.includes('Cartel de entrada'))).toBe(false);
  });

  /**
   * ⚠️ La estructura de dos columnas es lo que sostiene "una sola pantalla": el molinete a
   * la izquierda, quién está adentro a la derecha, y cada lista con su scroll interno. Si
   * alguien vuelve a apilar todo en una columna, la página vuelve a scrollear.
   */
  it('⚠️ el mostrador y la lista comparten fila (es lo que evita el scroll de página)', async () => {
    mostrador.datos = { ...mostrador.datos, adentro: [visitaAbierta('a1', 'Matias Benitez')] };
    await pintar();

    const cuerpo = container.querySelector('.access-cuerpo');
    expect(cuerpo, 'el contenedor de las dos columnas').toBeTruthy();
    expect(cuerpo.querySelector('.checkin-section'), 'el molinete').toBeTruthy();
    expect(cuerpo.querySelector('.access-adentro'), 'quién está adentro').toBeTruthy();
  });
});

describe('⚠️ el aviso de la cola escala con los días', () => {
  // EL RIESGO QUE ESTO CUBRE: un terminal, 30 días de tolerancia, y la cola en UN SOLO DISCO.
  // Lo que hay ahí son visitas que el gimnasio todavía no tiene en ningún otro lado. Si nadie
  // avisa, esos 30 días pasan en silencio hasta el día que la máquina no arranca.

  const aviso = () => container.querySelector('.copia-local.is-vieja, .copia-local.is-muy-vieja');

  it('con la cola vacía no hay cartel: uno siempre prendido deja de avisar', async () => {
    await pintar();
    expect(aviso()).toBeNull();
  });

  it('recién guardado dice que se manda solo, porque es verdad', async () => {
    colaFalsa.cuantos = 2;
    colaFalsa.dias = 0;

    await pintar();

    expect(aviso().textContent).toContain('se mandan al volver internet');
    expect(container.querySelector('.copia-local.is-muy-vieja'),
      'a los cero días no hay nada que alarmar').toBeNull();
  });

  it('⭐ a los 3 días DEJA de prometer que se arregla solo y pide que revisen', async () => {
    // Hasta ahí "se manda al volver internet" tranquiliza bien. Después de tres días ya no
    // volvió, y seguir diciendo lo mismo es exactamente lo que hace que nadie llame al
    // proveedor de internet.
    colaFalsa.cuantos = 47;
    colaFalsa.dias = 5;

    await pintar();

    const texto = aviso().textContent;
    expect(container.querySelector('.copia-local.is-muy-vieja'), 'y cambia de tono').toBeTruthy();
    expect(texto).toContain('5 días');
    expect(texto, 'que estén en una sola máquina es EL dato').toContain('solo en esta computadora');
    expect(texto, 'prometer que se arregla solo es lo que hay que dejar de decir')
      .not.toContain('se mandan al volver internet');
  });

  it('entre medio dice desde cuándo, sin alarmar todavía', async () => {
    colaFalsa.cuantos = 3;
    colaFalsa.dias = 1;

    await pintar();

    expect(aviso().textContent).toContain('desde ayer');
    expect(container.querySelector('.copia-local.is-muy-vieja')).toBeNull();
  });
});

describe('⭐ sin conexión el cartel MUESTRA los días', () => {
  // ERA AL REVÉS DE LO QUE HACE FALTA, y lo vio el dueño en la pantalla: el cartel de
  // "guardado sin conexión" salía sin el número.
  //
  // Sin internet el servidor no puede avisar nada, así que el único que puede decirle a quien
  // atiende "este socio está vencido" es el conteo local. Es justo el caso para el que se
  // construyó, y era el único lugar donde no se usaba.

  it('un socio al día: se ve cuántos le quedan, aunque quede encolado', async () => {
    memberService.searchForAccess.mockResolvedValue([
      { ...SOCIO, situacion: 'AL_DIA', diasRestantes: 29 },
    ]);
    accessService.checkIn.mockResolvedValue({ encolado: true, clientRef: 'x' });

    await pintar();
    await tipear('24732531');
    await apretar('Enter');

    const aviso = container.querySelector('.acceso-aviso');
    expect(aviso.textContent).toContain('Guardado sin conexión');
    expect(aviso.textContent, 'el número es lo que la persona del mostrador necesita')
      .toContain('29');
  });

  it('⚠️ un socio VENCIDO se ve en rojo, aunque no haya conexión', async () => {
    // Es el dato que cambia lo que hace quien atiende. Que no haya internet no lo vuelve
    // menos urgente: lo vuelve MÁS, porque no hay nadie más que se lo pueda decir.
    memberService.searchForAccess.mockResolvedValue([
      { ...SOCIO, situacion: 'VENCIDO', diasVencido: 8, diasRestantes: 0 },
    ]);
    accessService.checkIn.mockResolvedValue({ encolado: true, clientRef: 'x' });

    await pintar();
    await tipear('24732531');
    await apretar('Enter');

    const aviso = container.querySelector('.acceso-aviso');
    expect(aviso.textContent).toContain('8');
    expect(aviso.className, 'rojo, no ámbar').toMatch(/error/);
  });

  it('⭐ y el socio al día NO se pinta de amarillo: el número lo mira ÉL', async () => {
    // DECISIÓN DEL DUEÑO, y tiene razón. La primera versión pintaba el cartel entero de
    // amarillo para marcar "esto no llegó al servidor". Pero el número grande lo mira el
    // SOCIO, no la recepcionista: si a alguien al día se le pinta de amarillo porque el
    // terminal no tiene wifi, lee que hay un problema CON ÉL —y pregunta, o se va
    // preocupado— cuando el problema es del internet del gimnasio y no le incumbe.
    //
    // El color queda como con internet. Que quedó guardado sin conexión es un dato de la
    // CASA: va en el renglón de abajo, en amarillo, donde lo lee quien atiende.
    memberService.searchForAccess.mockResolvedValue([
      { ...SOCIO, situacion: 'AL_DIA', diasRestantes: 29 },
    ]);
    accessService.checkIn.mockResolvedValue({ encolado: true, clientRef: 'x' });

    await pintar();
    await tipear('24732531');
    await apretar('Enter');

    const aviso = container.querySelector('.acceso-aviso');
    expect(aviso.className, 'el mismo color que con internet').toMatch(/success/);
    expect(aviso.className, 'nada de amarillo en el cartel').not.toMatch(/warning/);
    expect(aviso.querySelector('.acceso-aviso-accion.sin-conexion'),
      'el amarillo va SOLO en el renglón que le habla a quien atiende').toBeTruthy();
  });
});

describe('⚠️ sin red, "quién está adentro" dice la verdad y no gira para siempre', () => {
  // LO REPORTÓ EL DUEÑO: apagó el wifi con la app ya cargada y la lista quedó en "Cargando…"
  // hasta que volvió a prenderlo.
  //
  // Y no era el cartel: el latido seguía disparando un pedido cada quince segundos, cada uno
  // con su plazo de espera y sus reintentos con espera creciente. Pedidos condenados a fallar,
  // apilados, que además tapan el problema — cuanto más se insiste, más tarda en aparecer la
  // respuesta honesta.
  //
  // Quién está adentro es lo ÚNICO de esta pantalla que el terminal no puede saber por su
  // cuenta: la dirección la decide el servidor. Sin él no hay respuesta, y prometerla con un
  // spinner deja a quien atiende esperando en vez de resolver por otro lado.

  function sinRed(hay) {
    Object.defineProperty(window.navigator, 'onLine', { value: hay, configurable: true });
  }

  afterEach(() => sinRed(true));

  it('lo dice, en vez de dejar el spinner girando', async () => {
    sinRed(false);
    accessService.getMostrador.mockImplementation(() => new Promise(() => {})); // nunca contesta

    await pintar();

    const lista = container.querySelector('.checked-in-list');
    expect(lista.textContent).toContain('Sin conexión');
    expect(lista.querySelector('.spinner'), 'un spinner promete algo que no va a llegar').toBeNull();
  });

  it('y deja de insistir: no apila pedidos condenados a fallar', async () => {
    // ⚠️ SE MIDE EL LATIDO, NO EL SERVICIO. La caché está mockeada y nunca llama al servicio
    // de verdad, así que contar `getMostrador` daba cero siempre — el test pasaba con y sin
    // el arreglo. Lo que hay que mirar es cuántas veces el latido pidió refrescar.
    sinRed(false);
    await pintar();
    const alPrincipio = mostrador.refrescos;

    // `visibilitychange` fuerza un pedido salteándose el ritmo: es el camino más directo
    // para provocar lo que en la máquina pasa cada quince segundos.
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
      });
    }

    expect(mostrador.refrescos, 'sin red no hay nada que preguntar').toBe(alPrincipio);
  });

  it('y con red sí insiste, que es lo que hace que el QR aparezca solo', async () => {
    // La otra mitad: frenar de más apagaría el latido que hace que un check-in por QR
    // aparezca en el mostrador sin que nadie toque nada.
    await pintar();
    const alPrincipio = mostrador.refrescos;

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(mostrador.refrescos).toBeGreaterThan(alPrincipio);
  });

  it('con red vuelve a mostrar la lista normal', async () => {
    mostrador.datos = {
      adentro: [{ id: 'a1', member: { fullName: 'Lurdes Rollet' }, checkInAt: new Date().toISOString() }],
      hoy: [], avisos: [], ingresos: [], hoyTotal: 0, hoyPromedioMin: null,
    };

    await pintar();

    const lista = container.querySelector('.checked-in-list');
    expect(lista.textContent).toContain('Lurdes Rollet');
    expect(lista.textContent).not.toContain('Sin conexión');
  });
});

describe('⭐ al volver la red, la lista se pone al día sola', () => {
  // REPORTADO POR EL DUEÑO: marcó una salida sin conexión, prendió el wifi, y el socio siguió
  // figurando adentro hasta que se fue a Retención y volvió.
  //
  // Mientras no hay red la lista queda congelada en el último dato bueno, y ese dato ya es
  // falso en el momento en que la cola sube lo que estaba esperando. Volver a tener red es,
  // por definición, el momento en que lo que se muestra dejó de ser lo mejor que se sabe.

  function red(hay) {
    Object.defineProperty(window.navigator, 'onLine', { value: hay, configurable: true });
    window.dispatchEvent(new Event(hay ? 'online' : 'offline'));
  }

  afterEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  it('vuelve la red y refresca sin esperar el próximo latido', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    await pintar();
    const alPrincipio = mostrador.refrescos;

    await act(async () => { red(true); await Promise.resolve(); });

    expect(mostrador.refrescos, 'lo que se está mostrando ya no es lo mejor que se sabe')
      .toBeGreaterThan(alPrincipio);
  });

  it('y no refresca de gusto si la red nunca se cortó', async () => {
    // Si cada render pidiera de nuevo, volvería el problema que ya costó caro: el mostrador
    // pidiendo sin parar mientras alguien teclea.
    await pintar();
    const alPrincipio = mostrador.refrescos;

    await act(async () => { window.dispatchEvent(new Event('online')); await Promise.resolve(); });

    expect(mostrador.refrescos).toBe(alPrincipio);
  });
});

describe('el contador de la cola tampoco afirma la dirección', () => {
  it('dice "acceso guardado", no "entrada guardada"', async () => {
    // Mismo motivo que el aviso del vaciado: ahí adentro puede haber salidas, y la dirección
    // no la sabe nadie hasta que el servidor la decide contra el momento en que ocurrió.
    colaFalsa.cuantos = 1;
    colaFalsa.dias = 0;

    await pintar();

    const cartel = container.querySelector('.copia-local.is-vieja').textContent;
    expect(cartel).toContain('acceso guardado');
    expect(cartel).not.toMatch(/entrada/i);
  });

  it('y en plural también', async () => {
    colaFalsa.cuantos = 4;
    colaFalsa.dias = 0;

    await pintar();

    const cartel = container.querySelector('.copia-local.is-vieja').textContent;
    expect(cartel).toContain('4 accesos guardados');
  });
});

describe('⭐ el socio que pagó sin conexión no queda como moroso a secas', () => {
  // EL CASO REAL: el socio paga en efectivo con el internet caído, camina hasta la puerta, y
  // la pantalla lo trata de vencido delante de todos.
  //
  // Cobrar corre el vencimiento, pero eso lo hace el SERVIDOR: hasta que el cobro no sube, la
  // copia local sigue diciendo lo que decía antes.
  //
  // ⚠️ Y NO SE ARREGLA CORRIÉNDOLE LA FECHA EN EL ESPEJO. Eso sería una segunda cuenta de la
  // misma cobertura — el error que este proyecto ya cometió con las fechas y que costó tres
  // bugs. El número no se toca: se explica al lado por qué está viejo.

  const VENCIDO = { ...SOCIO, situacion: 'VENCIDO', diasVencido: 8, diasRestantes: 0 };

  it('en la búsqueda dice que pagó recién, sin tocar el número', async () => {
    // DOS resultados a propósito: con uno solo, Enter registra y limpia la lista antes de que
    // se pueda mirar. Con dos, la pantalla no elige por nadie y la lista queda a la vista.
    memberService.searchForAccess.mockResolvedValue([VENCIDO, OTRO]);
    colaFalsa.sociosConCobro = ['m1'];

    await pintar();
    await tipear('Lurdes');
    await apretar('Enter');

    const fila = container.querySelector('.search-result-item');
    expect(fila.textContent).toContain('Pagó recién');
    expect(fila.textContent, 'el veredicto del servidor NO se corrige: se explica')
      .toContain('8d vencido');
  });

  it('y el cartel de la puerta también lo dice', async () => {
    memberService.searchForAccess.mockResolvedValue([VENCIDO]);
    colaFalsa.sociosConCobro = ['m1'];

    await pintar();
    await tipear('24732531');
    await apretar('Enter');

    expect(container.querySelector('.acceso-aviso').textContent)
      .toContain('se actualiza al volver internet');
  });

  it('sin cobro esperando, nada de esto aparece', async () => {
    memberService.searchForAccess.mockResolvedValue([VENCIDO, OTRO]);

    await pintar();
    await tipear('Lurdes');
    await apretar('Enter');

    expect(container.querySelector('.search-result-item').textContent).not.toContain('Pagó recién');
  });
});
