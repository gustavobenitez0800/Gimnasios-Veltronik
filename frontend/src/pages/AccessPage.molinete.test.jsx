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
// La preparación es la compartida de la pantalla de la puerta (AccessPage.preparar.jsx). Los
// mocks de acá se suman a los de allá: vitest los sube arriba de todo, antes de que esa
// preparación cargue la pantalla.
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// La cajita: lo que importa es qué le pide el mostrador.
const cajita = vi.hoisted(() => ({
  estado: { fase: 'conectada', version: 'veltronik-molinete 1', habilitada: true },
  abrirSiPasa: vi.fn(() => true),
  ordenarALaCajita: vi.fn(async () => true),
}));
vi.mock('../lib/cajitaMolinete', () => ({
  abrirSiPasa: cajita.abrirSiPasa,
  ordenarALaCajita: cajita.ordenarALaCajita,
  laCajitaManda: () => cajita.estado.fase === 'conectada' && cajita.estado.habilitada,
}));
vi.mock('../hooks/useCajitaMolinete', () => ({ useCajitaMolinete: () => cajita.estado }));

const {
  dibujo, SOCIO, memberService, accessService, colaFalsa, mostrador, pintar, tipear, apretar,
} = await import('./AccessPage.preparar');
// `root` y `container` cambian en cada test: se leen del módulo cada vez, no se copian.
const preparacion = await import('./AccessPage.preparar');

const VENCIDO = { ...SOCIO, situacion: 'VENCIDO', diasVencido: 5, diasRestantes: 0 };

/** Teclea el DNI y aprieta Enter, como el socio en la puerta. */
async function entrar() {
  await tipear('24732531');
  await apretar('Enter');
}

const boton = (texto) => [...preparacion.container.querySelectorAll('button')]
  .find((b) => b.textContent.includes(texto));

beforeEach(() => {
  cajita.abrirSiPasa.mockClear();
  cajita.ordenarALaCajita.mockClear();
  cajita.estado = { fase: 'conectada', version: 'veltronik-molinete 1', habilitada: true };
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

  it('⭐ en gracia: abre, como el molinete facial (y el cartel igual avisa)', async () => {
    memberService.searchForAccess.mockResolvedValue([{ ...SOCIO, situacion: 'EN_GRACIA', diasVencido: 1, diasRestantes: 0 }]);
    await pintar();
    await entrar();
    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ pasa: true });
  });

  it('⭐ sin fecha cargada: abre, como el molinete facial (es un dato que falta, no una deuda)', async () => {
    memberService.searchForAccess.mockResolvedValue([{ ...SOCIO, situacion: 'SIN_DATOS' }]);
    await pintar();
    await entrar();
    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ pasa: true });
  });

  it('dado de baja: no abre', async () => {
    memberService.searchForAccess.mockResolvedValue([{ ...SOCIO, situacion: 'INACTIVO' }]);
    await pintar();
    await entrar();
    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ pasa: false });
  });

  it('la SALIDA se le avisa como salida: abre solo si esta PC tiene el molinete también de salida', async () => {
    accessService.checkIn.mockResolvedValue({ direccion: 'SALIDA' });
    await pintar();
    await entrar();
    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ salida: true });
    expect(cajita.abrirSiPasa).not.toHaveBeenCalledWith(expect.objectContaining({ pasa: expect.anything() }));
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
    await act(async () => { preparacion.root.render(dibujo()); });
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
