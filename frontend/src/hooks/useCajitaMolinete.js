import { useSyncExternalStore, useEffect } from 'react';
import CONFIG from '../lib/config';
import { molineteService } from '../services/MolineteService';
import {
  estadoDeLaCajita, suscribirseALaCajita, conectarCajita, fijarHabilitacion,
} from '../lib/cajitaMolinete';

/** Lo último que dijo el servidor sobre el plan, por sucursal: sin internet la cajita sigue. */
const claveDelPlan = (sucursalId) => `cajita_habilitada:${sucursalId || 'sin-sucursal'}`;

/**
 * La cajita del molinete, para las pantallas: en qué estado está y si el plan la habilita.
 *
 * <p>Solo hace algo en el escritorio. En el portal web no hay cajita: la PC del mostrador es
 * la que la tiene enchufada.</p>
 *
 * <p>El plan se pregunta al servidor al montar, y la respuesta queda guardada en esta PC: un
 * gimnasio que se queda sin internet sigue abriendo con lo último que se supo. Si nunca se
 * supo (primera vez, y sin internet), no abre: el botón «Abrir» de quien atiende sigue andando.</p>
 *
 * @param {{ conectarAlMontar?: boolean }} opciones el mostrador la busca al abrir; Ajustes no
 *        (allá hay un botón, y un clic es lo único que deja pedir una cajita nueva).
 */
export function useCajitaMolinete({ conectarAlMontar = false } = {}) {
  const estado = useSyncExternalStore(suscribirseALaCajita, estadoDeLaCajita, estadoDeLaCajita);

  useEffect(() => {
    if (!CONFIG.IS_DESKTOP) return;
    let sucursalId = null;
    try {
      sucursalId = localStorage.getItem('current_org_id');
      fijarHabilitacion(localStorage.getItem(claveDelPlan(sucursalId)) === '1');
    } catch { /* sin almacenamiento: se queda con lo que diga el servidor */ }

    molineteService.habilitado()
      .then((habilitada) => {
        fijarHabilitacion(habilitada);
        try { localStorage.setItem(claveDelPlan(sucursalId), habilitada ? '1' : '0'); } catch { /* idem */ }
      })
      .catch(() => { /* sin internet: queda lo guardado */ });

    if (conectarAlMontar) conectarCajita();
  }, [conectarAlMontar]);

  return estado;
}
