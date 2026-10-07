// ============================================
// VELTRONIK V2 - PAGOS (gym)
// ============================================
// Cobro de cuotas: alta/edición de pagos filtrados por rango de fecha, con el
// período de membresía que se renueva solo al registrar el pago.
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { memberService, errorService, planService } from '../services';
import { usePaymentController } from '../controllers/usePaymentController';
import { formatDate, formatCurrency, getMethodLabel, toLocalDateString, addOneMonth, sumarPlata } from '../lib/utils';
import { etiquetaCobertura } from '../lib/cobertura';
import { FORMAS_DE_PAGO, OTRA_FORMA } from '../lib/formasDePago';
import { useModal, invalidateQueries } from '../hooks';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/Layout';
import { StatCard, FilterBar, Badge } from '../components/ui';
import Modal, { ModalActions } from '../components/ui/Modal';
import Icon from '../components/Icon';
import ImportarHistorialCaja from '../components/ImportarHistorialCaja';
import SelectorDeFechas from '../components/SelectorDeFechas';
import { useRangoDeFechas } from '../hooks/useRangoDeFechas';

/**
 * Compara el estado de un pago sin depender de mayúsculas.
 *
 * Durante mucho tiempo convivieron dos cajas en la misma columna: los pagos cargados desde
 * la app quedaron en minúscula ("paid") y los que tomaron el default viejo del backend, en
 * mayúscula ("PAID"). Comparar exacto hacía que los totales de esta pantalla se saltearan
 * los pagos de una de las dos épocas. El backend ya normaliza al guardar, pero los que ya
 * están en la base quedaron como quedaron.
 */
function esEstado(pago, estado) {
  return (pago?.status || '').toLowerCase() === estado;
}

/**
 * De quién es el cobro. Un cobro importado de un ex-socio (o un pase por día) no tiene socio
 * en Veltronik: no es un "socio eliminado", es alguien que nunca estuvo en este padrón.
 */
function nombreDelCobro(pago) {
  if (pago.member?.fullName) return pago.member.fullName;
  return pago.importado ? 'Sin socio en Veltronik' : 'Socio eliminado';
}

/**
 * El período en un renglón: "12/10 al 12/11/2026". Con el año repetido ("12/10/2026 -
 * 12/11/2026") la celda se partía en tres renglones y cada fila medía el doble.
 */
function periodoCorto(desde, hasta) {
  const d = formatDate(desde);
  const h = formatDate(hasta);
  if (!d || !h) return d || h || '-';
  const mismoAnio = d.slice(-4) === h.slice(-4);
  return `${mismoAnio ? d.slice(0, -5) : d} al ${h}`;
}

function getInitialForm() {
  const today = toLocalDateString(new Date());
  return {
    member_id: '',
    amount: '',
    paymentDate: today,
    paymentMethod: 'cash',
    status: 'paid',
    notes: '',
    periodStart: today,
    periodEnd: addOneMonth(today),
    plan_id: '',
  };
}

const PAYMENT_MAP_FN = (p) => ({
  member_id: p.member_id || '',
  amount: p.amount || '',
  paymentDate: p.paymentDate || '',
  // Con la hora: si al editar no se cambia el día, el cobro conserva la hora que tenía.
  paymentDateOriginal: p.paymentDateOriginal || '',
  paymentMethod: p.paymentMethod || 'cash',
  // En minúscula: si no, un pago viejo con "PAID" no coincide con ninguna opción del
  // select de estado y el campo aparece en blanco al editarlo.
  status: (p.status || 'paid').toLowerCase(),
  notes: p.notes || '',
  periodStart: p.periodStart || '',
  periodEnd: p.periodEnd || '',
  plan_id: p.plan?.id || '',
});

export default function PaymentsPage() {
  const { showToast } = useToast();
  const { orgRole, profile } = useAuth();
  // Mismo permiso que el backend (ImportacionCajaController): son los ingresos del gimnasio.
  const puedeImportar = orgRole === 'owner' || orgRole === 'admin';
  const [importandoHistorial, setImportandoHistorial] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // Desde/Hasta y el atajo puesto: el mismo selector que la Caja (useRangoDeFechas).
  const rango = useRangoDeFechas('month');
  const { desde: dateFrom, hasta: dateTo } = rango;

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // (El "Hasta" que se quedaba en ayer pasada la medianoche lo resuelve useRangoDeFechas.)

  // Member search in modal
  const [memberSearch, setMemberSearch] = useState('');
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null); // Local state for modal

  // Búsqueda de socios con debounce. `cancelled` descarta la respuesta de una búsqueda
  // vieja que llegue tarde: si tarda más que el debounce, pisaba a la búsqueda nueva.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (memberSearch.length < 2) { setFilteredMembers([]); return; }
      try {
        const results = await memberService.searchForAccess(memberSearch);
        if (!cancelled) setFilteredMembers(results);
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [memberSearch]);

  // Modal & Dialog
  // El form inicial se congela al montar: recalcularlo en cada render le cambiaba la
  // identidad a los callbacks de useModal (que dependen de él) render por medio.
  const [initialForm] = useState(getInitialForm);
  // Deep-link desde Socios ("Cobrar cuota") o del Dashboard: ?action=new[&member_id=…].
  // Se lee UNA sola vez, al montar: es un parámetro de entrada, no un estado que cambie.
  const [deepLink] = useState(() => ({
    wantsNew: searchParams.get('action') === 'new',
    memberId: searchParams.get('member_id') || '',
  }));
  // Sin socio en la URL el modal ya puede abrir en el primer render; con socio abre
  // recién cuando llega el fetch de abajo, para nacer con el período calculado.
  const modal = useModal(initialForm, deepLink.wantsNew && !deepLink.memberId);
  const openModal = modal.open;
  // El cobro que se está por anular, y por qué. No se borra: queda tachado (V88).
  const [anulando, setAnulando] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [guardandoAnulacion, setGuardandoAnulacion] = useState(false);

  // ─── CONTROLLER ───
  // Los filtros van como parámetros y no como una llamada dentro de un efecto: el rango de
  // fechas decide QUÉ se le pide al servidor (y qué se guarda en caché), y los otros tres
  // se aplican sobre lo ya traído. El efecto que había acá pedía el mes entero de nuevo
  // cada vez que se tocaba cualquiera de los cinco.
  const {
    payments,
    ingresos,
    loading: isFetching,
    error: loadError,
    refresh,
    savePayment,
    anularPayment,
  } = usePaymentController({
    dateFrom,
    dateTo,
    search: debouncedSearch,
    method: methodFilter,
    status: statusFilter,
  });

  // ─── Los números de arriba ───
  //
  // ⭐ Sin filtros, "Ingresos del período" es el del SERVIDOR (el libro de ingresos): el mismo
  // número del tablero, la caja y el Excel, con las ventas incluidas y dichas aparte. Antes se
  // sumaba acá lo que había en pantalla, con parseFloat, y era otro número más.
  //
  // Con un filtro puesto (un socio, una forma de pago) el total es el de lo filtrado —eso es lo
  // que se está preguntando—, sumado en centavos, y la etiqueta lo dice.
  const hayFiltro = !!((debouncedSearch || '').trim() || methodFilter || statusFilter);
  const stats = useMemo(() => {
    const paidInPeriod = payments.filter((p) => esEstado(p, 'paid'));
    const pendingInPeriod = payments.filter((p) => esEstado(p, 'pending'));
    const delServidor = !hayFiltro && ingresos ? Number(ingresos.total) : null;

    return {
      totalPeriod: delServidor ?? sumarPlata(paidInPeriod, (p) => p.amount),
      totalCount: paidInPeriod.length,
      pendingCount: pendingInPeriod.length,
      pendingTotal: sumarPlata(pendingInPeriod, (p) => p.amount),
      ventas: delServidor != null ? Number(ingresos.otrosIngresos) || 0 : 0,
      historial: delServidor != null ? Number(ingresos.historial) || 0 : 0,
    };
  }, [payments, ingresos, hayFiltro]);

  // De qué está hecho el total: las ventas de la caja no están en esta lista (es de cobros).
  const notaDelTotal = [
    stats.ventas > 0 && `${formatCurrency(stats.ventas)} de ventas de la caja`,
    stats.historial > 0 && `${formatCurrency(stats.historial)} del historial importado`,
  ].filter(Boolean).join(' · ');

  // Deep-link con socio: lo trae por ID y abre el modal ya preseleccionado.
  useEffect(() => {
    if (!deepLink.wantsNew) return;
    // La URL se limpia siempre, incluso sin socio: un F5 no debe reabrir el modal.
    setSearchParams({}, { replace: true });
    if (!deepLink.memberId) return;

    let cancelled = false;
    // Por ID directo. (Antes se usaba searchForAccess(memberId), que busca por
    // nombre/DNI/email: un UUID nunca matchea → el socio NO quedaba preseleccionado.)
    memberService.getMemberById(deepLink.memberId).then(member => {
      if (cancelled || !member) return;
      setSelectedMember({
        ...member,
        fullName: member.fullName || `${member.firstName || ''} ${member.lastName || ''}`.trim(),
        dni: member.dni || member.document || '',
      });
      // El período nuevo arranca donde termina la membresía vigente (o hoy si no tiene).
      const startStr = (member.membershipEnd || toLocalDateString(new Date())).split('T')[0];
      openModal({ id: null }, () => ({
        ...initialForm,
        member_id: deepLink.memberId,
        periodStart: startStr,
        periodEnd: addOneMonth(startStr),
      }));
    }).catch(err => {
      if (cancelled) return;
      console.error('No se pudo cargar el socio para el pago:', err);
      showToast('No se pudo cargar el socio seleccionado', 'error');
      openModal();
    });
    return () => { cancelled = true; };
  }, [deepLink, initialForm, openModal, setSearchParams, showToast]);

  // Form change handler with auto-period calculation
  const handleFormChange = (field, value) => {
    modal.setForm((prev) => {
      const updated = { ...prev, [field]: value };

      if (field === 'periodStart' && value) {
        updated.periodEnd = addOneMonth(value);
      }

      if (field === 'paymentDate' && value && !prev.periodStart) {
        updated.periodStart = value;
        updated.periodEnd = addOneMonth(value);
      }

      return updated;
    });
  };

  // ─── Aranceles ───
  // Se cargan una vez al montar. Si el gimnasio no cargó ninguno, el selector no aparece y
  // cobrar sigue funcionando exactamente como antes: escribiendo monto y fechas.
  const [aranceles, setAranceles] = useState([]);
  useEffect(() => {
    let cancelado = false;
    planService.getVigentes()
      .then(a => { if (!cancelado) setAranceles(a || []); })
      .catch(() => { /* sin aranceles se cobra a mano, no es un error */ });
    return () => { cancelado = true; };
  }, []);

  /**
   * "· 1 mes" — para que el que cobra vea qué período está vendiendo.
   *
   * <p>Sale de la cobertura (ADR-013), no de `durationDays`: ese campo quedó congelado en la
   * V65 y todo arancel creado después lo tiene en 0.</p>
   */
  const describirArancel = (a) => ` · ${etiquetaCobertura(a)}`;

  /**
   * Al elegir arancel se completa el monto, pero el período NO se toca acá.
   *
   * Lo calcula el backend al guardar, desde el propio plan y desde la cobertura vigente del
   * socio. Si lo calculáramos también en el navegador tendríamos dos cuentas para lo mismo
   * — que es exactamente el problema que ya nos costó los días de vencimiento en cinco
   * lugares y los rangos de fecha en dos.
   */
  const elegirArancel = (planId) => {
    const a = aranceles.find(x => x.id === planId);
    modal.setForm(prev => ({
      ...prev,
      plan_id: planId || '',
      amount: a ? String(a.price ?? '') : prev.amount,
    }));
  };

  const handleMemberSelect = (member) => {
    handleFormChange('member_id', member.id);
    setSelectedMember(member);
    setMemberSearch('');
    setFilteredMembers([]);
  };

  const handleClearSelectedMember = () => {
    handleFormChange('member_id', '');
    setSelectedMember(null);
  };

  const openEditModal = (payment) => {
    setMemberSearch('');
    setFilteredMembers([]);
    setSelectedMember(payment.member || null);
    modal.open(payment, PAYMENT_MAP_FN);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!modal.form.member_id) {
      showToast('Elegí un socio', 'error');
      return;
    }
    const amountVal = parseFloat(modal.form.amount);
    if (!modal.form.amount || isNaN(amountVal) || amountVal <= 0) {
      showToast('Escribí un monto mayor a cero', 'error');
      return;
    }

    modal.setSaving(true);
    try {
      const data = { ...modal.form, amount: parseFloat(modal.form.amount) };
      Object.keys(data).forEach((k) => { if (data[k] === '') data[k] = null; });

      if (modal.editingId) {
        data.id = modal.editingId;
      }
      
      // Correr el vencimiento del socio ya NO se hace acá. Antes había una segunda
      // request envuelta en un catch vacío ("best-effort"): si fallaba, el pago quedaba
      // guardado y el socio seguía figurando como vencido, sin que nadie se enterara.
      // Ahora el backend guarda el pago y la cobertura en una sola operación.
      //
      // Sacarlo no es solo limpieza: el backend nunca mueve la fecha HACIA ATRÁS (un
      // pago correctivo no puede acortarle la membresía a alguien al día), y esta llamada
      // la movía sin esa regla — o sea que deshacía la protección.
      await savePayment(data);
      showToast(modal.editingId ? 'Pago actualizado' : 'Pago registrado exitosamente', 'success');

      modal.close();
      // Vuelve a pedir el rango que se está mirando → la lista queda consistente con lo que
      // se ve. Guardar ya marcó viejos los otros rangos, Socios y el dashboard.
      refresh();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    } finally {
      modal.setSaving(false);
    }
  };

  const pedirAnulacion = (payment) => {
    setMotivoAnulacion('');
    setAnulando(payment);
  };

  /**
   * ⭐ Anular, no borrar. El cobro queda en la lista, tachado, con quién y por qué, y deja de
   * sumar en todas partes. Si ya estaba en un cierre de caja, el próximo cierre lo descuenta.
   */
  const confirmarAnulacion = async (e) => {
    e?.preventDefault();
    // El motivo es obligatorio por lo mismo que el detalle de un gasto: un cobro que se anula
    // "porque sí" no se puede revisar después.
    if (motivoAnulacion.trim().length < 3) {
      showToast('Escribí por qué se anula. Sin eso no se puede revisar después.', 'error');
      return;
    }
    setGuardandoAnulacion(true);
    try {
      const r = await anularPayment(anulando.id, {
        motivo: motivoAnulacion.trim(),
        anuladoPor: profile?.fullName || null,
      });
      const vence = r?.vencimientoRestaurado;
      showToast(vence ? `Cobro anulado. El socio vuelve a vencer el ${formatDate(vence)}.` : 'Cobro anulado.', 'success');
      setAnulando(null);
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    } finally {
      setGuardandoAnulacion(false);
    }
  };

  const handleMarkPaid = async (payment) => {
    try {
      await savePayment({
        ...payment,
        status: 'paid',
        // Fecha LOCAL: con toISOString(), un pago cobrado después de las 21:00 quedaba
        // registrado con la fecha de mañana (y desaparecía del filtro del día).
        paymentDate: toLocalDateString(),
      });
      showToast('Pago marcado como pagado', 'success');
      // El vencimiento lo corre el backend al guardar el pago (ver handleSubmit).
      refresh();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    }
  };

  return (
    <div className="payments-page">
      <PageHeader
        title="Pagos"
        subtitle={isFetching && payments.length > 0 ? "Actualizando datos..." : "Los cobros de tus socios"}
        icon="cash"
        actions={
          <div className="flex gap-1">
            {puedeImportar && (
              <button className="btn btn-secondary" onClick={() => setImportandoHistorial(true)}
                title="Cargar los cobros de tu sistema anterior">
                <Icon name="fileText" /> Importar historial
              </button>
            )}
            <button className="btn btn-primary" onClick={() => {
              setMemberSearch('');
              setSelectedMember(null);
              modal.open();
            }}>
              <Icon name="plus" /> Registrar pago
            </button>
          </div>
        }
      />

      {/* El rango de fechas: el mismo selector que la Caja. */}
      <div className="card mb-3" style={{ padding: '1.25rem' }}>
        <SelectorDeFechas rango={rango} />
      </div>

      {/* ─── Cuando el pedido falla, hay que decirlo ───
          Sin este cartel la pantalla queda idéntica a un mes sin un solo cobro: las tres
          tarjetas en cero y la tabla diciendo "no se encontraron pagos". Eso no es un dato,
          es una mentira — el sistema no sabe si hay pagos, no pudo preguntar. Y manda a
          buscar el problema donde no está. */}
      {loadError && (
        <div className="card mb-3" style={{ borderLeft: '3px solid var(--error-500)' }}>
          <div style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Icon name="alertTriangle" size="1.4em" />
            <div style={{ flex: 1, minWidth: '14rem' }}>
              <strong>No se pudieron cargar los pagos.</strong>
              <div className="text-muted" style={{ fontSize: '0.9rem' }}>
                {errorService.getMessage(loadError)}
              </div>
              <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
                Los números de abajo están en cero porque no llegó la respuesta, no porque no haya cobros.
              </div>
            </div>
            <button className="btn btn-secondary" onClick={refresh}>Reintentar</button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid stats-grid-3 mb-3">
        <StatCard icon="cash" label={hayFiltro ? 'Cobrado en lo filtrado' : 'Ingresos del período'}
          value={formatCurrency(stats.totalPeriod)} color="success"
          nota={!hayFiltro && notaDelTotal ? `Incluye ${notaDelTotal}` : undefined} />
        <StatCard icon="check" label="Pagos cobrados" value={stats.totalCount} color="primary" />
        <StatCard icon="clock" label="Pagos pendientes" value={stats.pendingCount} color={stats.pendingCount > 0 ? 'warning' : 'neutral'} />
      </div>

      {/* Filters */}
      <FilterBar
        onSearch={(e) => setSearchInput(e.target.value)}
        searchPlaceholder="Buscar por socio..."
        searchMaxWidth={280}
        filters={[
          {
            value: methodFilter,
            onChange: setMethodFilter,
            options: [
              { value: '', label: 'Todas las formas de pago' },
              ...FORMAS_DE_PAGO.map((f) => ({ value: f.valor, label: f.etiqueta })),
            ],
          },
          {
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: '', label: 'Todos los estados' },
              { value: 'paid', label: 'Pagados' },
              { value: 'pending', label: 'Pendientes' },
              { value: 'cancelled', label: 'Anulados' },
            ],
          },
        ]}
        count={payments.length}
        countLabel="pagos"
      />

      {/* Table */}
      <div className="card tabla-pagos">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th className="col-socio">Socio</th>
                <th>Monto</th>
                <th className="col-fecha">Fecha</th>
                <th className="col-forma">Forma de pago</th>
                <th className="col-periodo">Período</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {isFetching && payments.length === 0 ? (
                <tr>
                  <td colSpan="6" className="table-empty">
                    <span className="spinner" /> Cargando...
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan="6" className="table-empty">
                    No se pudieron cargar los pagos
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan="6" className="table-empty">
                    No se encontraron pagos
                  </td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id} className={esEstado(payment, 'cancelled') ? 'pago-anulado' : undefined}
                    style={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                    <td data-label="Socio" className="col-socio">
                      <strong className="celda-una-linea" title={nombreDelCobro(payment)}>{nombreDelCobro(payment)}</strong>
                      {payment.member?.dni && (
                        <small className="text-muted celda-una-linea" style={{ display: 'block' }}>
                          DNI {payment.member.dni}
                        </small>
                      )}
                      {/* Historia del sistema anterior: suma en los ingresos, pero no corrió
                          ningún vencimiento ni entra al cierre de caja (ADR-014). */}
                      {payment.importado && (
                        <small className="text-muted" style={{ display: 'block' }}
                          title="Importado del sistema anterior: no movió vencimientos ni entra al cierre de caja">
                          Historial importado{payment.notes ? ` · ${payment.notes}` : ''}
                        </small>
                      )}
                      {/* Anulado: se ve, tachado, con quién y por qué. Un cobro que desaparece de
                          la lista es justamente lo que no queremos que se pueda hacer. */}
                      {esEstado(payment, 'cancelled') && (payment.anuladoPorNombre || payment.motivoAnulacion) && (
                        <small className="pago-anulado-motivo">
                          Anulado{payment.anuladoPorNombre ? ` por ${payment.anuladoPorNombre}` : ''}
                          {payment.motivoAnulacion ? `: ${payment.motivoAnulacion}` : ''}
                        </small>
                      )}
                    </td>
                    <td data-label="Monto">
                      <span className="pago-monto" style={{ fontWeight: 600, color: 'var(--success-500)' }}>
                        {formatCurrency(payment.amount)}
                      </span>
                      {/* El estado va con el monto y SOLO cuando no es el de siempre. Una columna
                          que dice PAGADO en casi todas las filas es ruido, y le sacaba a la tabla
                          el ancho que necesitaba para entrar sin barra horizontal. */}
                      {!esEstado(payment, 'paid') && (
                        <div className="pago-estado">
                          {esEstado(payment, 'cancelled')
                            ? <Badge status="cancelled" label="Anulado" />
                            : <Badge status={payment.status} />}
                        </div>
                      )}
                    </td>
                    <td data-label="Fecha" className="col-fecha">{formatDate(payment.paymentDate)}</td>
                    <td data-label="Forma de pago" className="col-forma">{getMethodLabel(payment.paymentMethod)}</td>
                    <td data-label="Período" className="col-periodo">
                      {payment.periodStart && payment.periodEnd ? (
                        <span className="celda-una-linea">{periodoCorto(payment.periodStart, payment.periodEnd)}</span>
                      ) : payment.periodoImportadoDesde && payment.periodoImportadoHasta ? (
                        /* El del historial importado lo reconstruye el sistema con el
                           vencimiento que traía el anterior (V87): se ve igual, y el cartelito
                           dice de dónde sale. No mueve ningún vencimiento. */
                        <span className="celda-una-linea" title="Calculado con el vencimiento que traía el sistema anterior. No mueve ningún vencimiento.">
                          {periodoCorto(payment.periodoImportadoDesde, payment.periodoImportadoHasta)}
                        </span>
                      ) : '-'}
                    </td>
                    <td data-label="Acciones">
                      <div className="table-actions">
                        {esEstado(payment, 'pending') && (
                          <button className="action-btn-quick action-btn-success"
                            onClick={() => handleMarkPaid(payment)} title="Marcar como pagado">
                            <Icon name="check" />
                          </button>
                        )}
                        {/* Un anulado ya no se toca: si la plata entró, se registra un cobro nuevo. */}
                        {!esEstado(payment, 'cancelled') && (
                          <>
                            <button className="action-btn-quick action-btn-payment"
                              onClick={() => openEditModal(payment)} title="Editar">
                              <Icon name="edit" />
                            </button>
                            <button className="action-btn-quick action-btn-delete"
                              onClick={() => pedirAnulacion(payment)} title="Anular">
                              <Icon name="trash" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── PAYMENT MODAL ─── */}
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.close}
        title={modal.isEditing ? 'Editar pago' : 'Registrar pago'}
      >
        <form onSubmit={handleSave} noValidate>
          {/* Ya lo contó un cierre de caja: corregirlo se puede, y la diferencia entra en el
              próximo cierre a la vista. Que quien edita lo sepa antes de tocar el monto. */}
          {modal.isEditing && payments.find((p) => p.id === modal.editingId)?.cerradoEnCaja && (
            <p className="pago-aviso-cerrado">
              Este cobro ya entró en un cierre de caja. Si cambiás el monto o la forma de pago, la
              diferencia aparece como corrección en el próximo cierre.
            </p>
          )}
          <div className="modal-form">
            <div className="form-group full-width">
              <label className="form-label">Socio *</label>
              {selectedMember ? (
                <div className="selected-member-chip">
                  <div className="selected-member-info">
                    <strong>{selectedMember.fullName}</strong>
                    {selectedMember.dni && <span className="text-muted"> (DNI: {selectedMember.dni})</span>}
                  </div>
                  {!modal.isEditing && (
                    <button type="button" className="chip-remove" onClick={handleClearSelectedMember}
                      title="Cambiar socio">✕</button>
                  )}
                </div>
              ) : (
                <div className="member-search-container">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Buscar socio por nombre o DNI (mínimo 2 letras)..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    autoComplete="off"
                  />
                  {memberSearch.length >= 2 && filteredMembers.length > 0 && (
                    <div className="member-search-dropdown">
                      {filteredMembers.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="member-search-option"
                          onClick={() => handleMemberSelect(m)}
                        >
                          <span className="member-option-name">{m.fullName}</span>
                          {m.dni && <span className="member-option-dni">DNI: {m.dni}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {memberSearch.length >= 2 && filteredMembers.length === 0 && (
                    <div className="member-search-dropdown">
                      <div className="member-search-empty">No se encontraron socios</div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Monto *</label>
              <input type="number" className="form-input" placeholder="0"
                value={modal.form.amount} onChange={(e) => handleFormChange('amount', e.target.value)} />
            </div>

            {/* ─── El arancel decide, no la memoria de quien atiende ───
                Elegir el plan completa el monto y hace que el backend aplique los días que
                corresponden. Antes había que escribir el período a mano en cada cobro:
                vender un trimestral y olvidarse de correr el "hasta" dejaba al socio con un
                mes, y nadie se enteraba hasta que no lo dejaban entrar. */}
            {aranceles.length > 0 && (
              <div className="form-group full-width">
                <label className="form-label">Arancel</label>
                <select className="form-select" value={modal.form.plan_id || ''}
                  onChange={(e) => elegirArancel(e.target.value)}>
                  <option value="">Sin arancel (importe suelto)</option>
                  {aranceles.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {formatCurrency(a.price)}{describirArancel(a)}
                    </option>
                  ))}
                </select>
                <small className="form-hint">
                  {modal.form.plan_id
                    ? 'El período lo aplica el arancel: no hace falta tocar las fechas de abajo.'
                    : 'Sin arancel, el período lo escribís vos.'}
                </small>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Fecha de pago</label>
              <input type="date" className="form-input" value={modal.form.paymentDate}
                onChange={(e) => handleFormChange('paymentDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Forma de pago</label>
              <select className="form-select" value={modal.form.paymentMethod}
                onChange={(e) => handleFormChange('paymentMethod', e.target.value)}>
                {[...FORMAS_DE_PAGO, OTRA_FORMA].map((f) => (
                  <option key={f.valor} value={f.valor}>{f.etiqueta}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <select className="form-select" value={modal.form.status}
                onChange={(e) => handleFormChange('status', e.target.value)}>
                <option value="paid">Pagado</option>
                <option value="pending">Pendiente</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Período desde</label>
              <input type="date" className="form-input" value={modal.form.periodStart}
                onChange={(e) => handleFormChange('periodStart', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Período hasta</label>
              <input type="date" className="form-input" value={modal.form.periodEnd}
                onChange={(e) => handleFormChange('periodEnd', e.target.value)} />
              <small className="form-hint">
                Qué tramo cubre este pago. Al guardarlo, el socio queda habilitado hasta
                esta fecha, nunca menos de lo que ya tenía.
              </small>
            </div>
            <div className="form-group full-width">
              <label className="form-label">Notas</label>
              <textarea className="form-textarea" rows="2" value={modal.form.notes}
                onChange={(e) => handleFormChange('notes', e.target.value)} />
            </div>
          </div>
          <ModalActions onCancel={modal.close} saving={modal.saving} />
        </form>
      </Modal>

      <ImportarHistorialCaja
        abierto={importandoHistorial}
        onCerrar={() => setImportandoHistorial(false)}
        onImportado={() => {
          // Cambian los ingresos de meses enteros: el panel y este listado.
          invalidateQueries('gym_dashboard');
          refresh();
        }}
      />

      {/* ─── ANULAR UN COBRO ───
          No se borra: queda tachado y deja de sumar. El motivo es obligatorio. */}
      <Modal isOpen={!!anulando} onClose={() => setAnulando(null)} title="Anular cobro">
        <form onSubmit={confirmarAnulacion} noValidate>
          {anulando && (
            <div className="modal-form">
              <p className="full-width">
                <strong>{nombreDelCobro(anulando)}</strong> · {formatCurrency(anulando.amount)} ·{' '}
                {getMethodLabel(anulando.paymentMethod)} · {formatDate(anulando.paymentDate)}
              </p>
              <p className="full-width text-muted">
                El cobro queda en la lista, tachado, y deja de sumar en los ingresos.
                {anulando.cerradoEnCaja && ' Ya entró en un cierre de caja: el próximo cierre lo descuenta.'}
                {' '}Si este cobro fue el que le corrió el vencimiento al socio, vuelve a vencer cuando vencía antes.
              </p>
              <div className="form-group full-width">
                <label className="form-label" htmlFor="motivo-anulacion">¿Por qué se anula? *</label>
                <textarea id="motivo-anulacion" className="form-textarea" rows="2" value={motivoAnulacion}
                  onChange={(e) => setMotivoAnulacion(e.target.value)}
                  placeholder="Se cargó dos veces, era de otro socio, se devolvió la plata…" />
              </div>
            </div>
          )}
          <ModalActions onCancel={() => setAnulando(null)} saving={guardandoAnulacion}
            submitText="Anular cobro" submitClass="btn-danger" />
        </form>
      </Modal>
    </div>
  );
}
