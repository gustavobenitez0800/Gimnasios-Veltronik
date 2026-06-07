import { useState, useCallback } from 'react';
import { paymentService } from '../services/PaymentService';

export function usePaymentController() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const loadPayments = useCallback(async (dateFrom, dateTo, search, method, status) => {
    // Usamos el org del localStorage (se setea al instante al elegir el negocio), NO el gym del
    // contexto (que carga async). Sin esto, la página quedaba vacía si se abría antes de que el
    // contexto terminara de cargar — la causa de "no muestra datos hasta que registrás un pago".
    // El apiClient inyecta el X-Tenant-ID igual, así que la query queda acotada al negocio.
    if (!localStorage.getItem('current_org_id')) return;
    setLoading(true);
    setError(null);
    try {
      // El rango de fecha lo filtra el BACKEND (params from/to). search/method/status
      // se aplican sobre el resultado (filtros livianos de UI sobre el set ya acotado).
      const data = await paymentService.getAllPayments(dateFrom, dateTo);
      let mappedData = data.map(mapPaymentDTOToModel);

      const q = (search || '').trim().toLowerCase();
      if (q) {
        mappedData = mappedData.filter(p =>
          (p.member?.fullName || '').toLowerCase().includes(q) ||
          (p.member?.dni || '').toLowerCase().includes(q)
        );
      }
      if (method) mappedData = mappedData.filter(p => p.paymentMethod === method);
      if (status) mappedData = mappedData.filter(p => p.status === status);

      setPayments(mappedData);
    } catch (err) {
      console.error("Error loading payments:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mapPaymentDTOToModel]);

  // Guarda (alta o edición) y devuelve el pago. NO recarga acá: la página llama a loadPayments
  // con el filtro de fecha ACTIVO, para que la lista quede consistente con lo que el usuario ve
  // (antes recargaba SIN filtro → "aparecían todos" solo tras registrar un pago).
  const savePayment = async (paymentData) => {
    setLoading(true);
    setError(null);
    try {
      const dto = mapPaymentModelToDTO(paymentData);
      let saved;
      if (paymentData.id) {
        saved = await paymentService.update(paymentData.id, dto);
      } else {
        saved = await paymentService.createPayment(dto);
      }
      return saved;
    } catch (err) {
      console.error("Error saving payment:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deletePayment = async (id) => {
    setLoading(true);
    setError(null);
    try {
      await paymentService.deletePayment(id);
      setPayments(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error("Error deleting payment:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    payments,
    loading,
    error,
    loadPayments,
    savePayment,
    deletePayment
  };
}
