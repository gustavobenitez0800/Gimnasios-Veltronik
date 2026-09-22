import { useCallback, useMemo } from 'react';
import { mapPaymentModelToDTO as mapPaymentModelToDTOPuro } from './mapeoPago';
import { paymentService } from '../services/PaymentService';
import { useQueryCache, invalidateQueries } from '../hooks';

// Una sola lista vacía compartida: `data || []` crea un array nuevo en cada render
// mientras no hay datos, y eso le rompe la memorización a todo lo que dependa de él.
const EMPTY = [];
const SIN_DATOS = { lista: EMPTY, ingresos: null };

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
      // El momento ENTERO, con la hora. Editar un cobro sin tocar la fecha lo mandaba a las
      // 00:00 de ese día: la hora del mostrador (19:40) se perdía en cada edición.
      paymentDateOriginal: dto.paymentDate || null,
      paymentMethod: (dto.paymentMethod || 'CASH').toLowerCase(),
      status: (dto.status || 'PAID').toLowerCase(),
      notes: dto.notes || '',
      periodStart: dto.periodStart ? dto.periodStart.split('T')[0] : null,
      periodEnd: dto.periodEnd ? dto.periodEnd.split('T')[0] : null,
      // ⚠️ FALTABA, y la pantalla lo preguntaba igual: sin esto "Historial importado" no se
      // mostró nunca, y un cobro de ControlFit se veía idéntico a uno hecho acá.
      importado: !!dto.importado,
      // El período ESTIMADO de un cobro importado (V87). Aparte del de verdad: no es cobertura.
      periodoImportadoDesde: dto.periodoImportadoDesde || null,
      periodoImportadoHasta: dto.periodoImportadoHasta || null,
      // La anulación (V88): un cobro no se borra, queda tachado con quién y por qué.
      anuladoAt: dto.anuladoAt || null,
      anuladoPorNombre: dto.anuladoPorNombre || '',
      motivoAnulacion: dto.motivoAnulacion || '',
      // Ya lo contó un cierre de caja: corregirlo se puede, y entra como corrección en el próximo.
      cerradoEnCaja: !!dto.cerradoEnCaja,
    };
  }, []);

  // ⭐ El mapeo vive en ./mapeoPago, y no por prolijidad: acá se perdía el arancel entero.
  // No incluía `plan_id`, así que se podía elegir el arancel, ver el monto completarse, y el
  // arancel no salía nunca del navegador. Afuera se puede probar; adentro de un useCallback
  // no lo probaba nadie.
  //
  // No necesita useCallback: al ser una función de módulo, su identidad ya es estable.
  const mapPaymentModelToDTO = mapPaymentModelToDTOPuro;

  // Usamos el org del localStorage (se setea al instante al elegir el negocio), NO el gym del
  // contexto (que carga async). Sin esto, la página quedaba vacía si se abría antes de que el
  // contexto terminara de cargar — la causa de "no muestra datos hasta que registrás un pago".
  // El apiClient inyecta el X-Tenant-ID igual, así que la query queda acotada al negocio.
  const orgId = localStorage.getItem('current_org_id');

  const fetchPayments = useCallback(async () => {
    if (!orgId) return SIN_DATOS;
    // El rango de fecha lo filtra el BACKEND (params from/to).
    //
    // ⭐ Y el total del período lo cuenta el SERVIDOR (el libro de ingresos: el mismo número del
    // tablero, la caja y el Excel). Viaja en el mismo pedido para que la lista y el total no
    // puedan quedar de dos momentos distintos. Si ese endpoint falla (un backend que todavía no
    // lo tiene), la lista se muestra igual: el total cae a la suma de lo que está en pantalla.
    const [data, ingresos] = await Promise.all([
      paymentService.getAllPayments(dateFrom, dateTo),
      // Envuelto en un .then para que ni un error síncrono se lleve puesta la lista.
      dateFrom && dateTo
        ? Promise.resolve().then(() => paymentService.ingresos(dateFrom, dateTo)).catch(() => null)
        : Promise.resolve(null),
    ]);
    return { lista: (data || []).map(mapPaymentDTOToModel), ingresos };
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
  const { data, loading, isFetching, error, invalidate } = useQueryCache(
    ['payments', orgId, dateFrom || '', dateTo || ''],
    fetchPayments,
    { staleTime: STALE_MS },
  );

  const todos = data?.lista || EMPTY;

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

  /**
   * ⭐ ANULAR. El cobro no desaparece: queda en la lista, tachado, y deja de sumar.
   *
   * <p>Antes esto borraba, y borrar era borrar la prueba: la plata salía de los ingresos y del
   * cierre sin dejar el renglón.</p>
   */
  const anularPayment = async (id, { motivo, anuladoPor } = {}) => {
    try {
      const r = await paymentService.anular(id, { motivo, anuladoPor });
      invalidarDerivados();
      invalidate();
      return r;
    } catch (err) {
      console.error("Error anulando el cobro:", err);
      throw err;
    }
  };

  return {
    payments,
    // Lo que entró en el rango, contado por el servidor (null si no se pudo preguntar).
    ingresos: data?.ingresos || null,
    // ─── Que la pantalla pueda decir la verdad ───
    //
    // Si el pedido falla, `payments` queda vacío — igual que si el gimnasio no tuviera
    // ni un pago. La tabla no puede mostrar lo mismo en los dos casos: uno es un dato y
    // el otro es "no pude preguntar". Sin esto, un 401 o un 500 se leen como "no hay
    // pagos", que es la clase de mentira que manda a alguien a buscar el problema donde
    // no está.
    error,
    // "Cargando" para la página es una sola cosa: o no hay nada que mostrar, o lo que se
    // muestra se está refrescando por detrás.
    loading: loading || isFetching,
    refresh: invalidate,
    savePayment,
    anularPayment,
  };
}
