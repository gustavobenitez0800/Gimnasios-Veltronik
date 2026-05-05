import { useState, useCallback } from 'react';
import { classFacade } from '../repositories/ClassFacade';
import GymClass from '../models/GymClass';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook Controlador: useClassController
 * Equivalente a: ClaseController.java (@ManagedBean) en SIG JEE7
 */
export function useClassController() {
  const { gym: currentGym } = useAuth();
  
  // Estado local
  const [classes, setClasses] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Cargar todas las clases ordenadas
   */
  const loadClasses = useCallback(async () => {
    if (!currentGym?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await classFacade.findAllOrdered(currentGym.id);
      setClasses(data);
    } catch (err) {
      console.error("Error loading classes:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentGym]);

  /**
   * Guardar (Crear o Editar) una clase
   */
  const saveClass = async (classData) => {
    setLoading(true);
    setError(null);
    try {
      const classInstance = new GymClass({ ...classData, gym_id: currentGym.id });
      let saved;
      
      if (classInstance.id) {
        saved = await classFacade.edit(classInstance.id, classInstance);
      } else {
        saved = await classFacade.create(classInstance);
      }

      // Optimistic update
      setClasses(prev => {
        const exists = prev.find(c => c.id === saved.id);
        if (exists) {
          return prev.map(c => c.id === saved.id ? saved : c);
        }
        return [...prev, saved].sort((a, b) => {
          if (a.day_of_week === b.day_of_week) {
            const timeA = a.start_time || '';
            const timeB = b.start_time || '';
            return timeA.localeCompare(timeB);
          }
          return a.day_of_week - b.day_of_week;
        });
      });
      
      return saved;
    } catch (err) {
      console.error("Error saving class:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Eliminar una clase
   */
  const deleteClass = async (id) => {
    setLoading(true);
    setError(null);
    try {
      await classFacade.remove(id);
      setClasses(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error("Error deleting class:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // ─── LÓGICA DE RESERVAS (BOOKINGS) ───

  const loadBookingsForClass = async (classId, date) => {
    setBookingsLoading(true);
    try {
      const data = await classFacade.findBookingsForClass(classId, date);
      setBookings(data);
      return data;
    } catch (err) {
      console.error("Error loading bookings:", err);
      throw err;
    } finally {
      setBookingsLoading(false);
    }
  };

  return {
    classes,
    bookings,
    loading,
    bookingsLoading,
    error,
    loadClasses,
    saveClass,
    deleteClass,
    loadBookingsForClass,
  };
}
