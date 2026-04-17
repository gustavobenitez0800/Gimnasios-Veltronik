// ============================================
// VELTRONIK PLATFORM - SUPABASE RESTAURANT API
// ============================================
// LEGACY COMPATIBILITY LAYER
// Todas las funciones ahora delegan a los nuevos servicios POO.
// Los imports existentes siguen funcionando sin cambios.
// Migrar progresivamente a: import { orderService } from '../services';
// ============================================

import { areaService } from '../services/restaurant/AreaService';
import { tableService } from '../services/restaurant/TableService';
import { menuService } from '../services/restaurant/MenuService';
import { orderService } from '../services/restaurant/OrderService';
import { staffService } from '../services/restaurant/StaffService';
import { inventoryService } from '../services/restaurant/InventoryService';
import { reservationService } from '../services/restaurant/ReservationService';
import { cashRegisterService } from '../services/restaurant/CashRegisterService';
import { restaurantStatsService } from '../services/restaurant/RestaurantStatsService';

// ============================================
// ÁREAS
// ============================================

export async function getAreas() {
  return areaService.getAll();
}

export async function createArea(areaData) {
  return areaService.create(areaData);
}

export async function updateArea(id, updates) {
  return areaService.update(id, updates);
}

export async function deleteArea(id) {
  return areaService.delete(id);
}

// ============================================
// MESAS
// ============================================

export async function getTables() {
  return tableService.getAll();
}

export async function createTable(tableData) {
  return tableService.create(tableData);
}

export async function updateTable(id, updates) {
  return tableService.update(id, updates);
}

export async function deleteTable(id) {
  return tableService.delete(id);
}

// ============================================
// CATEGORÍAS DEL MENÚ
// ============================================

export async function getMenuCategories() {
  return menuService.getCategories();
}

export async function createMenuCategory(catData) {
  return menuService.createCategory(catData);
}

export async function updateMenuCategory(id, updates) {
  return menuService.updateCategory(id, updates);
}

export async function deleteMenuCategory(id) {
  return menuService.deleteCategory(id);
}

// ============================================
// PLATOS DEL MENÚ
// ============================================

export async function getMenuItems() {
  return menuService.getAll();
}

export async function createMenuItem(itemData) {
  return menuService.create(itemData);
}

export async function updateMenuItem(id, updates) {
  return menuService.update(id, updates);
}

export async function deleteMenuItem(id) {
  return menuService.delete(id);
}

// ============================================
// PEDIDOS
// ============================================

export async function getOrders(statusFilter = null) {
  return orderService.getAll(statusFilter);
}

export async function getActiveOrders() {
  return orderService.getActive();
}

export async function createOrder(orderData) {
  return orderService.create(orderData);
}

export async function updateOrder(id, updates) {
  return orderService.update(id, updates);
}

export async function closeOrder(id, paymentMethod, tip = 0) {
  return orderService.close(id, paymentMethod, tip);
}

// ============================================
// ÍTEMS DEL PEDIDO
// ============================================

export async function getOrderItems(orderId) {
  return orderService.getItems(orderId);
}

export async function addOrderItem(orderId, item) {
  return orderService.addItem(orderId, item);
}

export async function updateOrderItem(id, updates) {
  return orderService.updateItem(id, updates);
}

export async function removeOrderItem(id, orderId) {
  return orderService.removeItem(id, orderId);
}

// ============================================
// PERSONAL
// ============================================

export async function getStaff() {
  return staffService.getAll();
}

export async function createStaff(staffData) {
  return staffService.create(staffData);
}

export async function updateStaff(id, updates) {
  return staffService.update(id, updates);
}

export async function deleteStaff(id) {
  return staffService.delete(id);
}

// ============================================
// INVENTARIO
// ============================================

export async function getInventory() {
  return inventoryService.getAll();
}

export async function createInventoryItem(itemData) {
  return inventoryService.create(itemData);
}

export async function updateInventoryItem(id, updates) {
  return inventoryService.update(id, updates);
}

export async function getLowStockItems() {
  return inventoryService.getLowStock();
}

// ============================================
// RESERVAS
// ============================================

export async function getReservations(date = null) {
  return reservationService.getAll(date);
}

export async function createReservation(resData) {
  return reservationService.create(resData);
}

export async function updateReservation(id, updates) {
  return reservationService.update(id, updates);
}

export async function cancelReservation(id) {
  return reservationService.cancel(id);
}

// ============================================
// CAJA DIARIA
// ============================================

export async function getOpenCashRegister() {
  return cashRegisterService.getOpen();
}

export async function openCashRegister(openingAmount = 0) {
  return cashRegisterService.open(openingAmount);
}

export async function closeCashRegister(id, closingData) {
  return cashRegisterService.close(id, closingData);
}

// ============================================
// DASHBOARD STATS
// ============================================

export async function getRestaurantDashboardStats() {
  return restaurantStatsService.getDashboardStats();
}
