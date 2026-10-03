// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { frenarRuedaEnNumeros } from './ruedaEnNumeros';

let desarmar;
afterEach(() => { desarmar?.(); document.body.innerHTML = ''; });

const girar = (el) => el.dispatchEvent(new Event('wheel', { bubbles: true }));

describe('la rueda del mouse sobre un campo de plata', () => {
  it('⭐ le saca el foco al número enfocado, así la rueda no le cambia el valor', () => {
    desarmar = frenarRuedaEnNumeros();
    document.body.innerHTML = '<input type="number" value="45000">';
    const monto = document.querySelector('input');
    monto.focus();
    girar(monto);
    expect(document.activeElement).not.toBe(monto);
    expect(monto.value).toBe('45000');
  });

  it('a un campo de texto no le hace nada', () => {
    desarmar = frenarRuedaEnNumeros();
    document.body.innerHTML = '<input type="text" value="Ana">';
    const nombre = document.querySelector('input');
    nombre.focus();
    girar(nombre);
    expect(document.activeElement).toBe(nombre);
  });

  it('desarmado, ya no interviene', () => {
    frenarRuedaEnNumeros()();
    document.body.innerHTML = '<input type="number" value="1">';
    const campo = document.querySelector('input');
    campo.focus();
    girar(campo);
    expect(document.activeElement).toBe(campo);
  });
});
