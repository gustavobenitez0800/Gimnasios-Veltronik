// ============================================
// VELTRONIK - INSIGHTS SERVICE (POO)
// ============================================
// Predicciones, alertas y análisis de datos

/**
 * Servicio de insights y analytics del gimnasio.
 * Usa algoritmos locales (regresión lineal, estadísticas).
 */
export default class InsightsService {
  /**
   * Predice los ingresos del próximo mes usando regresión lineal.
   * @param {Array} payments — Array de pagos históricos
   * @returns {{ predicted, confidence, trend, percentChange, lastMonthAvg }}
   */
  predictNextMonthRevenue(payments) {
    if (!payments || payments.length === 0) {
      return { predicted: 0, confidence: 0, trend: 'neutral', percentChange: '0.0' };
    }

    // Agrupar pagos por mes
    const monthlyRevenue = {};
    payments.forEach((p) => {
      if (p.status !== 'paid') return;
      const date = new Date(p.payment_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenue[key] = (monthlyRevenue[key] || 0) + parseFloat(p.amount || 0);
    });

    const sortedKeys = Object.keys(monthlyRevenue).sort();
    const values = sortedKeys.map((k) => monthlyRevenue[k]);

    if (values.length < 2) {
      const avg = values.length > 0 ? values[0] : 0;
      return { predicted: avg, confidence: 30, trend: 'neutral', percentChange: '0.0' };
    }

    // Regresión lineal simple
    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    values.forEach((y, x) => {
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const predicted = intercept + slope * n;

    // Confianza basada en varianza
    const avg = sumY / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    const coefficient = stdDev / avg || 0;
    const confidence = Math.max(20, Math.min(95, 100 - coefficient * 100));

    const trend = slope > 0 ? 'up' : slope < 0 ? 'down' : 'neutral';
    const percentChange = avg > 0 ? ((predicted - avg) / avg) * 100 : 0;

    return {
      predicted: Math.max(0, Math.round(predicted)),
      confidence: Math.round(confidence),
      trend,
      percentChange: percentChange.toFixed(1),
      lastMonthAvg: Math.round(avg),
    };
  }

  /**
   * Genera alertas de pago (expirados, urgentes, warning).
   * @param {Array} members — Array de miembros
   * @returns {Array} alertas ordenadas por prioridad
   */
  getPaymentAlerts(members) {
    const today = new Date();
    const alerts = [];

    members.forEach((member) => {
      if (!member.membership_end) return;
      const endDate = new Date(member.membership_end);
      const daysToExpire = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

      if (daysToExpire <= 0) {
        alerts.push({
          type: 'expired',
          member,
          message: `${member.full_name} - Membresía vencida`,
          priority: 'high',
          daysAgo: Math.abs(daysToExpire),
        });
      } else if (daysToExpire <= 3) {
        alerts.push({
          type: 'urgent',
          member,
          message: `${member.full_name} - Vence en ${daysToExpire} día${daysToExpire > 1 ? 's' : ''}`,
          priority: 'high',
          daysRemaining: daysToExpire,
        });
      } else if (daysToExpire <= 7) {
        alerts.push({
          type: 'warning',
          member,
          message: `${member.full_name} - Vence en ${daysToExpire} días`,
          priority: 'medium',
          daysRemaining: daysToExpire,
        });
      }
    });

    return alerts.sort((a, b) => (a.daysRemaining || 0) - (b.daysRemaining || 0));
  }

  /**
   * Genera insights diarios del gimnasio.
   * @param {{ members, payments }} data
   * @returns {Array} insights
   */
  generateDailyInsights(data) {
    const { members, payments } = data;
    const insights = [];
    const today = new Date();

    // 1. Membresías por vencer esta semana
    const expiringThisWeek = members.filter((m) => {
      if (!m.membership_end) return false;
      const end = new Date(m.membership_end);
      const days = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 7;
    }).length;

    if (expiringThisWeek > 0) {
      insights.push({
        icon: '⏰',
        type: 'warning',
        title: 'Membresías por vencer',
        message: `${expiringThisWeek} socio${expiringThisWeek > 1 ? 's' : ''} con membresía próxima a vencer esta semana`,
      });
    }

    // 2. Tasa de actividad
    const activeCount = members.filter((m) => m.status === 'active').length;
    const activeRate = members.length > 0 ? ((activeCount / members.length) * 100).toFixed(0) : 0;

    if (members.length > 0) {
      insights.push({
        icon: '📊',
        type: 'info',
        title: 'Tasa de actividad',
        message: `${activeRate}% de tus socios están activos (${activeCount} de ${members.length})`,
      });
    }

    // 3. Comparativa mensual
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyIncome = payments
      .filter((p) => new Date(p.payment_date) >= startOfMonth && p.status === 'paid')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    const lastMonthIncome = payments
      .filter((p) => {
        const d = new Date(p.payment_date);
        return d >= startOfLastMonth && d <= endOfLastMonth && p.status === 'paid';
      })
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    if (lastMonthIncome > 0) {
      const change = (((monthlyIncome - lastMonthIncome) / lastMonthIncome) * 100).toFixed(0);
      const isUp = monthlyIncome >= lastMonthIncome;

      insights.push({
        icon: isUp ? '📈' : '📉',
        type: isUp ? 'success' : 'warning',
        title: 'Comparativa mensual',
        message: `Ingresos ${isUp ? 'subieron' : 'bajaron'} ${Math.abs(change)}% vs mes anterior`,
      });
    }

    // 4. Cumpleaños del día
    const todayBirthdays = members.filter((m) => {
      if (!m.birth_date) return false;
      const bd = new Date(m.birth_date);
      return bd.getDate() === today.getDate() && bd.getMonth() === today.getMonth();
    });

    if (todayBirthdays.length > 0) {
      insights.push({
        icon: '🎂',
        type: 'celebration',
        title: '¡Cumpleaños hoy!',
        message: todayBirthdays.map((m) => m.full_name).join(', '),
      });
    }

    return insights;
  }

  /**
   * Datos para gráfico de ingresos mensuales.
   * @param {Array} payments
   * @param {number} months — Cantidad de meses a mostrar
   * @returns {{ labels: string[], data: number[] }}
   */
  getMonthlyRevenueChartData(payments, months = 6) {
    const data = [];
    const labels = [];
    const today = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);

      const monthName = d.toLocaleDateString('es-AR', { month: 'short' });
      labels.push(monthName.charAt(0).toUpperCase() + monthName.slice(1));

      const monthRevenue = payments
        .filter((p) => {
          const pd = new Date(p.payment_date);
          return pd >= d && pd <= monthEnd && p.status === 'paid';
        })
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);

      data.push(monthRevenue);
    }

    return { labels, data };
  }

  /**
   * Datos para gráfico de distribución de estados de miembros.
   * @param {Array} members
   * @returns {{ labels, data, colors }}
   */
  getMemberStatusChartData(members) {
    const statusCount = { active: 0, inactive: 0, expired: 0, suspended: 0 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    members.forEach((m) => {
      let effectiveStatus = m.status;

      if (m.membership_end) {
        const endDate = new Date(m.membership_end);
        endDate.setHours(0, 0, 0, 0);
        if (endDate < today && effectiveStatus === 'active') {
          effectiveStatus = 'expired';
        }
      }

      if (Object.prototype.hasOwnProperty.call(statusCount, effectiveStatus)) {
        statusCount[effectiveStatus]++;
      }
    });

    return {
      labels: ['Activos', 'Inactivos', 'Vencidos', 'Suspendidos'],
      data: [statusCount.active, statusCount.inactive, statusCount.expired, statusCount.suspended],
      colors: ['#22C55E', '#6B7280', '#EF4444', '#F59E0B'],
    };
  }
}
