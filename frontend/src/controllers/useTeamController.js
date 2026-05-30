import { useState, useCallback } from 'react';
import { teamService } from '../services/TeamService';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook Controlador: useTeamController
 * Migrado de TeamFacade (Supabase) a TeamService (Java API).
 */
export function useTeamController() {
  const { gym: currentGym } = useAuth();
  
  const [teamMembers, setTeamMembers] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadTeam = useCallback(async () => {
    if (!currentGym?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await teamService.getTeamMembers();
      setTeamMembers(data);
    } catch (err) {
      console.error("Error loading team:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentGym]);

  const loadActivity = useCallback(async () => {
    if (!currentGym?.id) return;
    setActivityLoading(true);
    try {
      const data = await teamService.getActivityLog(50);
      setActivityLog(data);
    } catch (err) {
      console.error("Error loading activity:", err);
    } finally {
      setActivityLoading(false);
    }
  }, [currentGym]);

  const inviteMember = async (email, role) => {
    setLoading(true);
    setError(null);
    try {
      await teamService.inviteMember(email, role);
      await loadTeam();
    } catch (err) {
      console.error("Error inviting member:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateRole = async (targetUserId, newRole) => {
    setLoading(true);
    setError(null);
    try {
      await teamService.updateRole(targetUserId, newRole);
      await loadTeam();
    } catch (err) {
      console.error("Error updating role:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const removeMember = async (targetUserId) => {
    setLoading(true);
    setError(null);
    try {
      await teamService.removeMember(targetUserId);
      await loadTeam();
    } catch (err) {
      console.error("Error removing member:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    teamMembers,
    activityLog,
    loading,
    activityLoading,
    error,
    loadTeam,
    loadActivity,
    inviteMember,
    updateRole,
    removeMember
  };
}
