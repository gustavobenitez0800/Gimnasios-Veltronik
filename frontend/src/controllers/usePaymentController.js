import { useState, useCallback } from 'react';
import { paymentService } from '../services/PaymentService';
import { useAuth } from '../contexts/AuthContext';

export function usePaymentController() {
  const { gym: currentGym } = useAuth();
  
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
      notes: dto.description || dto.notes || '',
      // El backend no guarda periodStart/End, así que quedan nulos a menos que el frontend los intercepte de otro lado
      periodStart: dto.periodStart || null,
      periodEnd: dto.periodEnd || null
    };
  }, []);

  const mapPaymentModelToDTO = useCallback((model) => {
    return {
      member_id: model.member_id,
      amount: parseFloat(model.amount) || 0,
      paymentDate: model.paymentDate,
      paymentMethod: (model.paymentMethod || 'cash').toUpperCase(),
      status: (model.status || 'paid').toUpperCase(),
      description: model.notes || '',
      periodStart: model.periodStart || null,
      periodEnd: model.periodEnd || null
    };
  }, []);

  const loadPayments = useCallback(async (dateFrom, dateTo, search, method, status) => {
    if (!currentGym?.id) return;
    setLoading(true);
    setError(null);
    try {
      // Por ahora trae todos, luego podemos agregar params a Java
      const data = await paymentService.getAll();
      const mappedData = data.map(mapPaymentDTOToModel);
      setPayments(mappedData);
    } catch (err) {
      console.error("Error loading payments:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentGym, mapPaymentDTOToModel]);

  const savePayment = async (paymentData) => {
    setLoading(true);
    setError(null);
    try {
      const dto = mapPaymentModelToDTO(paymentData);
      let saved;
      if (paymentData.id) {
        saved = await paymentService.update(paymentData.id, dto);
      } else {
        saved = await paymentService.create(dto);
      }
      // Reload everything
      const data = await paymentService.getAll();
      const mappedData = data.map(mapPaymentDTOToModel);
      setPayments(mappedData);
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
      await paymentService.delete(id);
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
