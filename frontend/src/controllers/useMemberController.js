import { useState, useCallback } from 'react';
import { memberService } from '../services/MemberService';

/**
 * Estado + operaciones de la página de Socios.
 *
 * Acá vive la traducción entre el DTO del backend (firstName/lastName/document,
 * `active` booleano) y la forma que dibuja la UI (fullName/dni, `status` de tres
 * estados). Las páginas no tocan el DTO crudo.
 */

// El backend manda el nombre partido y la baja como booleano; la UI muestra un nombre
// solo y un estado de tres valores (activo / inactivo / vencido).
function fromApi(dto) {
  let attendanceDays = [];
  if (typeof dto.attendanceDays === 'string') {
    try { attendanceDays = JSON.parse(dto.attendanceDays); } catch { attendanceDays = []; }
  } else if (Array.isArray(dto.attendanceDays)) {
    attendanceDays = dto.attendanceDays;
  }

  const expired = dto.active && dto.membershipEnd && new Date(dto.membershipEnd) < new Date();
  const onlyDate = (value) => (value ? value.split('T')[0] : null);

  return {
    id: dto.id,
    fullName: `${dto.firstName || ''} ${dto.lastName || ''}`.trim(),
    dni: dto.document || dto.dni || '',
    email: dto.email || '',
    phone: dto.phone || '',
    birthDate: onlyDate(dto.birthDate),
    status: expired ? 'expired' : (dto.active ? 'active' : 'inactive'),
    membershipStart: onlyDate(dto.membershipStart),
    membershipEnd: onlyDate(dto.membershipEnd),
    attendanceDays,
    notes: dto.notes || '',
  };
}

function toApi(member) {
  const [firstName = '', ...rest] = (member.fullName || '').split(' ');

  return {
    firstName,
    lastName: rest.join(' '),
    document: member.dni,
    email: member.email || '',
    phone: member.phone,
    birthDate: member.birthDate || null,
    // Java espera LocalDateTime: la membresía arranca al abrir el día y vence al cerrarlo.
    membershipStart: member.membershipStart ? `${member.membershipStart}T00:00:00` : null,
    membershipEnd: member.membershipEnd ? `${member.membershipEnd}T23:59:59` : null,
    attendanceDays: JSON.stringify(member.attendanceDays || []),
    notes: member.notes || '',
    // El backend solo distingue alta/baja: cualquier estado que no sea 'active'
    // (inactivo, vencido, suspendido) viaja como baja.
    active: (member.status || 'active').toLowerCase() === 'active',
  };
}

export function useMemberController() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);

  const loadMembers = useCallback(async (page = 0, pageSize = 50, search = '') => {
    setLoading(true);
    try {
      // Paginación + búsqueda en el BACKEND: solo trae la página pedida,
      // no los cientos de socios de una (menos transferencia y memoria).
      const pageData = await memberService.getMembersPaged(page, pageSize, search);
      setMembers((pageData.content || []).map(fromApi));
      setTotalRecords(pageData.totalElements || 0);
    } catch (err) {
      console.error('Error loading members:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Devuelve el socio guardado, pero NO toca la lista: la página recarga con loadMembers
  // para que la tabla y el contador queden con lo que realmente hay en la base.
  const saveMember = async (memberData) => {
    setLoading(true);
    try {
      const dto = toApi(memberData);
      const saved = memberData.id
        ? await memberService.updateMember(memberData.id, dto)
        : await memberService.createMember(dto);
      return fromApi(saved);
    } catch (err) {
      console.error('Error saving member:', err);
      // El backend manda el motivo real (DNI repetido, etc.); sin él el toast dice cualquier cosa.
      throw new Error(err.response?.data?.message || err.message || 'Error al guardar socio');
    } finally {
      setLoading(false);
    }
  };

  const deleteMember = async (id) => {
    setLoading(true);
    try {
      await memberService.deleteMember(id);
      // Saca la fila al toque, sin esperar la recarga.
      setMembers(prev => prev.filter(m => m.id !== id));
      setTotalRecords(t => (t > 0 ? t - 1 : 0));
    } catch (err) {
      console.error('Error deleting member:', err);
      throw new Error(err.response?.data?.message || err.message || 'Error al eliminar socio');
    } finally {
      setLoading(false);
    }
  };

  return {
    members,
    loading,
    totalRecords,
    loadMembers,
    saveMember,
    deleteMember,
  };
}
