import { useState, useCallback } from 'react';
import { classService } from '../services/ClassService';
import { useAuth } from '../contexts/AuthContext';
import { useQueryCache } from '../hooks';

/**
 * Estado + operaciones de la página de Clases. El mapeo al contrato del backend vive en
 * ClassService.
 *
 * ⭐ LAS CLASES SE PINTAN AL INSTANTE AL VOLVER (2026-09-03). Antes cada visita arrancaba
 * con el spinner y pedía la grilla de cero. Ahora vienen de `useQueryCache`: al volver se
 * muestra la última grilla conocida y se refresca por detrás — el mismo patrón que Socios,
 * Pagos, Dashboard y Accesos.
 *
 * El hook pide solo al montarse: la página NO llama a `loadClasses()` al abrir. Queda para
 * después de guardar.
 */
export function useClassController() {
  const { gym: currentGym } = useAuth();
  const gymId = currentGym?.id || null;

  const [mutating, setMutating] = useState(false);

  const { data, loading, isFetching, mutate, invalidate } = useQueryCache(
    ['classes', gymId],
    () => (gymId ? classService.getActiveClasses() : Promise.resolve([])),
    { staleTime: 60000 },
  );
  const classes = data || [];

  const loadClasses = useCallback(() => { invalidate(); }, [invalidate]);

  const saveClass = async (classData) => {
    setMutating(true);
    try {
      const saved = classData.id
        ? await classService.update(classData.id, classData)
        : await classService.create(classData);
      invalidate(); // la grilla nueva llega por detrás; lo que hay en pantalla no se vacía
      return saved;
    } catch (err) {
      console.error("Error saving class:", err);
      throw err;
    } finally {
      setMutating(false);
    }
  };

  const deleteClass = async (id) => {
    setMutating(true);
    try {
      await classService.delete(id);
      // Sale de la pantalla en el acto (no hace falta esperar al servidor para eso), y
      // después se confirma contra el backend.
      mutate(classes.filter((c) => c.id !== id));
      invalidate();
    } catch (err) {
      console.error("Error deleting class:", err);
      throw err;
    } finally {
      setMutating(false);
    }
  };

  return {
    classes,
    // Solo cuando no hay nada que mostrar: un refresco de fondo no vacía la grilla.
    loading: loading || mutating,
    isFetching,
    loadClasses,
    saveClass,
    deleteClass,
  };
}
