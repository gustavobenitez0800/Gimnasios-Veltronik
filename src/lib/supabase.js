// ============================================
// VELTRONIK PLATFORM - SUPABASE CLIENT v2
// ============================================
// LEGACY COMPATIBILITY LAYER
// Todas las funciones ahora delegan a los nuevos servicios POO.
// Los imports existentes siguen funcionando sin cambios.
// Migrar progresivamente a: import { memberService } from '../services';
// ============================================

import { authService } from '../services/AuthService';
import { profileService } from '../services/ProfileService';
import { gymService } from '../services/GymService';
import { memberService } from '../services/MemberService';
import { paymentService } from '../services/PaymentService';
import { classService } from '../services/ClassService';
import { accessService } from '../services/AccessService';
import { subscriptionService } from '../services/SubscriptionService';
import { errorService } from '../services/ErrorService';
import supabase from '../services/base/SupabaseClient';

// Re-export the Supabase client as default (used by AuthContext directly)
export default supabase;

// ============================================
// AUTH FUNCTIONS
// ============================================

export async function signUp(email, password, fullName = '') {
  return authService.signUp(email, password, fullName);
}

export async function signIn(email, password) {
  return authService.signIn(email, password);
}

export async function signInWithGoogle() {
  return authService.signInWithGoogle();
}

export async function signOut() {
  return authService.signOut();
}

export function clearPlatformState() {
  authService.clearPlatformState();
}

export async function getCurrentUser() {
  return authService.getCurrentUser();
}

export async function getSession() {
  return authService.getSession();
}

export function onAuthStateChange(callback) {
  return authService.onAuthStateChange(callback);
}

// ============================================
// PROFILE FUNCTIONS
// ============================================

export async function getProfile() {
  return profileService.getCurrent();
}

export async function updateProfile(updates) {
  return profileService.updateCurrent(updates);
}

// ============================================
// GYM FUNCTIONS
// ============================================

export async function getGym() {
  return gymService.getCurrent();
}

export async function createGym(gymData) {
  return gymService.createForUser(gymData);
}

export async function updateGym(updates) {
  return gymService.updateCurrent(updates);
}

export async function getUserGyms() {
  return gymService.getUserGyms();
}

// ============================================
// PLANS & SUBSCRIPTIONS
// ============================================

export async function getPlans() {
  return subscriptionService.getPlans();
}

export async function getSubscription() {
  return subscriptionService.getCurrent();
}

// ============================================
// MEMBERS FUNCTIONS
// ============================================

export async function getMembers() {
  return memberService.getAll();
}

export async function getMembersPaginated(page = 0, pageSize = 50, search = '') {
  return memberService.getPaginated(page, pageSize, search);
}

export async function getMember(id) {
  return memberService.getById(id);
}

export async function createMember(memberData) {
  return memberService.create(memberData);
}

export async function updateMember(id, updates) {
  return memberService.update(id, updates);
}

export async function deleteMember(id) {
  return memberService.delete(id);
}

// ============================================
// MEMBER PAYMENTS
// ============================================

export async function getMemberPayments() {
  return paymentService.getAll();
}

export async function getMemberPaymentsByMember(memberId) {
  return paymentService.getByMemberId(memberId);
}

export async function createMemberPayment(paymentData) {
  return paymentService.create(paymentData);
}

export async function updateMemberPayment(id, updates) {
  return paymentService.update(id, updates);
}

export async function deleteMemberPayment(id) {
  return paymentService.delete(id);
}

// ============================================
// CLASSES FUNCTIONS
// ============================================

export async function getClasses() {
  return classService.getAll();
}

export async function createClass(classData) {
  return classService.create(classData);
}

export async function updateClass(id, updates) {
  return classService.update(id, updates);
}

export async function deleteClass(id) {
  return classService.delete(id);
}

// ============================================
// CLASS BOOKINGS
// ============================================

export async function getBookingsByDate(date) {
  return classService.getBookingsByDate(date);
}

export async function getBookingsForClass(classId, date) {
  return classService.getBookingsForClass(classId, date);
}

export async function createBooking(bookingData) {
  return classService.createBooking(bookingData);
}

export async function cancelBooking(id) {
  return classService.cancelBooking(id);
}

export async function markAttended(id) {
  return classService.markAttended(id);
}

// ============================================
// ACCESS LOGS
// ============================================

export async function getTodayAccessLogs() {
  return accessService.getTodayLogs();
}

export async function getAccessLogs(startDate, endDate) {
  return accessService.getLogsByDateRange(startDate, endDate);
}

export async function checkInMember(memberId, accessMethod = 'manual', notes = null) {
  return accessService.checkIn(memberId, accessMethod, notes);
}

export async function checkOutMember(accessLogId) {
  return accessService.checkOut(accessLogId);
}

export async function getCurrentlyCheckedIn() {
  return accessService.getCurrentlyCheckedIn();
}

export async function searchMembersForAccess(query) {
  return memberService.searchForAccess(query);
}

// ============================================
// DNI VALIDATION
// ============================================

export async function isDniDuplicate(dni, excludeId = null) {
  return memberService.isDniDuplicate(dni, excludeId);
}

// ============================================
// ERROR HANDLING
// ============================================

export function getSupabaseErrorMessage(error) {
  return errorService.getMessage(error);
}
