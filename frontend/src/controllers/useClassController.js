import { useState, useCallback } from 'react';
import { classService } from '../services/ClassService';
import { useAuth } from '../contexts/AuthContext';

export function useClassController() {
  const { gym: currentGym } = useAuth();

  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadClasses = useCallback(async () => {
    if (!currentGym?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await classService.getActiveClasses();
      setClasses(data);
    } catch (err) {
      console.error("Error loading classes:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentGym]);

  const saveClass = async (classData) => {
    setLoading(true);
    setError(null);
    try {
      let saved;
      if (classData.id) {
        saved = await classService.update(classData.id, classData);
      } else {
        saved = await classService.create(classData);
      }
      loadClasses(); // Refresh from backend
      return saved;
    } catch (err) {
      console.error("Error saving class:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteClass = async (id) => {
    setLoading(true);
    setError(null);
    try {
      await classService.delete(id);
      setClasses(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error("Error deleting class:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    classes,
    loading,
    error,
    loadClasses,
    saveClass,
    deleteClass,
  };
}
