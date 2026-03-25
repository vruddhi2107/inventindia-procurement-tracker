// ── DOUBLE-LOAD GUARD ───────────────────────────────────────
// Prevents SyntaxError if browser loads shared.js twice (e.g. caching + new file)
if (!window._procureSharedLoaded) {
window._procureSharedLoaded = true;

// ── TOAST / LOADER / MODAL ──────────────────────────────────
function showToast(msg, type='info') {
  const c=document.getElementById('toast-container'); if(!c)return;
  const t=document.createElement('div'); t.className=`toast ${type}`;
  t.innerHTML=`<span>${{success:'✓',error:'✗',info:'ℹ'}[type]||'ℹ'}</span><span>${msg}</span>`;
  c.appendChild(t); setTimeout(()=>t.remove(),4000);
}
function showLoader(s){ const e=document.getElementById('loadingOverlay'); if(e)e.classList.toggle('active',s); }
function openModal(id){ const m=document.getElementById(id); if(m){m.classList.add('active');document.body.style.overflow='hidden';} }
function closeModal(id){ const m=document.getElementById(id); if(m){m.classList.remove('active');document.body.style.overflow='';} }

// ── CONSTANTS ────────────────────────────────────────────────
// NOTE: DEPARTMENTS, ORDER_TYPES, PHASE_ORDER are defined in supabase-config.js
// Only define here what is NOT already in supabase-config.js
var CURRENCIES = typeof CURRENCIES !== 'undefined' ? CURRENCIES : ['AED','USD','EUR','GBP','INR','SAR','OMR','KWD','QAR','BHD'];
var SOURCING_OPTIONS = typeof SOURCING_OPTIONS !== 'undefined' ? SOURCING_OPTIONS : [{value:'domestic',label:'🏠 Domestic'},{value:'international',label:'🌍 International'}];
var PAYMENT_TERMS_OPTIONS = typeof PAYMENT_TERMS_OPTIONS !== 'undefined' ? PAYMENT_TERMS_OPTIONS : [
  {value:'50_50',label:'50% Advance — 50% Post Delivery'},
  {value:'full_advance',label:'100% Full Advance'},
  {value:'full_on_delivery',label:'100% On Delivery'},
  {value:'30_70',label:'30% Advance — 70% Post Delivery'},
  {value:'no_advance',label:'No Advance (Net 30/60/90)'},
  {value:'custom',label:'Custom Terms'}
];
// Extend PHASE_ORDER from supabase-config.js to include new phases
if (typeof PHASE_ORDER !== 'undefined' && !PHASE_ORDER.includes('qc_passed')) {
  PHASE_ORDER.splice(PHASE_ORDER.indexOf('accepted'), 0, 'qc_passed', 'payment_requested');
}
// Add advance_requested between approved and order_placed if not present
if (typeof PHASE_ORDER !== 'undefined' && !PHASE_ORDER.includes('advance_requested')) {
  PHASE_ORDER.splice(PHASE_ORDER.indexOf('order_placed'), 0, 'advance_requested');
}



function getPhaseBadge(phase){
  const map={
    submitted:['Submitted','badge-gray'],
    pending_initial_pm_approval:['PM Clearance','badge-orange'],
    procurement_active:['Procurement','badge-blue'],
    vendor_info_shared:['Vendor Info Shared','badge-purple'],
    quotations_shared:['Quotes Shared','badge-purple'],
    pending_pm_final_approval:['PM Approval','badge-orange'],
    approved:['Approved','badge-green'],
    order_placed:['Order Placed','badge-blue'],
    grn_pending:['GRN / QC','badge-orange'],
    qc_passed:['QC Passed','badge-green'],
    accepted:['Accepted & Closed','badge-green'],
    rejected:['Rejected','badge-red'],
    payment_requested:['Payment Requested','badge-purple'],
    advance_requested:['Advance Requested','badge-orange'],
    advance_approved:['Advance Approved','badge-green'],
    advance_rejected:['Advance Rejected','badge-red'],
  };
  const[label,cls]=map[phase]||[phase,'badge-gray'];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── NAVBAR / FOOTER ─────────────────────────────────────────
function initNavbar(user) {
  const g=id=>document.getElementById(id);
  if(g('navUserName')) g('navUserName').textContent=user.name;
  if(g('navUserDept')) g('navUserDept').textContent=user.department?DEPARTMENTS[user.department]:roleLabel(user.role);
  if(g('navUserAvatar')) g('navUserAvatar').textContent=user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  if(g('navRoleBadge')) g('navRoleBadge').textContent=roleLabel(user.role);
}
function roleLabel(r){return{master:'Master Admin',procurement_manager:'Procurement',engineer:'Engineer',project_manager:'Project Manager',accounts:'Accounts'}[r]||r;}
function logout(){Session.clear();window.location.href='../index.html';}

function buildNavbar(user) {
  const navLinks = {
    master: [
      {href:'master.html',label:'Dashboard'},
      {href:'projects.html',label:'Projects'},
      {href:'accounts.html',label:'Accounts'}
    ],
    project_manager: [
      {href:'pm.html',label:'My Requests'},
      {href:'projects.html',label:'Manage Projects'},
    ],
    procurement_manager: [
      {href:'procurement.html',label:'Procurement'},
    ],
    accounts: [
      {href:'accounts.html',label:'Payments'},
    ],
    engineer: [
      {href:'engineer.html',label:'My Requests'},
    ]
  };
  const links = navLinks[user.role]||[];
  return `<nav class="navbar">
    <a class="nav-logo" href="#">
      <div class="nav-logo-mark"><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" fill="white" opacity="0.9"/><rect x="10" y="1" width="6" height="6" rx="1.5" fill="white" opacity="0.5"/><rect x="1" y="10" width="6" height="6" rx="1.5" fill="white" opacity="0.5"/><rect x="10" y="10" width="6" height="6" rx="1.5" fill="white" opacity="0.9"/></svg></div>
      <div><div class="nav-logo-text">Procure<span>Ops</span></div></div>
    </a>
    <div class="nav-links" style="display:flex;gap:4px;margin-left:18px">
      ${links.map(l=>`<a href="${l.href}" class="nav-link ${window.location.pathname.includes(l.href)?'active':''}" style="font-size:0.78rem;padding:5px 12px;border-radius:5px;color:rgba(255,255,255,0.8);text-decoration:none;transition:background 0.15s;${window.location.pathname.includes(l.href)?'background:rgba(255,255,255,0.15);color:white':''}" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='${window.location.pathname.includes(l.href)?'rgba(255,255,255,0.15)':'transparent'}'">${l.label}</a>`).join('')}
    </div>
    <div class="nav-spacer"></div>
    <span class="nav-role-badge" id="navRoleBadge"></span>
    <div class="nav-user">
      <div class="nav-user-avatar" id="navUserAvatar"></div>
      <div><div class="nav-user-name" id="navUserName"></div><div class="nav-user-dept" id="navUserDept"></div></div>
    </div>
    <button class="btn-logout" onclick="logout()">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      Logout
    </button>
  </nav>`;
}

function buildFooter() {
  return `<footer>
    <div class="footer-logo">
      <div class="footer-logo-mark"><svg width="11" height="11" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" fill="white" opacity="0.9"/><rect x="10" y="1" width="6" height="6" rx="1.5" fill="white" opacity="0.5"/><rect x="1" y="10" width="6" height="6" rx="1.5" fill="white" opacity="0.5"/><rect x="10" y="10" width="6" height="6" rx="1.5" fill="white" opacity="0.9"/></svg></div>
      <div class="footer-logo-text">Procure<span>Ops</span></div>
    </div>
    <div class="footer-copy">© ${new Date().getFullYear()} ProcureOps</div>
    <div class="footer-links"><a href="#">Support</a><a href="#">Docs</a><a href="change-password.html">Change Password</a></div>
  </footer>`;
}

// ── WORKFLOW TRACK ──────────────────────────────────────────
const WF_STEPS = [
  {key:'submitted',label:'Submitted'},
  {key:'pending_initial_pm_approval',label:'PM Clearance'},
  {key:'procurement_active',label:'Procurement'},
  {key:'quotations_shared',label:'Quotations'},
  {key:'pending_pm_final_approval',label:'PM Approval'},
  {key:'approved',label:'PM Approved'},
  {key:'advance_requested',label:'Advance Pay'},
  {key:'order_placed',label:'Ordered'},
  {key:'grn_pending',label:'GRN/QC'},
  {key:'qc_passed',label:'QC Passed'},
  {key:'payment_requested',label:'Payment'}
];

function renderWorkflowTrack(phase) {
  const phaseToStep = {
    'advance_approved': 'advance_requested',
    'advance_rejected': 'advance_requested'
  };
  const effectivePhase = phaseToStep[phase] || phase;
  const idx=PHASE_ORDER.indexOf(effectivePhase);
  const isRej=phase==='rejected';
  const isAdvRej=phase==='advance_rejected';
  const isAdvApp=phase==='advance_approved';
  return `<div class="workflow-track">${WF_STEPS.map((s,i)=>{
    const si=PHASE_ORDER.indexOf(s.key);
    const isCurrent=effectivePhase===s.key;
    let cls=isCurrent?'current':si<idx?'done':'';
    const isAdvNode=isCurrent&&s.key==='advance_requested';
    let nodeStyle='', labelStyle='', nodeContent=cls==='done'?'✓':i+1, nodeLabel=s.label;
    if(isAdvNode&&isAdvRej){nodeStyle='style="background:var(--red);border-color:var(--red);color:white"';labelStyle='style="color:var(--red)"';nodeContent='✗';nodeLabel='Adv Rejected';}
    if(isAdvNode&&isAdvApp){nodeStyle='style="background:#16a34a;border-color:#16a34a;color:white"';labelStyle='style="color:#16a34a"';nodeContent='✓';nodeLabel='Adv Approved';}
    return `<div class="wf-step ${cls}"><div class="wf-node" ${nodeStyle}>${nodeContent}</div><div class="wf-label" ${labelStyle}>${nodeLabel}</div></div>`;
  }).join('')}${isRej?`<div class="wf-step current"><div class="wf-node" style="background:var(--red);border-color:var(--red);color:white">✗</div><div class="wf-label" style="color:var(--red)">Rejected</div></div>`:''}</div>`;
}

// ── PARTS TABLE RENDER (read-only) ──────────────────────────
function renderPartsTable(parts) {
  if(!parts||!parts.length) return '';
  return `<div style="margin-top:14px">
    <div class="detail-key" style="margin-bottom:8px">Parts / Items (BOM)</div>
    <div style="overflow-x:auto">
    <table class="parts-table">
      <thead><tr><th style="width:28px">#</th><th>Part Name</th><th style="width:80px">Qty</th><th>Specification</th></tr></thead>
      <tbody>${parts.map((p,i)=>`<tr><td style="color:var(--gray-4);text-align:center;font-family:var(--font-mono);font-size:0.72rem">${i+1}</td>
        <td>${p.name||'—'}</td>
        <td style="text-align:center;font-family:var(--font-mono)">${p.qty||0}</td>
        <td style="color:var(--gray-3)">${p.spec||'—'}</td></tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
}

// ── PR DETAIL HTML ──────────────────────────────────────────
function buildPRDetailHTML(pr, quotations=[], vendorName='', pmName='') {
  const parts = pr.parts||[];
  return `
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-key">Request #</div>
        <div class="detail-value"><span class="pr-number${pr.is_modification?' modified':''}">PR-${String(pr.request_number).padStart(4,'0')}</span>
        ${pr.is_modification?`<span class="mod-badge" style="margin-left:6px">↺ Modified</span>`:''}
        </div></div>
      <div class="detail-item"><div class="detail-key">Category</div><div class="detail-value">${pr.request_category==='vendor_info'?'Vendor Info Request':'RFQ'}</div></div>
      <div class="detail-item"><div class="detail-key">Project</div><div class="detail-value">${pr.project_name}</div></div>
      <div class="detail-item"><div class="detail-key">Phase</div><div class="detail-value">${pr.project_phase}</div></div>
      <div class="detail-item"><div class="detail-key">Project Manager</div><div class="detail-value">${pmName||pr.project_manager_name||'—'}</div></div>
      <div class="detail-item"><div class="detail-key">Team Member</div><div class="detail-value">${pr.team_member_name}</div></div>
      <div class="detail-item"><div class="detail-key">Department</div><div class="detail-value">${DEPARTMENTS[pr.department]||pr.department}</div></div>
      ${pr.order_type?`<div class="detail-item"><div class="detail-key">Order Type</div><div class="detail-value">${ORDER_TYPES[pr.order_type]||pr.order_type}</div></div>`:''}
      ${pr.product_link?`<div class="detail-item"><div class="detail-key">Product Link</div><div class="detail-value"><a href="${pr.product_link}" target="_blank" style="color:var(--red)">🔗 View Product</a></div></div>`:''}
      ${pr.sourcing?`<div class="detail-item"><div class="detail-key">Sourcing</div><div class="detail-value">${(Array.isArray(pr.sourcing)?pr.sourcing:JSON.parse(pr.sourcing||'[]')).map(s=>s==='domestic'?'🏠 Domestic':'🌍 International').join(', ')}</div></div>`:''}
      <div class="detail-item"><div class="detail-key">Assigned Vendor</div><div class="detail-value">${vendorName||'—'}</div></div>
      <div class="detail-item"><div class="detail-key">Submitted</div><div class="detail-value">${fmtDate(pr.created_at)}</div></div>
      ${pr.description?`<div class="detail-item" style="grid-column:1/-1"><div class="detail-key">Description / Notes</div><div class="detail-value" style="line-height:1.5">${pr.description}</div></div>`:''}
      ${pr.modification_note?`<div class="detail-item" style="grid-column:1/-1"><div class="detail-key" style="color:#6366f1">Modification Note</div><div class="detail-value">${pr.modification_note}</div></div>`:''}
    </div>

    ${pr.qc_criteria&&(pr.qc_criteria.preferred_color||pr.qc_criteria.preferred_material||pr.qc_criteria.custom)?`
    <div style="margin-top:14px;padding:12px 14px;background:rgba(99,102,241,0.05);border:1px solid rgba(99,102,241,0.18);border-radius:var(--radius)">
      <div class="detail-key" style="color:#6366f1;margin-bottom:8px">🔍 QC Criteria</div>
      <div class="detail-grid" style="gap:8px">
        ${pr.qc_criteria.preferred_color?`<div class="detail-item"><div class="detail-key">Preferred Color</div><div class="detail-value">${pr.qc_criteria.preferred_color}</div></div>`:''}
        ${pr.qc_criteria.preferred_material?`<div class="detail-item"><div class="detail-key">Preferred Material</div><div class="detail-value">${pr.qc_criteria.preferred_material}</div></div>`:''}
        ${pr.qc_criteria.custom?`<div class="detail-item" style="grid-column:1/-1"><div class="detail-key">Additional Criteria</div><div class="detail-value">${pr.qc_criteria.custom}</div></div>`:''}
      </div>
    </div>`:''}

    ${renderPartsTable(parts)}
    <div style="margin-top:16px">${renderWorkflowTrack(pr.phase)}</div>

    ${(pr.phase==='advance_requested'||pr.phase==='advance_approved'||pr.phase==='advance_rejected')?`<div style="margin-top:14px;padding:12px 14px;background:${pr.phase==='advance_approved'?'rgba(22,163,74,0.06)':pr.phase==='advance_rejected'?'rgba(214,43,43,0.06)':'rgba(245,158,11,0.06)'};border:1px solid ${pr.phase==='advance_approved'?'rgba(22,163,74,0.25)':pr.phase==='advance_rejected'?'rgba(214,43,43,0.25)':'rgba(245,158,11,0.25)'};border-radius:var(--radius)">
      <div class="detail-key" style="color:${pr.phase==='advance_approved'?'#16a34a':pr.phase==='advance_rejected'?'var(--red)':'#b45309'};margin-bottom:6px">
        ${{advance_approved:'✅ Advance Payment Approved',advance_rejected:'❌ Advance Payment Rejected',advance_requested:'⏳ Advance Payment Pending'}[pr.phase]||'💳 Advance Payment'}
      </div>
    </div>`:''}
    ${quotations.length?`<div style="margin-top:14px">
      <div class="detail-key" style="margin-bottom:8px">Quotations (${quotations.length})</div>
      <div style="display:flex;flex-direction:column;gap:8px">${quotations.map(q=>renderQuotationCard(q,false,pr.selected_quotation_id)).join('')}</div>
    </div>`:''}

    ${pr.vendor_info_details?`<div style="margin-top:14px;padding:14px;background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.2);border-radius:var(--radius)">
      <div class="detail-key" style="color:#7c3aed;margin-bottom:6px">🏢 Vendor Information (from Procurement)</div>
      <p style="font-size:0.83rem;line-height:1.5;white-space:pre-wrap">${pr.vendor_info_details}</p>
    </div>`:''}

    ${pr.client_approval_screenshot?`<div style="margin-top:14px;padding:12px;background:rgba(22,163,74,0.06);border:1px solid rgba(22,163,74,0.2);border-radius:var(--radius)">
      <div class="detail-key" style="color:#16a34a;margin-bottom:6px">✓ Client Approval</div>
      <img src="${pr.client_approval_screenshot}" style="max-width:100%;max-height:240px;object-fit:contain;border-radius:6px;border:1px solid var(--border)" onerror="this.style.display='none'"/>
      ${pr.client_approval_notes?`<p style="font-size:0.8rem;color:var(--gray-3);margin-top:6px">${pr.client_approval_notes}</p>`:''}
    </div>`:''}

    ${pr.pm_final_approval_notes?`<div style="margin-top:14px;padding:12px;background:${pr.pm_final_approval_status==='approved'?'rgba(22,163,74,0.06)':'rgba(214,43,43,0.06)'};border:1px solid ${pr.pm_final_approval_status==='approved'?'rgba(22,163,74,0.2)':'rgba(214,43,43,0.2)'};border-radius:var(--radius)">
      <div class="detail-key" style="color:${pr.pm_final_approval_status==='approved'?'#16a34a':'var(--red)'};margin-bottom:4px">PM ${pr.pm_final_approval_status==='approved'?'Approved':'Rejected'}</div>
      <p style="font-size:0.83rem">${pr.pm_final_approval_notes}</p>
    </div>`:''}

    ${pr.rejection_reason?`<div style="margin-top:14px;padding:12px;background:rgba(214,43,43,0.06);border:1px solid rgba(214,43,43,0.18);border-radius:var(--radius)">
      <div class="detail-key" style="color:var(--red);margin-bottom:4px">Rejection Reason</div>
      <p style="font-size:0.83rem">${pr.rejection_reason}</p>
    </div>`:''}

    ${pr.qc_notes?`<div style="margin-top:14px;padding:12px;background:${pr.qc_result==='qc_passed'||pr.qc_result==='accepted'?'rgba(22,163,74,0.06)':'rgba(214,43,43,0.06)'};border:1px solid ${pr.qc_result==='qc_passed'||pr.qc_result==='accepted'?'rgba(22,163,74,0.2)':'rgba(214,43,43,0.2)'};border-radius:var(--radius)">
      <div class="detail-key" style="color:${pr.qc_result==='qc_passed'||pr.qc_result==='accepted'?'#16a34a':'var(--red)'};margin-bottom:4px">QC — ${pr.qc_result==='qc_passed'||pr.qc_result==='accepted'?'Passed ✓':'Failed ✗'}</div>
      <p style="font-size:0.83rem">${pr.qc_notes}</p>
    </div>`:''}`;
}

// ── QUOTATION CARD ──────────────────────────────────────────
function renderQuotationCard(q, showSelectBtn=false, selectedId=null) {
  const isSelected = q.id===selectedId||q.is_selected;
  const isImg = q.file_type?.includes('image');
  const isPDF = q.file_type==='application/pdf';
  const currency = q.currency||'AED';
  return `<div class="quotation-card ${isSelected?'selected':''}" id="qcard-${q.id}">
    <div class="quotation-card-header">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
        <span style="font-size:1.1rem;flex-shrink:0">${isPDF?'📄':isImg?'🖼️':'🔗'}</span>
        <div style="min-width:0">
          <div style="font-weight:600;font-size:0.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${q.file_name}</div>
          <div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--gray-4)">${q.vendor_name||'—'} · ${fmtDate(q.created_at)}</div>
        </div>
      </div>
      ${isSelected?`<span style="background:#22c55e14;color:#16a34a;border:1px solid #22c55e30;padding:2px 8px;border-radius:3px;font-family:var(--font-mono);font-size:0.62rem;font-weight:600;white-space:nowrap">✓ SELECTED</span>`:''}
    </div>
    <div class="quotation-card-body">
      ${q.amount?`<div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:8px">
        <div><div class="detail-key">Amount</div><div style="font-family:var(--font-mono);font-size:0.95rem;font-weight:700">${currency} ${Number(q.amount).toLocaleString()}</div></div>
        ${q.lead_time_days?`<div><div class="detail-key">Lead Time</div><div style="font-family:var(--font-mono);font-weight:600">${q.lead_time_days}d</div></div>`:''}
      </div>`:''}
      ${q.notes?`<p style="font-size:0.78rem;color:var(--gray-3);margin-bottom:8px">${q.notes}</p>`:''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${isImg?`<button class="btn btn-secondary btn-sm" onclick="previewImage('${q.file_url}','${q.file_name}')">👁 Preview</button>`:''}
        <a href="${q.file_url}" target="_blank" download="${q.file_name}" class="btn btn-secondary btn-sm">⬇ Download</a>
        ${showSelectBtn&&!isSelected?`<button class="btn btn-primary btn-sm" onclick="selectQuotation('${q.id}')">✓ Select as Final</button>`:''}
        ${showSelectBtn&&isSelected?`<button class="btn btn-danger btn-sm" onclick="selectQuotation(null)">Deselect</button>`:''}
      </div>
    </div>
  </div>`;
}

function previewImage(url, name) {
  const o=document.createElement('div');
  o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;cursor:pointer';
  o.innerHTML=`<div style="max-width:90vw;max-height:85vh;overflow:auto;border-radius:10px;background:white;padding:3px"><img src="${url}" style="max-width:100%;display:block;border-radius:8px" alt="${name}"/></div>
    <button style="margin-top:14px;background:white;border:none;padding:8px 22px;border-radius:6px;font-weight:600;cursor:pointer" onclick="this.parentElement.remove()">✕ Close</button>`;
  o.onclick=e=>{if(e.target===o)o.remove();};
  document.body.appendChild(o);
}

// ── VENDOR VIEW ─────────────────────────────────────────────
async function loadAndRenderVendors(gridId, searchId) {
  const {data} = await db.from('vendors').select('*').order('name');
  const allVendors = data||[];
  renderVendorCards(allVendors, gridId);
  if(searchId) {
    document.getElementById(searchId)?.addEventListener('input', e=>{
      const s=e.target.value.toLowerCase();
      renderVendorCards(allVendors.filter(v=>!s||v.name.toLowerCase().includes(s)||(v.specialization||'').toLowerCase().includes(s)), gridId);
    });
  }
  return allVendors;
}

function renderVendorCards(vendors, gridId, canEdit=false) {
  const grid=document.getElementById(gridId);
  if(!grid) return;
  if(!vendors.length){grid.innerHTML=`<div style="grid-column:1/-1;color:var(--gray-4);padding:32px;text-align:center">No vendors found.</div>`;return;}
  grid.innerHTML=vendors.map(v=>{
    const pt = PAYMENT_TERMS_OPTIONS.find(p=>p.value===v.payment_terms);
    return `
    <div class="vendor-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:7px">
        <div><div class="vendor-name">${v.name}</div><div class="vendor-spec">${v.specialization||'—'}</div></div>
        <span style="font-size:0.62rem;font-family:var(--font-mono);padding:2px 6px;border-radius:3px;white-space:nowrap;flex-shrink:0;${v.is_active?'background:rgba(5,150,105,0.08);color:#047857;border:1px solid rgba(5,150,105,0.2)':'background:var(--off-white);color:var(--gray-4);border:1px solid var(--border)'}">
          ${v.is_active?'Active':'Inactive'}
        </span>
      </div>
      <div style="margin-bottom:6px">${starRating(v.avg_rating,v.rating_count)}</div>
      ${pt?`<div style="font-size:0.7rem;margin-bottom:8px;padding:3px 7px;background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.18);border-radius:3px;color:#6366f1">💳 ${pt.label}</div>`:''}
      <div style="display:flex;flex-direction:column;gap:2px;margin-bottom:9px">
        ${v.contact_person?`<div style="font-size:0.75rem;color:var(--gray-3)">👤 ${v.contact_person}</div>`:''}
        ${v.email?`<div style="font-size:0.75rem">✉ <a href="mailto:${v.email}" style="color:var(--red);text-decoration:none">${v.email}</a></div>`:''}
        ${v.phone?`<div style="font-size:0.75rem;color:var(--gray-3)">📞 ${v.phone}</div>`:''}
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        ${canEdit?`
          <button class="btn btn-secondary btn-sm" onclick="editVendor('${v.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="toggleVendorActive('${v.id}',${v.is_active})">${v.is_active?'Deactivate':'Activate'}</button>
          <button class="btn btn-ghost btn-sm" onclick="openVendorHistory('${v.id}')">📋 History</button>
        `:`
          <button class="btn btn-secondary btn-sm" onclick="openVendorEnquiry(${JSON.stringify(v).split('"').join('&quot;')})">📬 Enquire</button>
          <button class="btn btn-ghost btn-sm" onclick="openVendorHistory('${v.id}')">📋 History</button>
        `}
      </div>
    </div>`;
  }).join('');
}

// ── VENDOR HISTORY MODAL ─────────────────────────────────────
async function openVendorHistory(vendorId) {
  let ov=document.getElementById('_vendorHistoryModal');
  if(!ov){
    ov=document.createElement('div');ov.id='_vendorHistoryModal';ov.className='modal-overlay';
    ov.onclick=e=>{if(e.target===ov)ov.classList.remove('active');};
    document.body.appendChild(ov);
  }
  ov.innerHTML=`<div class="modal" style="max-width:960px"><div class="modal-header"><div class="modal-title">Vendor History</div><button class="modal-close" onclick="document.getElementById('_vendorHistoryModal').classList.remove('active')">✕</button></div><div class="modal-body" id="_vhBody"><div style="text-align:center;padding:24px;color:var(--gray-4)">Loading...</div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('_vendorHistoryModal').classList.remove('active')">Close</button></div></div>`;
  ov.classList.add('active');

  const [vendorRes, ratingsRes, ordersRes] = await Promise.all([
    db.from('vendors').select('*').eq('id',vendorId).single(),
    db.from('vendor_ratings').select('*,users(name),procurement_requests(project_name,request_number)').eq('vendor_id',vendorId).order('created_at',{ascending:false}),
    db.from('procurement_requests').select('*').eq('assigned_vendor_id',vendorId).order('created_at',{ascending:false})
  ]);

  const v = vendorRes.data||{};
  const ratings = ratingsRes.data||[];
  const orders = ordersRes.data||[];
  const pt = PAYMENT_TERMS_OPTIONS.find(p=>p.value===v.payment_terms);

  document.getElementById('_vhBody').innerHTML=`
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border)">
      <div style="width:48px;height:48px;border-radius:10px;background:var(--off-white);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:1.4rem">🏢</div>
      <div>
        <div style="font-weight:700;font-size:1rem">${v.name}</div>
        <div style="font-size:0.78rem;color:var(--gray-3)">${v.specialization||''}</div>
        <div style="margin-top:3px">${starRating(v.avg_rating,v.rating_count)}</div>
      </div>
      ${v.email?`<div style="font-size:0.76rem;color:var(--gray-3);margin-left:8px">${v.email}${v.phone?' · '+v.phone:''}</div>`:''}
      ${pt?`<div style="margin-left:auto;font-size:0.72rem;padding:4px 10px;background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.18);border-radius:5px;color:#6366f1;white-space:nowrap">💳 ${pt.label}</div>`:''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">
      <div>
        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--gray-4);margin-bottom:10px;display:flex;align-items:center;gap:6px">
          📦 Orders <span style="background:var(--off-white);border:1px solid var(--border);border-radius:10px;padding:1px 7px;font-size:0.68rem">${orders.length}</span>
        </div>
        ${orders.length?`<div style="display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto">
          ${orders.map(o=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--off-white);border:1px solid var(--border);border-radius:6px">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:0.78rem">PR-${String(o.request_number).padStart(4,'0')}</div>
              <div style="font-size:0.7rem;color:var(--gray-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.project_name}</div>
              <div style="font-size:0.65rem;color:var(--gray-4)">${fmtDate(o.created_at)}</div>
            </div>
            ${getPhaseBadge(o.phase)}
          </div>`).join('')}
        </div>`:`<div style="padding:20px;text-align:center;background:var(--off-white);border:1px solid var(--border);border-radius:6px"><div style="font-size:1.5rem;margin-bottom:4px">📭</div><p style="color:var(--gray-4);font-size:0.78rem">No orders yet</p></div>`}
      </div>
      <div>
        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--gray-4);margin-bottom:10px;display:flex;align-items:center;gap:6px">
          ⭐ Ratings <span style="background:var(--off-white);border:1px solid var(--border);border-radius:10px;padding:1px 7px;font-size:0.68rem">${ratings.length}</span>
        </div>
        ${ratings.length?`<div style="display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto">
          ${ratings.map(r=>`<div style="padding:9px 10px;background:var(--off-white);border:1px solid var(--border);border-radius:6px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:3px">
              <span style="color:#f59e0b;letter-spacing:1px;font-size:0.82rem">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
              <span style="font-size:0.65rem;color:var(--gray-4)">${fmtDate(r.created_at)}</span>
            </div>
            <div style="font-size:0.7rem;color:var(--gray-4);margin-bottom:3px">${r.users?.name||'Unknown'}${r.procurement_requests?.project_name?' · '+r.procurement_requests.project_name:''}</div>
            ${r.comment?`<p style="font-size:0.76rem;color:var(--gray-3);line-height:1.4">${r.comment}</p>`:'<p style="font-size:0.7rem;color:var(--gray-4);font-style:italic">No comment</p>'}
          </div>`).join('')}
        </div>`:`<div style="padding:20px;text-align:center;background:var(--off-white);border:1px solid var(--border);border-radius:6px"><div style="font-size:1.5rem;margin-bottom:4px">⭐</div><p style="color:var(--gray-4);font-size:0.78rem">No ratings yet</p></div>`}
      </div>
    </div>`;
}

// ── VENDOR ENQUIRY ───────────────────────────────────────────
function openVendorEnquiry(vendor) {
  if(typeof vendor === 'string') {
    try { vendor = JSON.parse(vendor.split('&quot;').join('"')); } catch(e) { return; }
  }
  let ov=document.getElementById('_vendorEnquiryModal');
  if(!ov){ov=document.createElement('div');ov.id='_vendorEnquiryModal';ov.className='modal-overlay';ov.onclick=e=>{if(e.target===ov)ov.classList.remove('active');};document.body.appendChild(ov);}
  const pt = PAYMENT_TERMS_OPTIONS.find(p=>p.value===vendor.payment_terms);
  ov.innerHTML=`<div class="modal" style="max-width:500px">
    <div class="modal-header"><div><div class="modal-title">${vendor.name}</div><div class="modal-title-sub">${vendor.specialization||'General Supplier'}</div></div><button class="modal-close" onclick="document.getElementById('_vendorEnquiryModal').classList.remove('active')">✕</button></div>
    <div class="modal-body">
      <div class="enquiry-contact-grid">
        <div><div class="enquiry-contact-label">Contact Person</div><div class="enquiry-contact-value">${vendor.contact_person||'—'}</div></div>
        <div><div class="enquiry-contact-label">Specialization</div><div class="enquiry-contact-value">${vendor.specialization||'—'}</div></div>
        <div><div class="enquiry-contact-label">Email</div><div class="enquiry-contact-value">${vendor.email?`<a href="mailto:${vendor.email}">${vendor.email}</a>`:'—'}</div></div>
        <div><div class="enquiry-contact-label">Phone</div><div class="enquiry-contact-value">${vendor.phone||'—'}</div></div>
        ${pt?`<div style="grid-column:1/-1"><div class="enquiry-contact-label">Payment Terms</div><div class="enquiry-contact-value" style="color:#6366f1">💳 ${pt.label}</div></div>`:''}
      </div>
      ${vendor.notes?`<div style="border-top:1px solid var(--border);padding-top:12px"><div class="detail-key" style="margin-bottom:5px">Notes</div><p style="font-size:0.8rem;color:var(--gray-3);line-height:1.5">${vendor.notes}</p></div>`:''}
      <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:13px"><div class="detail-key" style="margin-bottom:5px">Rating</div><div>${starRating(vendor.avg_rating,vendor.rating_count)}</div></div>
    </div>
    <div class="modal-footer">
      ${vendor.email?`<a href="mailto:${vendor.email}?subject=Enquiry%20from%20ProcureOps" class="btn btn-primary">✉ Send Email</a>`:''}
      <button class="btn btn-secondary" onclick="document.getElementById('_vendorEnquiryModal').classList.remove('active')">Close</button>
    </div>
  </div>`;
  ov.classList.add('active');
}

// ── COMMENTS ────────────────────────────────────────────────
window.loadComments = async function (prId) {
  const { data, error } = await db
    .from('pr_comments')
    .select('*,users(name)')
    .eq('pr_id', prId)
    .order('created_at');

  if (error) {
    console.error("Load comments error:", error);
    return [];
  }

  return data || [];
};

// FIX: expose postComment on window so all pages can access it reliably
window.postComment = async function(prId, userId, text) {
  if (!text?.trim()) return;
  const { error } = await db.from('pr_comments').insert({
    pr_id: prId,
    user_id: userId,
    comment: text.trim()
  });
  if (error) throw error;
};

function renderComments(comments) {
  if(!comments.length) return '<p style="color:var(--gray-4);font-size:0.78rem;text-align:center;padding:14px 0">No comments yet</p>';
  return `<div class="comment-list">${comments.map(c=>`
    <div class="comment-item">
      <div class="comment-avatar">${(c.users?.name||'?').split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
      <div class="comment-bubble">
        <div class="comment-meta">${c.users?.name||'Unknown'} · ${fmtDateTime(c.created_at)}</div>
        <div class="comment-text">${c.comment}</div>
      </div>
    </div>`).join('')}</div>`;
}

// ── BOM PARSER ───────────────────────────────────────────────
async function parseBOMFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isCSV = file.name.endsWith('.csv') || file.type === 'text/csv';

    if (isCSV) {
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const lines = text.split('\n').filter(l=>l.trim());
          if (lines.length < 2) { reject(new Error('CSV has no data rows')); return; }
          const header = lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/"/g,''));
          const nameIdx = header.findIndex(h=>h.includes('name')||h.includes('part')||h.includes('item')||h.includes('description'));
          const qtyIdx = header.findIndex(h=>h.includes('qty')||h.includes('quantity')||h.includes('count'));
          const specIdx = header.findIndex(h=>h.includes('spec')||h.includes('material')||h.includes('notes')||h.includes('description'));
          if (nameIdx === -1) { reject(new Error('Could not find name/part column in CSV')); return; }
          const parts = lines.slice(1).map(l=>{
            const cols = l.split(',').map(c=>c.trim().replace(/"/g,''));
            return { name: cols[nameIdx]||'', qty: parseInt(cols[qtyIdx]||'1')||1, spec: specIdx>=0?(cols[specIdx]||''):'' };
          }).filter(p=>p.name);
          resolve(parts);
        } catch(e) { reject(e); }
      };
      reader.readAsText(file);
    } else {
      reject(new Error('For XLSX files, please upload a CSV. Use File > Save As > CSV in Excel.'));
    }
  });
}

// ── PARTS EDITOR ─────────────────────────────────────────────
var _partsEditorRows = _partsEditorRows || [];
function initPartsEditor(containerId, initialParts=[]) {
  _partsEditorRows = initialParts.map((p,i)=>({...p,_id:p._id||i}));
  renderPartsEditor(containerId);
}
function renderPartsEditor(containerId) {
  const c=document.getElementById(containerId); if(!c) return;
  c.innerHTML=`
    <table class="parts-table" style="width:100%">
      <thead><tr><th style="width:28px">#</th><th>Part Name *</th><th style="width:90px">Qty *</th><th>Specification</th><th style="width:36px"></th></tr></thead>
      <tbody id="partsRows">${_partsEditorRows.map((p,i)=>partsRowHTML(i,p)).join('')}</tbody>
    </table>
    <button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px;border:1px dashed var(--border-strong)" onclick="addPartsRow('${containerId}')">+ Add Part</button>
  `;
}
function partsRowHTML(i, p={}) {
  return `<tr id="prow-${p._id??i}">
    <td style="color:var(--gray-4);text-align:center;font-family:var(--font-mono);font-size:0.72rem">${i+1}</td>
    <td><input type="text" class="parts-table" placeholder="e.g. M8 Bolt" value="${p.name||''}" onchange="updatePartField(${p._id??i},'name',this.value)" style="width:100%;border:none;outline:none;font-family:var(--font-body);font-size:0.82rem;padding:2px 4px;background:transparent"/></td>
    <td><div class="qty-cell">
      <button type="button" class="qty-btn" onclick="changeQty(${p._id??i},-1)">−</button>
      <input type="number" class="qty-input" value="${p.qty||1}" min="1" onchange="updatePartField(${p._id??i},'qty',+this.value||1)"/>
      <button type="button" class="qty-btn" onclick="changeQty(${p._id??i},1)">+</button>
    </div></td>
    <td><input type="text" placeholder="Dimensions, material, standard..." value="${p.spec||''}" onchange="updatePartField(${p._id??i},'spec',this.value)" style="width:100%;border:none;outline:none;font-family:var(--font-body);font-size:0.82rem;padding:2px 4px;background:transparent"/></td>
    <td><button type="button" class="btn btn-danger btn-sm" style="padding:3px 7px" onclick="removePartsRow(${p._id??i},'partsEditorContainer')">✕</button></td>
  </tr>`;
}
function addPartsRow(containerId) {
  const id=Date.now();
  _partsEditorRows.push({_id:id,name:'',qty:1,spec:''});
  renderPartsEditor(containerId);
}
function removePartsRow(rowId, containerId) {
  _partsEditorRows=_partsEditorRows.filter(r=>r._id!==rowId);
  renderPartsEditor(containerId||'partsEditorContainer');
}
function updatePartField(rowId, field, value) {
  const r=_partsEditorRows.find(r=>r._id===rowId); if(r) r[field]=value;
}
function changeQty(rowId, delta) {
  const r=_partsEditorRows.find(r=>r._id===rowId); if(!r) return;
  r.qty=Math.max(1,(r.qty||1)+delta);
  const input=document.querySelector(`#prow-${rowId} .qty-input`); if(input) input.value=r.qty;
}
function getPartsFromEditor() {
  _partsEditorRows.forEach(r=>{
    const row=document.getElementById(`prow-${r._id}`); if(!row) return;
    const inputs=row.querySelectorAll('input');
    if(inputs[0]) r.name=inputs[0].value.trim();
    if(inputs[1]) r.qty=+inputs[1].value||1;
    if(inputs[2]) r.spec=inputs[2].value.trim();
  });
  return _partsEditorRows.filter(r=>r.name).map(({name,qty,spec})=>({name,qty:qty||1,spec:spec||''}));
}

} // end _procureSharedLoaded guard