// ============================================
// GIMNASIO VELTRONIK - AI INSIGHTS MODULE
// ============================================
// Predicciones, alertas inteligentes e insights
// usando algoritmos locales y API de Gemini

const AI_CONFIG = {
    // Para desarrollo usamos análisis local
    // En producción se puede integrar con Gemini/OpenAI
    USE_EXTERNAL_API: false,
    GEMINI_API_KEY: '' // Configurar en .env para producción
};

// ============================================
// PREDICCIÓN DE INGRESOS
// ============================================

/**
 * Predice los ingresos del próximo mes basándose en el histórico
 * @param {Array} payments - Array de pagos históricos
 * @returns {Object} - Predicción con monto y confianza
 */
function predictNextMonthRevenue(payments) {
    if (!payments || payments.length === 0) {
        return { predicted: 0, confidence: 0, trend: 'neutral' };
    }

    // Agrupar pagos por mes
    const monthlyRevenue = {};
    payments.forEach(p => {
        if (p.status !== 'paid') return;
        const date = new Date(p.payment_date);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        monthlyRevenue[key] = (monthlyRevenue[key] || 0) + parseFloat(p.amount);
    });

    const values = Object.values(monthlyRevenue);
    if (values.length < 2) {
        const avg = values.length > 0 ? values[0] : 0;
        return { predicted: avg, confidence: 30, trend: 'neutral' };
    }

    // Calcular tendencia (regresión lineal simple)
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

    // Predecir siguiente mes
    const predicted = intercept + slope * n;

    // Calcular confianza basada en variabilidad
    const avg = sumY / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    const coefficient = stdDev / avg || 0;
    const confidence = Math.max(20, Math.min(95, 100 - coefficient * 100));

    // Determinar tendencia
    const trend = slope > 0 ? 'up' : slope < 0 ? 'down' : 'neutral';
    const percentChange = avg > 0 ? ((predicted - avg) / avg) * 100 : 0;

    return {
        predicted: Math.max(0, Math.round(predicted)),
        confidence: Math.round(confidence),
        trend,
        percentChange: percentChange.toFixed(1),
        lastMonthAvg: Math.round(avg)
    };
}

// ============================================
// ALERTAS INTELIGENTES
// ============================================

/**
 * Detecta socios en riesgo de abandono
 * @param {Array} members - Lista de socios
 * @param {Array} accessLogs - Logs de acceso (si disponibles)
 * @returns {Array} - Socios en riesgo
 */
function detectAtRiskMembers(members, accessLogs = []) {
    const today = new Date();
    const atRisk = [];

    members.forEach(member => {
        const riskFactors = [];
        let riskScore = 0;

        // Factor 1: Membresía próxima a vencer (7 días)
        if (member.membership_end) {
            const endDate = new Date(member.membership_end);
            const daysToExpire = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

            if (daysToExpire <= 0) {
                riskScore += 40;
                riskFactors.push('Membresía vencida');
            } else if (daysToExpire <= 7) {
                riskScore += 25;
                riskFactors.push(`Vence en ${daysToExpire} días`);
            } else if (daysToExpire <= 14) {
                riskScore += 10;
                riskFactors.push(`Vence en ${daysToExpire} días`);
            }
        }

        // Factor 2: Estado inactivo o suspendido
        if (member.status === 'inactive') {
            riskScore += 30;
            riskFactors.push('Estado inactivo');
        } else if (member.status === 'suspended') {
            riskScore += 35;
            riskFactors.push('Suspendido');
        } else if (member.status === 'expired') {
            riskScore += 45;
            riskFactors.push('Expirado');
        }

        // Factor 3: Sin asistencia reciente (si hay logs)
        if (accessLogs.length > 0) {
            const memberLogs = accessLogs.filter(l => l.member_id === member.id);
            const lastVisit = memberLogs.length > 0 ?
                new Date(Math.max(...memberLogs.map(l => new Date(l.checked_in_at)))) : null;

            if (!lastVisit) {
                riskScore += 20;
                riskFactors.push('Sin visitas registradas');
            } else {
                const daysSinceVisit = Math.ceil((today - lastVisit) / (1000 * 60 * 60 * 24));
                if (daysSinceVisit > 14) {
                    riskScore += 15;
                    riskFactors.push(`${daysSinceVisit} días sin asistir`);
                }
            }
        }

        if (riskScore >= 20) {
            atRisk.push({
                ...member,
                riskScore,
                riskLevel: riskScore >= 50 ? 'high' : riskScore >= 30 ? 'medium' : 'low',
                riskFactors
            });
        }
    });

    // Ordenar por score descendente
    return atRisk.sort((a, b) => b.riskScore - a.riskScore).slice(0, 10);
}

/**
 * Genera alertas de pagos próximos a vencer
 * @param {Array} members - Lista de socios
 * @returns {Array} - Alertas de pago
 */
function getPaymentAlerts(members) {
    const today = new Date();
    const alerts = [];

    members.forEach(member => {
        if (!member.membership_end) return;

        const endDate = new Date(member.membership_end);
        const daysToExpire = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

        if (daysToExpire <= 0) {
            alerts.push({
                type: 'expired',
                member,
                message: `${member.full_name} - Membresía vencida`,
                priority: 'high',
                daysAgo: Math.abs(daysToExpire)
            });
        } else if (daysToExpire <= 3) {
            alerts.push({
                type: 'urgent',
                member,
                message: `${member.full_name} - Vence en ${daysToExpire} día${daysToExpire > 1 ? 's' : ''}`,
                priority: 'high',
                daysRemaining: daysToExpire
            });
        } else if (daysToExpire <= 7) {
            alerts.push({
                type: 'warning',
                member,
                message: `${member.full_name} - Vence en ${daysToExpire} días`,
                priority: 'medium',
                daysRemaining: daysToExpire
            });
        }
    });

    return alerts.sort((a, b) => (a.daysRemaining || 0) - (b.daysRemaining || 0));
}

// ============================================
// INSIGHTS AUTOMÁTICOS
// ============================================

/**
 * Genera insights diarios basados en los datos
 * @param {Object} data - Datos del gimnasio
 * @returns {Array} - Lista de insights
 */
function generateDailyInsights(data) {
    const { members, payments, gym } = data;
    const insights = [];
    const today = new Date();

    // Insight 1: Membresías por vencer
    const expiringThisWeek = members.filter(m => {
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
            action: 'Ver lista',
            actionUrl: 'members.html?filter=expiring'
        });
    }

    // Insight 2: Socios activos vs inactivos
    const activeCount = members.filter(m => m.status === 'active').length;
    const inactiveCount = members.filter(m => m.status !== 'active').length;
    const activeRate = members.length > 0 ? (activeCount / members.length * 100).toFixed(0) : 0;

    if (inactiveCount > 0) {
        insights.push({
            icon: '📊',
            type: 'info',
            title: 'Tasa de actividad',
            message: `${activeRate}% de tus socios están activos (${activeCount} de ${members.length})`,
            action: null
        });
    }

    // Insight 3: Ingresos del mes
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyIncome = payments
        .filter(p => new Date(p.payment_date) >= startOfMonth && p.status === 'paid')
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    // Comparar con mes anterior
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    const lastMonthIncome = payments
        .filter(p => {
            const d = new Date(p.payment_date);
            return d >= startOfLastMonth && d <= endOfLastMonth && p.status === 'paid';
        })
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    if (lastMonthIncome > 0) {
        const change = ((monthlyIncome - lastMonthIncome) / lastMonthIncome * 100).toFixed(0);
        const isUp = monthlyIncome >= lastMonthIncome;

        insights.push({
            icon: isUp ? '📈' : '📉',
            type: isUp ? 'success' : 'warning',
            title: 'Comparativa mensual',
            message: `Ingresos ${isUp ? 'subieron' : 'bajaron'} ${Math.abs(change)}% vs mes anterior`,
            action: null
        });
    }

    // Insight 4: Cumpleaños de hoy
    const todayBirthdays = members.filter(m => {
        if (!m.birth_date) return false;
        const bd = new Date(m.birth_date);
        return bd.getDate() === today.getDate() && bd.getMonth() === today.getMonth();
    });

    if (todayBirthdays.length > 0) {
        insights.push({
            icon: '🎂',
            type: 'celebration',
            title: '¡Cumpleaños hoy!',
            message: todayBirthdays.map(m => m.full_name).join(', '),
            action: 'Enviar saludo'
        });
    }

    // Insight 5: Predicción de ingresos
    const prediction = predictNextMonthRevenue(payments);
    if (prediction.confidence >= 50) {
        const trendEmoji = prediction.trend === 'up' ? '🚀' : prediction.trend === 'down' ? '⚠️' : '➡️';
        insights.push({
            icon: trendEmoji,
            type: prediction.trend === 'up' ? 'success' : prediction.trend === 'down' ? 'warning' : 'info',
            title: 'Predicción próximo mes',
            message: `Estimamos ingresos de ${formatCurrency(prediction.predicted)} (${prediction.percentChange > 0 ? '+' : ''}${prediction.percentChange}%)`,
            confidence: prediction.confidence
        });
    }

    return insights;
}

// ============================================
// DATOS PARA GRÁFICOS
// ============================================

/**
 * Prepara datos para gráfico de ingresos mensuales
 * @param {Array} payments - Pagos
 * @param {number} months - Cantidad de meses a mostrar
 * @returns {Object} - Datos para Chart.js
 */
function getMonthlyRevenueChartData(payments, months = 6) {
    const data = [];
    const labels = [];
    const today = new Date();

    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);

        const monthName = d.toLocaleDateString('es-AR', { month: 'short' });
        labels.push(monthName.charAt(0).toUpperCase() + monthName.slice(1));

        const monthRevenue = payments
            .filter(p => {
                const pd = new Date(p.payment_date);
                return pd >= d && pd <= monthEnd && p.status === 'paid';
            })
            .reduce((sum, p) => sum + parseFloat(p.amount), 0);

        data.push(monthRevenue);
    }

    return { labels, data };
}

/**
 * Prepara datos para gráfico de socios por estado
 * @param {Array} members - Socios
 * @returns {Object} - Datos para Chart.js
 */
function getMemberStatusChartData(members) {
    const statusCount = {
        active: 0,
        inactive: 0,
        expired: 0,
        suspended: 0
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    members.forEach(m => {
        let effectiveStatus = m.status;

        // Check if membership is expired (overrides active status)
        if (m.membership_end) {
            const endDate = new Date(m.membership_end);
            endDate.setHours(0, 0, 0, 0);

            // Only mark as expired if date passed and status was active
            // (If they are already suspended or inactive, we keep that status)
            if (endDate < today && effectiveStatus === 'active') {
                effectiveStatus = 'expired';
            }
        }

        // Count logic
        if (statusCount.hasOwnProperty(effectiveStatus)) {
            statusCount[effectiveStatus]++;
        } else if (effectiveStatus === 'expired') {
            // Handle case where 'expired' might not be a DB status but is a derived one
            statusCount.expired++;
        }
    });

    return {
        labels: ['Activos', 'Inactivos', 'Vencidos', 'Suspendidos'],
        data: [statusCount.active, statusCount.inactive, statusCount.expired, statusCount.suspended],
        colors: ['#22C55E', '#6B7280', '#EF4444', '#F59E0B']
    };
}

/**
 * Obtiene estadísticas de crecimiento de socios
 * @param {Array} members - Socios
 * @returns {Object} - Estadísticas
 */
function getMemberGrowthStats(members) {
    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    const newThisMonth = members.filter(m => {
        const created = new Date(m.created_at);
        return created >= thisMonth;
    }).length;

    const newLastMonth = members.filter(m => {
        const created = new Date(m.created_at);
        return created >= lastMonth && created <= lastMonthEnd;
    }).length;

    const growth = newLastMonth > 0 ?
        ((newThisMonth - newLastMonth) / newLastMonth * 100).toFixed(0) :
        newThisMonth > 0 ? 100 : 0;

    return {
        newThisMonth,
        newLastMonth,
        growth: parseInt(growth),
        total: members.length
    };
}

// ============================================
// HELPER: Format Currency
// ============================================
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0
    }).format(amount);
}

// Exportar funciones para uso global
window.AIInsights = {
    predictNextMonthRevenue,
    detectAtRiskMembers,
    getPaymentAlerts,
    generateDailyInsights,
    getMonthlyRevenueChartData,
    getMemberStatusChartData,
    getMemberGrowthStats
};
