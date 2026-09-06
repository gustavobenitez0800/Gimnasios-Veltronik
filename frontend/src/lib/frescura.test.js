// ============================================
// VELTRONIK - Tests de cuán vieja es la copia local
// ============================================
// Lo que se prueba es la REGLA DE LAS TRES BANDAS, que es la decisión del dueño escrita en
// código: la copia vale 30 días y el plazo NO apaga nada — solo cambia cuánto insiste el
// cartel. Un test acá es lo que evita que dentro de seis meses alguien "optimice" el número
// y termine frenando a un gimnasio que lleva ocho días sin internet.
//
// Se prueba la función sola, sin montar el componente: la regla es la parte que importa y
// no debería necesitar un DOM para verificarse.
// ============================================

import { describe, it, expect } from 'vitest';
import { bandaDeFrescura, ESPEJO_DIAS } from './frescura';

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

// Un "ahora" fijo: una fecha que depende del reloj real es un test que falla solo algún día.
const AHORA = new Date('2026-09-06T15:00:00').getTime();

/** Hace `n` milisegundos. */
const hace = (n) => AHORA - n;

describe('las tres bandas de la copia local', () => {
  it('recién actualizada, discreta', () => {
    expect(bandaDeFrescura(hace(30 * 1000), AHORA)).toBe('fresca');
    expect(bandaDeFrescura(hace(20 * MINUTO), AHORA)).toBe('fresca');
  });

  it('hasta una hora sigue siendo discreta', () => {
    // Un mostrador con una conexión mala pierde ciclos todo el tiempo. Ponerse ámbar a los
    // diez minutos sería un cartel de alarma encendido media jornada, y un aviso que está
    // siempre prendido deja de avisar.
    expect(bandaDeFrescura(hace(59 * MINUTO), AHORA)).toBe('fresca');
  });

  it('pasada la hora avisa, pero sin drama', () => {
    expect(bandaDeFrescura(hace(2 * HORA), AHORA)).toBe('vieja');
    expect(bandaDeFrescura(hace(5 * DIA), AHORA)).toBe('vieja');
  });

  it('el día 29 todavía avisa nomás; el 31 insiste', () => {
    expect(bandaDeFrescura(hace(29 * DIA), AHORA)).toBe('vieja');
    expect(bandaDeFrescura(hace(31 * DIA), AHORA)).toBe('muy-vieja');
  });

  it('justo en el plazo todavía NO es "muy vieja"', () => {
    // El borde va del lado permisivo, como todo lo demás en el mostrador.
    expect(bandaDeFrescura(hace(ESPEJO_DIAS * DIA), AHORA)).toBe('vieja');
  });

  it('sin fecha de actualización no alarma a nadie', () => {
    // Puede pasar en el primer arranque, antes del primer refresco. No saber de cuándo es la
    // copia no es lo mismo que saber que es vieja.
    expect(bandaDeFrescura(null, AHORA)).toBe('fresca');
  });

  it('el plazo es de 30 días, y está puesto a propósito', () => {
    // Si alguien lo cambia, que sea una decisión y no un descuido: siete días dejaba a un
    // gimnasio sin veredictos por un fin de semana largo con la línea cortada.
    expect(ESPEJO_DIAS).toBe(30);
  });
});
