// ============================================
// VELTRONIK - SERVICES INDEX
// ============================================
// Re-exportación centralizada de todos los servicios.
// Permite: import { memberService, paymentService } from '../services';
// ============================================

// Base
export { default as supabase } from './base/SupabaseClient';

// Core Services
export { authService } from './AuthService';
export { profileService } from './ProfileService';
export { gymService } from './GymService';
export { memberService } from './MemberService';
export { paymentService } from './PaymentService';
export { classService } from './ClassService';
export { accessService } from './AccessService';
export { subscriptionService } from './SubscriptionService';
export { errorService } from './ErrorService';
export { storageService } from './storageService';

// Analytics
import InsightsService from './InsightsService';
export const insightsService = new InsightsService();
export { dashboardStatsService } from './DashboardStatsService';

// Restaurant Services
export { areaService } from './restaurant/AreaService';
export { tableService } from './restaurant/TableService';
export { menuService } from './restaurant/MenuService';
export { orderService } from './restaurant/OrderService';
export { staffService } from './restaurant/StaffService';
export { inventoryService } from './restaurant/InventoryService';
export { reservationService } from './restaurant/ReservationService';
export { cashRegisterService } from './restaurant/CashRegisterService';
export { restaurantStatsService } from './restaurant/RestaurantStatsService';

// Salon Services
export { salonClientService } from './salon/SalonClientService';
export { salonServiceService } from './salon/SalonServiceService';
export { salonStylistService } from './salon/SalonStylistService';
export { salonAppointmentService } from './salon/SalonAppointmentService';
export { salonSaleService } from './salon/SalonSaleService';
export { salonProductService } from './salon/SalonProductService';
export { salonStatsService } from './salon/SalonStatsService';
