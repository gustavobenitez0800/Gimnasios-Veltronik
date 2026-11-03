// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - El socio pasa el llavero por el lector (ADR-016)
// ============================================
// El lector "tipo teclado" escribe el número y un Enter en el buscador de Accesos, como una
// persona muy rápida. La pantalla reconoce la ráfaga y registra la entrada como con el DNI —el
// mismo cartel, la misma X y la misma cajita—, con el método LLAVERO.
//
// La preparación es la compartida de la pantalla de la puerta (AccessPage.preparar.jsx). La
// búsqueda del llavero en sí (exacta, en la copia local) se prueba en lib/localMembers.llaveros.
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

const cajita = vi.hoisted(() => ({
  estado: { fase: 'conectada', version: 'veltronik-molinete 2', habilitada: true },
  abrirSiPasa: vi.fn(() => true),
  ordenarALaCajita: vi.fn(async () => true),
}));
vi.mock('../lib/cajitaMolinete', () => ({
  abrirSiPasa: cajita.abrirSiPasa,
  ordenarALaCajita: cajita.ordenarALaCajita,
}));
vi.mock('../hooks/useCajitaMolinete', () => ({ useCajitaMolinete: () => cajita.estado }));

const {
  SOCIO, OTRO, memberService, accessService, sonido, pintar, tipear, apretar, campo,
} = await import('./AccessPage.preparar');
const preparacion = await import('./AccessPage.preparar');

const VENCIDO = { ...SOCIO, situacion: 'VENCIDO', diasVencido: 5, diasRestantes: 0 };

/**
 * Escribe como el lector: un keydown por carácter, `cada` milisegundos, y el Enter. El momento
 * de cada tecla se fija a mano (`timeStamp`), que es lo que mira la pantalla para saber si fue
 * un lector o una persona.
 */
async function pasarPorElLector(texto, { cada = 5, desde = 10_000 } = {}) {
  const el = campo();
  let t = desde;
  await act(async () => {
    for (const c of texto) {
      const tecla = new KeyboardEvent('keydown', { key: c, bubbles: true, cancelable: true });
      Object.defineProperty(tecla, 'timeStamp', { value: t });
      el.dispatchEvent(tecla);
      t += cada;
    }
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(enter, 'timeStamp', { value: t });
    el.dispatchEvent(enter);
  });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

const texto = () => document.body.textContent;

beforeEach(() => {
  cajita.abrirSiPasa.mockClear();
  memberService.buscarPorLlavero = vi.fn().mockResolvedValue({ socios: [SOCIO], ultimaBaja: null });
});

describe('⭐ pasar el llavero', () => {
  it('registra la entrada con el método LLAVERO, sin que nadie toque nada', async () => {
    await pintar();
    await pasarPorElLector('0012345678');

    expect(memberService.buscarPorLlavero).toHaveBeenCalledWith('0012345678');
    expect(accessService.checkIn).toHaveBeenCalledWith('m1', 'LLAVERO', 'Lurdes Rollet');
    // El Enter era del lector: no pasó por el buscador de las personas.
    expect(memberService.searchForAccess).not.toHaveBeenCalled();
  });

  it('⭐ abre el molinete con la misma regla que el DNI', async () => {
    await pintar();
    await pasarPorElLector('0012345678');

    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ pasa: true });
  });

  it('con la cuota vencida no abre, y suena la X (siempre: lo pasó una persona)', async () => {
    memberService.buscarPorLlavero.mockResolvedValue({ socios: [VENCIDO], ultimaBaja: null });
    await pintar();
    await pasarPorElLector('0012345678');

    expect(cajita.abrirSiPasa).toHaveBeenCalledWith({ pasa: false });
    expect(sonido.sonarVencidoDirecto).toHaveBeenCalledWith('m1');
    expect(sonido.sonarEntrada).not.toHaveBeenCalled();
  });

  it('⭐ al día: suena el «din-din» de la entrada, para que se oiga sin mirar la pantalla', async () => {
    await pintar();
    await pasarPorElLector('0012345678');

    expect(sonido.sonarEntrada).toHaveBeenCalledTimes(1);
    expect(sonido.sonarVencidoDirecto).not.toHaveBeenCalled();
  });

  it('⭐ lo que había escrito antes en el campo no se pega al llavero, y el campo queda vacío', async () => {
    await pintar();
    await tipear('pe');
    await pasarPorElLector('0012345678', { desde: 20_000 });

    expect(memberService.buscarPorLlavero).toHaveBeenCalledWith('0012345678');
    expect(campo().value).toBe('');
  });

  it('el cartel dice lo mismo que con el DNI', async () => {
    await pintar();
    await pasarPorElLector('0012345678');

    expect(texto()).toContain('Lurdes Rollet');
    expect(texto()).toContain('Entrada registrada');
  });
});

describe('cuando el llavero no alcanza para saber quién es', () => {
  it('⭐ uno que no es de nadie: el aviso para asignarlo, y el molinete NO se abre', async () => {
    memberService.buscarPorLlavero.mockResolvedValue({ socios: [], ultimaBaja: null });
    await pintar();
    await pasarPorElLector('0099999999');

    expect(texto()).toContain('Llavero sin asignar');
    expect(texto()).toContain('0099999999');
    expect(accessService.checkIn).not.toHaveBeenCalled();
    expect(cajita.abrirSiPasa).not.toHaveBeenCalled();
    // Y se oye: hay alguien en la puerta que no puede entrar.
    expect(sonido.sonarLlaveroDesconocido).toHaveBeenCalledTimes(1);
  });

  it('⭐ uno dado de baja: el aviso dice a quién se le perdió', async () => {
    memberService.buscarPorLlavero.mockResolvedValue({
      socios: [],
      ultimaBaja: { llavero: { dadoDeBajaEn: '2026-11-02T10:00:00', motivoBaja: 'Lo perdió' }, socio: { nombre: 'Ana Pérez' } },
    });
    await pintar();
    await pasarPorElLector('0012345678');

    expect(texto()).toContain('Ana Pérez');
    expect(texto()).toContain('Lo perdió');
    expect(accessService.checkIn).not.toHaveBeenCalled();
  });

  it('el llavero de uno y el DNI de otro: muestra los dos y no elige por nadie', async () => {
    memberService.buscarPorLlavero.mockResolvedValue({ socios: [SOCIO, OTRO], ultimaBaja: null });
    await pintar();
    await pasarPorElLector('0012345678');

    expect(accessService.checkIn).not.toHaveBeenCalled();
    expect(preparacion.container.querySelectorAll('.search-result-item')).toHaveLength(2);
  });
});

describe('una persona sigue siendo una persona', () => {
  it('⭐ el DNI tecleado a ritmo humano va por el camino de siempre', async () => {
    await pintar();
    await tipear('24732531');
    await pasarPorElLector('24732531', { cada: 120 });

    expect(memberService.buscarPorLlavero).not.toHaveBeenCalled();
    expect(memberService.searchForAccess).toHaveBeenCalledWith('24732531');
    expect(accessService.checkIn).toHaveBeenCalledWith('m1', 'manual', 'Lurdes Rollet');
    // El «din-din» es del llavero: con el DNI tecleado la persona ya está mirando la pantalla.
    expect(sonido.sonarEntrada).not.toHaveBeenCalled();
  });

  it('el Enter suelto de siempre registra como siempre', async () => {
    await pintar();
    await tipear('24732531');
    await apretar('Enter');

    expect(memberService.buscarPorLlavero).not.toHaveBeenCalled();
    expect(accessService.checkIn).toHaveBeenCalledWith('m1', 'manual', 'Lurdes Rollet');
  });
});

describe('la búsqueda que llega tarde', () => {
  it('🔴 después de entrar, la búsqueda retrasada no vuelve a mostrar la lista', async () => {
    await pintar();
    await tipear('24732531');
    await apretar('Enter');
    expect(accessService.checkIn).toHaveBeenCalled();

    // La búsqueda mientras se escribe espera 300 ms: que venza.
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); });

    expect(preparacion.container.querySelectorAll('.search-result-item')).toHaveLength(0);
  });
});
