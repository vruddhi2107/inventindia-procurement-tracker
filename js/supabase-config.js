// ============================================================
// SUPABASE CONFIGURATION
// Replace with your actual Supabase project URL and anon key
// ============================================================

const SUPABASE_URL = 'https://nxhvxfvfhvbkymgvmwwi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54aHZ4ZnZmaHZia3ltZ3Ztd3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5OTg5MjQsImV4cCI6MjA4NzU3NDkyNH0.U5lrYtTXBEbqpF5ZO7GcMWQ8IGhsGqWsvGiDZ4FQnK0';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// SESSION MANAGEMENT (localStorage based - no Supabase Auth)
// ============================================================
const Session = {
  set(user) {
    localStorage.setItem('procurement_user', JSON.stringify(user));
  },
  get() {
    const u = localStorage.getItem('procurement_user');
    return u ? JSON.parse(u) : null;
  },
  clear() {
    localStorage.removeItem('procurement_user');
  },
  require(allowedRoles) {
    const user = this.get();
    if (!user) { window.location.href = '../index.html'; return null; }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      alert('Access denied.');
      window.location.href = '../index.html';
      return null;
    }
    return user;
  }
};

// ============================================================
// PHASE CONFIG
// ============================================================
const PHASES = {
  submitted:                { label: 'Submitted', color: '#6366f1', icon: '📋' },
  quotation_attached:       { label: 'Quotation Attached', color: '#f59e0b', icon: '📎' },
  engineer_review:          { label: 'Engineer Review', color: '#3b82f6', icon: '🔍' },
  pending_client_approval:  { label: 'Pending Client Approval', color: '#8b5cf6', icon: '⏳' },
  pending_pm_approval:      { label: 'Pending PM Approval', color: '#ec4899', icon: '⏳' },
  approved:                 { label: 'Approved', color: '#10b981', icon: '✅' },
  order_placed:             { label: 'Order Placed', color: '#14b8a6', icon: '🛒' },
  grn_pending:              { label: 'GRN / Quality Check', color: '#f97316', icon: '📦' },
  accepted:                 { label: 'Accepted & Closed', color: '#22c55e', icon: '✔️' },
  rejected:                 { label: 'Rejected & Closed', color: '#ef4444', icon: '❌' }
};

const ORDER_TYPES = {
  repeat: 'Repeat Order',
  custom: 'Custom Order',
  modification: 'Modification Request',
  inventory: 'Inventory Item'
};

const DEPARTMENTS = { mech: 'Mechanical', id: 'Industrial Design', electronics: 'Electronics' };

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getPhaseBadge(phase) {
  const p = PHASES[phase] || { label: phase, color: '#6b7280' };
  return `<span class="phase-badge" style="background:${p.color}20;color:${p.color};border:1px solid ${p.color}40">${p.icon} ${p.label}</span>`;
}