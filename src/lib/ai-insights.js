// ============================================
// VELTRONIK V2 - AI INSIGHTS (Compatibility Layer)
// ============================================
// Delegates to InsightsService for backward compatibility.
// New code should import { insightsService } from '../services';

import { insightsService } from '../services';

export function predictNextMonthRevenue(payments) {
  return insightsService.predictNextMonthRevenue(payments);
}

export function getPaymentAlerts(members) {
  return insightsService.getPaymentAlerts(members);
}

export function generateDailyInsights(data) {
  return insightsService.generateDailyInsights(data);
}

export function getMonthlyRevenueChartData(payments, months = 6) {
  return insightsService.getMonthlyRevenueChartData(payments, months);
}

export function getMemberStatusChartData(members) {
  return insightsService.getMemberStatusChartData(members);
}
