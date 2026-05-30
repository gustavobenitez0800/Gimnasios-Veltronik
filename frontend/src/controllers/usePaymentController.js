import { useState, useCallback } from 'react';
import { paymentService } from '../services/PaymentService';
import { useAuth } from '../contexts/AuthContext';

export function usePaymentController() {
  const { gym: currentGym } = useAuth();
  
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadPayments = useCallback(async (dateFrom, dateTo, search, method, status) => {
    if (!currentGym?.id) return;
    setLoading(true);
    setError(null);
    try {
      // Por ahora trae todos, luego podemos agregar params a Java
      const data = await paymentService.getAll();
      setPayments(data);
    } catch (err) {
      console.error("Error loading payments:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentGym]);

  const savePayment = async (paymentData) => {
    setLoading(true);
    setError(null);
    try {
      let saved;
      if (paymentData.id) {
        saved = await paymentService.update(paymentData.id, paymentData);
      } else {
        saved = await paymentService.create(paymentData);
      }
      // Reload everything
      const data = await paymentService.getAll();
      setPayments(data);
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
