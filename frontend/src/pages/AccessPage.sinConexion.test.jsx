// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - La pantalla de la puerta SIN CONEXIÓN
// ============================================
// La cola de lo que no pudo subir y cómo avisa según los días, el cartel que muestra los días
// aunque no haya red, que el mostrador no apile pedidos condenados a fallar, que se ponga al
// día solo al volver la red, y que el socio que pagó sin conexión no quede como moroso.
//
// Lo de siempre (teclado, Enter, avisos, QR) está en AccessPage.test.jsx. Los mocks y
// ayudantes de los dos, en AccessPage.preparar.jsx.

import { describe, it, expect, afterEach } from 'vitest';
import { act } from 'react';
import {
  container, pintar, tipear, apretar, SOCIO, OTRO, mostrador, colaFalsa, accessService, memberService,
} from './AccessPage.preparar';

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

  describe('⭐⭐ cuando NO es el internet, no dice "al volver internet"', () => {
    // Santo Sport, 05/10/2026. El servidor rechazaba una alta y detrás quedaron 139 movimientos.
    // Este cartel dijo "139 accesos guardados sin conexión desde ayer · se mandan al volver
    // internet" durante 36 horas, con el internet andando. El dueño llamó al técnico del router.

    const TRABADA = { tipo: 'ALTA', status: 500, intentos: 288, error: 'HTTP 500 x288 · …' };

    it('dice que no pudieron subir, que no es el internet y a quién avisar', async () => {
      colaFalsa.cuantos = 139;
      colaFalsa.dias = 1;
      colaFalsa.trabada = TRABADA;

      await pintar();

      const texto = aviso().textContent;
      expect(texto).toContain('139 movimientos no pudieron subir');
      expect(texto).toContain('no es el internet');
      expect(texto, 'que no se perdió nada es lo primero que hay que saber')
        .toContain('guardados en esta computadora');
      expect(texto).toContain('avisale a Veltronik');
    });

    it('⚠️ y NO promete que se arregla al volver internet, ni habla de "sin conexión"', async () => {
      colaFalsa.cuantos = 139;
      colaFalsa.dias = 1;
      colaFalsa.trabada = TRABADA;

      await pintar();

      const texto = aviso().textContent;
      expect(texto).not.toContain('al volver internet');
      expect(texto).not.toContain('sin conexión');
      expect(container.querySelectorAll('.copia-local.is-vieja, .copia-local.is-muy-vieja'),
        'un solo cartel: los dos juntos se contradirían').toHaveLength(1);
    });

    it('alarma desde el primer momento: no espera tres días para cambiar de tono', async () => {
      colaFalsa.cuantos = 4;
      colaFalsa.dias = 0;
      colaFalsa.trabada = TRABADA;

      await pintar();

      expect(container.querySelector('.copia-local.is-muy-vieja')).toBeTruthy();
    });

    it('con uno solo, habla en singular', async () => {
      colaFalsa.cuantos = 1;
      colaFalsa.trabada = TRABADA;

      await pintar();

      const texto = aviso().textContent;
      expect(texto).toContain('1 movimiento no pudo subir');
      expect(texto).toContain('Está guardado');
    });
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

describe('⚠️ sin red, el mostrador no apila pedidos condenados a fallar', () => {
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
