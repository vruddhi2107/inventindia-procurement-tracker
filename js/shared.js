// ============================================================
// SHARED UTILITIES — used across all dashboard pages
// ============================================================

function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✓', error: '✗', info: 'ℹ' };
  t.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function showLoader(show) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.toggle('active', show);
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add('active'); document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.remove('active'); document.body.style.overflow = ''; }
}

function initNavbar(user) {
  const nameEl = document.getElementById('navUserName');
  const deptEl = document.getElementById('navUserDept');
  const avatarEl = document.getElementById('navUserAvatar');
  const roleEl = document.getElementById('navRoleBadge');

  if (nameEl) nameEl.textContent = user.name;
  if (deptEl) deptEl.textContent = user.department ? DEPARTMENTS[user.department] : roleLabel(user.role);
  if (avatarEl) avatarEl.textContent = user.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
  if (roleEl) roleEl.textContent = roleLabel(user.role);
}

function roleLabel(role) {
  return { master: 'Master Admin', procurement_manager: 'Procurement Manager', engineer: 'Engineer', project_manager: 'Project Manager' }[role] || role;
}

function logout() {
  Session.clear();
  window.location.href = '../index.html';
}

// Workflow steps for the timeline
const WORKFLOW_STEPS = [
  { key: 'submitted',               label: 'Submitted' },
  { key: 'quotation_attached',      label: 'Quotation' },
  { key: 'engineer_review',         label: 'Review' },
  { key: 'pending_client_approval', label: 'Approval' },
  { key: 'approved',                label: 'Approved' },
  { key: 'order_placed',            label: 'Ordered' },
  { key: 'grn_pending',             label: 'GRN' },
  { key: 'accepted',                label: 'Closed' },
];

const PHASE_ORDER = ['submitted','quotation_attached','engineer_review','pending_client_approval','pending_pm_approval','approved','order_placed','grn_pending','accepted','rejected'];

function renderWorkflowTrack(currentPhase) {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);
  const closed = currentPhase === 'accepted' || currentPhase === 'rejected';

  return `<div class="workflow-track">` +
    WORKFLOW_STEPS.map((step, i) => {
      const stepIdx = PHASE_ORDER.indexOf(step.key);
      let cls = '';
      if (currentPhase === step.key) cls = 'current';
      else if (closed && i === WORKFLOW_STEPS.length - 1) cls = 'done';
      else if (stepIdx < currentIdx) cls = 'done';
      return `<div class="wf-step ${cls}">
        <div class="wf-node">${cls === 'done' ? '✓' : i + 1}</div>
        <div class="wf-label">${step.label}</div>
      </div>`;
    }).join('') + `</div>`;
}

async function loadComments(prId) {
  const { data } = await db.from('pr_comments')
    .select('*, users(name)')
    .eq('pr_id', prId)
    .order('created_at', { ascending: true });
  return data || [];
}

function renderComments(comments) {
  if (!comments.length) return '<p style="color:var(--gray-4);font-size:0.83rem;text-align:center;padding:16px 0;">No comments yet.</p>';
  return `<div class="comment-list">${comments.map(c => `
    <div class="comment-item">
      <div class="comment-avatar">${(c.users?.name || '?').split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
      <div class="comment-bubble">
        <div class="comment-meta">${c.users?.name || 'Unknown'} · ${formatDate(c.created_at)}</div>
        <div class="comment-text">${c.comment}</div>
      </div>
    </div>`).join('')}</div>`;
}

async function postComment(prId, userId, text) {
  if (!text.trim()) return;
  const { error } = await db.from('pr_comments').insert({
    pr_id: prId, user_id: userId, comment: text.trim()
  });
  if (error) throw error;
}

function buildNavbar(user) {
  return `
  <nav class="navbar">
    <a class="nav-logo" href="#">
      <div class="nav-logo-mark">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="1" y="1" width="6" height="6" rx="1.5" fill="white" opacity="0.9"/>
          <rect x="10" y="1" width="6" height="6" rx="1.5" fill="white" opacity="0.5"/>
          <rect x="1" y="10" width="6" height="6" rx="1.5" fill="white" opacity="0.5"/>
          <rect x="10" y="10" width="6" height="6" rx="1.5" fill="white" opacity="0.9"/>
        </svg>
      </div>
      <div>
        <div class="nav-logo-text">Procure<span>Ops</span></div>
        <div style="font-size:0.6rem;font-family:var(--font-mono);color:var(--gray-4);letter-spacing:0.07em;text-transform:uppercase;">Management Portal</div>
      </div>
    </a>
    <div class="nav-spacer"></div>
    <span class="nav-role-badge" id="navRoleBadge"></span>
    <div class="nav-user">
      <div class="nav-user-avatar" id="navUserAvatar"></div>
      <div>
        <div class="nav-user-name" id="navUserName"></div>
        <div class="nav-user-dept" id="navUserDept"></div>
      </div>
    </div>
    <button class="btn-logout" onclick="logout()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      Logout
    </button>
  </nav>`;
}

function buildFooter() {
  return `
  <footer>
    <div class="footer-logo">
      <div class="footer-logo-mark">
        <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
          <rect x="1" y="1" width="6" height="6" rx="1.5" fill="white" opacity="0.9"/>
          <rect x="10" y="1" width="6" height="6" rx="1.5" fill="white" opacity="0.5"/>
          <rect x="1" y="10" width="6" height="6" rx="1.5" fill="white" opacity="0.5"/>
          <rect x="10" y="10" width="6" height="6" rx="1.5" fill="white" opacity="0.9"/>
        </svg>
      </div>
      <div class="footer-logo-text">Procure<span>Ops</span></div>
    </div>
    <div class="footer-copy">© ${new Date().getFullYear()} ProcureOps — Procurement Management System</div>
    <div class="footer-links">
      <a href="#">Support</a>
      <a href="#">Documentation</a>
      <a href="change-password.html">Change Password</a>
    </div>
  </footer>`;
}

// PR Detail HTML builder
function buildPRDetailHTML(pr) {
  return `
    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-key">Request Number</div>
        <div class="detail-value"><span class="pr-number">PR-${String(pr.request_number).padStart(4,'0')}</span></div>
      </div>
      <div class="detail-item">
        <div class="detail-key">Category</div>
        <div class="detail-value">${pr.request_category}</div>
      </div>
      <div class="detail-item">
        <div class="detail-key">Project Name</div>
        <div class="detail-value">${pr.project_name}</div>
      </div>
      <div class="detail-item">
        <div class="detail-key">Project Phase</div>
        <div class="detail-value">${pr.project_phase}</div>
      </div>
      <div class="detail-item">
        <div class="detail-key">Project Manager</div>
        <div class="detail-value">${pr.project_manager_name}</div>
      </div>
      <div class="detail-item">
        <div class="detail-key">Team Member</div>
        <div class="detail-value">${pr.team_member_name}</div>
      </div>
      <div class="detail-item">
        <div class="detail-key">Department</div>
        <div class="detail-value">${DEPARTMENTS[pr.department] || pr.department}</div>
      </div>
      <div class="detail-item">
        <div class="detail-key">Order Type</div>
        <div class="detail-value">${ORDER_TYPES[pr.order_type] || pr.order_type}</div>
      </div>
      <div class="detail-item">
        <div class="detail-key">Vendor Suggestion</div>
        <div class="detail-value">${pr.vendor_suggestion || '—'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-key">Submitted</div>
        <div class="detail-value">${formatDate(pr.created_at)}</div>
      </div>
      ${pr.description ? `<div class="detail-item" style="grid-column:1/-1">
        <div class="detail-key">Description</div>
        <div class="detail-value">${pr.description}</div>
      </div>` : ''}
    </div>
    <div style="margin-top:18px">${renderWorkflowTrack(pr.phase)}</div>
    ${pr.quotation_url ? `<div style="margin-top:12px;padding:12px;background:var(--off-white);border-radius:var(--radius);border:1px solid var(--border)">
      <div class="detail-key" style="margin-bottom:6px">Quotation</div>
      <a href="${pr.quotation_url}" target="_blank" class="btn btn-secondary btn-sm">📎 View Quotation</a>
      ${pr.quotation_notes ? `<p style="margin-top:8px;font-size:0.82rem;color:var(--gray-3)">${pr.quotation_notes}</p>` : ''}
    </div>` : ''}
    ${pr.approval_screenshot_url ? `<div style="margin-top:12px;padding:12px;background:var(--off-white);border-radius:var(--radius);border:1px solid var(--border)">
      <div class="detail-key" style="margin-bottom:6px">Client Approval Screenshot</div>
      <img src="${pr.approval_screenshot_url}" style="max-width:100%;border-radius:6px;border:1px solid var(--border)" onerror="this.style.display='none'"/>
    </div>` : ''}
    ${pr.rejection_reason ? `<div style="margin-top:12px;padding:12px;background:rgba(224,32,32,0.06);border-radius:var(--radius);border:1px solid rgba(224,32,32,0.2)">
      <div class="detail-key" style="margin-bottom:4px;color:var(--red)">Rejection Reason</div>
      <p style="font-size:0.85rem;">${pr.rejection_reason}</p>
    </div>` : ''}`;
}