import { useState, useCallback } from 'react';
import { classService } from '../services/ClassService';
import { useAuth } from '../contexts/AuthContext';

/** Estado + operaciones de la página de Clases. El mapeo al contrato del backend vive en ClassService. */
export function useClassController() {
  const { gym: currentGym } = useAuth();

  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadClasses = useCallback(async () => {
    if (!currentGym?.id) return;
    setLoading(true);
    try {
      const data = await classService.getActiveClasses();
      setClasses(data);
    } catch (err) {
      console.error("Error loading classes:", err);
    } finally {
      setLoading(false);
    }
  }, [currentGym]);

  const saveClass = async (classData) => {
    setLoading(true);
    try {
      const saved = classData.id
        ? await classService.update(classData.id, classData)
        : await classService.create(classData);
      loadClasses(); // Refresh from backend
      return saved;
    } catch (err) {
      console.error("Error saving class:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteClass = async (id) => {
    setLoading(true);
    try {
      await classService.delete(id);
      setClasses(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error("Error deleting class:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    classes,
    loading,
    loadClasses,
    saveClass,
    deleteClass,
  };
}
