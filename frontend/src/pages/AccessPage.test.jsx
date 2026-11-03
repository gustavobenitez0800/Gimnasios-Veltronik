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

//
// Lo que pasa SIN CONEXIÓN (la cola, el cartel sin red, la vuelta de la red) está en
// AccessPage.sinConexion.test.jsx. Los mocks y ayudantes de los dos, en AccessPage.preparar.jsx.

import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import {
  AccessPage, root, container, pintar, campo, tipear, apretar, SOCIO, OTRO, mostrador, colaFalsa, sonido, accessService, memberService, toastEstable, authEstable,
} from './AccessPage.preparar';

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

describe('⭐ el QR en la pantalla, en lugar de quién está adentro (22/09)', () => {

  const visitaAbierta = (id, nombre, memberId) => ({
    id,
    member: { id: memberId, fullName: nombre, dni: '30111222' },
    checkInAt: new Date(Date.now() - 20 * 60000).toISOString(),
    checkOutAt: null,
  });

  /**
   * ⭐ EL PEDIDO DEL DUEÑO: "que saques 'en el gimnasio ahora' y en su lugar pongas el QR para
   * que escaneen sin que haya que entrar al botón del cartel".
   */
  it('el QR ocupa el lugar de la lista, al lado del buscador', async () => {
    mostrador.datos = { ...mostrador.datos, adentro: [visitaAbierta('a1', 'Matias Benitez', 'm9')] };
    await pintar();

    const cuerpo = container.querySelector('.access-cuerpo');
    expect(cuerpo.querySelector('.checkin-section'), 'el molinete').toBeTruthy();
    expect(cuerpo.querySelector('.access-qr'), 'el QR, en la misma fila').toBeTruthy();
    expect(cuerpo.querySelector('.access-adentro'), 'la lista se fue').toBeNull();
    expect(container.textContent).not.toContain('En el Gimnasio ahora');
  });

  it('⚠️ recepción lo ve (atiende el mostrador), pero no se le ofrece crearlo', async () => {
    await pintar();
    expect(container.querySelector('.qr-falso').dataset.puedeCrear).toBe('false');
  });

  it('el dueño sí puede crearlo, y sigue teniendo el botón del cartel para imprimir', async () => {
    authEstable.orgRole = 'owner';
    try {
      await pintar();
      expect(container.querySelector('.qr-falso').dataset.puedeCrear).toBe('true');
      const botones = [...container.querySelectorAll('button')].map((b) => b.textContent);
      expect(botones.some((x) => x.includes('Cartel de entrada'))).toBe(true);
    } finally {
      authEstable.orgRole = 'reception';
    }
  });

  it('y a recepción no se le ofrece el cartel para imprimir: no es cosa suya', async () => {
    await pintar();

    const botones = [...container.querySelectorAll('button')].map((b) => b.textContent);
    expect(botones.some((x) => x.includes('Cartel de entrada'))).toBe(false);
  });

  it('⭐ la salida se sigue marcando sin moverse: se busca al socio y dice "Adentro desde"', async () => {
    // Dos resultados, para que Enter no registre por nadie y la lista quede a la vista.
    memberService.searchForAccess.mockResolvedValue([SOCIO, OTRO]);
    mostrador.datos = { ...mostrador.datos, adentro: [visitaAbierta('a1', 'Lurdes Rollet', 'm1')] };
    await pintar();
    await tipear('Lurdes');
    await apretar('Enter');

    const fila = [...container.querySelectorAll('.search-result-item')]
      .find((f) => f.textContent.includes('Lurdes Rollet'));
    expect(fila.textContent).toContain('Adentro desde');
    expect(fila.textContent).toContain('Registrar salida');
  });
});


describe('⭐ la X del socio vencido suena al entrar, por donde entre', () => {

  const VENCIDO = { ...SOCIO, situacion: 'VENCIDO', diasVencido: 5, diasRestantes: 0 };

  async function llegaRefresco(datos) {
    mostrador.datos = { ...mostrador.datos, ...datos };
    await act(async () => { root.render(<AccessPage />); });
    for (let i = 0; i < 6; i += 1) {
      await act(async () => { await Promise.resolve(); });
    }
  }

  it('entra a mano con la cuota vencida: suena', async () => {
    memberService.searchForAccess.mockResolvedValue([VENCIDO]);
    await pintar();
    await tipear('24732531');
    await apretar('Enter');

    expect(sonido.sonarVencidoDirecto).toHaveBeenCalledWith('m1');
    expect(sonido.sonarVencidoDirecto).toHaveBeenCalledTimes(1);
  });

  it('el que está al día entra en silencio', async () => {
    await pintar();
    await tipear('24732531');
    await apretar('Enter');

    expect(sonido.sonarVencidoDirecto).not.toHaveBeenCalled();
  });

  it('al que SALE no le suena: ya entrenó, no se le reclama nada', async () => {
    memberService.searchForAccess.mockResolvedValue([VENCIDO]);
    accessService.checkIn.mockResolvedValue({ direccion: 'SALIDA' });
    await pintar();
    await tipear('24732531');
    await apretar('Enter');

    expect(sonido.sonarVencidoDirecto).not.toHaveBeenCalled();
  });

  it('⭐ al que acaba de pagar (el cobro todavía no subió) no le suena: sería una falsa alarma', async () => {
    memberService.searchForAccess.mockResolvedValue([VENCIDO]);
    colaFalsa.sociosConCobro = ['m1'];
    await pintar();
    await tipear('24732531');
    await apretar('Enter');

    expect(sonido.sonarVencidoDirecto).not.toHaveBeenCalled();
  });

  it('entra por QR con la cuota vencida: suena', async () => {
    await pintar();
    await llegaRefresco({
      ingresos: [{ accesoId: 'qr9', socioId: 'm9', nombre: 'Juan Bautista', situacion: 'EN_GRACIA', diasVencido: 1, diasRestantes: 0, hora: '2026-09-21T23:24:00' }],
    });

    expect(sonido.sonarVencido).toHaveBeenCalledTimes(1);
  });

  it('⭐ el molinete frena a un vencido: suena; lo que ya estaba al abrir la pantalla, no', async () => {
    const rechazo = (accesoId, estado) => ({ accesoId, socioId: 'm7', nombre: 'Ana Paz', estado, diasVencido: 9, hora: '2026-09-21T10:00:00' });
    mostrador.datos = { ...mostrador.datos, rechazos: [rechazo('viejo', 'VENCIDO')] };
    await pintar();
    expect(sonido.sonarVencido, 'abrir la pantalla no dispara los rechazos de antes').not.toHaveBeenCalled();

    await llegaRefresco({ rechazos: [rechazo('nuevo', 'VENCIDO'), rechazo('viejo', 'VENCIDO')] });
    expect(sonido.sonarVencido).toHaveBeenCalledTimes(1);

    await llegaRefresco({ rechazos: [rechazo('pagó', 'AL_DIA'), rechazo('nuevo', 'VENCIDO')] });
    expect(sonido.sonarVencido, 'el que ya está al día no suena').toHaveBeenCalledTimes(1);
  });
});

describe('el cartel', () => {

  it('sin fecha cargada dice la palabra, no un "—" gigante', async () => {
    memberService.searchForAccess.mockResolvedValue([{ ...SOCIO, situacion: 'SIN_DATOS', diasRestantes: null }]);
    await pintar();
    await tipear('24732531');
    await apretar('Enter');

    const cifra = container.querySelector('.acceso-aviso-cifra');
    expect(cifra.textContent).toBe('Sin fecha cargada');
    expect(cifra.querySelector('strong')).toBeNull();
  });

  it('cada cartel sabe su lugar en la pila, para acomodarse sin saltos', async () => {
    await pintar();
    await tipear('24732531');
    await apretar('Enter');
    await tipear('24732531');
    await apretar('Enter');

    const carteles = [...container.querySelectorAll('.acceso-aviso')];
    expect(carteles).toHaveLength(2);
    expect(carteles.map((c) => c.style.getPropertyValue('--i'))).toEqual(['0', '1']);
    expect(carteles.every((c) => c.style.getPropertyValue('--n') === '2')).toBe(true);
  });
});
