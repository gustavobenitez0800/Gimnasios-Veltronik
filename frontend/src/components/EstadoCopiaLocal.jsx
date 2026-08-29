// ============================================
// VELTRONIK - ESTADO DE LA COPIA LOCAL
// ============================================
// Un renglón discreto que le dice al mostrador de cuándo son los datos que está viendo.
//
// POR QUÉ HACE FALTA
// La copia local hace que buscar sea instantáneo, pero a cambio los datos pueden estar un
// poco viejos: alguien que pagó hace diez minutos en otra terminal todavía figura vencido.
// Eso es inevitable —es la naturaleza de tener una copia— y por eso NO se esconde. Un
// sistema que muestra datos viejos sin decirlo es un sistema en el que se deja de confiar
// la primera vez que alguien lo descubre.
//
// Se muestra al lado del buscador, chiquito, sin alarmar: la mayoría del tiempo dice "hace
// unos segundos" y nadie lo mira. Cuando el internet se cae, empieza a envejecer a la vista,
// y ahí la recepcionista entiende sola por qué el socio que acaba de pagar sigue en rojo.

import { useState, useEffect } from 'react';
import { estadoSocios, REFRESCO_MS } from '../lib/localMembers';
import Icon from './Icon';

function haceCuanto(ms, ahora) {
  if (!ms) return null;
  const seg = Math.floor((ahora - ms) / 1000);
  if (seg < 45) return 'hace unos segundos';
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const hs = Math.round(min / 60);
  if (hs < 24) return `hace ${hs} h`;
  return `hace ${Math.round(hs / 24)} días`;
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

  // Se marca como vieja recién al doblar el intervalo de refresco: un ciclo perdido puede
  // ser una conexión con hipo, dos ya es un problema que vale la pena mostrar.
  const vieja = actualizado && ahora - actualizado > REFRESCO_MS * 2;

  return (
    <p className={`copia-local ${vieja ? 'is-vieja' : ''}`}>
      <Icon name={vieja ? 'wifiOff' : 'check'} size="0.9em" />
      <span>
        {cantidad} socios en esta computadora
        {actualizado ? ` · actualizado ${haceCuanto(actualizado, ahora)}` : ''}
      </span>
    </p>
  );
}
