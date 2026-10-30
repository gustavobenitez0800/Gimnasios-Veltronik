// @vitest-environment happy-dom
// ============================================
// LA VUELTA DEL LINK "CONFIRMÁ TU CORREO"
// ============================================
//
// El bug: confirmar el correo no abría el panel, y entrar de nuevo sí. El canje del `?code=`
// vence a los 5 minutos de haberse registrado y solo anda en el mismo navegador, pero el
// correo queda confirmado igual. La app caía al login sin decir nada. Ver vueltaDelCorreo.js.
// ============================================

import { describe, it, expect, beforeEach } from 'vitest';
import { leerVueltaDelCorreo, avisoDeLaVuelta, limpiarVueltaDelCorreo } from './vueltaDelCorreo';

const PORTAL = 'https://veltronik-v2.vercel.app';

describe('qué trajo el link del correo', () => {
  it('la vuelta de un alta: la marca y el código de Supabase', () => {
    expect(leerVueltaDelCorreo(`${PORTAL}/?alta=1&code=abc`)).toEqual({
      tokenHash: null, tipo: null, traiaCodigo: true, error: null,
    });
  });

  it('el link con token_hash (la plantilla nueva) cuenta como alta aunque no traiga la marca', () => {
    expect(leerVueltaDelCorreo(`${PORTAL}/?token_hash=xyz&type=email`)).toEqual({
      tokenHash: 'xyz', tipo: 'email', traiaCodigo: false, error: null,
    });
    expect(leerVueltaDelCorreo(`${PORTAL}/?token_hash=xyz&type=signup`).tipo).toBe('signup');
  });

  it('un token_hash de recuperar contraseña NO es un alta', () => {
    expect(leerVueltaDelCorreo(`${PORTAL}/?token_hash=xyz&type=recovery`)).toBeNull();
  });

  it('el error que Supabase devuelve cuando el link ya se usó o venció', () => {
    const vuelta = leerVueltaDelCorreo(
      `${PORTAL}/?alta=1&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
    );
    expect(vuelta.error).toBe('Email link is invalid or has expired');
  });

  it('⭐ el `?code=` de Google o de recuperar contraseña no se toca: no traen la marca', () => {
    expect(leerVueltaDelCorreo(`${PORTAL}/?code=abc#/lobby`)).toBeNull();
    expect(leerVueltaDelCorreo(`${PORTAL}/?code=abc#/reset-password`)).toBeNull();
    expect(leerVueltaDelCorreo(`${PORTAL}/`)).toBeNull();
    expect(leerVueltaDelCorreo('')).toBeNull();
    expect(leerVueltaDelCorreo('no es una url')).toBeNull();
  });
});

describe('qué se le dice a quien volvió del correo y quedó en el login', () => {
  it('⭐ con código y sin error: el correo YA está confirmado, que entre con la contraseña', () => {
    const aviso = avisoDeLaVuelta(leerVueltaDelCorreo(`${PORTAL}/?alta=1&code=abc`));
    expect(aviso.tipo).toBe('ok');
    expect(aviso.texto).toContain('quedó confirmado');
  });

  it('con error de Supabase: el link ya se usó o venció, y se dicen los dos caminos', () => {
    const aviso = avisoDeLaVuelta(leerVueltaDelCorreo(`${PORTAL}/?alta=1&error=access_denied`));
    expect(aviso.tipo).toBe('error');
    expect(aviso.texto).toContain('ya se usó o venció');
    expect(aviso.texto).toContain('registrate de nuevo');
  });

  it('un token_hash que no abrió sesión también es un link vencido', () => {
    const aviso = avisoDeLaVuelta(leerVueltaDelCorreo(`${PORTAL}/?token_hash=xyz&type=email`));
    expect(aviso.tipo).toBe('error');
  });

  it('sin vuelta, o con la marca sola (una recarga después de limpiar), no hay aviso', () => {
    expect(avisoDeLaVuelta(null)).toBeNull();
    expect(avisoDeLaVuelta(leerVueltaDelCorreo(`${PORTAL}/?alta=1`))).toBeNull();
  });
});

describe('limpiar la barra de direcciones', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('saca lo que dejó el correo y deja la ruta del hash como estaba', () => {
    window.history.replaceState(null, '', '/?alta=1&code=abc&otro=1#/lobby');
    limpiarVueltaDelCorreo();
    expect(window.location.search).toBe('?otro=1');
    expect(window.location.hash).toBe('#/lobby');
  });

  it('también los parámetros de error', () => {
    window.history.replaceState(null, '', '/?alta=1&error=access_denied&error_code=otp_expired&error_description=x&sb=');
    limpiarVueltaDelCorreo();
    expect(window.location.search).toBe('');
  });
});
