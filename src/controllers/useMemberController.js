import { useState, useCallback } from 'react';
import { memberFacade } from '../repositories/MemberFacade';
import Member from '../models/Member';
import { useAuth } from '../contexts/AuthContext'; // Asumimos que existe para obtener el gymId

/**
 * Hook Controlador: useMemberController
 * Equivalente a: MemberController.java (@ManagedBean, @ViewScoped) en SIG JEE7
 * 
 * Orquesta la lógica entre la vista y la capa de acceso a datos (Facade).
 */
export function useMemberController() {
  const { gym: currentGym } = useAuth(); // Dependencia externa para el contexto
  
  // Estados de la vista (equivalente a los atributos privados del ManagedBean)
  const [members, setMembers] = useState([]);
  const [currentMember, setCurrentMember] = useState(new Member()); // Objeto vacío por defecto
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);

  // --- MÉTODOS DEL CONTROLADOR ---

  /**
   * Equivalente a init() o loadData() en el ManagedBean
   */
  const loadMembers = useCallback(async (page = 0, pageSize = 50, search = '') => {
    if (!currentGym?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await memberFacade.findPaginated(currentGym.id, page, pageSize, search);
      setMembers(result.data); // data ya son instancias de Member gracias al Facade
      setTotalRecords(result.count);
    } catch (err) {
      console.error("Error loading members:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentGym]);

  /**
   * Equivalente a save() en JSF
   */
  const saveMember = async (memberData) => {
    setLoading(true);
    setError(null);
    try {
      const gymId = currentGym.id;
      
      // Validación de negocio en el controlador
      const isDuplicate = await memberFacade.isDniDuplicate(gymId, memberData.dni, memberData.id);
      if (isDuplicate) {
        throw new Error("El DNI ya se encuentra registrado en este gimnasio.");
      }

      // Creamos una instancia de Modelo si no lo es
      const memberInstance = new Member({ ...memberData, gym_id: gymId });

      let savedMember;
      if (memberInstance.id) {
        // Editar
        savedMember = await memberFacade.edit(memberInstance.id, memberInstance);
      } else {
        // Crear
        savedMember = await memberFacade.create(memberInstance);
      }

      // Actualizar la lista local sin recargar todo (Optimistic UI)
      setMembers(prev => {
        const exists = prev.find(m => m.id === savedMember.id);
        if (exists) {
          return prev.map(m => m.id === savedMember.id ? savedMember : m);
        }
        setTotalRecords(t => t + 1);
        return [savedMember, ...prev];
      });

      return savedMember; // Retornamos para que la UI sepa que tuvo éxito (ej. cerrar modal)
    } catch (err) {
      console.error("Error saving member:", err);
      setError(err.message);
      throw err; // Lanzamos el error para que la vista muestre una alerta
    } finally {
      setLoading(false);
    }
  };

  /**
   * Equivalente a delete() en JSF
   */
  const deleteMember = async (id) => {
    setLoading(true);
    setError(null);
    try {
      await memberFacade.remove(id);
      setMembers(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error("Error deleting member:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Equivalente a prepareCreate() en JSF
   */
  const prepareCreate = () => {
    setCurrentMember(new Member());
  };

  /**
   * Equivalente a prepareEdit() en JSF
   */
  const prepareEdit = (memberInstance) => {
    setCurrentMember(memberInstance);
  };

  return {
    // Propiedades
    members,
    currentMember,
    loading,
    error,
    totalRecords,
    
    // Setters manuales por si la vista lo requiere
    setCurrentMember,
    
    // Métodos
    loadMembers,
    saveMember,
    deleteMember,
    prepareCreate,
    prepareEdit
  };
}
