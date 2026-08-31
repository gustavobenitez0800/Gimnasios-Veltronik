import { useCallback, useMemo } from 'react';
import { paymentService } from '../services/PaymentService';
import { useQueryCache, invalidateQueries } from '../hooks';

// Una sola lista vacía compartida: `data || []` crea un array nuevo en cada render
// mientras no hay datos, y eso le rompe la memorización a todo lo que dependa de él.
const EMPTY = [];

// Un minuto de frescura. Los pagos los carga esta misma pantalla (y ahí se invalida la
// caché a mano), así que lo único que puede quedar viejo es un cobro hecho desde otra
// máquina en el último minuto.
const STALE_MS = 60 * 1000;

/**
 * @param {object} filtros
 * @param {string} filtros.dateFrom  Desde — lo filtra el BACKEND, así que va en la clave.
 * @param {string} filtros.dateTo    Hasta — idem.
 * @param {string} filtros.search    Nombre o DNI — se aplica acá, sobre lo ya traído.
 * @param {string} filtros.method    Medio de pago — idem.
 * @param {string} filtros.status    Estado — idem.
 */
export function usePaymentController({ dateFrom, dateTo, search, method, status } = {}) {
  const mapPaymentDTOToModel = useCallback((dto) => {
    const member = dto.member ? {
      ...dto.member,
      id: dto.member.id,
      fullName: `${dto.member.firstName || ''} ${dto.member.lastName || ''}`.trim(),
      dni: dto.member.document || dto.member.dni
    } : null;

    return {
      id: dto.id,
      member_id: member ? member.id : null,
      member: member,
      amount: dto.amount,
      paymentDate: dto.paymentDate ? dto.paymentDate.split('T')[0] : null,
      paymentMethod: (dto.paymentMethod || 'CASH').toLowerCase(),
      status: (dto.status || 'PAID').toLowerCase(),
      notes: dto.notes || '',
      periodStart: dto.periodStart ? dto.periodStart.split('T')[0] : null,
      periodEnd: dto.periodEnd ? dto.periodEnd.split('T')[0] : null
    };
  }, []);

  const mapPaymentModelToDTO = useCallback((model) => {
    return {
      member_id: model.member_id,
      amount: parseFloat(model.amount) || 0,
      paymentDate: model.paymentDate ? `${model.paymentDate}T00:00:00` : null,
      paymentMethod: (model.paymentMethod || 'cash').toUpperCase(),
      status: (model.status || 'paid').toUpperCase(),
      notes: model.notes || '',
      periodStart: model.periodStart ? `${model.periodStart}T00:00:00` : null,
      periodEnd: model.periodEnd ? `${model.periodEnd}T23:59:59` : null
    };
  }, []);

  // Usamos el org del localStorage (se setea al instante al elegir el negocio), NO el gym del
  // contexto (que carga async). Sin esto, la página quedaba vacía si se abría antes de que el
  // contexto terminara de cargar — la causa de "no muestra datos hasta que registrás un pago".
  // El apiClient inyecta el X-Tenant-ID igual, así que la query queda acotada al negocio.
  const orgId = localStorage.getItem('current_org_id');

  const fetchPayments = useCallback(async () => {
    if (!orgId) return EMPTY;
    // El rango de fecha lo filtra el BACKEND (params from/to).
    const data = await paymentService.getAllPayments(dateFrom, dateTo);
    return (data || []).map(mapPaymentDTOToModel);
  }, [orgId, dateFrom, dateTo, mapPaymentDTOToModel]);

  // ─── Lo que se guarda es lo que costó traer ───
  //
  // En la clave va SOLO lo que cambia la consulta: negocio y rango de fechas. Buscar por
  // nombre, o filtrar por medio de pago, se resuelve más abajo sobre lo que ya está en
  // memoria — así que ahora no le pega al servidor.
  //
  // Antes sí le pegaba: escribir en el buscador disparaba una consulta COMPLETA de pagos
  // para después filtrarla en el navegador. Se pedía todo el mes de nuevo para tachar
  // filas que ya estaban ahí.
  const { data, loading, isFetching, mutate, invalidate } = useQueryCache(
    ['payments', orgId, dateFrom || '', dateTo || ''],
    fetchPayments,
    { staleTime: STALE_MS },
  );

  const todos = data || EMPTY;

  const payments = useMemo(() => {
    let lista = todos;
    const q = (search || '').trim().toLowerCase();
    if (q) {
      lista = lista.filter(p =>
        (p.member?.fullName || '').toLowerCase().includes(q) ||
        (p.member?.dni || '').toLowerCase().includes(q)
      );
    }
    if (method) lista = lista.filter(p => p.paymentMethod === method);
    if (status) lista = lista.filter(p => p.status === status);
    return lista;
  }, [todos, search, method, status]);

  // ─── Cobrar cambia más cosas que la lista de pagos ───
  //
  // Guardar un pago corre el vencimiento del socio en el backend. Si no se invalidan
  // también Socios y el dashboard, el socio que ACABA de pagar seguiría figurando vencido en la
  // pantalla de al lado y los ingresos del mes seguirían mostrando el número anterior —
  // hasta tres minutos, que es lo que dura el caché del dashboard.
  const invalidarDerivados = useCallback(() => {
    invalidateQueries('payments');
    invalidateQueries('members');
    invalidateQueries('gym_dashboard');
    invalidateQueries('retention_analytics');
  }, []);

  // Guarda (alta o edición) y devuelve el pago. NO recarga acá: la página llama a refresh()
  // con el filtro de fecha ACTIVO, para que la lista quede consistente con lo que el usuario ve
  // (antes recargaba SIN filtro → "aparecían todos" solo tras registrar un pago).
  const savePayment = async (paymentData) => {
    try {
      const dto = mapPaymentModelToDTO(paymentData);
      let saved;
      if (paymentData.id) {
        saved = await paymentService.update(paymentData.id, dto);
      } else {
        saved = await paymentService.createPayment(dto);
      }
      invalidarDerivados();
      return saved;
    } catch (err) {
      console.error("Error saving payment:", err);
      throw err;
    }
  };

  const deletePayment = async (id) => {
    try {
      await paymentService.deletePayment(id);
      // Saca la fila al toque, sin esperar la recarga…
      mutate(todos.filter(p => p.id !== id));
      // …y después se invalida todo lo derivado: borrar un pago mueve los ingresos del mes.
      invalidarDerivados();
      invalidate();
    } catch (err) {
      console.error("Error deleting payment:", err);
      throw err;
    }
  };

  return {
    payments,
    // "Cargando" para la página es una sola cosa: o no hay nada que mostrar, o lo que se
    // muestra se está refrescando por detrás.
    loading: loading || isFetching,
    refresh: invalidate,
    savePayment,
    deletePayment
  };
}
