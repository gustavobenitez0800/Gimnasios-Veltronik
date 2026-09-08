// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Editar a un socio SIN CUOTA no puede darlo de baja
// ============================================
// ⚠️ ESTE TEST EXISTE POR UNA TRAMPA CONCRETA, NO POR PROLIJIDAD.
//
// `toApi` traduce el estado del socio a un booleano: cualquier `status` que no sea 'active'
// viaja al backend como `active: false`. Y guardar manda el socio ENTERO.
//
// Desde que el alta dejó de regalar un mes (ADR-013), "sin cuota" es el estado de todo socio
// recién cargado, y la tentación evidente es darle un `status: 'sin_cuota'` para que el chip
// lo diga. Escrito así, entrar a ese socio a corregirle el teléfono LO DARÍA DE BAJA — sin
// tocar el estado, sin aviso, y con la baja escrita en producción.
//
// Por eso "sin cuota" es una lectura derivada (`esSinCuota`, en MembersPage) y no un estado
// guardado. Lo de abajo es lo que sostiene esa decisión cuando ya nadie se acuerde de por qué.
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const getMembersPaged = vi.fn();
const updateMember = vi.fn();
vi.mock('../services/MemberService', () => ({
  memberService: {
    getMembersPaged: (...a) => getMembersPaged(...a),
    createMember: vi.fn(),
    updateMember: (...a) => updateMember(...a),
    deleteMember: vi.fn(),
  },
}));

const { useMemberController } = await import('./useMemberController');
const { clearQueryCache } = await import('../hooks');

/** Un socio recién dado de alta: activo, sin ninguna cobertura. Tal cual lo manda el backend. */
const RECIEN_DADO_DE_ALTA = {
  id: 'm1',
  firstName: 'Jose Luis',
  lastName: 'Benitez',
  document: '30111222',
  phone: '3764111111',
  active: true,
  membershipEnd: null,
  situacion: 'SIN_DATOS',
  diasRestantes: 0,
  diasVencido: 0,
};

function montar() {
  const renders = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  function Sonda() { renders.push(useMemberController(25)); return null; }
  act(() => { root.render(<Sonda />); });
  return {
    ultimo: () => renders[renders.length - 1],
    desmontar: () => act(() => { root.unmount(); }),
  };
}

const esperar = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('el socio sin cuota', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    clearQueryCache();
    getMembersPaged.mockReset();
    updateMember.mockReset();
    updateMember.mockResolvedValue(RECIEN_DADO_DE_ALTA);
    window.localStorage.setItem('current_org_id', 'org-1');
  });

  it('llega a la pantalla como ACTIVO, no como un estado propio', async () => {
    getMembersPaged.mockResolvedValue({ content: [RECIEN_DADO_DE_ALTA], totalElements: 1 });

    const vista = montar();
    await esperar();

    const socio = vista.ultimo().members[0];
    // El estado guardado sigue siendo el de siempre. Lo que cambia es cómo se DIBUJA, y eso
    // lo decide la pantalla mirando `situacion` — que también tiene que llegar.
    expect(socio.status).toBe('active');
    expect(socio.situacion).toBe('SIN_DATOS');
    vista.desmontar();
  });

  it('⭐ editarlo NO lo da de baja', async () => {
    getMembersPaged.mockResolvedValue({ content: [RECIEN_DADO_DE_ALTA], totalElements: 1 });

    const vista = montar();
    await esperar();

    // El viaje completo, como lo hace la pantalla: el socio que se dibujó es el que se guarda.
    const socio = vista.ultimo().members[0];
    await act(async () => {
      await vista.ultimo().saveMember({ ...socio, phone: '3764999999' });
    });

    expect(updateMember).toHaveBeenCalledTimes(1);
    const [, dto] = updateMember.mock.calls[0];
    // LA LÍNEA QUE IMPORTA. Si alguien le inventa un `status` a "sin cuota", esto se pone rojo
    // acá y no en la base de datos de un gimnasio.
    expect(dto.active).toBe(true);
    expect(dto.phone).toBe('3764999999');
    vista.desmontar();
  });

  it('al dado de baja sí lo sigue mandando como baja', async () => {
    // El contrapeso: el test de arriba no vale nada si `active` fuera siempre true.
    getMembersPaged.mockResolvedValue({
      content: [{ ...RECIEN_DADO_DE_ALTA, active: false, situacion: 'INACTIVO' }],
      totalElements: 1,
    });

    const vista = montar();
    await esperar();

    const socio = vista.ultimo().members[0];
    expect(socio.status).toBe('inactive');
    await act(async () => { await vista.ultimo().saveMember(socio); });

    expect(updateMember.mock.calls[0][1].active).toBe(false);
    vista.desmontar();
  });
});
