// ============================================
// LA PANTALLA DE SOCIOS — el estado y las acciones
// ============================================
// Todo lo que pages/MembersPage.jsx sabe y hace, sin nada de dibujo: filtros, selección para
// asignar aranceles en masa, la ficha, el cobro, la papelera, el historial, el CSV y WhatsApp.
// Los DATOS (traer, guardar, borrar socios) los da useMemberController; esto es la pantalla.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { paymentService, errorService } from '../services';
import { memberService } from '../services/MemberService';
import { planService } from '../services/PlanService';
import { useMemberController } from './useMemberController';
import { getInitialMemberForm, mapMemberToForm } from './formSocio';
import { addOneMonth } from '../lib/utils';
import { GYM } from '../lib/gym';
import { ESTADOS_DEL_SOCIO, estadoDelSocio } from '../lib/situacionSocio';
import { enlaceDeWhatsApp } from '../lib/whatsapp';
import { cobrarCuota } from '../lib/cobrarCuota';
import { PAGE_SIZE, LARGE_SIZE, SACAR_ARANCEL, STATUS_FILTER_OPTIONS, ESTADO_DE_ANTES } from '../lib/listaDeSocios';
import { useModal, useConfirmDialog, usePagination, useDebouncedSearch, useMolinete } from '../hooks';
import { useAlPonerseAlDia } from '../hooks/useAlPonerseAlDia';
import { DAY_NAMES } from '../components/ui';

export function usePantallaDeSocios() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const { orgRole } = useAuth();
  const { memberLabel, membersLabel } = GYM;
  const membersLabelLower = membersLabel.toLowerCase();
  const canDelete = orgRole === 'owner' || orgRole === 'admin';

  // Controller. Recibe el tamaño de página para que la primera consulta salga ya con el
  // tamaño real y no se pida una página que nadie va a mirar.
  const {
    members: controllerMembers,
    loading: isFetching,
    error: loadError,
    totalRecords,
    loadMembers,
    refresh,
    saveMember,
    deleteMember
  } = useMemberController(PAGE_SIZE);

  // Filters. El estado puede venir en la URL (?estado=vencido): el "Ver vencidos" del
  // Dashboard llega con el filtro ya puesto. Solo se aceptan los que existen en el menú, más
  // los nombres de antes (un enlace guardado con ?estado=expired sigue andando).
  const [statusFilter, setStatusFilter] = useState(() => {
    const crudo = searchParams.get('estado') || '';
    const pedido = ESTADO_DE_ANTES[crudo] || crudo;
    return STATUS_FILTER_OPTIONS.some((o) => o.value === pedido) ? pedido : '';
  });

  // ─── Los aranceles del gimnasio ───
  //
  // Se traen una vez y sirven para tres cosas: pintar la columna, elegir en la ficha y
  // preparar el cobro. Si el gimnasio no configuró ninguno, todo sigue funcionando como
  // antes: la columna no aparece y se cobra escribiendo el monto.
  const [aranceles, setAranceles] = useState([]);
  const cargarAranceles = useCallback(() => {
    planService.getVigentes()
      .then((lista) => setAranceles(lista || []))
      // Sin aranceles se cobra a mano. No es un error que valga interrumpir a nadie, y la
      // lista que ya estaba se queda.
      .catch(() => {});
  }, []);
  useEffect(() => { cargarAranceles(); }, [cargarAranceles]);
  // Abierta sin conexión, la lista queda vacía: se trae apenas vuelve.
  useAlPonerseAlDia(cargarAranceles);
  const hayAranceles = aranceles.length > 0;

  // ─── El molinete ───
  //
  // Solo aparece en la computadora del local que tiene el equipo configurado: es la única
  // que le llega, porque vive en la red del gimnasio. En la web y en las demás máquinas el
  // botón no se dibuja — uno muerto se aprieta tres veces y termina en un llamado.
  const molinete = useMolinete();

  /**
   * Pone el molinete en modo captura para este socio.
   *
   * <p>La foto la saca el EQUIPO y se queda adentro de él: no pasa por Veltronik ni por esta
   * computadora. Nosotros solo guardamos que el socio X es la persona X en el molinete, que
   * es lo que nos deja fuera del problema del dato biométrico.</p>
   */
  const tomarFoto = async (member) => {
    const r = await molinete.sacarFoto(member.id);
    if (r?.ok) {
      showToast(`El molinete está esperando a ${member.fullName}: que se pare enfrente.`, 'success');
    } else {
      showToast(r?.error || 'El molinete no contestó.', 'error');
    }
  };

  // A quién le estamos cobrando. null = el modal está cerrado.
  const [cobrando, setCobrando] = useState(null);
  // Qué fila está guardando su arancel desde la lista, para no dejar el select muerto.
  const [guardandoArancel, setGuardandoArancel] = useState(null);

  // ─── La selección para asignar en masa ───
  //
  // Un Set y no un array: marcar y desmarcar 383 socios con `includes` sobre un array es
  // recorrer la lista entera en cada clic.
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [asignandoMasivo, setAsignandoMasivo] = useState(false);
  // Lo que se va a aplicar, esperando confirmación. null = no hay nada pendiente.
  const [confirmandoMasivo, setConfirmandoMasivo] = useState(null);

  // ─── PAPELERA ───
  // null = cerrada. Un array = abierta con lo que haya. Se pide al abrir y no al cargar la
  // página: es una pantalla que se usa pocas veces al año, y no tiene por qué costarle un
  // pedido más a la pantalla más abierta del sistema.
  const [papelera, setPapelera] = useState(null);
  const [importando, setImportando] = useState(false);
  const [cargandoPapelera, setCargandoPapelera] = useState(false);
  const [restaurando, setRestaurando] = useState(null);

  // ⚠️ Solo dueño/admin. Cambiar de golpe lo que se le cobra a doscientas personas no es
  // una operación de mostrador — y el backend lo verifica igual, no alcanza con esconderlo.
  const puedeAsignarMasivo = hayAranceles && canDelete;

  const alternarSeleccion = (id) => {
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  // Aplica el filtro de estado sobre el set cargado (la página del backend, o el set completo
  // cuando hay filtro). "expired" se calcula por fecha de vencimiento en el cliente.
  const filteredMembers = useMemo(() => {
    if (!statusFilter) return controllerMembers;
    return controllerMembers.filter((m) => {
      // ⭐ El filtro que hace usable la función el primer día: el dueño acaba de cargar sus
      // aranceles y tiene 383 socios sin ninguno. Sin una forma de encontrarlos, la única
      // opción es recorrer la lista entera a ojo.
      if (statusFilter === 'sin_arancel') return !m.planId;
      // El estado lo dice el servidor (la situación), igual que la columna de días. Comparar
      // fechas acá volvía a abrir la grieta del reloj del navegador contra el del servidor.
      return estadoDelSocio(m) === statusFilter;
    });
  }, [controllerMembers, statusFilter]);

  // Total para paginar: con filtro, el del set filtrado; sin filtro, el total del backend.
  const viewTotal = statusFilter ? filteredMembers.length : totalRecords;

  // Pagination
  const pagination = usePagination(viewTotal, PAGE_SIZE);
  const { search, handleSearchInput } = useDebouncedSearch(300, pagination.reset);

  // Filas a mostrar: con filtro paginamos en el cliente (ya tenemos todo el set); sin filtro,
  // la página ya viene acotada del backend.
  const pagedMembers = useMemo(() => {
    if (!statusFilter) return filteredMembers;
    const start = pagination.page * PAGE_SIZE;
    return filteredMembers.slice(start, start + PAGE_SIZE);
  }, [filteredMembers, statusFilter, pagination.page]);

  // Las columnas de la tabla varían: la casilla de selección y el arancel aparecen o no.
  // Un colSpan fijo dejaba el mensaje de "no hay socios" cortado a mitad de la fila.
  const CUANTAS_COLUMNAS = 7 + (puedeAsignarMasivo ? 1 : 0) + (hayAranceles ? 1 : 0);

  // ¿Está marcada toda la página que se ve? Se calcula sobre las filas visibles, que es
  // exactamente lo que la casilla del encabezado promete.
  const todosVisiblesMarcados = pagedMembers.length > 0
    && pagedMembers.every((m) => seleccion.has(m.id));

  const alternarTodosVisibles = () => {
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (todosVisiblesMarcados) pagedMembers.forEach((m) => s.delete(m.id));
      else pagedMembers.forEach((m) => s.add(m.id));
      return s;
    });
  };

  // Cambiar de filtro o de página con cosas marcadas es la receta para aplicarle un arancel
  // a alguien que ya no se está viendo. La selección se limpia sola al cambiar la vista.
  useEffect(() => {
    setSeleccion(new Set());
  }, [statusFilter, search]);

  // Modal. Con `?action=new` (atajo "Nuevo socio" del Dashboard) arranca abierto:
  // se resuelve en el primer render, sin efecto que lo abra después.
  // El form inicial se congela al montar: recalcularlo en cada render le cambiaría la
  // identidad a los callbacks de useModal, que dependen de él.
  const [initialForm] = useState(getInitialMemberForm);
  const modal = useModal(initialForm, searchParams.get('action') === 'new');

  // ─── El alta en dos niveles ───
  //
  // Para dar de alta a alguien en el mostrador hacen falta CUATRO cosas: nombre, DNI,
  // teléfono y qué arancel paga. Lo demás (email, nacimiento, fechas, estado, notas, días)
  // existe y se puede cargar, pero no tiene por qué estar en la cara de quien tiene a un
  // socio esperando: va plegado bajo "Más datos". Al EDITAR se abre todo, porque ahí se
  // viene a corregir un dato puntual y hay que verlo.
  const [masDatos, setMasDatos] = useState(false);
  useEffect(() => { if (!modal.isOpen) setMasDatos(false); }, [modal.isOpen]);
  const mostrarMasDatos = masDatos || modal.isEditing;

  // Mover el inicio corre el fin con él, como hace el período en Registrar Pago: si
  // alguien empezó el 10, su mes termina el 10 del que viene. Sigue siendo editable —
  // se toca el fin después y queda lo que se haya puesto.
  const cambiarInicioMembresia = (value) => {
    if (!value) { modal.handleChange('membershipStart', value); return; }
    modal.handleMultiChange({ membershipStart: value, membershipEnd: addOneMonth(value) });
  };

  // Delete confirmation
  const deleteDialog = useConfirmDialog();

  // Payments history
  const [paymentsModal, setPaymentsModal] = useState(false);
  const [paymentsMember, setPaymentsMember] = useState(null);
  const [memberPayments, setMemberPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // ─── FETCH MEMBERS VIA CONTROLLER ───
  // Con filtro de estado pedimos el set completo (page 0, tamaño grande) y paginamos en el
  // cliente; sin filtro, paginación normal del backend. Al fijar la página en 0 cuando hay
  // filtro, cambiar de página en el cliente NO dispara una recarga.
  const fetchPage = statusFilter ? 0 : pagination.page;
  const fetchSize = statusFilter ? LARGE_SIZE : PAGE_SIZE;
  useEffect(() => {
    loadMembers(fetchPage, fetchSize, search);
  }, [fetchPage, fetchSize, search, loadMembers]);

  // ─── SAVE MEMBER ───
  /**
   * Asigna el arancel desde la propia lista.
   *
   * <p>⭐ Es la diferencia entre poder y no poder. Un gimnasio con 383 socios no va a abrir
   * 383 fichas, esperar el modal, elegir, guardar y cerrar. Acá son dos clics por socio y
   * la fila se queda donde está.</p>
   */
  const asignarArancel = async (member, planId) => {
    if ((member.planId || '') === (planId || '')) return;
    setGuardandoArancel(member.id);
    try {
      // Se manda la ficha COMPLETA con el arancel cambiado: guardar envía todos los campos,
      // así que mandar solo el plan borraría el resto.
      await saveMember({ ...mapMemberToForm(member), id: member.id, planId: planId || '' });
      refresh();
      const elegido = aranceles.find((a) => a.id === planId);
      showToast(
        elegido ? `${member.fullName}: ${elegido.name}` : `${member.fullName} quedó sin arancel`,
        'success',
      );
    } catch (error) {
      showToast(error.message || errorService.getMessage(error), 'error');
    } finally {
      setGuardandoArancel(null);
    }
  };

  /**
   * Aplica el arancel a todos los seleccionados, en UN pedido.
   *
   * <p>⚠️ No es un bucle de pedidos a propósito. Con 383 socios serían 383 viajes, más de un
   * minuto de espera, y —lo grave— si se cierra la pestaña a la mitad queda la mitad hecha
   * sin forma de saber cuál. El servidor lo aplica entero.</p>
   */
  const aplicarArancelMasivo = async () => {
    // `__sin__` es "sacárselo". Un valor vacío no sirve como opción del desplegable: sería
    // indistinguible del texto de arriba ("Asignarles un arancel…").
    const planId = confirmandoMasivo.planId === SACAR_ARANCEL ? null : confirmandoMasivo.planId;
    const ids = [...seleccion];
    setConfirmandoMasivo(null);
    setAsignandoMasivo(true);
    try {
      const r = await memberService.asignarArancelMasivo(ids, planId);
      setSeleccion(new Set());
      refresh();

      const elegido = aranceles.find((a) => a.id === planId);
      const que = elegido ? elegido.name : 'sin arancel';
      // Se informa lo que el SERVIDOR dice que cambió, no lo que se pidió. Pueden diferir:
      // un socio borrado desde otra terminal mientras esto se armaba ya no existe.
      if (r.actualizados < r.pedidos) {
        showToast(
          `${r.actualizados} de ${r.pedidos} socios quedaron en "${que}". ` +
          'Los demás ya no estaban.', 'warning',
        );
      } else {
        showToast(`${r.actualizados} socios quedaron en "${que}".`, 'success');
      }
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    } finally {
      setAsignandoMasivo(false);
    }
  };

  /**
   * Cobrar sin salir de Socios. El cobro en sí es el mismo que el de la puerta
   * (`lib/cobrarCuota`): acá solo se refresca la lista después.
   */
  const cobrarLaCuota = async (cobro) => {
    const r = await cobrarCuota(cobrando, cobro);
    if (!r.encolado) refresh();
    return r;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!modal.form.fullName.trim()) {
      showToast('El nombre es requerido', 'error');
      return;
    }

    modal.setSaving(true);
    try {
      const data = modal.getCleanedData();
      if (modal.editingId) {
        data.id = modal.editingId;
      }
      
      const guardado = await saveMember(data);
      // Forzar recarga desde la BD para garantizar sincronización de la tabla y contador.
      // `refresh` pide de nuevo la MISMA vista que se está mirando; guardar ya marcó viejas
      // las demás páginas, que también dejaron de ser ciertas.
      refresh();
      
      // ⚠️ SIN CONEXIÓN NO SE DICE "GUARDADO EXITOSAMENTE". Está guardado acá, no en el
      // servidor: quien atiende tiene que saber que todavía falta que suba, igual que en el
      // cobro y en la entrada. Es la misma regla en la tercera pantalla.
      showToast(
        guardado?.encolado
          ? `${memberLabel} guardado sin conexión · se manda al volver internet`
          : `${memberLabel} guardado exitosamente`,
        guardado?.encolado ? 'warning' : 'success',
      );
      modal.close();
    } catch (error) {
      showToast(error.message || errorService.getMessage(error), 'error');
    } finally {
      modal.setSaving(false);
    }
  };

  // ─── DELETE MEMBER ───
  const handleDelete = async () => {
    await deleteDialog.confirm(async (id) => {
      try {
        await deleteMember(id);
        showToast(`${memberLabel} eliminado`, 'success');
      } catch (error) {
        showToast(errorService.getMessage(error), 'error');
      }
    });
  };

  // ─── PAPELERA ───
  const abrirPapelera = async () => {
    setCargandoPapelera(true);
    setPapelera([]);
    try {
      setPapelera(await memberService.getPapelera());
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
      setPapelera(null);
    } finally {
      setCargandoPapelera(false);
    }
  };

  const restaurarSocio = async (socio) => {
    setRestaurando(socio.id);
    try {
      await memberService.restoreMember(socio.id);
      // Se saca de la lista a mano en vez de volver a pedirla: el socio ya no está borrado,
      // así que un segundo pedido devolvería lo mismo menos él. Evita el parpadeo.
      setPapelera((actual) => actual.filter((m) => m.id !== socio.id));
      showToast(`${socio.fullName || memberLabel} volvió al padrón`, 'success');
      // El padrón que está atrás del modal ya no dice la verdad: le falta el que acaba de
      // volver. Se refresca ahora y no al cerrar, así al cerrar el socio ya está ahí.
      refresh();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    } finally {
      setRestaurando(null);
    }
  };

  // ─── PAYMENTS HISTORY ───
  const openPaymentsHistory = async (member) => {
    setPaymentsMember(member);
    setPaymentsModal(true);
    setPaymentsLoading(true);
    try {
      const payments = await paymentService.getByMemberId(member.id);
      // El backend no garantiza orden y manda status/method en MAYÚSCULAS (PAID/CASH...).
      // Normalizamos a minúsculas (para que el Badge y getMethodLabel resuelvan bien) y
      // ordenamos del más reciente al más antiguo.
      const normalized = (payments || [])
        .map((p) => ({
          ...p,
          status: (p.status || '').toLowerCase(),
          paymentMethod: (p.paymentMethod || '').toLowerCase(),
        }))
        .sort((a, b) => new Date(b.paymentDate || 0) - new Date(a.paymentDate || 0));
      setMemberPayments(normalized);
    } catch {
      setMemberPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  // ─── CSV EXPORT ───
  const exportCSV = () => {
    if (filteredMembers.length === 0) {
      showToast('No hay datos para exportar', 'warning');
      return;
    }
    const headers = ['Nombre', 'DNI', 'Teléfono', 'Email', 'Estado', 'Inicio', 'Vencimiento', 'Días de asistencia'];
    const rows = filteredMembers.map((m) => {
      const days = Array.isArray(m.attendanceDays) ? m.attendanceDays.map(d => DAY_NAMES[d]).join(', ') : '';
      return [
        m.fullName, m.dni || '', m.phone || '', m.email || '',
        // El CSV dice lo mismo que la pantalla. Un export que contradice la tabla que se está
        // mirando es peor que no exportar nada.
        ESTADOS_DEL_SOCIO[estadoDelSocio(m)].texto,
        m.membershipStart || '', m.membershipEnd || '', days,
      ];
    });
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `socios_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exportado correctamente', 'success');
  };

  // ─── WHATSAPP ───
  const openWhatsApp = (member) => {
    if (!member.phone) {
      showToast(`Este ${memberLabel.toLowerCase()} no tiene teléfono registrado`, 'warning');
      return;
    }
    const enlace = enlaceDeWhatsApp(member.phone);
    if (!enlace) {
      showToast(`El teléfono de la ficha (${member.phone}) no parece un número completo`, 'warning');
      return;
    }
    window.open(enlace, '_blank', 'noopener');
  };

  return {
    memberLabel, membersLabel, membersLabelLower, canDelete,
    isFetching, loadError, totalRecords, refresh,
    statusFilter, setStatusFilter, search, handleSearchInput, pagination, viewTotal, pagedMembers,
    aranceles, hayAranceles, molinete, tomarFoto,
    cobrando, setCobrando, cobrarCuota: cobrarLaCuota, guardandoArancel, asignarArancel,
    seleccion, setSeleccion, alternarSeleccion, todosVisiblesMarcados, alternarTodosVisibles,
    puedeAsignarMasivo, asignandoMasivo, confirmandoMasivo, setConfirmandoMasivo, aplicarArancelMasivo,
    CUANTAS_COLUMNAS,
    modal, setMasDatos, mostrarMasDatos, cambiarInicioMembresia, handleSave,
    deleteDialog, handleDelete,
    papelera, setPapelera, cargandoPapelera, restaurando, abrirPapelera, restaurarSocio,
    importando, setImportando,
    paymentsModal, setPaymentsModal, paymentsMember, memberPayments, paymentsLoading, openPaymentsHistory,
    exportCSV, openWhatsApp,
  };
}
