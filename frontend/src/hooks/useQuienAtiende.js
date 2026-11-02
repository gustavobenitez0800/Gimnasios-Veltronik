import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getShift } from '../lib/shift';

/**
 * El nombre de quien está atendiendo, para firmar lo que se hace: el del turno del mostrador si
 * hay uno abierto, si no el de la cuenta. Es la misma regla que usa la caja.
 *
 * <p>Devuelve una FUNCIÓN y no el nombre: el turno se puede abrir o cerrar con la pantalla
 * abierta, y la firma tiene que ser la del momento en que se aprieta el botón.</p>
 */
export function useQuienAtiende() {
  const { profile } = useAuth();
  return useCallback(() => getShift()?.name || profile?.fullName || null, [profile]);
}
