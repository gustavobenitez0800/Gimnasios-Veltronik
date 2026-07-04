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
export { storageService } from './storageService';
export { deviceService } from './DeviceService';
export { cashierService } from './CashierService';

// Vertical Canchas (FUTBOL_5)
export { courtService } from './CourtService';

// Vertical Kiosco (KIOSCO)
export { kioskService } from './KioskService';

// Analytics
import InsightsService from './InsightsService';
export const insightsService = new InsightsService();
export { dashboardStatsService } from './DashboardStatsService';
