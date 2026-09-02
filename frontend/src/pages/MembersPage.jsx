// ============================================
// VELTRONIK V2 - SOCIOS / ALUMNOS (gym)
// ============================================
// ABM de socios con búsqueda y paginación server-side, historial de pagos y
// export a CSV. Cómo se llama al socio lo dice lib/gym.
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { paymentService, errorService } from '../services';
import { memberService } from '../services/MemberService';
import { useMemberController } from '../controllers/useMemberController';
import { formatDate, formatCurrency, getMethodLabel, addOneMonth } from '../lib/utils';
import { GYM } from '../lib/gym';
import { useModal, useConfirmDialog, usePagination, useDebouncedSearch } from '../hooks';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import { FilterBar, Badge, DaySelector, DAY_NAMES, Pagination } from '../components/ui';
import Modal, { ModalActions } from '../components/ui/Modal';
import Icon from '../components/Icon';
import CobroRapido from '../components/CobroRapido';
import { planService } from '../services/PlanService';
import { getInitialMemberForm, mapMemberToForm } from '../controllers/formSocio';
import { useAuth } from '../contexts/AuthContext';

const PAGE_SIZE = 25;
// Cuando se filtra por estado traemos el set completo (suficiente para PyMEs) para evaluar
// el estado sobre TODOS los socios, no solo la página actual del backend.
const LARGE_SIZE = 1000;

/**
 * El formulario vive en ../controllers/formSocio.
 *
 * ⚠️ NO VOLVER A COPIARLO ACÁ. Estaba declarado dos veces —el alta y la edición— y le
 * faltaba `planId` a las dos: se podía elegir el arancel de un socio y al guardar
 * desaparecía. Afuera se puede probar, y hay un test que falla si algún campo editable no
 * sobrevive la vuelta servidor → formulario.
 */
const MEMBER_MAP_FN = mapMemberToForm;

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
  { value: 'expired', label: 'Vencidos' },
  // El dueño acaba de cargar sus aranceles y tiene cientos de socios sin ninguno. Este
  // filtro es la diferencia entre "asignarlos" y "recorrer la lista entera a ojo".
  { value: 'sin_arancel', label: 'Sin arancel' },
];

export default function MembersPage() {
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

  // Filters
  const [statusFilter, setStatusFilter] = useState('');

  // ─── Los aranceles del gimnasio ───
  //
  // Se traen una vez y sirven para tres cosas: pintar la columna, elegir en la ficha y
  // preparar el cobro. Si el gimnasio no configuró ninguno, todo sigue funcionando como
  // antes: la columna no aparece y se cobra escribiendo el monto.
  const [aranceles, setAranceles] = useState([]);
  useEffect(() => {
    planService.getVigentes()
      .then((lista) => setAranceles(lista || []))
      // Sin aranceles se cobra a mano. No es un error que valga interrumpir a nadie.
      .catch(() => setAranceles([]));
  }, []);
  const hayAranceles = aranceles.length > 0;

  // A quién le estamos cobrando. null = el modal está cerrado.
  const [cobrando, setCobrando] = useState(null);
  // Qué fila está guardando su arancel desde la lista, para no dejar el select muerto.
  const [guardandoArancel, setGuardandoArancel] = useState(null);

  // Aplica el filtro de estado sobre el set cargado (la página del backend, o el set completo
  // cuando hay filtro). "expired" se calcula por fecha de vencimiento en el cliente.
  const filteredMembers = useMemo(() => {
    if (!statusFilter) return controllerMembers;
    return controllerMembers.filter((m) => {
      // 'Vencido' lo dice el backend, igual que la columna de días. Comparar fechas acá
      // volvía a abrir la misma grieta: la del navegador contra la del servidor.
      if (statusFilter === 'expired') {
        return m.situacion === 'VENCIDO' || m.situacion === 'EN_GRACIA';
      }
      // ⭐ El filtro que hace usable la función el primer día: el dueño acaba de cargar sus
      // aranceles y tiene 383 socios sin ninguno. Sin una forma de encontrarlos, la única
      // opción es recorrer la lista entera a ojo.
      if (statusFilter === 'sin_arancel') return !m.planId;
      return m.status === statusFilter;
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

  // Modal. Con `?action=new` (atajo "Nuevo socio" del Dashboard) arranca abierto:
  // se resuelve en el primer render, sin efecto que lo abra después.
  // El form inicial se congela al montar: recalcularlo en cada render le cambiaría la
  // identidad a los callbacks de useModal, que dependen de él.
  const [initialForm] = useState(getInitialMemberForm);
  const modal = useModal(initialForm, searchParams.get('action') === 'new');

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
   * Cobrar sin salir de Socios.
   *
   * <p>⚠️ NO se mandan fechas. El vencimiento lo corre el backend al aplicar la cobertura del
   * arancel; calcularlo también acá sería tener dos cuentas para lo mismo, que es el error
   * que ya costó los días de vencimiento en cinco lugares.</p>
   */
  const cobrarCuota = async ({ planId, monto, metodo }) => {
    await paymentService.createPayment({
      member_id: cobrando.id,
      plan_id: planId,
      amount: monto,
      paymentMethod: (metodo || 'cash').toUpperCase(),
      status: 'PAID',
    });
    refresh();
    // Se devuelve el socio ya actualizado para poder mostrar el vencimiento REAL. Si no se
    // puede releer, se devuelve vacío: el modal prefiere no decir nada antes que inventar
    // una fecha.
    try {
      const dto = await memberService.getMemberById(cobrando.id);
      // El DTO trae membershipEnd con hora; el modal solo muestra la fecha.
      return dto ? { membershipEnd: dto.membershipEnd } : {};
    } catch {
      return {};
    }
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
      
      await saveMember(data);
      // Forzar recarga desde la BD para garantizar sincronización de la tabla y contador.
      // `refresh` pide de nuevo la MISMA vista que se está mirando; guardar ya marcó viejas
      // las demás páginas, que también dejaron de ser ciertas.
      refresh();
      
      showToast(`${memberLabel} guardado exitosamente`, 'success');
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
    const headers = ['Nombre', 'DNI', 'Teléfono', 'Email', 'Estado', 'Inicio', 'Vencimiento', 'Días de Asistencia'];
    const rows = filteredMembers.map((m) => {
      const days = Array.isArray(m.attendanceDays) ? m.attendanceDays.map(d => DAY_NAMES[d]).join(', ') : '';
      return [
        m.fullName, m.dni || '', m.phone || '', m.email || '',
        m.status === 'active' ? 'Activo' : m.status === 'inactive' ? 'Inactivo' : m.status === 'expired' ? 'Vencido' : 'Suspendido',
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
    const phone = member.phone.replace(/\D/g, '');
    window.open(`https://wa.me/54${phone}`, '_blank');
  };

  // ─── DÍAS: lo dice el BACKEND, acá solo se pinta ───
  //
  // Esta función calculaba los días por su cuenta y daba MAL. Para el mismo socio, el aviso
  // del mostrador decía "hace 2 días" y esta lista "4d vencido". Dos errores que se sumaban:
  //   · el socio llegaba acá con la hora del vencimiento recortada (solo la fecha), y
  //   · un texto "2026-08-27" en JavaScript se lee como UTC — en Argentina, tres horas antes.
  //
  // Ahora el número viene calculado por la misma clase del backend que decide qué ve el socio
  // al escanear el QR y qué se le avisa al mostrador. Un socio no puede deber dos cantidades
  // distintas de días según qué pantalla se mire.
  const getDaysInfo = (member) => {
    const { situacion, diasVencido, diasRestantes } = member || {};
    if (!situacion || situacion === 'SIN_DATOS') return { text: '-', className: 'days-none' };
    if (situacion === 'INACTIVO') return { text: 'baja', className: 'days-none' };

    // Se le acabaron las clases del abono. NO es lo mismo que vencido: este socio está al
    // día con la plata, lo que agotó es el cupo de visitas que compró. Decirle "vencido"
    // sería mandarlo a discutir una deuda que no tiene.
    if (situacion === 'SIN_CLASES') return { text: 'sin clases', className: 'days-expired' };

    if (situacion === 'VENCIDO' || situacion === 'EN_GRACIA') {
      return { text: `${diasVencido}d vencido`, className: 'days-expired' };
    }
    const d = diasRestantes ?? 0;
    // Si el gimnasio lleva cupo, las clases van al lado de los días: para el que viene
    // seguido, es lo que se le acaba primero.
    const cl = member?.clasesRestantes != null ? ` · ${member.clasesRestantes}cl` : '';
    if (d <= 3) return { text: `${d}d${cl}`, className: 'days-danger' };
    if (d <= 7) return { text: `${d}d${cl}`, className: 'days-warning' };
    return { text: `${d}d${cl}`, className: 'days-ok' };
  };

  return (
    <div className="members-page">
      <PageHeader
        title={membersLabel}
        subtitle={isFetching && pagedMembers.length > 0 ? "Actualizando datos..." : `${totalRecords} ${membersLabelLower} registrados`}
        icon="users"
        actions={
          <div className="flex gap-1">
            <button className="btn btn-secondary" onClick={exportCSV}>
              <Icon name="download" /> Exportar
            </button>
            <button className="btn btn-primary" onClick={() => modal.open()}>
              <Icon name="plus" /> Nuevo {memberLabel}
            </button>
          </div>
        }
      />

      {/* Filters */}
      <FilterBar
        onSearch={handleSearchInput}
        searchPlaceholder="Buscar por nombre, DNI o email..."
        filters={[
          {
            value: statusFilter,
            onChange: (v) => { setStatusFilter(v); pagination.reset(); },
            options: STATUS_FILTER_OPTIONS,
          },
        ]}
        count={totalRecords}
        countLabel={membersLabelLower}
      />

      {/* Table */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>DNI</th>
                <th>Teléfono</th>
                <th>Estado</th>
                {hayAranceles && <th>Arancel</th>}
                <th>Asistencia</th>
                <th>Días</th>
                <th>Vencimiento</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && pagedMembers.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center text-muted" style={{ padding: '3rem' }}>
                    <span className="spinner" /> Cargando...
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  {/* Una lista vacía porque fallo el pedido NO es un gimnasio sin socios. */}
                  <td colSpan="8" className="text-center text-muted" style={{ padding: '3rem' }}>
                    No se pudieron cargar los {membersLabelLower}
                  </td>
                </tr>
              ) : pagedMembers.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center text-muted" style={{ padding: '3rem' }}>
                    No se encontraron {membersLabelLower}
                  </td>
                </tr>
              ) : (
                pagedMembers.map((member) => {
                  const daysInfo = getDaysInfo(member);
                  return (
                    <tr key={member.id} style={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                      <td data-label="Nombre"><strong>{member.fullName}</strong></td>
                      <td data-label="DNI">{member.dni || '-'}</td>
                      <td data-label="Teléfono">{member.phone || '-'}</td>
                      <td data-label="Estado"><Badge status={member.status} /></td>
                      {hayAranceles && (
                        /* ⭐ El arancel se elige acá mismo, sin abrir la ficha. Con 383
                           socios, abrir un modal por cada uno no es una opción: son dos
                           clics contra cinco pasos, y la fila no se mueve de lugar. */
                        <td data-label="Arancel">
                          <select
                            className={member.planId ? 'arancel-select' : 'arancel-select sin-arancel'}
                            value={member.planId || ''}
                            disabled={guardandoArancel === member.id}
                            onChange={(e) => asignarArancel(member, e.target.value)}
                            title={member.planNombre || 'Sin arancel'}
                          >
                            <option value="">Sin arancel</option>
                            {/* El arancel que el socio tiene puede estar dado de baja y no
                                venir entre los vigentes. Sin esta opción el select se vería
                                vacío, y el primer cambio se lo borraría sin querer. */}
                            {member.planId && !aranceles.some((a) => a.id === member.planId) && (
                              <option value={member.planId}>
                                {member.planNombre || 'Arancel viejo'} · de baja
                              </option>
                            )}
                            {aranceles.map((a) => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td data-label="Asistencia">
                        <DaySelector selectedDays={member.attendanceDays || []} readOnly />
                      </td>
                      <td data-label="Días">
                        <span className={`days-countdown ${daysInfo.className}`}>{daysInfo.text}</span>
                      </td>
                      <td data-label="Vencimiento">{formatDate(member.membershipEnd)}</td>
                      <td data-label="Acciones">
                        <div className="table-actions">
                          <button
                            className="action-btn-quick action-btn-charge"
                            /* Antes esto SALTABA a Pagos con un formulario vacío: había que
                               buscar de nuevo al socio, elegir el arancel, escribir el monto
                               y las fechas. Cinco pasos y un cambio de pantalla para la
                               operación más común del gimnasio. */
                            onClick={() => setCobrando(member)}
                            title="Cobrar cuota"
                          ><Icon name="dollarSign" size="1em" /></button>
                          {member.phone && (
                            <button
                              className="action-btn-quick action-btn-whatsapp"
                              onClick={() => openWhatsApp(member)}
                              title="WhatsApp"
                            ><Icon name="messageCircle" size="1em" /></button>
                          )}
                          <button
                            className="action-btn-quick action-btn-history"
                            onClick={() => openPaymentsHistory(member)}
                            title="Historial de pagos"
                          ><Icon name="creditCard" size="1em" /></button>
                          <button
                            className="action-btn-quick action-btn-payment"
                            onClick={() => modal.open(member, MEMBER_MAP_FN)}
                            title="Editar"
                          ><Icon name="edit" /></button>
                          {canDelete && (
                            <button
                              className="action-btn-quick action-btn-delete"
                              onClick={() => deleteDialog.open(member.id, member.fullName)}
                              title="Eliminar"
                            ><Icon name="trash" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination {...pagination} totalCount={viewTotal} />
      </div>

      {/* ─── MEMBER MODAL ─── */}
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.close}
        title={modal.isEditing ? `Editar ${memberLabel}` : `Nuevo ${memberLabel}`}
      >
        <form onSubmit={handleSave} noValidate>
          <div className="modal-form">
            <div className="form-group full-width">
              <label className="form-label">Nombre completo *</label>
              <input type="text" className="form-input" value={modal.form.fullName}
                onChange={(e) => modal.handleChange('fullName', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">DNI</label>
              <input type="text" className="form-input" placeholder="12345678" pattern="\d*"
                onInput={(e) => e.target.value = e.target.value.replace(/\D/g, '')}
                value={modal.form.dni} onChange={(e) => modal.handleChange('dni', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Teléfono</label>
              <input type="tel" className="form-input" placeholder="11-1234-5678"
                value={modal.form.phone} onChange={(e) => modal.handleChange('phone', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" className="form-input"
                value={modal.form.email} onChange={(e) => modal.handleChange('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de nacimiento</label>
              <input type="date" className="form-input"
                value={modal.form.birthDate} onChange={(e) => modal.handleChange('birthDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Inicio de membresía</label>
              <input type="date" className="form-input"
                value={modal.form.membershipStart} onChange={(e) => cambiarInicioMembresia(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fin de membresía</label>
              <input type="date" className="form-input"
                value={modal.form.membershipEnd} onChange={(e) => modal.handleChange('membershipEnd', e.target.value)} />
              <small className="form-hint">
                Hasta cuándo puede entrar. Cobrarle la cuota la corre sola: acá se toca
                solo para dar de alta a alguien que ya venía pagando, o para corregir.
              </small>
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <select className="form-select" value={modal.form.status}
                onChange={(e) => modal.handleChange('status', e.target.value)}>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="expired">Vencido</option>
                <option value="suspended">Suspendido</option>
              </select>
            </div>
            {hayAranceles && (
              <div className="form-group">
                <label className="form-label">Arancel</label>
                <select className="form-select" value={modal.form.planId || ''}
                  onChange={(e) => modal.handleChange('planId', e.target.value)}>
                  <option value="">Sin arancel</option>
                  {/* Igual que en la lista: si el suyo se dio de baja, se muestra igual para
                      no borrárselo sin querer al primer guardado. */}
                  {modal.form.planId && !aranceles.some((a) => a.id === modal.form.planId) && (
                    <option value={modal.form.planId}>Su arancel actual · de baja</option>
                  )}
                  {aranceles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {formatCurrency(a.price)}
                    </option>
                  ))}
                </select>
                <small className="form-hint">
                  {/* ⚠️ Acá NO se toca el vencimiento. El arancel dice cuánto suma cada cobro,
                      y esa cuenta la hace el backend al cobrar. Si la ficha además moviera la
                      fecha, habría dos lugares decidiendo lo mismo. */}
                  Es lo que se le va a cobrar. El vencimiento se corre al registrar el pago.
                </small>
              </div>
            )}
            <div className="form-group full-width">
              <label className="form-label">Notas</label>
              <textarea className="form-textarea" rows="2"
                value={modal.form.notes} onChange={(e) => modal.handleChange('notes', e.target.value)} />
            </div>
            <div className="form-group full-width">
              <label className="form-label">Días de Asistencia</label>
              <DaySelector
                selectedDays={modal.form.attendanceDays}
                onChange={(days) => modal.handleChange('attendanceDays', days)}
              />
            </div>
          </div>
          <ModalActions onCancel={modal.close} saving={modal.saving} />
        </form>
      </Modal>

      {/* ─── PAYMENTS HISTORY MODAL ─── */}
      <Modal
        isOpen={paymentsModal}
        onClose={() => setPaymentsModal(false)}
        title="Historial de Pagos"
        actions={
          <button className="btn btn-secondary" onClick={() => setPaymentsModal(false)}>Cerrar</button>
        }
      >
        <p className="text-muted mb-2">{paymentsMember?.fullName || ''}</p>
        <div className="payment-history-list">
          {paymentsLoading ? (
            <div className="text-center text-muted" style={{ padding: '2rem' }}>
              <span className="spinner" /> Cargando...
            </div>
          ) : memberPayments.length === 0 ? (
            <div className="text-center text-muted" style={{ padding: '2rem' }}>
              Sin pagos registrados
            </div>
          ) : (
            memberPayments.map((p) => (
              <div key={p.id} className="payment-history-item">
                <div className="payment-info">
                  <span className="payment-amount">{formatCurrency(p.amount)}</span>
                  <span className="payment-date">
                    {formatDate(p.paymentDate)}
                    {p.paymentMethod ? ` · ${getMethodLabel(p.paymentMethod)}` : ''}
                  </span>
                </div>
                <Badge status={p.status} />
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* ─── COBRAR, SIN IRSE DE ACÁ ─── */}
      <CobroRapido
        socio={cobrando}
        aranceles={aranceles}
        abierto={!!cobrando}
        onCerrar={() => setCobrando(null)}
        onCobrar={cobrarCuota}
      />

      {/* ─── DELETE CONFIRMATION ─── */}
      <ConfirmDialog
        open={deleteDialog.isOpen}
        title={`Eliminar ${memberLabel}`}
        message={`¿Estás seguro de eliminar a "${deleteDialog.itemName}"? Esta acción no se puede deshacer.`}
        icon="trash"
        confirmText="Eliminar"
        confirmClass="btn-danger"
        onConfirm={handleDelete}
        onCancel={deleteDialog.close}
      />
    </div>
  );
}
