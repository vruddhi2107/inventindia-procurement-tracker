// ============================================================
// SUPABASE CONFIGURATION
// Replace with your actual Supabase project URL and anon key
// ============================================================

const SUPABASE_URL = 'https://nxhvxfvfhvbkymgvmwwi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54aHZ4ZnZmaHZia3ltZ3Ztd3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5OTg5MjQsImV4cCI6MjA4NzU3NDkyNH0.U5lrYtTXBEbqpF5ZO7GcMWQ8IGhsGqWsvGiDZ4FQnK0';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// ============================================================
// SUPABASE CONFIGURATION — ProcureOps v2
// Replace YOUR_SUPABASE_URL and YOUR_SUPABASE_ANON_KEY below
// ============================================================


// ============================================================
// SESSION
// ============================================================
const Session = {
  set(user) { localStorage.setItem('procurement_user', JSON.stringify(user)); },
  get() { const u = localStorage.getItem('procurement_user'); return u ? JSON.parse(u) : null; },
  clear() { localStorage.removeItem('procurement_user'); },
  require(allowedRoles) {
    const user = this.get();
    if (!user) { window.location.href = '../index.html'; return null; }
    if (allowedRoles && !allowedRoles.includes(user.role)) { alert('Access denied.'); window.location.href = '../index.html'; return null; }
    return user;
  }
};

// ============================================================
// UPDATED PHASES — New workflow
// ============================================================
const PHASES = {
  submitted:                    { label: 'Submitted',                color: '#6366f1', icon: '📋' },
  pending_initial_pm_approval:  { label: 'Awaiting PM Clearance',   color: '#f59e0b', icon: '🔐' },
  procurement_active:           { label: 'Procurement Active',       color: '#3b82f6', icon: '⚙️'  },
  vendor_info_shared:           { label: 'Vendor Info Shared',       color: '#8b5cf6', icon: '🏢' },
  quotations_shared:            { label: 'Quotations Shared',        color: '#8b5cf6', icon: '📨' },
  pending_client_approval:      { label: 'Pending Client Approval',  color: '#ec4899', icon: '👤' },
  pending_pm_final_approval:    { label: 'Pending PM Approval',      color: '#f97316', icon: '✍️'  },
  approved:                     { label: 'Approved',                 color: '#10b981', icon: '✅' },
  advance_requested:            { label: 'Advance Requested',        color: '#f59e0b', icon: '💳' },
  advance_approved:             { label: 'Advance Approved',         color: '#22c55e', icon: '💳' },
  advance_rejected:             { label: 'Advance Rejected',         color: '#ef4444', icon: '💳' },
  advance_raised_to_accounts:   { label: 'Advance Raised',           color: '#f59e0b', icon: '📤' },
  advance_payment_received:     { label: 'Advance Received',         color: '#22c55e', icon: '💳' },
  order_placed:                 { label: 'Order Placed',             color: '#14b8a6', icon: '🛒' },
  grn_pending:                  { label: 'GRN / QC Pending',         color: '#f59e0b', icon: '📦' },
  qc_passed:                    { label: 'QC Passed',                color: '#22c55e', icon: '✔️'  },
  payment_requested:            { label: 'Payment Requested',        color: '#8b5cf6', icon: '💰' },
  payment_raised_to_accounts:   { label: 'Payment Raised',           color: '#8b5cf6', icon: '📤' },
  payment_received:             { label: 'Payment Received',         color: '#22c55e', icon: '✅' },
  accepted:                     { label: 'Accepted & Closed',        color: '#22c55e', icon: '✔️'  },
  rejected:                     { label: 'Rejected & Closed',        color: '#ef4444', icon: '✖️' },
  pending_decline_approval:     { label: 'Pending Decline Approval', color: '#f59e0b', icon: '⚠️' },
  declined:                     { label: 'Declined',                 color: '#ef4444', icon: '🚫' }
};

const ORDER_TYPES = {
  repeat:       'Repeat Order (Previously Requested)',
  custom:       'Custom Order (Vendor Customization)',
  modification: 'Modification Request (Change to Previous)',
  inventory:    'Inventory Item (Available in Inventory)'
};

const DEPARTMENTS = { mech: 'Mechanical', id: 'Industrial Design', electronics: 'Electronics' };

// Ordered for workflow timeline
const PHASE_ORDER = [
  'submitted',
  'pending_initial_pm_approval',
  'procurement_active',
  'quotations_shared',
  'pending_pm_final_approval',
  'approved',
  'advance_raised_to_accounts',
  'advance_payment_received',
  'order_placed',
  'grn_pending',
  'qc_passed',
  'payment_raised_to_accounts',
  'payment_received',
  'accepted'
];

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

// Short-name aliases used throughout the app
const fmtDate = formatDate;
const fmtDateTime = formatDateTime;

function getPhaseBadge(phase) {
  const p = PHASES[phase] || { label: phase, color: '#6b7280', icon: '•' };
  return `<span class="phase-badge" style="background:${p.color}18;color:${p.color};border:1px solid ${p.color}35">${p.icon} ${p.label}</span>`;
}

function starRating(rating, count) {
  const r = Math.round(rating * 2) / 2;
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= r) stars += `<span style="color:#f59e0b;font-size:0.85rem">★</span>`;
    else if (i - 0.5 === r) stars += `<span style="color:#f59e0b;font-size:0.85rem">⯨</span>`;
    else stars += `<span style="color:#d1d5db;font-size:0.85rem">★</span>`;
  }
  return `<span style="display:inline-flex;align-items:center;gap:3px">${stars} <span style="font-family:var(--font-mono);font-size:0.72rem;color:var(--gray-4)">(${count})</span></span>`;
}

// File → Supabase Storage upload helper.
// Uploads to the 'attachments' bucket and returns {name, type, url}.
// Use this instead of fileToBase64() for anything saved into the DB —
// base64 in a jsonb/text column is what bloated procurement_requests to
// ~51MB (attachments + both approval screenshots) on a handful of rows.
async function uploadFileToStorage(file, folder) {
  if (file.size > 5 * 1024 * 1024) throw new Error('File too large. Max 5MB.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${folder}/${Date.now()}_${safeName}`;
  const { error: uploadErr } = await db.storage
    .from('attachments')
    .upload(path, file, { contentType: file.type });
  if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message);
  const { data: urlData } = db.storage.from('attachments').getPublicUrl(path);
  return { name: file.name, type: file.type, url: urlData?.publicUrl };
}

// Column list for LIST/dashboard views of procurement_requests.
// Excludes attachments, client_approval_screenshot, pm_approval_screenshot —
// these can carry multi-MB base64 blobs (legacy rows) or growing Storage-URL
// arrays, and are only ever read off a single fetched PR in detail modals,
// never off list rows. Use select('*') only for single-PR detail queries
// (.eq('id', id).single()).
const PR_LIST_COLUMNS = 'id,request_number,request_category,project_name,project_phase,project_manager_name,team_member_name,department,order_type,vendor_suggestion,description,phase,initial_pm_approval,assigned_vendor_id,selected_quotation_id,client_approval_notes,pm_final_approval_status,pm_final_approval_notes,rejection_reason,needs_more_vendors,qc_result,qc_notes,order_notes,created_by,created_at,updated_at,approval_path,assigned_pm_id,vendor_info_details,is_modification,parent_request_id,modification_note,parts,product_link,sourcing,qc_criteria,advance_option,phase_timestamps,quote_eta,last_reminder_sent_at,last_reminder_phase';

// File → base64 helper
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 5 * 1024 * 1024) { reject(new Error('File too large. Max 5MB.')); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function getFileType(file) {
  if (!file) return 'url';
  const t = file.type;
  if (t === 'image/png') return 'image/png';
  if (t === 'image/jpeg' || t === 'image/jpg') return 'image/jpeg';
  if (t === 'application/pdf') return 'application/pdf';
  return 'url';
}