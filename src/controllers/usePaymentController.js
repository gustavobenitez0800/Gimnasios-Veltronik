import { useState, useCallback } from 'react';
import { paymentFacade } from '../repositories/PaymentFacade';
import Payment from '../models/Payment';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook Controlador: usePaymentController
 * Equivalente a: PagoController.java (@ManagedBean) en SIG JEE7
 */
export function usePaymentController() {
  const { gym: currentGym } = useAuth();
  
  // Estado local de la vista (Atributos del ManagedBean)
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({ totalMonth: 0, totalCount: 0, byMethod: {} });
  const [currentPayment, setCurrentPayment] = useState(new Payment());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Cargar la lista de pagos usando filtros
   */
  const loadPayments = useCallback(async (dateFrom, dateTo, search, method, status) => {
    if (!currentGym?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await paymentFacade.findByFilters(
        currentGym.id, dateFrom, dateTo, search, method, status
      );
      setPayments(data);
    } catch (err) {
      console.error("Error loading payments:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentGym]);

  /**
   * Cargar pagos de un socio específico (para el historial)
   */
  const loadMemberPayments = async (memberId) => {
    if (!currentGym?.id) return [];
    try {
      return await paymentFacade.findByMember(currentGym.id, memberId);
    } catch (err) {
      console.error("Error loading member payments:", err);
      throw err;
    }
  };

  /**
   * Cargar estadísticas analíticas
   */
  const loadStats = useCallback(async () => {
    if (!currentGym?.id) return;
    try {
      const monthStats = await paymentFacade.getMonthlyStats(currentGym.id);
      setStats(monthStats);
    } catch (err) {
      console.error("Error loading payment stats:", err);
    }
  }, [currentGym]);

  /**
   * Guardar o editar un pago
   */
  const savePayment = async (paymentData) => {
    setLoading(true);
    setError(null);
    try {
      const paymentInstance = new Payment({ ...paymentData, gym_id: currentGym.id });
      let saved;
      
      if (paymentInstance.id) {
        saved = await paymentFacade.edit(paymentInstance.id, paymentInstance);
      } else {
        saved = await paymentFacade.create(paymentInstance);
      }

      // Optimistic Update
      setPayments(prev => {
        const exists = prev.find(p => p.id === saved.id);
        if (exists) {
          return prev.map(p => p.id === saved.id ? saved : p);
        }
        return [saved, ...prev];
      });
      
      // Recargar stats si fue exitoso
      await loadStats();
      
      return saved;
    } catch (err) {
      console.error("Error saving payment:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Eliminar un pago
   */
  const deletePayment = async (id) => {
    setLoading(true);
    setError(null);
    try {
      await paymentFacade.remove(id);
      setPayments(prev => prev.filter(p => p.id !== id));
      await loadStats();
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
    stats,
    currentPayment,
    loading,
    error,
    setCurrentPayment,
    loadPayments,
    loadMemberPayments,
    loadStats,
    savePayment,
    deletePayment
  };
}
