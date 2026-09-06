// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests de la situación del socio, contada en el terminal
// ============================================
// ⚠️⚠️ ESTOS TESTS SON EL CONTRATO ENTRE DOS COPIAS DE LA MISMA REGLA.
//
// `lib/situacionSocio.js` es un puerto de `MemberAccessPolicy` (Java). Existe porque la copia
// local vale 30 días y un veredicto tiene fecha de vencimiento: sin contar acá, un socio con
// 10 días restantes cuando se cortó internet seguiría mostrando 10 al mes siguiente.
//
// Los casos de abajo son LOS MISMOS que fija `MemberAccessPolicyTest`, con los mismos números
// —incluido el caso real que rompió: vencimiento 27/08 21:30 mirado el 30/08 21:18—. Si algún
// día uno de los dos lados cambia, esto se pone rojo. Es lo único que sostiene que las dos
// copias digan lo mismo.
// ============================================

import { describe, it, expect, beforeEach } from 'vitest';
import { situacionDe, graceDays, recordarGraceDays, compararConElServidor } from './situacionSocio';

/** Un socio activo que vence en el momento dado. */
const socio = (vence) => ({ isActive: true, membershipEnd: vence });

/** Fecha local, con la misma forma en que la manda el backend (LocalDateTime, sin zona). */
const cuando = (a, m, d, h = 0, min = 0) =>
  `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  + `T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;

const enElMomento = (a, m, d, h = 0, min = 0) => new Date(a, m - 1, d, h, min, 0);

beforeEach(() => {
  localStorage.clear();
});

describe('el caso que rompió (los mismos números que el test de Java)', () => {
  it('27/08 21:30 mirado el 30/08 21:18 son 2 días, no 4', () => {
    // El backend decía 2 y la pantalla 4. El bueno es el 2: son 2 días y 23 horas, y hasta
    // que no se cumplen 3 días completos, son 2.
    const r = situacionDe(socio(cuando(2026, 8, 27, 21, 30)), enElMomento(2026, 8, 30, 21, 18));
    expect(r.diasVencido).toBe(2);
  });

  it('la hora del vencimiento CUENTA: perderla era la mitad del bug', () => {
    const ahora = enElMomento(2026, 8, 30, 21, 18);

    const conHora = situacionDe(socio(cuando(2026, 8, 27, 21, 30)), ahora).diasVencido;
    const sinHora = situacionDe(socio(cuando(2026, 8, 27, 0, 0)), ahora).diasVencido;

    expect(conHora).toBe(2);
    expect(sinHora).toBe(3);
    expect(conHora, 'recortar la hora CAMBIA el resultado: por eso no se puede recortar')
      .not.toBe(sinHora);
  });
});

describe('los bordes', () => {
  it('un minuto antes de vencer todavía está al día', () => {
    const r = situacionDe(socio(cuando(2026, 9, 10, 12, 0)), enElMomento(2026, 9, 10, 11, 59));
    expect(r.situacion).toBe('AL_DIA');
  });

  it('al que le quedan horas le falta 1 día, no 0', () => {
    // Decirle "0 días" a alguien que todavía puede entrenar hoy es alarmarlo de más.
    const r = situacionDe(socio(cuando(2026, 9, 10, 23, 0)), enElMomento(2026, 9, 10, 11, 0));
    expect(r.situacion).toBe('AL_DIA');
    expect(r.diasRestantes).toBe(1);
  });

  it('recién vencido cae en GRACIA, no en vencido', () => {
    const r = situacionDe(socio(cuando(2026, 9, 8, 12, 0)), enElMomento(2026, 9, 10, 12, 0));
    expect(r.situacion).toBe('EN_GRACIA');
    expect(r.diasVencido).toBe(2);
  });

  it('pasada la gracia sí es VENCIDO', () => {
    const r = situacionDe(socio(cuando(2026, 9, 1, 12, 0)), enElMomento(2026, 9, 10, 12, 0));
    expect(r.situacion).toBe('VENCIDO');
    expect(r.diasVencido).toBe(9);
  });

  it('justo en el límite de la gracia todavía es gracia', () => {
    const r = situacionDe(socio(cuando(2026, 9, 7, 12, 0)), enElMomento(2026, 9, 10, 12, 0));
    expect(r.diasVencido).toBe(3);
    expect(r.situacion, 'el borde va del lado permisivo, como en Java').toBe('EN_GRACIA');
  });
});

describe('los que NO son morosos', () => {
  it('⚠️ sin fecha cargada NO es deuda: es un dato que falta', () => {
    // Pasa con los migrados y los cargados a las apuradas. Tratarlo como deudor haría sonar
    // la alarma en la cara de alguien que está al día.
    const r = situacionDe({ isActive: true, membershipEnd: null }, enElMomento(2026, 9, 10));
    expect(r.situacion).toBe('SIN_DATOS');
    expect(r.diasVencido).toBe(0);
  });

  it('el dado de baja no debe: ya no es socio', () => {
    const r = situacionDe(
      { isActive: false, membershipEnd: cuando(2026, 1, 1) }, enElMomento(2026, 9, 10),
    );
    expect(r.situacion).toBe('INACTIVO');
    expect(r.diasVencido, 'no se le reclama nada: no es un problema de plata').toBe(0);
  });

  it('la baja manda sobre la fecha, aunque esté vigente', () => {
    const r = situacionDe(
      { isActive: false, membershipEnd: cuando(2027, 1, 1) }, enElMomento(2026, 9, 10),
    );
    expect(r.situacion).toBe('INACTIVO');
  });
});

describe('⭐ el número que envejece — la razón de ser de este archivo', () => {
  it('el mismo socio, mirado 20 días después, ya NO está al día', () => {
    // ESTE es el agujero que este módulo cierra. Sin él, el veredicto queda congelado en el
    // último refresco: un socio con 10 días restantes cuando se cortó internet seguiría
    // mostrando 10 al mes siguiente, con quince de vencido. Un dato viejo se nota; uno
    // equivocado con cara de correcto, no.
    const s = socio(cuando(2026, 9, 10, 12, 0));

    const elDiaDelCorte = situacionDe(s, enElMomento(2026, 8, 31, 12, 0));
    const veinteDiasDespues = situacionDe(s, enElMomento(2026, 9, 20, 12, 0));

    expect(elDiaDelCorte.situacion).toBe('AL_DIA');
    expect(elDiaDelCorte.diasRestantes).toBe(10);
    expect(veinteDiasDespues.situacion).toBe('VENCIDO');
    expect(veinteDiasDespues.diasVencido).toBe(10);
  });
});

describe('los días de gracia los manda el servidor', () => {
  it('sin que el servidor haya hablado, usa 3', () => {
    expect(graceDays()).toBe(3);
  });

  it('si el servidor dice otro número, ese manda', () => {
    // Así, cambiar la gracia de 3 a 5 en el backend no deja un número viejo escrito de este
    // lado — que es justo la clase de valor que alguien cambia en un lugar y olvida en otro.
    recordarGraceDays(7);
    expect(graceDays()).toBe(7);

    const r = situacionDe(socio(cuando(2026, 9, 5, 12, 0)), enElMomento(2026, 9, 10, 12, 0));
    expect(r.diasVencido).toBe(5);
    expect(r.situacion, 'con 7 de gracia, 5 días vencido sigue siendo gracia').toBe('EN_GRACIA');
  });

  it('un valor absurdo no pisa el bueno', () => {
    recordarGraceDays(3);
    recordarGraceDays(-1);
    recordarGraceDays('cualquier cosa');
    expect(graceDays()).toBe(3);
  });
});

describe('la red de seguridad contra la deriva', () => {
  it('cuando las dos copias coinciden, no dice nada', () => {
    const s = { ...socio(cuando(2027, 1, 1)), situacion: 'AL_DIA' };
    expect(compararConElServidor(s, enElMomento(2026, 9, 10))).toBe(true);
  });

  it('cuando difieren, avisa', () => {
    // Sin esto, una divergencia entre las dos copias de la regla vive meses escondida: son
    // dos números que nunca se muestran juntos.
    const s = { ...socio(cuando(2026, 1, 1)), situacion: 'AL_DIA' }; // el servidor se equivoca
    expect(compararConElServidor(s, enElMomento(2026, 9, 10))).toBe(false);
  });

  it('sin respuesta del servidor no hay nada que comparar', () => {
    expect(compararConElServidor(socio(cuando(2027, 1, 1)))).toBe(true);
  });
});
