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

// ── NAVBAR / FOOTER ─────────────────────────────────────────
function initNavbar(user) {
  const g=id=>document.getElementById(id);
  if(g('navUserName')) g('navUserName').textContent=user.name;
  if(g('navUserDept')) g('navUserDept').textContent=user.department?DEPARTMENTS[user.department]:roleLabel(user.role);
  if(g('navUserAvatar')) g('navUserAvatar').textContent=user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  if(g('navRoleBadge')) g('navRoleBadge').textContent=roleLabel(user.role);
}
function roleLabel(r){return{master:'Master Admin',procurement_manager:'Procurement',engineer:'Engineer',project_manager:'Project Manager'}[r]||r;}
function logout(){Session.clear();window.location.href='../index.html';}

function buildNavbar(user) {
  return `<nav class="navbar">
    <a class="nav-logo" href="#">
      <div class="nav-logo-mark"><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" fill="white" opacity="0.9"/><rect x="10" y="1" width="6" height="6" rx="1.5" fill="white" opacity="0.5"/><rect x="1" y="10" width="6" height="6" rx="1.5" fill="white" opacity="0.5"/><rect x="10" y="10" width="6" height="6" rx="1.5" fill="white" opacity="0.9"/></svg></div>
      <div><div class="nav-logo-text">Procure<span>Ops</span></div></div>
    </a>
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
  {key:'approved',label:'Approved'},
  {key:'order_placed',label:'Ordered'},
  {key:'grn_pending',label:'GRN/QC'},
  {key:'accepted',label:'Closed'}
];

function renderWorkflowTrack(phase) {
  const idx=PHASE_ORDER.indexOf(phase);
  const isRej=phase==='rejected', isAcc=phase==='accepted';
  return `<div class="workflow-track">${WF_STEPS.map((s,i)=>{
    const si=PHASE_ORDER.indexOf(s.key);
    let cls=isAcc?'done':phase===s.key?'current':si<idx?'done':'';
    return `<div class="wf-step ${cls}"><div class="wf-node">${cls==='done'?'✓':i+1}</div><div class="wf-label">${s.label}</div></div>`;
  }).join('')}${isRej?`<div class="wf-step current"><div class="wf-node" style="background:var(--red);border-color:var(--red);color:white">✗</div><div class="wf-label" style="color:var(--red)">Rejected</div></div>`:''}</div>`;
}

// ── PARTS TABLE RENDER (read-only for PR detail) ────────────
function renderPartsTable(parts) {
  if(!parts||!parts.length) return '';
  return `<div style="margin-top:14px">
    <div class="detail-key" style="margin-bottom:8px">Parts / Items</div>
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
      <div class="detail-item"><div class="detail-key">Vendor Suggestion</div><div class="detail-value">${pr.vendor_suggestion||'—'}</div></div>
      <div class="detail-item"><div class="detail-key">Assigned Vendor</div><div class="detail-value">${vendorName||'—'}</div></div>
      <div class="detail-item"><div class="detail-key">PM Approval</div><div class="detail-value">${pr.initial_pm_approval==='already_approved'?'<span style="color:#16a34a">✓ Had approval</span>':pr.initial_pm_approval==='needs_approval'?'Requested clearance':'—'}</div></div>
      <div class="detail-item"><div class="detail-key">Submitted</div><div class="detail-value">${fmtDate(pr.created_at)}</div></div>
      ${pr.description?`<div class="detail-item" style="grid-column:1/-1"><div class="detail-key">Description / Notes</div><div class="detail-value" style="line-height:1.5">${pr.description}</div></div>`:''}
      ${pr.modification_note?`<div class="detail-item" style="grid-column:1/-1"><div class="detail-key" style="color:#6366f1">Modification Note</div><div class="detail-value">${pr.modification_note}</div></div>`:''}
    </div>

    ${renderPartsTable(parts)}
    <div style="margin-top:16px">${renderWorkflowTrack(pr.phase)}</div>

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

    ${pr.qc_notes?`<div style="margin-top:14px;padding:12px;background:${pr.qc_result==='accepted'?'rgba(22,163,74,0.06)':'rgba(214,43,43,0.06)'};border:1px solid ${pr.qc_result==='accepted'?'rgba(22,163,74,0.2)':'rgba(214,43,43,0.2)'};border-radius:var(--radius)">
      <div class="detail-key" style="color:${pr.qc_result==='accepted'?'#16a34a':'var(--red)'};margin-bottom:4px">QC — ${pr.qc_result==='accepted'?'Passed':'Failed'}</div>
      <p style="font-size:0.83rem">${pr.qc_notes}</p>
    </div>`:''}`;
}

// ── QUOTATION CARD ──────────────────────────────────────────
function renderQuotationCard(q, showSelectBtn=false, selectedId=null) {
  const isSelected = q.id===selectedId||q.is_selected;
  const isImg = q.file_type?.includes('image');
  const isPDF = q.file_type==='application/pdf';
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
        <div><div class="detail-key">Amount</div><div style="font-family:var(--font-mono);font-size:0.95rem;font-weight:700">${q.currency||'AED'} ${Number(q.amount).toLocaleString()}</div></div>
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

// ── VENDOR VIEW (shared by all roles) ──────────────────────
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
  grid.innerHTML=vendors.map(v=>`
    <div class="vendor-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:7px">
        <div><div class="vendor-name">${v.name}</div><div class="vendor-spec">${v.specialization||'—'}</div></div>
        <span style="font-size:0.62rem;font-family:var(--font-mono);padding:2px 6px;border-radius:3px;white-space:nowrap;flex-shrink:0;${v.is_active?'background:rgba(5,150,105,0.08);color:#047857;border:1px solid rgba(5,150,105,0.2)':'background:var(--off-white);color:var(--gray-4);border:1px solid var(--border)'}">
          ${v.is_active?'Active':'Inactive'}
        </span>
      </div>
      <div style="margin-bottom:8px">${starRating(v.avg_rating,v.rating_count)}</div>
      <div style="display:flex;flex-direction:column;gap:2px;margin-bottom:9px">
        ${v.contact_person?`<div style="font-size:0.75rem;color:var(--gray-3)">👤 ${v.contact_person}</div>`:''}
        ${v.email?`<div style="font-size:0.75rem">✉ <a href="mailto:${v.email}" style="color:var(--red);text-decoration:none">${v.email}</a></div>`:''}
        ${v.phone?`<div style="font-size:0.75rem;color:var(--gray-3)">📞 ${v.phone}</div>`:''}
        ${v.address?`<div style="font-size:0.75rem;color:var(--gray-4)">📍 ${v.address}</div>`:''}
      </div>
      ${v.notes?`<p style="font-size:0.72rem;color:var(--gray-4);border-top:1px solid var(--border);padding-top:7px;margin-bottom:8px">${v.notes}</p>`:''}
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        ${canEdit?`
          <button class="btn btn-secondary btn-sm" onclick="editVendor('${v.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="toggleVendorActive('${v.id}',${v.is_active})">${v.is_active?'Deactivate':'Activate'}</button>
          ${v.assigned_vendor_id?'':''} 
          <button class="btn btn-ghost btn-sm" onclick="openVendorEnquiry(${JSON.stringify(v).split('"').join('&quot;')})">Enquire</button>
        `:`
          <button class="btn btn-secondary btn-sm" onclick="openVendorEnquiry(${JSON.stringify(v).split('"').join('&quot;')})">📬 Enquire</button>
        `}
      </div>
    </div>`).join('');
}

// Enquiry modal — shows vendor contact + notes box (for all roles)
function openVendorEnquiry(vendor) {
  // If vendor is passed as a string (from onclick attr), parse it
  if(typeof vendor === 'string') {
    try { vendor = JSON.parse(vendor.split('&quot;').join('"')); } catch(e) { return; }
  }
  // Create or reuse enquiry overlay
  let ov=document.getElementById('_vendorEnquiryModal');
  if(!ov){
    ov=document.createElement('div');
    ov.id='_vendorEnquiryModal';
    ov.className='modal-overlay';
    ov.onclick=e=>{if(e.target===ov)ov.classList.remove('active');};
    document.body.appendChild(ov);
  }
  ov.innerHTML=`<div class="modal" style="max-width:500px">
    <div class="modal-header">
      <div><div class="modal-title">${vendor.name}</div><div class="modal-title-sub">${vendor.specialization||'General Supplier'}</div></div>
      <button class="modal-close" onclick="document.getElementById('_vendorEnquiryModal').classList.remove('active')">✕</button>
    </div>
    <div class="modal-body">
      <div class="enquiry-contact-grid">
        <div>
          <div class="enquiry-contact-label">Contact Person</div>
          <div class="enquiry-contact-value">${vendor.contact_person||'—'}</div>
        </div>
        <div>
          <div class="enquiry-contact-label">Specialization</div>
          <div class="enquiry-contact-value">${vendor.specialization||'—'}</div>
        </div>
        <div>
          <div class="enquiry-contact-label">Email</div>
          <div class="enquiry-contact-value">${vendor.email?`<a href="mailto:${vendor.email}">${vendor.email}</a>`:'—'}</div>
        </div>
        <div>
          <div class="enquiry-contact-label">Phone</div>
          <div class="enquiry-contact-value">${vendor.phone||'—'}</div>
        </div>
        ${vendor.address?`<div style="grid-column:1/-1">
          <div class="enquiry-contact-label">Address</div>
          <div class="enquiry-contact-value">${vendor.address}</div>
        </div>`:''}
      </div>
      ${vendor.notes?`<div style="border-top:1px solid var(--border);padding-top:12px;margin-bottom:0">
        <div class="detail-key" style="margin-bottom:5px">Notes</div>
        <p style="font-size:0.8rem;color:var(--gray-3);line-height:1.5">${vendor.notes}</p>
      </div>`:''}
      <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:13px">
        <div class="detail-key" style="margin-bottom:5px">Rating</div>
        <div>${starRating(vendor.avg_rating,vendor.rating_count)}</div>
      </div>
      <div style="margin-top:14px;padding:10px 12px;background:rgba(200,40,26,0.05);border:1px solid rgba(200,40,26,0.14);border-radius:var(--radius);font-size:0.77rem;color:var(--gray-3)">
        💡 Use the contact details above to reach out directly. For RFQ requests, submit a procurement request — the procurement team will coordinate with this vendor.
      </div>
    </div>
    <div class="modal-footer">
      ${vendor.email?`<a href="mailto:${vendor.email}?subject=Enquiry%20from%20ProcureOps" class="btn btn-primary">✉ Send Email</a>`:''}
      <button class="btn btn-secondary" onclick="document.getElementById('_vendorEnquiryModal').classList.remove('active')">Close</button>
    </div>
  </div>`;
  ov.classList.add('active');
}

// ── COMMENTS ───────────────────────────────────────────────
async function loadComments(prId) {
  const{data}=await db.from('pr_comments').select('*,users(name)').eq('pr_id',prId).order('created_at');
  return data||[];
}
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
async function postComment(prId, userId, text) {
  if(!text?.trim()) return;
  const{error}=await db.from('pr_comments').insert({pr_id:prId,user_id:userId,comment:text.trim()});
  if(error) throw error;
}

// ── PARTS EDITOR (live form) ────────────────────────────────
// Manages parts array in memory; call getPartsFromEditor() to retrieve
let _partsEditorRows = [];

function initPartsEditor(containerId, initialParts=[]) {
  _partsEditorRows = initialParts.map((p,i)=>({...p,_id:i}));
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
    <td><button type="button" class="btn btn-danger btn-sm" style="padding:3px 7px" onclick="removePartsRow(${p._id??i},'${arguments[2]||''}')">✕</button></td>
  </tr>`;
}

function addPartsRow(containerId) {
  const id = Date.now();
  _partsEditorRows.push({_id:id, name:'', qty:1, spec:''});
  renderPartsEditor(containerId);
}

function removePartsRow(rowId, containerId) {
  _partsEditorRows = _partsEditorRows.filter(r=>r._id!==rowId);
  // Re-assign _id based on index to keep consistent
  renderPartsEditor(containerId||'partsEditorContainer');
}

function updatePartField(rowId, field, value) {
  const r = _partsEditorRows.find(r=>r._id===rowId);
  if(r) r[field] = value;
}

function changeQty(rowId, delta) {
  const r = _partsEditorRows.find(r=>r._id===rowId);
  if(!r) return;
  r.qty = Math.max(1, (r.qty||1)+delta);
  const input = document.querySelector(`#prow-${rowId} .qty-input`);
  if(input) input.value = r.qty;
}

function getPartsFromEditor() {
  // Sync any un-onchange'd values from DOM
  _partsEditorRows.forEach(r=>{
    const row = document.getElementById(`prow-${r._id}`);
    if(!row) return;
    const inputs = row.querySelectorAll('input');
    if(inputs[0]) r.name = inputs[0].value.trim();
    if(inputs[1]) r.qty = +inputs[1].value||1;
    if(inputs[2]) r.spec = inputs[2].value.trim();
  });
  return _partsEditorRows.filter(r=>r.name).map(({name,qty,spec})=>({name,qty:qty||1,spec:spec||''}));
}