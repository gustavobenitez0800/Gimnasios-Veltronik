// ============================================
// VELTRONIK - SERVICES INDEX
// ============================================
// Re-exportación centralizada de todos los servicios.
// Permite: import { memberService, paymentService } from '../services';
// ============================================

// Core Services
export { authService } from './AuthService';
export { gymService } from './GymService';
export { memberService } from './MemberService';
export { paymentService } from './PaymentService';
export { classService } from './ClassService';
export { accessService } from './AccessService';
export { teamService } from './TeamService';
export { subscriptionService } from './SubscriptionService';
export { errorService } from './ErrorService';
export { deviceService } from './DeviceService';
// Personas del mostrador (PIN por turno): no son usuarios, no tienen cuenta.
export { cashierService } from './CashierService';
// Aranceles: el catálogo de lo que vende el gimnasio (días y/o clases por plan).
export { planService } from './PlanService';

// Analytics
import InsightsService from './InsightsService';
export const insightsService = new InsightsService();
export { dashboardStatsService } from './DashboardStatsService';
// Resumen cross-sucursal del dueño (solo portal web).
export { ownerInsightsService } from './OwnerInsightsService';
