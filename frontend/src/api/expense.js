import api from './auth';

/**
 * Expense Management & Splitting API Service
 * Reuses the existing Axios instance with automatic JWT Bearer token attachment.
 */

// 1. Ledger & Dashboard
export const getTripExpenseDashboard = (tripId) =>
  api.get(`/trips/${tripId}/expenses/dashboard`);

export const getTripMembers = (tripId) =>
  api.get(`/trips/${tripId}/members`);

// 2. Add Expense
export const addExpense = (tripId, data) =>
  api.post(`/trips/${tripId}/expenses`, data);

// 3. Dispute & Acceptance
export const disputeExpense = (expenseId, data) =>
  api.post(`/expenses/${expenseId}/dispute`, data);

export const reviewDispute = (disputeId, data) =>
  api.post(`/disputes/${disputeId}/review`, data);

export const acceptExpense = (expenseId) =>
  api.post(`/expenses/${expenseId}/accept`);

// 4. Settlements
export const settleBalance = (tripId, data) =>
  api.post(`/trips/${tripId}/settlements`, data);

// 5. In-App Notifications
export const getNotifications = () =>
  api.get('/notifications');

export const markNotificationRead = (notificationId) =>
  api.post(`/notifications/${notificationId}/read`);

export const markAllNotificationsRead = () =>
  api.post('/notifications/read-all');
