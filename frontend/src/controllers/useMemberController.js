import { useState, useCallback } from 'react';
import { memberService } from '../services/MemberService';
import { useQueryCache, invalidateQueries } from '../hooks';

// Una sola lista vacía compartida: con `data?.x || []` se crea un array NUEVO en cada
// render mientras no hay datos, y los useMemo de la página que dependen de ella dejan
// de memorizar nada.
const EMPTY = [];

// Cuánto vale lo que ya se tiene antes de volver a preguntar. Un minuto: la lista solo
// cambia cuando alguien da de alta, edita o cobra — y las tres cosas invalidan la caché
// a mano acá abajo. Lo único que podría quedar viejo un minuto es un cambio hecho desde
// OTRA máquina, y para una lista de socios eso no le rompe el día a nadie.
const STALE_MS = 60 * 1000;

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

  // El estado también lo dice el backend. El cálculo local que había acá comparaba fechas
  // en la zona del navegador y podía discrepar con el resto del sistema.
  const expired = dto.situacion === 'VENCIDO' || dto.situacion === 'EN_GRACIA';
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
    // La FECHA recortada solo para los formularios (un input date no acepta la hora).
    membershipEnd: onlyDate(dto.membershipEnd),
    // Y el timestamp COMPLETO aparte: recortarlo fue la mitad del bug de los días.
    membershipEndAt: dto.membershipEnd || null,
    // La situación la calcula el backend; acá solo viaja.
    situacion: dto.situacion || null,
    diasVencido: dto.diasVencido ?? null,
    diasRestantes: dto.diasRestantes ?? null,
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

/**
 * @param {number} initialPageSize  El tamaño de página de la pantalla. Se pasa para que la
 *   PRIMERA consulta salga ya con el tamaño real: si el controller arrancara con otro, se
 *   pediría una página que nadie va a mirar y recién después la buena.
 */
export function useMemberController(initialPageSize = 25) {
  // ─── Volver a Socios ya no es esperar de nuevo ───
  //
  // Esta pantalla pedía la lista de cero en CADA visita: ir a Accesos y volver era otro
  // spinner en blanco. Es la misma queja de "va lento" que se arregló en el mostrador, y
  // la solución ya estaba escrita en el proyecto (`useQueryCache`): pintar al instante lo
  // último que se sabía y refrescar por detrás.
  //
  // La clave lleva negocio + página + tamaño + búsqueda, porque el backend pagina y busca
  // del lado del servidor: cada combinación es una respuesta distinta. El negocio va en la
  // clave por lo mismo que en el dashboard: si `current_org_id` todavía no está (el Lobby
  // lo escribe antes de navegar, pero el contexto tarda), la clave cambia cuando llega y
  // no queda pegada una lista que no es de esta sucursal.
  const orgId = localStorage.getItem('current_org_id');
  const [query, setQuery] = useState({ page: 0, size: initialPageSize, search: '' });

  const fetchMembers = useCallback(async () => {
    // Paginación + búsqueda en el BACKEND: solo trae la página pedida,
    // no los cientos de socios de una (menos transferencia y memoria).
    const pageData = await memberService.getMembersPaged(query.page, query.size, query.search);
    return {
      members: (pageData.content || []).map(fromApi),
      totalRecords: pageData.totalElements || 0,
    };
  }, [query]);

  const { data, loading, isFetching, error, mutate, invalidate } = useQueryCache(
    ['members', orgId, query.page, query.size, query.search],
    fetchMembers,
    { staleTime: STALE_MS },
  );

  const members = data?.members || EMPTY;
  const totalRecords = data?.totalRecords || 0;

  // La página sigue llamando a esto igual que antes; ahora solo anota QUÉ hay que mostrar
  // y la caché decide si hace falta pedirlo. Si los parámetros no cambiaron devuelve el
  // mismo objeto, así que no dispara ni un render de más.
  const loadMembers = useCallback((page = 0, pageSize = 50, search = '') => {
    setQuery((prev) => (
      prev.page === page && prev.size === pageSize && prev.search === search
        ? prev
        : { page, size: pageSize, search }
    ));
  }, []);

  // ─── Después de tocar un socio hay que invalidar TODAS las páginas ───
  //
  // No solo la que se está mirando: si se edita un socio en la página 1 y después se va a
  // la 2, esa seguiría guardada como estaba. Antes no hacía falta porque no se guardaba
  // nada; con caché, no invalidar sería inventar un bug donde no lo había.
  //
  // El dashboard y retención también: cuentan socios activos y vencidos, y esos números
  // acaban de cambiar.
  const invalidarDerivados = useCallback(() => {
    invalidateQueries('members');
    invalidateQueries('gym_dashboard');
    invalidateQueries('retention_analytics');
  }, []);

  // Devuelve el socio guardado, pero NO toca la lista: la página llama a refresh() para
  // que la tabla y el contador queden con lo que realmente hay en la base.
  const saveMember = async (memberData) => {
    try {
      const dto = toApi(memberData);
      const saved = memberData.id
        ? await memberService.updateMember(memberData.id, dto)
        : await memberService.createMember(dto);
      invalidarDerivados();
      return fromApi(saved);
    } catch (err) {
      console.error('Error saving member:', err);
      // El backend manda el motivo real (DNI repetido, etc.); sin él el toast dice cualquier cosa.
      throw new Error(err.response?.data?.message || err.message || 'Error al guardar socio');
    }
  };

  const deleteMember = async (id) => {
    try {
      await memberService.deleteMember(id);
      // Saca la fila al toque, sin esperar la recarga…
      mutate({
        members: members.filter((m) => m.id !== id),
        totalRecords: totalRecords > 0 ? totalRecords - 1 : 0,
      });
      // …y después se pide la verdad, porque al borrar una fila la página se corre: el
      // primero de la página siguiente ahora entra en esta.
      invalidarDerivados();
      invalidate();
    } catch (err) {
      console.error('Error deleting member:', err);
      throw new Error(err.response?.data?.message || err.message || 'Error al eliminar socio');
    }
  };

  return {
    members,
    // Mismo motivo que en Pagos: una lista vacía porque falló el pedido NO es lo mismo
    // que un gimnasio sin socios, y la pantalla tiene que poder distinguirlas.
    error,
    // Para la página "está cargando" es una sola cosa: o no hay nada que mostrar, o lo que
    // se muestra se está refrescando por detrás. De ahí salen el "Actualizando datos...",
    // el spinner de la tabla vacía y el atenuado de las filas.
    loading: loading || isFetching,
    totalRecords,
    loadMembers,
    refresh: invalidate,
    saveMember,
    deleteMember,
  };
}
