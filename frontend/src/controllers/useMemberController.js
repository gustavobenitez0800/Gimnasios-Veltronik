import { useState, useCallback } from 'react';
import { memberService } from '../services/MemberService';
import Member from '../models/Member';

/**
 * Hook Controlador: useMemberController
 * Conectado a la API Java (Fase 4).
 */
export function useMemberController() {
  const [members, setMembers] = useState([]);
  const [currentMember, setCurrentMember] = useState(new Member());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);

  // Mapear el DTO de Java al Modelo de React (para mantener compatibilidad de UI)
  const mapDTOToModel = (dto) => {
    return new Member({
      id: dto.id,
      fullName: `${dto.firstName || ''} ${dto.lastName || ''}`.trim(),
      dni: dto.dni,
      email: dto.email,
      phone: dto.phone,
      birthDate: dto.birthDate,
      status: dto.status?.toLowerCase() || 'active',
      membershipStart: dto.membershipStart || null,
      membershipEnd: dto.membershipEnd || null,
      attendanceDays: dto.attendanceDays || [],
      notes: dto.notes || '',
    });
  };

  // Mapear el Modelo de React al DTO de Java
  const mapModelToDTO = (model) => {
    const parts = (model.fullName || '').split(' ');
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    return {
      firstName: firstName,
      lastName: lastName,
      dni: model.dni,
      email: model.email,
      phone: model.phone,
      birthDate: model.birthDate || null,
      membershipStart: model.membershipStart || null,
      membershipEnd: model.membershipEnd || null,
      attendanceDays: model.attendanceDays || [],
      notes: model.notes || '',
      status: model.status?.toUpperCase() || 'ACTIVE'
    };
  };

  const loadMembers = useCallback(async (page = 0, pageSize = 50, search = '') => {
    setLoading(true);
    setError(null);
    try {
      // Obtenemos todos desde la API Java (para gimnasios chicos a medianos es rapidísimo)
      const dataDTOs = await memberService.getAllMembers();
      
      // Transformar DTOs a Modelos
      let mappedMembers = dataDTOs.map(mapDTOToModel);
      
      // Filtro local en memoria
      if (search && search.trim() !== '') {
        const s = search.toLowerCase();
        mappedMembers = mappedMembers.filter(m => 
          (m.fullName && m.fullName.toLowerCase().includes(s)) ||
          (m.dni && m.dni.includes(s)) ||
          (m.email && m.email.toLowerCase().includes(s))
        );
      }

      setTotalRecords(mappedMembers.length);

      // Paginación local en memoria
      const start = page * pageSize;
      const paginated = mappedMembers.slice(start, start + pageSize);

      setMembers(paginated);
    } catch (err) {
      console.error("Error loading members:", err);
      setError(err.message || "Error al cargar los socios.");
    } finally {
      setLoading(false);
    }
  }, []);

  const saveMember = async (memberData) => {
    setLoading(true);
    setError(null);
    try {
      const dto = mapModelToDTO(memberData);
      let savedDTO;

      if (memberData.id) {
        savedDTO = await memberService.updateMember(memberData.id, dto);
      } else {
        savedDTO = await memberService.createMember(dto);
      }

      const savedMember = mapDTOToModel(savedDTO);

      // No modificamos la lista aquí, dejamos que MembersPage recargue con loadMembers
      return savedMember;
    } catch (err) {
      console.error("Error saving member:", err);
      // Extraer mensaje del response del API si existe
      const msg = err.response?.data?.message || err.message || "Error al guardar socio";
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const deleteMember = async (id) => {
    setLoading(true);
    setError(null);
    try {
      await memberService.deleteMember(id);
      // Forzamos actualización local rápida
      setMembers(prev => prev.filter(m => m.id !== id));
      setTotalRecords(t => t > 0 ? t - 1 : 0);
    } catch (err) {
      console.error("Error deleting member:", err);
      const msg = err.response?.data?.message || err.message || "Error al eliminar socio";
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const prepareCreate = () => setCurrentMember(new Member());
  const prepareEdit = (memberInstance) => setCurrentMember(memberInstance);

  return {
    members,
    currentMember,
    loading,
    error,
    totalRecords,
    setCurrentMember,
    loadMembers,
    saveMember,
    deleteMember,
    prepareCreate,
    prepareEdit
  };
}
