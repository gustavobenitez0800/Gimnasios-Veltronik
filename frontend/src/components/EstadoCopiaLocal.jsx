// ============================================
// VELTRONIK - ESTADO DE LA COPIA LOCAL
// ============================================
// Un renglón que le dice al mostrador de cuándo son los datos que está viendo.
//
// POR QUÉ HACE FALTA
// La copia local hace que buscar sea instantáneo, pero a cambio los datos pueden estar un
// poco viejos: alguien que pagó hace diez minutos en otra terminal todavía figura vencido.
// Eso es inevitable —es la naturaleza de tener una copia— y por eso NO se esconde. Un
// sistema que muestra datos viejos sin decirlo es un sistema en el que se deja de confiar
// la primera vez que alguien lo descubre.
//
// ⭐ EL PLAZO NO ES UN INTERRUPTOR, ES CUÁNDO CAMBIA EL CARTEL
// Decisión del dueño (2026-09-06): la copia vale 30 días, y NADA se apaga al cumplirse.
// La regla de las tres bandas vive en `lib/frescura.js`, con el porqué completo; acá se
// usa nomás. Este archivo decide cómo SE VE cada banda, no cuándo empieza.

import { useState, useEffect } from 'react';
import { estadoSocios } from '../lib/localMembers';
import { bandaDeFrescura } from '../lib/frescura';
import Icon from './Icon';

function haceCuanto(ms, ahora) {
  if (!ms) return null;
  const seg = Math.floor((ahora - ms) / 1000);
  if (seg < 45) return 'hace unos segundos';
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const hs = Math.round(min / 60);
  if (hs < 24) return `hace ${hs} h`;
  const dias = Math.round(hs / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

/** El día en que se actualizó, para cuando "hace 12 días" ya no le sirve a nadie. */
function elDia(ms) {
  try {
    return new Date(ms).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
  } catch {
    return null;
  }
}

export default function EstadoCopiaLocal() {
  // El "ahora" vive en el estado, no se lee durante el render: un componente tiene que
  // pintar lo mismo con las mismas entradas, y `Date.now()` cambia en cada repintado.
  // Este intervalo es a la vez el reloj y el motivo del repintado.
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    // Cada 30 segundos alcanza: es un dato de contexto, no un cronómetro.
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const { cantidad, actualizado, vacia } = estadoSocios();
  if (vacia) return null;

  const banda = bandaDeFrescura(actualizado, ahora);
  const dia = actualizado ? elDia(actualizado) : null;

  // El texto cambia con la banda porque la pregunta del mostrador cambia. A los cinco
  // minutos importa "¿está fresco?"; a los doce días la única pregunta útil es "¿de qué día
  // son estos datos?", y "hace 12 días" obliga a hacer la cuenta mentalmente.
  let texto;
  if (banda === 'fresca') {
    texto = `${cantidad} socios en esta computadora${actualizado ? ` · actualizado ${haceCuanto(actualizado, ahora)}` : ''}`;
  } else if (banda === 'vieja') {
    texto = `Sin conexión${dia ? ` desde el ${dia}` : ''} · se atiende con la copia de esta computadora`;
  } else {
    texto = `Los datos son del ${dia} · el mostrador sigue funcionando, pero un socio puede haber pagado después`;
  }

  return (
    <p className={`copia-local is-${banda}`} role={banda === 'muy-vieja' ? 'status' : undefined}>
      <Icon name={banda === 'fresca' ? 'check' : 'wifiOff'} size="0.9em" />
      <span>{texto}</span>
    </p>
  );
}
