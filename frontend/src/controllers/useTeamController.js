import { useState, useCallback } from 'react';
import { teamService } from '../services/TeamService';
import { useAuth } from '../contexts/AuthContext';
import { useQueryCache } from '../hooks';

/**
 * Hook Controlador: useTeamController
 *
 * ⭐ EL EQUIPO SE PINTA AL INSTANTE AL VOLVER (2026-09-03).
 *
 * Antes cada visita a "Equipo" arrancaba con el spinner y pedía la lista de cero. Es lo que
 * los dueños describen como "va lento": no es que el servidor tarde, es que la pantalla
 * queda en blanco entre un clic y el siguiente. Ahora la lista viene de `useQueryCache`
 * (Stale-While-Revalidate): al volver se muestra lo último que se sabía y se refresca por
 * detrás. El mismo patrón que ya usan Socios, Pagos, Dashboard y Accesos.
 *
 * El hook pide solo al montarse: la página NO tiene que llamar a `loadTeam()` al abrir
 * (sería pedir dos veces lo mismo). `loadTeam` queda para después de una mutación.
 *
 * La actividad se sigue pidiendo a mano, cuando se abre su pestaña: es secundaria y no
 * vale la pena traerla en cada visita.
 */
export function useTeamController() {
  const { gym: currentGym } = useAuth();
  const gymId = currentGym?.id || null;

  const [activityLog, setActivityLog] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState(null);

  // La clave lleva la sucursal: cambiar de gimnasio no puede mostrar el equipo del otro.
  const { data, loading, isFetching, invalidate } = useQueryCache(
    ['team', gymId],
    () => (gymId ? teamService.getTeamMembers() : Promise.resolve([])),
    { staleTime: 60000 },
  );
  const teamMembers = data || [];

  /** Vuelve a pedir la lista. Para después de invitar, cambiar rol o sacar a alguien. */
  const loadTeam = useCallback(() => { invalidate(); }, [invalidate]);

  const loadActivity = useCallback(async () => {
    if (!gymId) return;
    setActivityLoading(true);
    try {
      const data = await teamService.getActivityLog(50);
      setActivityLog(data);
    } catch (err) {
      console.error("Error loading activity:", err);
    } finally {
      setActivityLoading(false);
    }
  }, [gymId]);

  /** Envuelve una mutación: marca ocupado, refresca la lista al terminar, propaga el error. */
  const mutar = async (accion, quePaso) => {
    setMutating(true);
    setError(null);
    try {
      const resultado = await accion();
      invalidate();
      return resultado;
    } catch (err) {
      console.error(quePaso, err);
      setError(err.message);
      throw err;
    } finally {
      setMutating(false);
    }
  };

  /** @returns el miembro agregado; trae `temporaryPassword` si se acaba de crear la cuenta. */
  const inviteMember = (email, role, fullName) =>
    mutar(() => teamService.inviteMember(email, role, fullName), 'Error inviting member:');

  const updateRole = (targetUserId, newRole) =>
    mutar(() => teamService.updateRole(targetUserId, newRole), 'Error updating role:');

  const removeMember = (targetUserId) =>
    mutar(() => teamService.removeMember(targetUserId), 'Error removing member:');

  return {
    teamMembers,
    activityLog,
    // `loading` solo cuando NO hay nada que mostrar (primera vez). Un refresco de fondo o
    // una mutación no vacían la pantalla: eso era el parpadeo.
    loading: loading || mutating,
    isFetching,
    activityLoading,
    error,
    loadTeam,
    loadActivity,
    inviteMember,
    updateRole,
    removeMember
  };
}
