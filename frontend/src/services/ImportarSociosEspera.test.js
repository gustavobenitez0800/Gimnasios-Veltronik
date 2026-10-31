// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Importar socios espera lo que tarda el servidor
// ============================================
// 🔴 El 2026-10-31, en una migración de ControlFit, confirmar 2.069 socios dados de baja tardó
// más que los 20 s por defecto del apiClient: la pantalla dijo "El servidor tardó demasiado en
// contestar" mientras el servidor terminaba bien y los guardaba todos. Reintentar ahí es lo que
// no hay que hacer, y la pantalla lo estaba invitando a hacer.
//
// Mismo criterio que el historial de caja (PaymentService): analizar y deshacer, 2 minutos;
// importar, 3.
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiClient = { get: vi.fn(), post: vi.fn(), put: vi.fn() };
vi.mock('../lib/apiClient', () => ({ default: apiClient }));

const { memberService } = await import('./MemberService');

const FILAS = [{ fila: 2, nombre: 'Lurdes Gómez', documento: '30111222' }];

describe('importar socios: el tiempo de espera', () => {
  beforeEach(() => {
    apiClient.post.mockReset();
    apiClient.post.mockResolvedValue({ data: {} });
    vi.spyOn(memberService, 'refrescarCopiaLocal').mockImplementation(() => {});
  });

  it('la vista previa espera 2 minutos', async () => {
    await memberService.analizarImportacion('socios.xlsx', FILAS);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/gym/members/importacion/analizar', { archivo: 'socios.xlsx', filas: FILAS }, { timeout: 120000 });
  });

  it('confirmar espera 3 minutos: miles de socios no entran en 20 s', async () => {
    await memberService.importar('socios.xlsx', FILAS);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/gym/members/importacion', { archivo: 'socios.xlsx', filas: FILAS }, { timeout: 180000 });
  });

  it('deshacer espera 2 minutos', async () => {
    await memberService.deshacerImportacion('lote-1');
    expect(apiClient.post).toHaveBeenCalledWith('/gym/members/importacion/lote-1/deshacer', null, { timeout: 120000 });
  });
});
