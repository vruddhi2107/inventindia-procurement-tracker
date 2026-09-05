// ══════════════════════════════════════════════════════════════
// po-groups.js — Part-Level PO Tracking
//
// Additive module. Nothing here is imported by legacy code paths.
// A request only enters this system when procurement_requests.is_legacy
// is explicitly false. All existing single-PO-per-request requests
// (is_legacy = true, the default) continue to use the untouched logic
// already in shared.js / procurement.html / engineer.html / pm.html /
// accounts.html exactly as it works today.
//
// Requires: js/supabase-config.js (global `db` client), js/shared.js
// (dbFetch, showToast, showLoader, fmtDate helpers) to be loaded first.
// ══════════════════════════════════════════════════════════════

const PO_GROUP_PHASES = [
  { key: 'quotation_pending', label: 'Quotation Pending', badge: 'badge-gray' },
  { key: 'quoted',            label: 'Engineer Review',   badge: 'badge-purple' },
  { key: 'pending_pm_approval', label: 'Pending PM Approval', badge: 'badge-orange' },
  { key: 'pm_approved',       label: 'PM Approved',       badge: 'badge-green' },
  { key: 'order_placed',      label: 'Order Placed',      badge: 'badge-blue' },
  { key: 'grn_pending',       label: 'GRN / QC',          badge: 'badge-orange' },
  { key: 'rework_pending',    label: 'Rework / Return',   badge: 'badge-red' },
  { key: 'qc_passed',         label: 'QC Passed',         badge: 'badge-green' },
  { key: 'payment_pending',   label: 'Payment Pending',   badge: 'badge-orange' },
  { key: 'closed',            label: 'Closed',            badge: 'badge-green' },
  { key: 'rejected',          label: 'Rejected',          badge: 'badge-red' },
  { key: 'declined',          label: 'Declined',          badge: 'badge-red' },
];
const PO_GROUP_TERMINAL = new Set(['closed', 'rejected', 'declined']);

function poGroupPhaseMeta(phase) {
  return PO_GROUP_PHASES.find(p => p.key === phase) || { key: phase, label: phase, badge: 'badge-gray' };
}

// Loaded once per page from po_phase_config (Master-Admin-editable).
// Falls back silently to the hardcoded PO_GROUP_PHASES defaults above if
// the table hasn't been seeded yet or the fetch fails — the app never
// breaks because of a missing admin config row.
async function loadPhaseConfigOverrides() {
  try {
    const rows = await dbFetch(
      () => db.from('po_phase_config').select('*').order('sort_order'),
      'phase config'
    );
    (rows || []).forEach(row => {
      const entry = PO_GROUP_PHASES.find(p => p.key === row.phase_key);
      if (entry) { entry.label = row.label; entry.badge = row.badge_class; }
    });
  } catch (e) {
    console.warn('[po-groups] phase config load failed, using defaults:', e.message);
  }
}
window.loadPhaseConfigOverrides = loadPhaseConfigOverrides;
// Fire on script load so every page picks up Master Admin's label/color
// choices without each page needing to remember to call it.
if (typeof db !== 'undefined') { loadPhaseConfigOverrides(); }

function poGroupPhaseBadgeHTML(phase) {
  const meta = poGroupPhaseMeta(phase);
  return `<span class="badge ${meta.badge}">${meta.label}</span>`;
}

function addPOGroupPhaseTimestamp(group, phase) {
  const ts = Object.assign({}, group.phase_timestamps || {});
  ts[phase] = new Date().toISOString();
  return ts;
}

// ── PART LINES ──────────────────────────────────────────────
// Explodes procurement_requests.parts[] into request_part_lines rows.
// Call once, right after a new-model request is created (or lazily the
// first time Procurement opens a new-model request that has no part
// lines yet).
async function ensurePartLinesExist(pr) {
  const existing = await dbFetch(
    () => db.from('request_part_lines').select('id').eq('pr_id', pr.id).limit(1),
    'part lines check'
  );
  if (existing && existing.length) return;

  const parts = pr.parts || [];
  if (!parts.length) return;

  const rows = parts.map((p, i) => ({
    pr_id: pr.id,
    part_index: i,
    name: p.name || `Part ${i + 1}`,
    qty: p.qty || 1,
    uom: p.uom || null,
    department: p.department || null,
    spec: p.spec || null,
    status: 'unassigned',
  }));
  const { error } = await db.from('request_part_lines').insert(rows);
  if (error) console.error('[po-groups] ensurePartLinesExist failed:', error.message);
}

async function fetchPartLines(prId) {
  return await dbFetch(
    () => db.from('request_part_lines').select('*').eq('pr_id', prId).order('part_index'),
    'part lines'
  );
}

async function fetchPOGroups(prId) {
  return await dbFetch(
    () => db.from('po_groups')
      .select('*, vendors(name)')
      .eq('pr_id', prId)
      .eq('current_version', true)
      .order('created_at'),
    'PO groups'
  );
}

// ── GROUPING: assign a set of ungrouped part lines to a new PO Group ──
async function createPOGroupFromParts(prId, partLineIds, vendorId, vendorLabel, createdBy) {
  if (!partLineIds || !partLineIds.length) {
    showToast('Select at least one part to group.', 'error');
    return null;
  }
  showLoader(true);
  try {
    const { data: group, error: gErr } = await db.from('po_groups').insert({
      pr_id: prId,
      group_label: vendorLabel || 'Vendor Group',
      vendor_id: vendorId || null,
      phase: 'quotation_pending',
      phase_timestamps: { quotation_pending: new Date().toISOString() },
      cycle_number: 1,
      current_version: true,
      created_by: createdBy || null,
    }).select().single();

    if (gErr) throw gErr;

    const { error: pErr } = await db.from('request_part_lines')
      .update({ po_group_id: group.id, status: 'grouped', updated_at: new Date().toISOString() })
      .in('id', partLineIds);
    if (pErr) throw pErr;

    showToast(`PO Group "${group.group_label}" created with ${partLineIds.length} part(s).`, 'success');
    return group;
  } catch (e) {
    console.error('[po-groups] createPOGroupFromParts failed:', e.message);
    showToast('Error creating PO Group: ' + e.message, 'error');
    return null;
  } finally {
    showLoader(false);
  }
}

async function ungroupPartLine(partLineId) {
  const { error } = await db.from('request_part_lines')
    .update({ po_group_id: null, status: 'unassigned', updated_at: new Date().toISOString() })
    .eq('id', partLineId);
  if (error) { showToast('Error: ' + error.message, 'error'); return false; }
  return true;
}

// ── RE-QUOTE CYCLE: version a PO Group instead of mutating it in place ──
// Creates a new po_groups row with cycle_number+1, snapshots the old one
// into po_group_versions, marks the old row current_version=false and
// points superseded_by_version_id at the new row's id. Part lines move
// to the new group id so the UI always resolves to the live version.
async function requoteCycle(oldGroup, reason, createdBy) {
  showLoader(true);
  try {
    const { data: newGroup, error: nErr } = await db.from('po_groups').insert({
      pr_id: oldGroup.pr_id,
      group_label: oldGroup.group_label,
      vendor_id: oldGroup.vendor_id,
      phase: 'quotation_pending',
      phase_timestamps: { quotation_pending: new Date().toISOString() },
      cycle_number: (oldGroup.cycle_number || 1) + 1,
      current_version: true,
      created_by: createdBy || null,
    }).select().single();
    if (nErr) throw nErr;

    const { error: vErr } = await db.from('po_group_versions').insert({
      po_group_id: oldGroup.id,
      version_number: oldGroup.cycle_number || 1,
      snapshot: oldGroup,
      reason: reason || null,
      created_by: createdBy || null,
    });
    if (vErr) throw vErr;

    const { error: uErr } = await db.from('po_groups')
      .update({ current_version: false, superseded_by_version_id: newGroup.id, updated_at: new Date().toISOString() })
      .eq('id', oldGroup.id);
    if (uErr) throw uErr;

    const { error: pErr } = await db.from('request_part_lines')
      .update({ po_group_id: newGroup.id, updated_at: new Date().toISOString() })
      .eq('po_group_id', oldGroup.id);
    if (pErr) throw pErr;

    showToast(`Re-quote cycle ${newGroup.cycle_number} started for "${newGroup.group_label}".`, 'success');
    return newGroup;
  } catch (e) {
    console.error('[po-groups] requoteCycle failed:', e.message);
    showToast('Error starting re-quote cycle: ' + e.message, 'error');
    return null;
  } finally {
    showLoader(false);
  }
}

// ── PHASE TRANSITIONS ───────────────────────────────────────
async function setPOGroupPhase(group, newPhase, extraFields) {
  const update = Object.assign({
    phase: newPhase,
    phase_timestamps: addPOGroupPhaseTimestamp(group, newPhase),
    updated_at: new Date().toISOString(),
  }, extraFields || {});
  const { error } = await db.from('po_groups').update(update).eq('id', group.id);
  if (error) { showToast('Error: ' + error.message, 'error'); return false; }
  return true;
}

// ── GRN / QC, scoped per PO Group ──────────────────────────
async function submitPOGroupGRN(poGroupId, grnData, createdBy) {
  showLoader(true);
  try {
    const { error: gErr } = await db.from('po_group_grn').insert(Object.assign({
      po_group_id: poGroupId,
      created_by: createdBy || null,
    }, grnData));
    if (gErr) throw gErr;

    const passed = grnData.qc_result === 'qc_passed';
    const { data: group } = await db.from('po_groups').select('*').eq('id', poGroupId).single();
    await setPOGroupPhase(group, passed ? 'qc_passed' : 'rework_pending');

    showToast(passed ? 'QC passed — GRN recorded.' : 'QC failed — PO Group moved to Rework/Return.', passed ? 'success' : 'error');
    return true;
  } catch (e) {
    console.error('[po-groups] submitPOGroupGRN failed:', e.message);
    showToast('Error submitting GRN: ' + e.message, 'error');
    return false;
  } finally {
    showLoader(false);
  }
}

// Vendor has reshipped after a rework/return — send back into GRN/QC.
async function resubmitAfterRework(group) {
  return await setPOGroupPhase(group, 'grn_pending');
}

// ── PAYMENTS, scoped per PO Group, with running-total support ─────────
// Phases where goods have already been received & QC'd. Only once a group
// is here does "fully paid" mean "safe to close" — an advance paid earlier
// (pm_approved / order_placed / grn_pending / rework_pending) must never
// auto-close a group whose goods haven't even arrived yet, no matter how
// large the advance amount is relative to the (often provisional) PO value
// entered at that point.
const PO_GROUP_POST_GOODS_PHASES = new Set(['qc_passed', 'payment_pending']);

async function recordPOGroupPayment(poGroupId, paymentType, amount, currency, poValue, raisedBy, smartsheetId, screenshot) {
  showLoader(true);
  try {
    const prior = await dbFetch(
      () => db.from('po_group_payments').select('amount').eq('po_group_id', poGroupId).eq('status', 'paid'),
      'prior payments'
    );
    const priorTotal = (prior || []).reduce((sum, r) => sum + (r.amount || 0), 0);
    const runningTotal = priorTotal + (amount || 0);

    // status is set straight to 'paid' — this flow has a single "Record
    // Payment" action (unlike the legacy raise-then-confirm flow), so the
    // row it creates already represents money paid. This also matters for
    // the prior-payments query above, which only counts status='paid' rows
    // toward the running total — leaving this as 'raised' meant every
    // group with more than one installment (advance + balance) never
    // accumulated a correct running total or closed itself.
    const { error } = await db.from('po_group_payments').insert({
      po_group_id: poGroupId,
      payment_type: paymentType,
      amount,
      currency: currency || 'INR',
      running_total_paid: runningTotal,
      po_value: poValue || null,
      status: 'paid',
      raised_by: raisedBy || null,
      raised_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
      smartsheet_payment_id: smartsheetId || null,
      screenshot: screenshot || null,
    });
    if (error) throw error;

    const { data: group } = await db.from('po_groups').select('*').eq('id', poGroupId).single();
    const isFullyPaid = poValue && runningTotal >= poValue;
    // Only let a payment move the group's phase once goods are in and QC'd.
    // An advance recorded at pm_approved/order_placed/grn_pending/rework_pending
    // is logged (and shows up in the group's Payments panel) but leaves the
    // phase — and the Place Order / GRN / rework actions still pending on
    // it — exactly where it was.
    if (PO_GROUP_POST_GOODS_PHASES.has(group.phase)) {
      await setPOGroupPhase(group, isFullyPaid ? 'closed' : 'payment_pending');
    }

    showToast(isFullyPaid && PO_GROUP_POST_GOODS_PHASES.has(group.phase) ? 'Payment recorded — PO Group closed.' : 'Payment recorded.', 'success');
    return true;
  } catch (e) {
    console.error('[po-groups] recordPOGroupPayment failed:', e.message);
    showToast('Error recording payment: ' + e.message, 'error');
    return false;
  } finally {
    showLoader(false);
  }
}

// ── ROLLUP DISPLAY HELPERS (client-side mirror of the SQL trigger,
//    used for instant UI feedback before the DB round-trips) ──────────
function computeRollupLabel(poGroups) {
  if (!poGroups || !poGroups.length) return { label: 'No PO Groups Yet', closed: false };
  const closedCount = poGroups.filter(g => PO_GROUP_TERMINAL.has(g.phase)).length;
  const total = poGroups.length;
  if (closedCount === total) return { label: 'Closed', closed: true };
  return { label: `${closedCount} of ${total} POs Closed`, closed: false };
}

// ── RENDER: PO Group chip strip for collapsed request-list rows ───────
function renderPOGroupChips(poGroups) {
  if (!poGroups || !poGroups.length) {
    return `<span style="font-size:0.72rem;color:var(--gray-4);font-style:italic">No parts grouped yet</span>`;
  }
  return poGroups.map(g => {
    const meta = poGroupPhaseMeta(g.phase);
    const vendorName = g.vendors?.name || g.group_label;
    return `<span class="badge ${meta.badge}" style="margin-right:4px;font-size:0.68rem" title="${g.group_label}">${vendorName}: ${meta.label}</span>`;
  }).join('');
}

// ── RENDER: one quotation card inside a PO Group (multi-quote, per-quote vendor) ──
// showSelectBtn=true renders the PM's "Select as Final" / "Deselect" toggle.
// selectedId is the client-side-tracked pick (falls back to is_selected from DB).
function renderPOGroupQuotationCard(groupId, q, showSelectBtn, selectedId) {
  const isSelected = showSelectBtn ? (q.id === selectedId) : !!q.is_selected;
  const isImg = q.file_type?.includes('image');
  const isPDF = q.file_type === 'application/pdf' || q.file_name?.toLowerCase().includes('.pdf');
  const currency = q.currency || 'INR';
  const fi = q.file_url ? _regFile(q.file_url, q.file_name || 'quotation') : null;
  return `<div class="quotation-card ${isSelected ? 'selected' : ''}" id="pogq-card-${q.id}" style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
        <span style="font-size:1.1rem;flex-shrink:0">${isPDF ? '📄' : isImg ? '🖼️' : '🔗'}</span>
        <div style="min-width:0">
          <div style="font-weight:600;font-size:0.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${q.vendor_name || 'Unnamed vendor'}</div>
          <div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--gray-4)">${q.file_name || 'No file'} · ${fmtDate(q.created_at)}</div>
        </div>
      </div>
      ${isSelected ? `<span style="background:#22c55e14;color:#16a34a;border:1px solid #22c55e30;padding:2px 8px;border-radius:3px;font-family:var(--font-mono);font-size:0.62rem;font-weight:600;white-space:nowrap">✓ SELECTED</span>` : ''}
    </div>
    ${q.amount ? `<div style="display:flex;gap:18px;flex-wrap:wrap;margin:8px 0">
      <div><div class="detail-key">Amount</div><div style="font-family:var(--font-mono);font-size:0.9rem;font-weight:700">${currency} ${Number(q.amount).toLocaleString()}</div></div>
      ${q.lead_time_days ? `<div><div class="detail-key">Lead Time</div><div style="font-family:var(--font-mono);font-weight:600">${q.lead_time_days}d</div></div>` : ''}
    </div>` : ''}
    ${q.notes ? `<p style="font-size:0.78rem;color:var(--gray-3);margin:6px 0">${q.notes}</p>` : ''}
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">
      ${fi !== null ? `<button class="btn btn-secondary btn-sm" onclick="_previewByIdx(${fi})">👁 Preview</button>
      <button class="btn btn-secondary btn-sm" onclick="_downloadByIdx(${fi})">⬇ Download</button>` : ''}
      ${showSelectBtn && !isSelected ? `<button class="btn btn-primary btn-sm" onclick="selectPOGroupQuotation('${groupId}','${q.id}')">✓ Select as Final</button>` : ''}
      ${showSelectBtn && isSelected ? `<button class="btn btn-danger btn-sm" onclick="selectPOGroupQuotation('${groupId}',null)">Deselect</button>` : ''}
    </div>
  </div>`;
}

// Client-side "which quote is PM currently pointing at" per group, keyed
// by group id — mirrors the legacy pmSelectedQuotationId pattern but
// scoped per-group since a request can have several PO Groups open in
// the same modal at once.
const _poGroupSelectedQuote = {};
function selectPOGroupQuotation(groupId, qId) {
  _poGroupSelectedQuote[groupId] = qId;
  const card = document.getElementById(`po-group-actions-${groupId}`);
  if (!card) return;
  card.querySelectorAll('.quotation-card').forEach(el => {
    const id = el.id.replace('pogq-card-', '');
    const isNow = id === qId;
    el.classList.toggle('selected', isNow);
  });
  // Re-render this group's action area so the badge + button states refresh cleanly.
  const group = (currentPOGroupsCache || []).find(g => g.id === groupId);
  const quotations = (currentPOGroupQuotationsCache || {})[groupId] || [];
  const partLines = currentPartLinesCache || [];
  if (group) renderPOGroupActions(group, partLines, quotations, currentVendorListCache || []);
}
window.selectPOGroupQuotation = selectPOGroupQuotation;

// ── ENGINEER VERIFICATION (mirrors legacy buildQuoteReview / selectApprovalPath) ──
// Client-side state for the in-progress engineer decision, keyed by group id.
const _poGroupEngineerPath = {};       // groupId -> 'client' | 'project_manager'
const _poGroupEngineerSelectedQuote = {}; // groupId -> quotation id (client path only)
const _poGroupEngineerScreenshot = {}; // groupId -> uploaded screenshot URL

function renderEngineerPOGroupReview(group, quotations) {
  const path = _poGroupEngineerPath[group.id] || null;
  const selectedQuoteId = _poGroupEngineerSelectedQuote[group.id] || null;
  const screenshotUrl = _poGroupEngineerScreenshot[group.id] || null;
  if (!quotations.length) {
    return `<div style="font-size:0.78rem;color:var(--gray-4)">No quotations on file for this group — ask Procurement to add one.</div>`;
  }
  return `
    <div class="detail-key" style="margin-bottom:8px">Quotations to Verify</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">${quotations.map(q => renderPOGroupQuotationCard(group.id, q, false)).join('')}</div>
    <div style="border-top:1px solid var(--border);padding-top:14px;margin-bottom:14px">
      <div class="form-label" style="margin-bottom:10px">Who should approve this? *</div>
      <div class="approval-options">
        <div class="approval-option ${path === 'client' ? 'selected' : ''}" id="pogPathClient-${group.id}" onclick="handleEngineerSelectPOGroupPath('${group.id}','client')">
          <div class="approval-option-icon">👤</div>
          <div class="approval-option-label">Client Approval</div>
          <div class="approval-option-sub">Select quote + attach client screenshot, then goes to PM</div>
        </div>
        <div class="approval-option ${path === 'project_manager' ? 'selected' : ''}" id="pogPathPM-${group.id}" onclick="handleEngineerSelectPOGroupPath('${group.id}','project_manager')">
          <div class="approval-option-icon">👔</div>
          <div class="approval-option-label">Project Manager</div>
          <div class="approval-option-sub">Forward directly — PM selects quote and approves</div>
        </div>
      </div>
    </div>
    <div id="pogClientFields-${group.id}" style="display:${path === 'client' ? 'block' : 'none'}">
      <div class="form-label" style="margin-bottom:8px">Select Final Quotation *</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">${quotations.map(q => renderPOGroupQuotationCard(group.id, q, true, selectedQuoteId)).join('')}</div>
      <div class="form-label" style="margin-bottom:6px">Client Approval Screenshot *</div>
      <div class="screenshot-zone" id="pogScreenshotZone-${group.id}" style="display:${screenshotUrl ? 'none' : 'block'}">
        <input type="file" id="pogScreenshotFile-${group.id}" accept="image/png,image/jpeg" onchange="handleEngineerPOGroupScreenshot(event,'${group.id}')"/>
        <div style="font-size:1.3rem;margin-bottom:4px">📷</div><div style="font-size:0.8rem;font-weight:600">Upload screenshot</div><div style="font-size:0.72rem;color:var(--gray-4)">PNG or JPG, max 5MB</div>
      </div>
      <div id="pogScreenshotPreview-${group.id}" style="display:${screenshotUrl ? 'block' : 'none'};margin-top:8px">
        <img id="pogScreenshotImg-${group.id}" src="${screenshotUrl || ''}" style="max-width:100%;max-height:200px;object-fit:contain;border-radius:6px;border:1px solid var(--border)"/>
        <button class="btn btn-ghost btn-sm" style="margin-top:4px" onclick="clearEngineerPOGroupScreenshot('${group.id}')">✕ Remove</button>
      </div>
      <div class="form-group" style="margin-top:10px">
        <label class="form-label">Client Approval Notes</label>
        <textarea class="form-control" id="pogClientNotes-${group.id}" placeholder="Client name, reference, date..."></textarea>
      </div>
    </div>
    <div id="pogPMFields-${group.id}" style="display:${path === 'project_manager' ? 'block' : 'none'}">
      <div style="background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.18);border-radius:var(--radius-sm);padding:12px;display:flex;gap:10px">
        <span style="font-size:1.2rem">👔</span>
        <div><div style="font-size:0.85rem;font-weight:600;margin-bottom:3px">Forwarding to PM</div>
        <p style="font-size:0.78rem;color:var(--gray-3)">PM will receive all quotations, select the final one, and give approval.</p></div>
      </div>
    </div>
    ${path ? `<div style="margin-top:14px"><button class="btn btn-primary btn-sm" onclick="handleEngineerSubmitPOGroupPath('${group.id}')">Submit →</button></div>` : ''}`;
}

function handleEngineerSelectPOGroupPath(groupId, path) {
  _poGroupEngineerPath[groupId] = path;
  if (path !== 'client') _poGroupEngineerSelectedQuote[groupId] = null;
  const group = (currentPOGroupsCache || []).find(g => g.id === groupId);
  const quotations = (currentPOGroupQuotationsCache || {})[groupId] || [];
  if (group) {
    const el = document.getElementById(`po-group-actions-${groupId}`);
    if (el) el.innerHTML = renderEngineerPOGroupReview(group, quotations);
  }
}
window.handleEngineerSelectPOGroupPath = handleEngineerSelectPOGroupPath;

async function handleEngineerPOGroupScreenshot(e, groupId) {
  const file = e.target.files[0]; if (!file) return;
  try {
    const uploaded = await uploadFileToStorage(file, `pr/${currentPR?.id || 'pending'}/po-group-client-approval`);
    _poGroupEngineerScreenshot[groupId] = uploaded.url;
    const group = (currentPOGroupsCache || []).find(g => g.id === groupId);
    const quotations = (currentPOGroupQuotationsCache || {})[groupId] || [];
    if (group) {
      const el = document.getElementById(`po-group-actions-${groupId}`);
      if (el) el.innerHTML = renderEngineerPOGroupReview(group, quotations);
    }
  } catch (err) {
    showToast('Screenshot upload failed: ' + err.message, 'error');
  }
}
window.handleEngineerPOGroupScreenshot = handleEngineerPOGroupScreenshot;

function clearEngineerPOGroupScreenshot(groupId) {
  _poGroupEngineerScreenshot[groupId] = null;
  const group = (currentPOGroupsCache || []).find(g => g.id === groupId);
  const quotations = (currentPOGroupQuotationsCache || {})[groupId] || [];
  if (group) {
    const el = document.getElementById(`po-group-actions-${groupId}`);
    if (el) el.innerHTML = renderEngineerPOGroupReview(group, quotations);
  }
}
window.clearEngineerPOGroupScreenshot = clearEngineerPOGroupScreenshot;

async function handleEngineerSubmitPOGroupPath(groupId) {
  const path = _poGroupEngineerPath[groupId];
  if (!path) { showToast('Please select an approval path', 'error'); return; }
  const { data: group } = await db.from('po_groups').select('*').eq('id', groupId).single();

  if (path === 'client') {
    const selectedQuoteId = _poGroupEngineerSelectedQuote[groupId];
    const screenshotUrl = _poGroupEngineerScreenshot[groupId];
    if (!selectedQuoteId) { showToast('Please select a final quotation', 'error'); return; }
    if (!screenshotUrl) { showToast('Please attach client approval screenshot', 'error'); return; }
    showLoader(true);
    try {
      await db.from('po_group_quotations').update({ is_selected: false }).eq('po_group_id', groupId);
      await db.from('po_group_quotations').update({ is_selected: true }).eq('id', selectedQuoteId);
      await setPOGroupPhase(group, 'pending_pm_approval', {
        approval_path: 'client',
        selected_quotation_id: selectedQuoteId,
        client_approval_screenshot: screenshotUrl,
        client_approval_notes: document.getElementById(`pogClientNotes-${groupId}`)?.value.trim() || null,
      });
      showToast('Client approval submitted — forwarded to PM.', 'success');
      notifyRoleOfPOGroupEvent(currentPR.id, `"${group.group_label}" client-approved and forwarded for PM's final decision on PR-${String(currentPR.request_number).padStart(4,'0')}.`, 'pm');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      showLoader(false);
    }
  } else {
    showLoader(true);
    try {
      await db.from('po_group_quotations').update({ is_selected: false }).eq('po_group_id', groupId);
      await setPOGroupPhase(group, 'pending_pm_approval', {
        approval_path: 'project_manager',
        client_approval_screenshot: null,
        client_approval_notes: null,
        selected_quotation_id: null,
      });
      showToast('Forwarded directly to Project Manager.', 'success');
      notifyRoleOfPOGroupEvent(currentPR.id, `"${group.group_label}" forwarded to PM for quote selection and approval on PR-${String(currentPR.request_number).padStart(4,'0')}.`, 'pm');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      showLoader(false);
    }
  }
  delete _poGroupEngineerPath[groupId];
  delete _poGroupEngineerSelectedQuote[groupId];
  delete _poGroupEngineerScreenshot[groupId];
  await openPRNewModel(currentPR.id);
}
window.handleEngineerSubmitPOGroupPath = handleEngineerSubmitPOGroupPath;

// selectPOGroupQuotation is reused inside the engineer's client-path quote
// picker too — detect which mode we're in (engineer choosing vs PM
// choosing) by checking whether an engineer path is currently active for
// this group, and update the matching state bucket.
const _origSelectPOGroupQuotation = selectPOGroupQuotation;
function selectPOGroupQuotationRouter(groupId, qId) {
  if (_poGroupEngineerPath[groupId] === 'client') {
    _poGroupEngineerSelectedQuote[groupId] = qId;
    const group = (currentPOGroupsCache || []).find(g => g.id === groupId);
    const quotations = (currentPOGroupQuotationsCache || {})[groupId] || [];
    if (group) {
      const el = document.getElementById(`po-group-actions-${groupId}`);
      if (el) el.innerHTML = renderEngineerPOGroupReview(group, quotations);
    }
    return;
  }
  _origSelectPOGroupQuotation(groupId, qId);
}
window.selectPOGroupQuotation = selectPOGroupQuotationRouter;

// ── RENDER: expandable PO Group detail card (used inside request modal) ──
// ── RENDER: per-PO-Group workflow timeline ──────────────────────────
// Mirrors legacy renderWorkflowTrack (shared.js) but reads a PO Group's
// own `phase`/`phase_timestamps` instead of the parent PR's. Once a
// request is split into groups, each group runs its own independent
// lifecycle — the PR-level timeline stops advancing, so this is the
// only place progress/dates for a given vendor split are visible.
const PO_GROUP_TRACK_STEPS = [
  { key: 'quotation_pending', label: 'Quote Pending' },
  { key: 'quoted', label: 'Engineer Review' },
  { key: 'pending_pm_approval', label: 'PM Approval' },
  { key: 'pm_approved', label: 'Approved' },
  { key: 'order_placed', label: 'Order Placed' },
  { key: 'grn_pending', label: 'GRN / QC' },
  { key: 'qc_passed', label: 'QC Passed' },
  { key: 'payment_pending', label: 'Payment' },
  { key: 'closed', label: 'Closed' },
];
const PO_GROUP_TRACK_ORDER = PO_GROUP_TRACK_STEPS.map(s => s.key);

function renderPOGroupTimeline(group) {
  const ts = group.phase_timestamps || {};
  const phase = group.phase;
  const isTerminalBad = phase === 'rejected' || phase === 'declined';
  const isRework = phase === 'rework_pending';
  // Rework isn't on the main track — it's a loop back into GRN/QC — so it
  // occupies that same slot for progress purposes and gets its own tag.
  const effectivePhase = isRework ? 'grn_pending' : phase;
  const idx = isTerminalBad ? PO_GROUP_TRACK_ORDER.length : PO_GROUP_TRACK_ORDER.indexOf(effectivePhase);

  function shortDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  const stepsHTML = PO_GROUP_TRACK_STEPS.map((s, i) => {
    const si = PO_GROUP_TRACK_ORDER.indexOf(s.key);
    const isCurrent = !isTerminalBad && effectivePhase === s.key;
    const isDone = isTerminalBad || si < idx;
    const cls = isCurrent ? 'current' : isDone ? 'done' : '';
    const dateStr = (isDone || isCurrent) ? shortDate(ts[s.key]) : '';
    return `<div class="wf-step ${cls}">
      <div class="wf-node">${isDone ? '✓' : i + 1}</div>
      <div class="wf-label">${s.label}</div>
      <div class="wf-date">${dateStr}</div>
    </div>`;
  }).join('');

  const reworkHTML = isRework
    ? `<div class="wf-step current"><div class="wf-node" style="background:var(--red);border-color:var(--red);color:white">↺</div><div class="wf-label" style="color:var(--red)">Rework/Return</div><div class="wf-date">${shortDate(ts['rework_pending'])}</div></div>`
    : '';
  const rejHTML = isTerminalBad
    ? `<div class="wf-step current"><div class="wf-node" style="background:var(--red);border-color:var(--red);color:white">✗</div><div class="wf-label" style="color:var(--red)">${phase === 'rejected' ? 'Rejected' : 'Declined'}</div><div class="wf-date">${shortDate(ts[phase])}</div></div>`
    : '';

  return `<div class="workflow-track" style="margin:2px 0 10px">${stepsHTML}${reworkHTML}${rejHTML}</div>`;
}
window.renderPOGroupTimeline = renderPOGroupTimeline;

// ── RENDER: read-only docs/payments panel, same for every role ─────────
// Quotation files, the generated PO, and payment records are shown here
// unconditionally (not gated by role or phase like the action area below),
// since PM/Engineer/Accounts should be able to see everything Procurement
// has on a group at any time, not just what that phase's action branch
// happens to render for their role.
function renderPOGroupDocsAndPayments(group, quotations, po, poAttachment, paymentRows) {
  let html = '';

  if (quotations && quotations.length) {
    html += `<div style="margin-top:8px">
      <div class="detail-key" style="margin-bottom:6px">📎 Quotations &amp; Files</div>
      <div style="display:flex;flex-direction:column;gap:6px">${quotations.map(q => renderPOGroupQuotationCard(group.id, q, false)).join('')}</div>
    </div>`;
  }

  if (po) {
    const fi = poAttachment?.file_url ? _regFile(poAttachment.file_url, poAttachment.file_name || `PO_${po.po_number}.pdf`) : null;
    // The PO record and its PDF are saved in two separate steps (see
    // confirmGeneratePOGroupOrder) — the DB write basically can't fail,
    // but the html2canvas/jsPDF render + Storage upload can, silently,
    // leaving a PO with no attached file. Surface that clearly instead of
    // just omitting the buttons, and give Procurement a one-click retry
    // that backfills the PDF without touching the PO record itself.
    // Only procurement.html has the #poModal markup this needs, so the
    // retry action is scoped to that role.
    const role = window.PO_GROUP_PAGE_ROLE || 'procurement';
    const missingPdfHTML = (fi === null)
      ? `<div style="width:100%;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:6px;border-top:1px dashed rgba(214,43,43,0.25);margin-top:4px">
          <span style="font-size:0.74rem;color:var(--red)">⚠️ PDF not attached — the file failed to save when this PO was generated.</span>
          ${role === 'procurement' ? `<button class="btn btn-secondary btn-sm" onclick="openPOGroupModal('${group.id}')">🔄 Generate PDF</button>` : ''}
        </div>`
      : '';
    html += `<div style="margin-top:8px;border:1px solid rgba(99,102,241,0.25);border-radius:var(--radius-sm);overflow:hidden">
      <div style="padding:8px 12px;background:rgba(99,102,241,0.07);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
        <div style="font-weight:700;font-size:0.8rem;color:#4f46e5">📄 Purchase Order</div>
        <span style="font-family:var(--font-mono);font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:3px;background:rgba(99,102,241,0.12);color:#4f46e5">${po.po_number}</span>
      </div>
      <div style="padding:10px 12px;background:white;display:flex;flex-wrap:wrap;gap:14px;align-items:center">
        <div><div class="detail-key">PO Date</div><div class="detail-value" style="font-family:var(--font-mono);font-size:0.8rem">${fmtDate(po.po_date || po.created_at)}</div></div>
        <div><div class="detail-key">Total Amount</div><div class="detail-value" style="font-family:var(--font-mono);font-weight:700;font-size:0.85rem">${po.currency || 'INR'} ${Number(po.total_amount || 0).toLocaleString()}</div></div>
        ${fi !== null ? `<div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="_previewByIdx(${fi})">👁 Preview PO</button>
          <button class="btn btn-secondary btn-sm" onclick="_downloadByIdx(${fi})">⬇ Download</button>
        </div>` : ''}
        ${missingPdfHTML}
      </div>
    </div>`;
  }

  if (paymentRows && paymentRows.length) {
    html += `<div style="margin-top:8px;border:1px solid rgba(139,92,246,0.3);border-radius:var(--radius-sm);overflow:hidden">
      <div style="padding:8px 12px;background:rgba(139,92,246,0.07)"><div style="font-weight:700;font-size:0.8rem;color:#7c3aed">💰 Payments</div></div>
      <div style="padding:10px 12px;background:white;display:flex;flex-direction:column;gap:8px">
        ${paymentRows.map(p => `<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:0.78rem;border-bottom:1px dashed var(--border);padding-bottom:6px">
          <span style="font-weight:600;text-transform:capitalize">${p.payment_type}</span>
          <span style="font-family:var(--font-mono);font-weight:700">${p.currency || 'INR'} ${Number(p.amount || 0).toLocaleString()}</span>
          <span style="color:var(--gray-4)">Running total: ${p.currency || 'INR'} ${Number(p.running_total_paid || 0).toLocaleString()}</span>
          <span class="badge ${p.status === 'paid' ? 'badge-green' : 'badge-orange'}">${(p.status || '').toUpperCase()}</span>
          <span style="color:var(--gray-4);font-size:0.72rem">${fmtDate(p.raised_at || p.paid_at)}</span>
          ${p.smartsheet_payment_id ? `<span style="color:#6366f1;font-family:var(--font-mono);font-size:0.72rem">📋 ${p.smartsheet_payment_id}</span>` : ''}
          ${p.screenshot ? `<button class="btn btn-secondary btn-sm" onclick="_previewByIdx(${_regFile(p.screenshot, 'payment_screenshot')})">👁 Screenshot</button>` : ''}
        </div>`).join('')}
      </div>
    </div>`;
  }

  return html;
}
window.renderPOGroupDocsAndPayments = renderPOGroupDocsAndPayments;

function renderPOGroupCard(group, partLines, quotations, po, poAttachment, paymentRows) {
  const meta = poGroupPhaseMeta(group.phase);
  const groupParts = (partLines || []).filter(p => p.po_group_id === group.id);
  const partsRows = groupParts.map(p =>
    `<tr><td>${p.name}</td><td style="text-align:center;font-family:var(--font-mono)">${p.qty}</td><td>${p.uom || '—'}</td></tr>`
  ).join('');

  return `
  <div class="po-group-card" data-group-id="${group.id}" style="border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-weight:700;font-size:0.88rem">${group.group_label} <span style="color:var(--gray-4);font-weight:400;font-size:0.75rem">· Cycle ${group.cycle_number}</span></div>
      ${poGroupPhaseBadgeHTML(group.phase)}
    </div>
    <table class="parts-table" style="width:100%;margin-bottom:10px">
      <thead><tr><th>Part</th><th style="width:60px">Qty</th><th style="width:60px">UOM</th></tr></thead>
      <tbody>${partsRows || '<tr><td colspan="3" style="color:var(--gray-4)">No parts in this group</td></tr>'}</tbody>
    </table>
    ${renderPOGroupTimeline(group)}
    <div id="po-group-actions-${group.id}"></div>
    ${renderPOGroupDocsAndPayments(group, quotations, po, poAttachment, paymentRows)}
  </div>`;
}

// ── RENDER: basic request details — Request #, Project, Team Member, PM,
// Department etc. Mirrors the fields shown in the legacy buildPRDetailHTML()
// (shared.js) header, since the part-level modal has its own body layout
// and doesn't call into that function at all — without this, none of that
// identifying info is visible anywhere in the split-cycle modal.
function buildPOGroupBasicDetailsHTML(pr) {
  return `
    <div class="detail-grid" style="margin-bottom:14px">
      <div class="detail-item"><div class="detail-key">Request #</div>
        <div class="detail-value"><span class="pr-number${pr.is_modification ? ' modified' : ''}">PR-${String(pr.request_number).padStart(4, '0')}</span>
        ${pr.is_modification ? `<span class="mod-badge" style="margin-left:6px">↺ Modified</span>` : ''}
        </div></div>
      <div class="detail-item"><div class="detail-key">Category</div><div class="detail-value">${pr.request_category === 'vendor_info' ? 'Vendor Info Request' : 'RFQ'}</div></div>
      <div class="detail-item"><div class="detail-key">Project</div><div class="detail-value">${pr.project_name}</div></div>
      <div class="detail-item"><div class="detail-key">Phase</div><div class="detail-value">${pr.project_phase}</div></div>
      <div class="detail-item"><div class="detail-key">Project Manager</div><div class="detail-value">${pr.project_manager_name || '—'}</div></div>
      <div class="detail-item"><div class="detail-key">Team Member</div><div class="detail-value">${pr.team_member_name}</div></div>
      <div class="detail-item"><div class="detail-key">Department</div><div class="detail-value">${DEPARTMENTS[pr.department] || pr.department}</div></div>
      ${pr.order_type ? `<div class="detail-item"><div class="detail-key">Order Type</div><div class="detail-value">${ORDER_TYPES[pr.order_type] || pr.order_type}</div></div>` : ''}
      ${pr.product_link ? `<div class="detail-item"><div class="detail-key">Product Link</div><div class="detail-value"><a href="${pr.product_link}" target="_blank" style="color:var(--red)">🔗 View Product</a></div></div>` : ''}
      <div class="detail-item"><div class="detail-key">Submitted</div><div class="detail-value">${fmtDate(pr.created_at)}</div></div>
      ${pr.description ? `<div class="detail-item" style="grid-column:1/-1"><div class="detail-key">Description / Notes</div><div class="detail-value" style="line-height:1.5">${pr.description}</div></div>` : ''}
      ${pr.modification_note ? `<div class="detail-item" style="grid-column:1/-1"><div class="detail-key" style="color:#6366f1">Modification Note</div><div class="detail-value">${pr.modification_note}</div></div>` : ''}
    </div>`;
}

// ── RENDER: "Group Parts" panel — ungrouped parts + vendor assignment ──
function renderUngroupedPartsPanel(prId, ungroupedParts, vendorOptionsHTML) {
  if (!ungroupedParts || !ungroupedParts.length) return '';
  const rows = ungroupedParts.map(p => `
    <tr>
      <td><input type="checkbox" class="ungrouped-part-cb" value="${p.id}"/></td>
      <td>${p.name}</td>
      <td style="text-align:center;font-family:var(--font-mono)">${p.qty}</td>
      <td>${p.spec || '—'}</td>
    </tr>`).join('');

  return `
  <div class="action-section" style="border:1px solid rgba(99,102,241,0.3);background:rgba(99,102,241,0.04);border-radius:var(--radius);padding:16px;margin-bottom:14px">
    <div class="action-section-title" style="color:#4f46e5">🧩 Group Parts to a Vendor <span class="action-badge">ACTION AVAILABLE</span></div>
    <p style="font-size:0.82rem;color:var(--gray-3);margin-bottom:10px">Select the parts going to the same vendor, choose the vendor, and create a PO Group. Repeat for each vendor split.</p>
    <table class="parts-table" style="width:100%;margin-bottom:10px">
      <thead><tr><th style="width:28px"></th><th>Part</th><th style="width:60px">Qty</th><th>Spec</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select id="groupVendorSelect" class="form-control" style="max-width:240px">${vendorOptionsHTML}</select>
      <button class="btn btn-primary btn-sm" onclick="handleCreatePOGroup('${prId}')">Create PO Group from Selected Parts</button>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// FULL MODAL RENDER — new-model requests only (procurement.html)
//
// Mirrors the shape of legacy openPR() but drives everything off
// po_groups / request_part_lines instead of a single phase/PO.
// Relies on globals already present on procurement.html at call time:
// currentPR, currentUser, allVendors, loadComments, renderComments,
// openModal, closeModal, showToast, showLoader, DEPARTMENTS.
// ══════════════════════════════════════════════════════════════
// Self-contained vendor fetch — does NOT rely on each page's own
// loadVendors()/allVendors global, since those only exist on
// procurement.html and master.html. Engineer/PM/Accounts don't define
// them at all, so calling into a page-specific loadVendors() from here
// would throw "loadVendors is not defined" and crash the modal for
// those three roles. This is scoped to po-groups.js and cached for the
// lifetime of the page load.
let _vendorCache = null;
// Cross-function caches for the currently-open modal, used by
// selectPOGroupQuotation() to re-render a single group's actions
// without re-fetching or re-rendering the whole modal body.
let currentPOGroupsCache = [];
let currentPOGroupQuotationsCache = {};
let currentPartLinesCache = [];
let currentVendorListCache = [];
async function fetchVendorsForGroupingPanel() {
  if (_vendorCache) return _vendorCache;
  const rows = await dbFetch(() => db.from('vendors').select('*').order('name'), 'vendors');
  _vendorCache = rows || [];
  return _vendorCache;
}
window.fetchVendorsForGroupingPanel = fetchVendorsForGroupingPanel;

async function openPRNewModel(id) {
  // Fetches the request directly rather than searching a page-local
  // allRequests/myRequests array. Those arrays are declared with `let`
  // on each page, which never attaches to `window` — relying on a
  // cross-script global lookup here would be fragile and silently break.
  // A direct fetch is simpler, works identically from every page and
  // every entry point (including Accounts' payments-due list, which
  // opens a request by id without it being in any locally loaded list),
  // and guarantees fresh data instead of a possibly-stale cached copy.
  showLoader(true);
  const { data: pr, error } = await db.from('procurement_requests').select(PR_LIST_COLUMNS).eq('id', id).single();
  if (error || !pr) {
    showLoader(false);
    showToast('Could not load this request: ' + (error?.message || 'not found'), 'error');
    return;
  }
  currentPR = pr;

  document.getElementById('prModalTitle').textContent = `PR-${String(currentPR.request_number).padStart(4, '0')} — ${currentPR.project_name}`;
  document.getElementById('prModalSub').textContent = `${currentPR.request_category === 'vendor_info' ? 'Vendor Info' : 'RFQ'} · ${DEPARTMENTS[currentPR.department] || currentPR.department} · Part-Level PO Tracking`;

  const vendorList = (window.PO_GROUP_PAGE_ROLE === 'procurement' || window.PO_GROUP_PAGE_ROLE === 'master')
    ? await fetchVendorsForGroupingPanel()
    : [];
  await ensurePartLinesExist(currentPR);

  const [partLines, poGroups, comments] = await Promise.all([
    fetchPartLines(id),
    fetchPOGroups(id),
    loadComments(id),
  ]);

  const groupIds = poGroups.map(g => g.id);
  const quotationsByGroup = {};
  const poByGroup = {};
  const poAttachmentByGroup = {};
  const paymentsByGroup = {};
  if (groupIds.length) {
    const [allQuotes, allPOs, allPOAttachments, allPayments] = await Promise.all([
      dbFetch(() => db.from('po_group_quotations').select('*').in('po_group_id', groupIds).order('created_at'), 'PO group quotations'),
      dbFetch(() => db.from('purchase_orders').select('*').in('po_group_id', groupIds), 'PO group purchase orders'),
      dbFetch(() => db.from('pr_attachments').select('*').in('po_group_id', groupIds).order('created_at', { ascending: false }), 'PO group PO attachments'),
      dbFetch(() => db.from('po_group_payments').select('*').in('po_group_id', groupIds).order('raised_at'), 'PO group payments'),
    ]);
    (allQuotes || []).forEach(q => {
      (quotationsByGroup[q.po_group_id] = quotationsByGroup[q.po_group_id] || []).push(q);
    });
    (allPOs || []).forEach(po => { poByGroup[po.po_group_id] = po; });
    // Attachments are ordered newest-first above, so the first match per
    // group is the current PO's PDF (a re-quote cycle keeps prior PDFs
    // around under the old, superseded group id — they aren't touched).
    (allPOAttachments || []).forEach(a => {
      if (!poAttachmentByGroup[a.po_group_id]) poAttachmentByGroup[a.po_group_id] = a;
    });
    (allPayments || []).forEach(p => {
      (paymentsByGroup[p.po_group_id] = paymentsByGroup[p.po_group_id] || []).push(p);
    });
  }
  showLoader(false);

  // Cache the currently-rendered state so selectPOGroupQuotation() can
  // re-render a single group's action area without a full modal reload.
  currentPOGroupsCache = poGroups;
  currentPOGroupQuotationsCache = quotationsByGroup;
  currentPartLinesCache = partLines;
  currentVendorListCache = vendorList;

  const ungroupedParts = partLines.filter(p => p.status === 'unassigned');
  const rollup = computeRollupLabel(poGroups);

  const vendorOptionsHTML = `<option value="">— Select vendor —</option>` +
    vendorList.map(v => `<option value="${v.id}" data-name="${v.name}">${v.name}${v.specialization ? ' (' + v.specialization + ')' : ''}</option>`).join('');

  // Generated-PO summary, so "has a PO actually been generated for this
  // request?" is answerable at a glance instead of having to open every
  // group card. Each chip jumps to its group's card, where the full PO
  // details (date, amount, PDF) live via renderPOGroupDocsAndPayments().
  const generatedPOs = poGroups.filter(g => poByGroup[g.id]).map(g => ({ group: g, po: poByGroup[g.id] }));
  const poSummaryHTML = generatedPOs.length ? `
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid rgba(99,102,241,0.15)">
      <span style="font-size:0.72rem;color:var(--gray-4)">📄 PO${generatedPOs.length > 1 ? 's' : ''} generated:</span>
      ${generatedPOs.map(({ group: g, po }) => `<span class="badge badge-blue" style="cursor:pointer;font-family:var(--font-mono)" onclick="document.querySelector('[data-group-id=&quot;${g.id}&quot;]')?.scrollIntoView({behavior:'smooth',block:'center'})" title="${po.currency || 'INR'} ${Number(po.total_amount || 0).toLocaleString()} — ${g.group_label}">${po.po_number}</span>`).join('')}
    </div>` : '';

  const rollupBannerHTML = `
    <div style="margin-bottom:14px;padding:10px 14px;border-radius:var(--radius);background:${rollup.closed ? 'rgba(22,163,74,0.06)' : 'rgba(99,102,241,0.06)'};border:1px solid ${rollup.closed ? 'rgba(22,163,74,0.2)' : 'rgba(99,102,241,0.2)'}">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:700;font-size:0.85rem;color:${rollup.closed ? '#16a34a' : '#4f46e5'}">${rollup.closed ? '✅' : '🧩'} ${rollup.label}</div>
        <div style="font-size:0.72rem;color:var(--gray-4)">${partLines.length} part${partLines.length !== 1 ? 's' : ''} total · Part-Level PO Tracking</div>
      </div>
      ${poSummaryHTML}
    </div>`;

  const groupingPanelHTML = (window.PO_GROUP_PAGE_ROLE === 'procurement' || window.PO_GROUP_PAGE_ROLE === 'master')
    ? renderUngroupedPartsPanel(id, ungroupedParts, vendorOptionsHTML)
    : (ungroupedParts.length ? `<div style="font-size:0.78rem;color:var(--gray-4);margin-bottom:10px">🧩 ${ungroupedParts.length} part(s) not yet grouped to a vendor by Procurement.</div>` : '');

  const groupCardsHTML = poGroups.map(g => {
    const card = renderPOGroupCard(g, partLines, quotationsByGroup[g.id] || [], poByGroup[g.id] || null, poAttachmentByGroup[g.id] || null, paymentsByGroup[g.id] || []);
    return card;
  }).join('') || (ungroupedParts.length ? '' : `<div style="text-align:center;padding:20px;color:var(--gray-4);font-size:0.82rem">No parts on this request yet.</div>`);

  document.getElementById('prModalBody').innerHTML =
    buildPOGroupBasicDetailsHTML(currentPR) +
    rollupBannerHTML +
    groupingPanelHTML +
    `<div id="poGroupCardsContainer">${groupCardsHTML}</div>` +
    `<div style="margin-top:22px;border-top:1px solid var(--border);padding-top:16px">
      <div class="section-title" style="margin-bottom:10px">💬 Comments</div>
      <div id="commentsList">${renderComments(comments)}</div>
      <div style="position:relative;display:flex;gap:8px;margin-top:10px">
        <div style="position:relative;flex:1">
          <input class="form-control" id="commentInput" placeholder="Add a comment… use @ to tag someone" style="width:100%" onkeydown="if(event.key==='Enter'&&document.getElementById('mentionDd').style.display==='none')addComment()"/>
          <div id="mentionDd" style="display:none;position:absolute;z-index:9999;left:0;bottom:calc(100% + 4px);min-width:220px;max-height:200px;overflow-y:auto;background:white;border:1px solid var(--border);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.14)"></div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="addComment()">Post</button>
      </div>
    </div>`;

  const footer = document.getElementById('prModalFooter');
  // Close refreshes the underlying list too — otherwise a PO Group that
  // just closed (or a rollup that just flipped to "Closed") only shows
  // up correctly after the next full page load, since the background
  // list array isn't live-updated while the modal is open.
  footer.innerHTML = `<button class="btn btn-secondary" onclick="closeModal('prModal'); refreshUnderlyingList();">Close</button>`;

  openModal('prModal');
  setTimeout(function () { window.initCommentBox && window.initCommentBox('commentInput', 'mentionDd'); }, 50);

  // Populate each PO Group card's action area after the card HTML is in the DOM.
  poGroups.forEach(g => renderPOGroupActions(g, partLines, quotationsByGroup[g.id] || [], vendorList));
}
window.openPRNewModel = openPRNewModel;

// ── Opt a legacy request into the new part/PO-group model ──────────
// Called from procurement.html when Procurement decides a request needs
// to be split across more than one vendor. Irreversible by design (once
// parts are grouped into vendor-specific POs, collapsing back to a
// single PO doesn't map cleanly) — confirm before flipping.
async function enablePartLevelTracking(prId) {
  // Only relies on currentPR (already loaded by the time this button is
  // clickable, since it only renders inside an open request modal) —
  // not on any page-specific list variable name, so this can't break if
  // called from a page whose list array happens to be named differently.
  if (currentPR && (currentPR.parts || []).length < 2) {
    showToast('This request only has one part — Part-Level PO Tracking is for splitting multiple parts across vendors.', 'error');
    return;
  }
  if (!confirm('This will switch this request to Part-Level PO Tracking, letting you split its parts across multiple vendor POs. This cannot be undone for this request. Continue?')) return;
  showLoader(true);
  try {
    const { error } = await db.from('procurement_requests')
      .update({ is_legacy: false, rollup_status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', prId);
    if (error) throw error;
    showToast('Part-Level PO Tracking enabled for this request.', 'success');
    await openPRNewModel(prId);
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    showLoader(false);
  }
}
window.enablePartLevelTracking = enablePartLevelTracking;

// Self-contained fallback for addComment() — Accounts and Master don't
// define their own version of this (Procurement/Engineer/PM do, and
// those pages' own richer versions take priority since this only
// defines the function if it isn't already present on the page).
if (typeof window.addComment !== 'function') {
  window.addComment = async function addComment() {
    const input = document.getElementById('commentInput'), text = input?.value.trim();
    if (!text || !currentPR) return;
    try {
      await window.postComment(currentPR.id, currentUser.id, text);
      input.value = '';
      const c = await loadComments(currentPR.id);
      document.getElementById('commentsList').innerHTML = renderComments(c);
    } catch (e) { showToast('Comment failed', 'error'); }
  };
}

// ── Accounts payment form, shared across every phase a payment can be
// raised from (pm_approved through payment_pending). Mirrors the legacy
// Smartsheet-based flow (Payment ID + screenshot), scoped to a PO Group.
function renderPOGroupPaymentForm(group, contextHTML) {
  return `
    ${contextHTML}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <select class="form-control" style="max-width:120px" id="payType-${group.id}">
        <option value="advance">Advance</option>
        <option value="balance">Balance</option>
        <option value="full">Full</option>
      </select>
      <input class="form-control" style="max-width:120px" type="number" id="payAmt-${group.id}" placeholder="Amount"/>
      <input class="form-control" style="max-width:140px" type="number" id="payPoValue-${group.id}" placeholder="Total PO value"/>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <input class="form-control" style="max-width:200px" type="text" id="paySmartsheetId-${group.id}" placeholder="Smartsheet Payment ID"/>
      <input class="form-control" style="max-width:220px" type="file" accept=".png,.jpg,.jpeg,.pdf" id="payScreenshot-${group.id}"/>
    </div>
    <button class="btn btn-primary btn-sm" onclick="handleRecordPayment('${group.id}')">Record Payment →</button>`;
}

// ── PO Group action area — phase-specific controls, gated by page role ──
// window.PO_GROUP_PAGE_ROLE must be set by each page before calling
// openPRNewModel: 'procurement' | 'pm' | 'engineer' | 'accounts' | 'master'.
// This mirrors the exact role split already used by the legacy flow
// (e.g. Procurement invokes GRN as a trigger; Engineer performs the
// actual GRN/QC entry — same split, just scoped per PO Group now).
function renderPOGroupActions(group, partLines, quotations, vendorList) {
  const el = document.getElementById(`po-group-actions-${group.id}`);
  if (!el) return;
  const phase = group.phase;
  const role = window.PO_GROUP_PAGE_ROLE || 'procurement';
  let html = '';

  const readOnly = (msg) => `<div style="font-size:0.78rem;color:var(--gray-3)">${msg}</div>`;

  if (phase === 'quotation_pending') {
    if (role === 'procurement') {
      const existingHTML = quotations.length
        ? `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">${quotations.map(q => renderPOGroupQuotationCard(group.id, q, false)).join('')}</div>`
        : `<div style="font-size:0.78rem;color:var(--gray-4);margin-bottom:10px">No quotations added yet — add at least one below.</div>`;
      const vendorOptionsHTML = `<option value="">— Select vendor —</option>` +
        (vendorList || []).map(v => `<option value="${v.id}" data-name="${v.name}">${v.name}${v.specialization ? ' (' + v.specialization + ')' : ''}</option>`).join('');
      html = `
        <div class="detail-key" style="margin-bottom:6px">Quotations for this Group</div>
        ${existingHTML}
        <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
          <div class="form-label" style="margin-bottom:6px;font-size:0.75rem">Add Another Quotation</div>
          <div class="form-group" style="margin-bottom:8px">
            <select class="form-control" id="quoteVendor-${group.id}">${vendorOptionsHTML}</select>
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <input type="file" class="form-control" id="quoteFile-${group.id}" accept=".png,.jpg,.jpeg,.pdf"/>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
            <input class="form-control" style="max-width:120px" type="number" id="quoteAmt-${group.id}" placeholder="Amount"/>
            <select class="form-control" style="max-width:90px" id="quoteCur-${group.id}">${(window.CURRENCIES||['INR','USD']).map(c => `<option value="${c}">${c}</option>`).join('')}</select>
            <input class="form-control" style="max-width:140px" type="number" id="quoteLt-${group.id}" placeholder="Lead time (days)"/>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="handleAddPOGroupQuote('${group.id}')">+ Add Quotation</button>
        </div>
        ${quotations.length ? `<div style="margin-top:12px"><button class="btn btn-primary btn-sm" onclick="handleSharePOGroupQuotes('${group.id}')">Share ${quotations.length} Quotation${quotations.length>1?'s':''} for Engineer Verification →</button></div>` : ''}`;
    } else {
      html = readOnly('⏳ Awaiting quotation upload from Procurement.');
    }
  } else if (phase === 'quoted') {
    // Mirrors legacy buildQuoteReview(): Engineer verifies every quote,
    // then picks whether this group needs client sign-off or goes
    // straight to PM. Same two-path decision as the single-PO flow —
    // just scoped to this one group's quotations instead of the PR's.
    if (role === 'engineer' || role === 'master') {
      html = renderEngineerPOGroupReview(group, quotations);
    } else if (role === 'procurement') {
      html = (quotations.length
        ? `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">${quotations.map(q => renderPOGroupQuotationCard(group.id, q, false)).join('')}</div>`
        : '') + readOnly('⏳ Awaiting Engineer verification.') +
        `<div style="margin-top:8px"><button class="btn btn-secondary btn-sm" onclick="handleRequoteGroup('${group.id}')">Request Re-Quote (new cycle)</button></div>`;
    } else {
      html = readOnly('⏳ Awaiting Engineer verification.');
    }
  } else if (phase === 'pending_pm_approval') {
    const isPMPath = group.approval_path === 'project_manager';
    const engineerSelectedQ = quotations.find(q => q.id === group.selected_quotation_id) || quotations.find(q => q.is_selected);
    if (role === 'pm' || role === 'master') {
      if (isPMPath) {
        // Engineer forwarded directly — PM sees every quote and picks the final one, same as before.
        const selectedId = _poGroupSelectedQuote[group.id] || null;
        html = `<div style="font-size:0.78rem;color:var(--gray-3);margin-bottom:8px">Engineer forwarded directly to you — select a final quotation, then approve.</div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">${quotations.map(q => renderPOGroupQuotationCard(group.id, q, true, selectedId)).join('')}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="handlePMApproveGroup('${group.id}')">✓ Select &amp; Approve PO Group</button>
            <button class="btn btn-danger btn-sm" onclick="handlePMRejectGroup('${group.id}')">✗ Reject</button>
          </div>`;
      } else {
        // Client path — Engineer already picked the quote and attached approval; PM just reviews.
        html = `<div style="font-size:0.78rem;color:var(--gray-3);margin-bottom:10px">Engineer selected a quote and attached client approval. Review and decide.</div>
          ${engineerSelectedQ ? `<div style="margin-bottom:10px">${renderPOGroupQuotationCard(group.id, engineerSelectedQ, false)}</div>` : ''}
          ${group.client_approval_screenshot ? `<div style="margin-bottom:10px;padding:10px;background:rgba(22,163,74,0.06);border:1px solid rgba(22,163,74,0.2);border-radius:var(--radius)">
            <div class="detail-key" style="color:#16a34a;margin-bottom:6px">✓ Client Approval Screenshot</div>
            <img src="${group.client_approval_screenshot}" style="max-width:100%;max-height:220px;object-fit:contain;border-radius:6px;border:1px solid var(--border)" onerror="this.style.display='none'"/>
            ${group.client_approval_notes ? `<p style="margin-top:6px;font-size:0.8rem;color:var(--gray-3)">${group.client_approval_notes}</p>` : ''}
          </div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="handlePMApproveGroup('${group.id}')">✓ Approve PO Group</button>
            <button class="btn btn-danger btn-sm" onclick="handlePMRejectGroup('${group.id}')">✗ Reject</button>
          </div>`;
      }
    } else if (role === 'procurement') {
      html = readOnly('⏳ Awaiting PM final approval for this PO Group.') +
        `<div style="margin-top:8px"><button class="btn btn-secondary btn-sm" onclick="handleRequoteGroup('${group.id}')">Request Re-Quote (new cycle)</button></div>`;
    } else {
      html = readOnly('⏳ Awaiting PM final approval.');
    }
  } else if (phase === 'pm_approved') {
    if (role === 'procurement') {
      html = `
      <div style="font-size:0.78rem;color:#16a34a;margin-bottom:8px">✓ PM Approved — ready to place order.</div>
      <button class="btn btn-primary btn-sm" onclick="handlePlaceOrderForGroup('${group.id}')">Place Order →</button>`;
    } else if (role === 'accounts' || role === 'master') {
      html = renderPOGroupPaymentForm(group, `<div style="font-size:0.78rem;color:#16a34a;margin-bottom:8px">✓ PM Approved — raise an advance payment now if the vendor needs it before starting work, or wait until goods are received.</div>`);
    } else {
      html = readOnly('✓ PM Approved — awaiting order placement by Procurement.');
    }
  } else if (phase === 'order_placed') {
    if (role === 'procurement') {
      html = `
      <div style="font-size:0.78rem;color:var(--gray-3);margin-bottom:8px">🛒 Order placed.</div>
      <button class="btn btn-primary btn-sm" onclick="handleInvokeGRNForGroup('${group.id}')">Goods Received — Notify Engineer for QC →</button>`;
    } else if (role === 'accounts' || role === 'master') {
      html = renderPOGroupPaymentForm(group, `<div style="font-size:0.78rem;color:var(--gray-3);margin-bottom:8px">🛒 Order placed — raise an advance payment if due before the goods arrive.</div>`);
    } else {
      html = readOnly('🛒 Order placed — awaiting goods receipt.');
    }
  } else if (phase === 'grn_pending') {
    if (role === 'engineer' || role === 'master') {
      const groupParts = partLines.filter(p => p.po_group_id === group.id);
      html = `
        <div style="font-size:0.78rem;color:var(--gray-3);margin-bottom:8px">📦 Perform GRN / QC.</div>
        <table class="parts-table" style="width:100%;margin-bottom:8px">
          <thead><tr><th>Part</th><th style="width:70px">Received</th><th style="width:70px">Accepted</th></tr></thead>
          <tbody>${groupParts.map((p, i) => `<tr><td>${p.name}</td>
            <td><input type="number" min="0" class="form-control" id="grnRcvd-${group.id}-${i}" style="width:60px"/></td>
            <td><input type="number" min="0" class="form-control" id="grnAccpt-${group.id}-${i}" style="width:60px"/></td></tr>`).join('')}</tbody>
        </table>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="handleSubmitGRN('${group.id}', true)">Submit GRN — QC Passed ✓</button>
          <button class="btn btn-danger btn-sm" onclick="handleSubmitGRN('${group.id}', false)">Submit GRN — QC Failed ✗</button>
        </div>`;
    } else if (role === 'accounts' || role === 'master') {
      html = renderPOGroupPaymentForm(group, `<div style="font-size:0.78rem;color:var(--gray-3);margin-bottom:8px">📦 GRN / QC in progress — raise an advance payment if still due.</div>`);
    } else {
      html = readOnly('📦 GRN / QC in progress — waiting on Engineer.');
    }
  } else if (phase === 'rework_pending') {
    if (role === 'engineer' || role === 'procurement' || role === 'master') {
      html = `
      <div style="font-size:0.78rem;color:var(--red);margin-bottom:8px">✗ QC Failed — sent back to vendor for rework/return.</div>
      <button class="btn btn-secondary btn-sm" onclick="handleResubmitRework('${group.id}')">Vendor Reshipped — Resume GRN/QC</button>`;
    } else if (role === 'accounts') {
      html = renderPOGroupPaymentForm(group, `<div style="font-size:0.78rem;color:var(--red);margin-bottom:8px">✗ QC Failed — item(s) returned to vendor. Payments already raised are unaffected.</div>`);
    } else {
      html = readOnly('✗ QC Failed — item(s) returned to vendor for rework.');
    }
  } else if (phase === 'qc_passed' || phase === 'payment_pending') {
    if (role === 'accounts' || role === 'master') {
      html = renderPOGroupPaymentForm(group, `<div style="font-size:0.78rem;color:${phase === 'qc_passed' ? '#16a34a' : 'var(--gray-3)'};margin-bottom:8px">${phase === 'qc_passed' ? '✅ QC Passed — raise the balance/full payment.' : '💰 Partial payment recorded — balance still due.'}</div>`);
    } else {
      html = readOnly(phase === 'qc_passed' ? '✅ QC Passed — awaiting payment from Accounts.' : '💰 Partial payment recorded — balance pending with Accounts.');
    }
  } else if (phase === 'closed') {
    html = `<div style="font-size:0.78rem;color:#16a34a">✔️ Closed — received, QC'd, and paid.</div>`;
  } else if (phase === 'rejected' || phase === 'declined') {
    html = `<div style="font-size:0.78rem;color:var(--red)">✗ ${phase === 'rejected' ? 'Rejected' : 'Declined'}.</div>`;
  }
  el.innerHTML = html;
}

// ── Handlers wired to the buttons above ─────────────────────────────
async function handleCreatePOGroup(prId) {
  const checked = Array.from(document.querySelectorAll('.ungrouped-part-cb:checked')).map(cb => cb.value);
  const vendorSel = document.getElementById('groupVendorSelect');
  const vendorId = vendorSel?.value || null;
  const vendorLabel = vendorSel?.selectedOptions?.[0]?.dataset?.name || vendorSel?.selectedOptions?.[0]?.textContent || 'Vendor Group';
  if (!vendorId) { showToast('Select a vendor for this group.', 'error'); return; }
  const group = await createPOGroupFromParts(prId, checked, vendorId, vendorLabel, currentUser?.id);
  if (group) await openPRNewModel(prId);
}

// Adds one quotation to a PO Group's collection. Group stays in
// quotation_pending so Procurement can keep adding more (one per
// vendor being compared) before handing the whole set to PM —
// mirrors legacy's "upload several, then Share Quotations" flow.
async function handleAddPOGroupQuote(groupId) {
  const vendorSel = document.getElementById(`quoteVendor-${groupId}`);
  const vendorId = vendorSel?.value || null;
  const vendorName = vendorSel?.selectedOptions?.[0]?.dataset?.name || vendorSel?.selectedOptions?.[0]?.textContent || null;
  if (!vendorId) { showToast('Select a vendor for this quotation.', 'error'); return; }
  const fileEl = document.getElementById(`quoteFile-${groupId}`);
  const amt = document.getElementById(`quoteAmt-${groupId}`)?.value;
  const cur = document.getElementById(`quoteCur-${groupId}`)?.value || 'INR';
  const lt = document.getElementById(`quoteLt-${groupId}`)?.value;
  showLoader(true);
  try {
    let fileUrl = null, fileName = null, fileType = null;
    if (fileEl?.files?.[0]) {
      const f = fileEl.files[0];
      const uploaded = await uploadFileToStorage(f, `pr/${groupId}/po-group-quotations`);
      fileUrl = uploaded?.url || null; fileName = uploaded?.name || f.name; fileType = uploaded?.type || f.type;
    }
    const { error } = await db.from('po_group_quotations').insert({
      po_group_id: groupId, vendor_id: vendorId, vendor_name: vendorName,
      file_name: fileName, file_url: fileUrl, file_type: fileType,
      amount: amt ? parseFloat(amt) : null, currency: cur,
      lead_time_days: lt ? parseInt(lt) : null, uploaded_by: currentUser?.id || null,
    });
    if (error) throw error;
    showToast('Quotation added.', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    showLoader(false);
    await openPRNewModel(currentPR.id);
  }
}

// Explicit hand-off once all quotes for a group are in — moves the
// group to 'quoted' so Engineer can verify and route it onward.
async function handleSharePOGroupQuotes(groupId) {
  const { data: group } = await db.from('po_groups').select('*').eq('id', groupId).single();
  const ok = await setPOGroupPhase(group, 'quoted');
  if (!ok) return;
  showToast('Quotations shared with Engineer for verification.', 'success');
  notifyRoleOfPOGroupEvent(currentPR.id, `Quotations ready for verification — "${group.group_label}" on PR-${String(currentPR.request_number).padStart(4,'0')}.`, 'engineer');
  await openPRNewModel(currentPR.id);
}

async function handleRequoteGroup(groupId) {
  const { data: group } = await db.from('po_groups').select('*').eq('id', groupId).single();
  const reason = prompt('Reason for re-quote (e.g. "quote rejected", "price renegotiated"):') || 'Re-quote requested';
  const newGroup = await requoteCycle(group, reason, currentUser?.id);
  if (newGroup) await openPRNewModel(currentPR.id);
}

async function handlePMApproveGroup(groupId) {
  const { data: group } = await db.from('po_groups').select('*').eq('id', groupId).single();
  const { data: quotations } = await db.from('po_group_quotations').select('*').eq('po_group_id', groupId);
  const selectedId = _poGroupSelectedQuote[groupId] || (quotations || []).find(q => q.is_selected)?.id || null;
  const selectedQuote = (quotations || []).find(q => q.id === selectedId);
  if (!selectedQuote) { showToast('Select a final quotation before approving.', 'error'); return; }

  showLoader(true);
  try {
    // Mark the chosen quote selected, clear any other selection on this group.
    await db.from('po_group_quotations').update({ is_selected: false }).eq('po_group_id', groupId);
    await db.from('po_group_quotations').update({ is_selected: true }).eq('id', selectedQuote.id);

    // The approved quote's vendor becomes the group's vendor of record —
    // this is what Place Order / GRN / Payment downstream key off of.
    await setPOGroupPhase(group, 'pm_approved', {
      vendor_id: selectedQuote.vendor_id || group.vendor_id,
      group_label: selectedQuote.vendor_name || group.group_label,
      selected_quotation_id: selectedQuote.id,
    });
    showToast('PO Group approved with selected quotation.', 'success');
    notifyRoleOfPOGroupEvent(currentPR.id, `"${group.group_label}" approved (${selectedQuote.vendor_name || 'vendor'} selected) — ready to place order on PR-${String(currentPR.request_number).padStart(4,'0')}.`, 'procurement');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    showLoader(false);
    delete _poGroupSelectedQuote[groupId];
    await openPRNewModel(currentPR.id);
  }
}

async function handlePMRejectGroup(groupId) {
  const reason = prompt('Reason for rejecting this PO Group\'s quotation:');
  if (reason === null) return;
  const { data: group } = await db.from('po_groups').select('*').eq('id', groupId).single();
  await setPOGroupPhase(group, 'rejected', { rejection_reason: reason });
  showToast('PO Group rejected.', 'error');
  notifyRoleOfPOGroupEvent(currentPR.id, `"${group.group_label}" quotation rejected on PR-${String(currentPR.request_number).padStart(4,'0')} — ${reason}`, 'procurement');
  await openPRNewModel(currentPR.id);
}

// Replaces the old prompt()-only PO number entry with the same rich
// "PO Paper" preview/PDF/branding flow Procurement already uses for
// single-vendor requests (openPOModal/confirmGeneratePO in
// procurement.html) — just scoped to this one group's parts, vendor,
// and selected quotation instead of the whole PR. Reuses the same
// #poModal shell and its generic helpers (recalcPO, downloadPO,
// _freezePOInputs/_restorePOInputs, numToWords, PAYMENT_TERMS_OPTIONS),
// which only exist on procurement.html — the only page this button
// renders on (Place Order is procurement-role-only, see renderPOGroupActions).
async function handlePlaceOrderForGroup(groupId) {
  await openPOGroupModal(groupId);
}

async function openPOGroupModal(groupId) {
  showLoader(true);
  const { data: group } = await db.from('po_groups').select('*, vendors(*)').eq('id', groupId).single();
  const partLines = await dbFetch(() => db.from('request_part_lines').select('*').eq('po_group_id', groupId).order('part_index'), 'group part lines');
  const groupQuotes = await dbFetch(() => db.from('po_group_quotations').select('*').eq('po_group_id', groupId), 'group quotations');
  showLoader(false);

  const pr = currentPR;
  const vendor = group.vendors || null;
  const selectedQ = (groupQuotes || []).find(q => q.id === group.selected_quotation_id) || (groupQuotes || []).find(q => q.is_selected) || (groupQuotes || [])[0] || null;

  const now = new Date();
  const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyShort = `${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
  const groupTag = (group.group_label || 'GRP').replace(/[^A-Za-z0-9]/g, '').substring(0, 6).toUpperCase() || 'GRP';
  const poNumber = `IIIPO/${fyShort}/${String(pr.request_number).padStart(4, '0')}-${groupTag}`;
  const todayStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/');
  const deliveryDate = selectedQ?.lead_time_days
    ? new Date(Date.now() + selectedQ.lead_time_days * 86400000).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/')
    : '—';
  const pt = (window.PAYMENT_TERMS_OPTIONS || []).find(p => p.value === vendor?.payment_terms);
  const ptLabel = vendor?.payment_terms === 'custom' ? (vendor?.custom_payment_terms || 'Custom Terms') : (pt?.label || 'As agreed');
  const currency = selectedQ?.currency || 'INR';
  const currSymbol = currency === 'INR' ? '₹' : currency;

  const baseAmt = parseFloat(selectedQ?.amount || 0);
  const cgstPct = 9, sgstPct = 9;
  const cgstAmt = Math.round(baseAmt * cgstPct / 100 * 100) / 100;
  const sgstAmt = Math.round(baseAmt * sgstPct / 100 * 100) / 100;
  const netPayable = baseAmt + cgstAmt + sgstAmt;

  const savedLogo = localStorage.getItem('po_logo');
  const savedSig = localStorage.getItem('po_sig');
  const logoSrc = savedLogo || 'https://nxhvxfvfhvbkymgvmwwi.supabase.co/storage/v1/object/public/assets/Inventindia_Logo-2.png';
  const sigSrc = savedSig || '../stamp.png';

  const defaultTermsHTML = `- <strong>Packing :</strong> Goods must be packed in new containers with clear markings for content, gross weight, tare weight, net weight, and hazard info. We will reject goods that don't meet these packing requirements.
- <strong>Delivery :</strong> Goods should be delivered at the desired destination between 9 AM to 5 PM. We shall allow the delivery of the vehicle inside our premises at any time, but unloading of goods is as per Instructions.
- <strong>Payment :</strong> This will be according to the terms mentioned in the Purchase Order.
- <strong>Weight &amp; Purity :</strong> Both the parameters should be in accordance with the order form. Any difference in weight or purity will be calculated to achieve the real quantity supplied and payment shall be made on this real quantity.
- <strong>Mandatory Documents Set :</strong> Material supplied should be accompanied with invoice for buyer along with duplicate for transporter. All supplied document/s must clearly indicate our purchase order number &amp; date, else the payment may not be processed.
- <strong>Jurisdiction :</strong> Subject To Ahmedabad jurisdiction only.`;

  document.getElementById('poModalSub').textContent = `${poNumber} — ${pr.project_name} (${group.group_label})`;

  const partsArr = (partLines || []).length ? partLines : [{ name: group.group_label || '—', qty: 1, spec: '' }];
  const totalQty = partsArr.reduce((s, x) => s + (x.qty || 1), 0) || 1;
  const itemRows = partsArr.map((p, i) => {
    const unitRate = partsArr.length > 1 ? (baseAmt / totalQty) : (baseAmt / (p.qty || 1));
    const rowTotal = unitRate * (p.qty || 1);
    return `<tr>
      <td class="center">${i + 1}</td>
      <td class="center"><input class="po-meta-input" style="text-align:center" placeholder="—"/></td>
      <td><div class="item-desc-main">${p.name || '—'}</div>${p.spec ? `<div class="item-desc-sub">${p.spec}</div>` : ''}</td>
      <td class="center"><input class="po-meta-input" style="text-align:center" placeholder="—"/></td>
      <td class="center">${p.qty || 1}</td>
      <td class="center">${p.uom || 'Nos'}</td>
      <td class="right"><input class="po-meta-input" id="pog-unitrate-${i}" style="text-align:right" type="number" value="${unitRate.toFixed(2)}" oninput="recalcPOGroupRow(${i},${p.qty || 1})"/></td>
      <td class="right" id="pog-rowtotal-${i}">${currSymbol} ${rowTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    </tr>`;
  }).join('');

  document.getElementById('poModalBody').innerHTML = `
    <div style="margin-bottom:12px;padding:9px 12px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);border-radius:6px;font-size:0.78rem;display:flex;align-items:center;flex-wrap:wrap;gap:12px">
      <span>⚙️ Review and edit fields directly in the PO below. Adjust tax rates here:</span>
      <div style="display:flex;gap:8px;align-items:center;margin-left:auto;flex-wrap:wrap">
        <label style="font-size:0.74rem;white-space:nowrap">CGST %</label>
        <input id="cgstInput" type="number" value="${cgstPct}" class="po-tax-input" onchange="recalcPO()"/>
        <label style="font-size:0.74rem;white-space:nowrap">SGST %</label>
        <input id="sgstInput" type="number" value="${sgstPct}" class="po-tax-input" onchange="recalcPO()"/>
        <label style="font-size:0.74rem;white-space:nowrap">P&amp;F</label>
        <input id="pnfInput" type="number" value="0" class="po-tax-input" style="width:70px" onchange="recalcPO()"/>
      </div>
    </div>

    <div id="poPreviewBox">
      <div class="po-top-bar">
        <div style="width:130px"></div>
        <div class="po-paper-title">Purchase Order</div>
        <div id="poLogoSlot" style="width:130px;display:flex;justify-content:flex-end">
          <img src="${logoSrc}" class="po-logo-img" alt="Logo" crossorigin="anonymous" onerror="this.style.display='none'"/>
        </div>
      </div>

      <div class="po-addr-grid" style="border-top:1px solid #999">
        <div class="po-addr-cell">
          <div class="cell-head">Name and Address of Buyer :</div>
          <div class="company-name">INVENTINDIA INNOVATIONS PVT. LTD.</div>
          Ch03, Inspire Business Park,<br/>
          Adani Shantigram, Near Vaishnodevi Circle, Gandhinagar,<br/>
          Ahmedabad (Gujarat) India - 382421<br/>
          GSTIN : 24AACCI7644H1ZK<br/>
          Contact Person: Jaimin Prajapati<br/>
          Email: Jaimin.p@inventindia.com<br/>
          Contact No.: 9924077107<br/>
          Place of Supply: Gujarat.India
        </div>
        <div class="po-addr-cell">
          <table style="width:100%;font-size:0.74rem">
            <tr><td style="font-weight:600;white-space:nowrap;padding-right:6px;padding-bottom:2px">PO Number :</td><td><input class="po-meta-input" id="poPreviewNum" value="${poNumber}" style="font-weight:700;font-size:0.82rem"/></td></tr>
            <tr><td style="font-weight:600;white-space:nowrap;padding-right:6px;padding-bottom:2px">PO Date :</td><td><input class="po-meta-input" id="poDate" value="${todayStr}"/></td></tr>
            <tr><td style="font-weight:600;white-space:nowrap;padding-right:6px;padding-bottom:2px">Delivery Date :</td><td><input class="po-meta-input" id="poDelivery" value="${deliveryDate}"/></td></tr>
            <tr><td style="font-weight:600;white-space:nowrap;padding-right:6px;padding-bottom:2px">Payment Terms :</td><td>${ptLabel}</td></tr>
            <tr><td style="font-weight:600;white-space:nowrap;padding-right:6px;padding-bottom:2px">Delivery Terms :</td><td>NA</td></tr>
            <tr><td style="font-weight:600;white-space:nowrap;padding-right:6px;padding-bottom:2px">Mode of Transport :</td><td>NA</td></tr>
            <tr><td style="font-weight:600;white-space:nowrap;padding-right:6px;padding-bottom:2px">Final Destination :</td><td>Inventindia</td></tr>
            <tr><td style="font-weight:600;white-space:nowrap;padding-right:6px;padding-bottom:2px">Quote Ref :</td><td><input class="po-meta-input" id="poQuoteRef" placeholder="—"/></td></tr>
            <tr><td style="font-weight:600;white-space:nowrap;padding-right:6px;padding-bottom:2px">Indent Number :</td><td><input class="po-meta-input" id="poIndent" value="NA"/></td></tr>
            <tr><td style="font-weight:600;white-space:nowrap;padding-right:6px;padding-bottom:2px">Project Code/Name :</td><td><input class="po-meta-input" id="poProjectCode" value="${pr.project_name || 'NA'} — ${group.group_label || ''}"/></td></tr>
          </table>
        </div>
      </div>

      <div class="po-addr-grid">
        <div class="po-addr-cell">
          <div class="cell-head">Name and Address of Supplier :</div>
          <div class="company-name">${vendor?.name || group.group_label || '—'}</div>
          ${vendor?.address ? vendor.address + '<br/>' : ''}
          ${vendor?.contact_person ? `Contact: ${vendor.contact_person}<br/>` : ''}
          ${vendor?.phone ? `Phone: ${vendor.phone}<br/>` : ''}
          ${vendor?.email ? `${vendor.email}<br/>` : ''}
          ${vendor?.GSTIN ? `GSTIN : ${vendor.GSTIN}<br/>` : ''}
          ${vendor?.country ? `Country : ${vendor.country}<br/>` : ''}
          ${vendor?.vendor_type ? `Vendor Type : ${vendor.vendor_type}<br/>` : ''}
          Place of Supply: Gujarat.India
        </div>
        <div class="po-addr-cell">
          <div class="cell-head">Shipping Details :</div>
          <div class="company-name">INVENTINDIA INNOVATIONS PVT. LTD.</div>
          Ch03, Inspire Business Park,<br/>
          Adani Shantigram, Ahmedabad (Gujarat) India - 382421<br/>
          GSTIN : 24AACC17644H1ZK<br/>
          Contact Person: Jaimin Prajapati<br/>
          Email: Jaimin.p@inventindia.com<br/>
          Contact No.: 9924077107<br/>
          Place of Supply: Gujarat.India
        </div>
      </div>

      <table class="po-items-table">
        <thead>
          <tr>
            <th style="width:42px">Sr No</th>
            <th style="width:72px">Item Code</th>
            <th>Description</th>
            <th style="width:72px">HSN/SAC Code</th>
            <th style="width:64px">Quantity</th>
            <th style="width:52px">UOM</th>
            <th style="width:82px">Unit Rate</th>
            <th style="width:96px">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          <tr style="height:22px"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
          <tr style="height:22px"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        </tbody>
      </table>

      <div class="po-bottom-grid">
        <div class="po-left-bottom">
          <div class="bank-section">
            <div style="font-weight:700;font-size:0.71rem;margin-bottom:5px">Bank Details:</div>
            <table style="width:100%">
              <tr><td>Account Holder Name</td><td>: Inventindia Innovations Private Limited</td></tr>
              <tr><td>Bank Name</td><td>: ICICI Bank</td></tr>
              <tr><td>A/C No</td><td>: 461105000085</td></tr>
              <tr><td>IFCS Code</td><td>: ICIC0004611</td></tr>
            </table>
          </div>
          <div class="po-terms-section">
            <div class="terms-head">Terms &amp; Conditions:</div>
            <div id="poTermsEditable" class="po-terms-editable" contenteditable="true">${defaultTermsHTML}</div>
          </div>
        </div>

        <div>
          <table class="po-amount-table">
            <tr><td>Basic Amount :</td><td id="poBasicAmt">${currSymbol} ${baseAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
            <tr><td>Discount (%) :</td><td id="poDiscount">0.00</td></tr>
            <tr><td>Amount after Discount :</td><td id="poAfterDiscount">${currSymbol} ${baseAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
            <tr><td>P&amp;F Charge :</td><td id="poPnf">${currSymbol} 0.00</td></tr>
            <tr><td>CGST % &nbsp; <span id="poCgstPctLabel">${cgstPct}</span>.00 :</td><td id="poCgst">${currSymbol} ${cgstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
            <tr><td>SGST % &nbsp; <span id="poSgstPctLabel">${sgstPct}</span>.00 :</td><td id="poSgst">${currSymbol} ${sgstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
            <tr class="net-row"><td>Net Payable (INR) :</td><td id="poNet">${currSymbol} ${netPayable.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</td></tr>
            <tr class="words-row"><td colspan="2"><strong>Amount in words :</strong><br/><span id="poWords">${(window.numToWords ? numToWords(netPayable) : '')}</span></td></tr>
          </table>

          <div class="po-sig-section">
            <div class="po-sig-img-wrap">
              <div id="poSigSlot">
                <img src="${sigSrc}" alt="Authorized Signatory" style="max-height:68px;max-width:100%;object-fit:contain" onerror="this.style.display='none'"/>
              </div>
            </div>
            <div class="po-sig-label">(Authorized Signatory)</div>
          </div>
        </div>
      </div>

      <div class="po-doc-footer">
        <span>This is a computer generated document</span>
        <span>Jurisdiction : Subject To Ahmedabad jurisdiction only.</span>
      </div>
    </div>
  `;

  window._poBaseAmt = baseAmt;
  window._poCurrSymbol = currSymbol;
  window._poCgstPct = cgstPct;
  window._poSgstPct = sgstPct;
  window._poGroupPartsArr = partsArr;
  window._poGroupId = groupId;
  window._poGroupSelectedQuoteId = selectedQ?.id || null;

  // Point the modal's Confirm button at the group-scoped save handler
  // instead of the legacy single-PO confirmGeneratePO(). Download PDF
  // stays wired to the existing generic downloadPO() (works off
  // #poPreviewBox regardless of which flow opened the modal).
  const confirmBtn = document.querySelector('#poModal .modal-footer .btn-primary');
  if (confirmBtn) confirmBtn.setAttribute('onclick', `confirmGeneratePOGroupOrder('${groupId}')`);

  openModal('poModal');
}
window.openPOGroupModal = openPOGroupModal;

// Group-scoped row recalculation — mirrors legacy recalcPORow but reads
// from window._poGroupPartsArr (this group's own part lines) instead of
// currentPR.parts, since a PR with several PO Groups has several
// independent part sets and totals.
function recalcPOGroupRow(idx, qty) {
  const input = document.getElementById(`pog-unitrate-${idx}`);
  const totalCell = document.getElementById(`pog-rowtotal-${idx}`);
  const sym = window._poCurrSymbol || '₹';
  if (!input || !totalCell) return;
  const unitRate = parseFloat(input.value) || 0;
  const rowTotal = unitRate * qty;
  totalCell.textContent = `${sym} ${rowTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const partsArr = window._poGroupPartsArr && window._poGroupPartsArr.length ? window._poGroupPartsArr : [{ qty: 1 }];
  let newBase = 0;
  partsArr.forEach((p, i) => {
    const el = document.getElementById(`pog-unitrate-${i}`);
    newBase += (parseFloat(el?.value) || 0) * (p.qty || 1);
  });
  window._poBaseAmt = newBase;
  const basicEl = document.getElementById('poBasicAmt');
  if (basicEl) basicEl.textContent = `${sym} ${newBase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const afterEl = document.getElementById('poAfterDiscount');
  if (afterEl) afterEl.textContent = `${sym} ${newBase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  if (typeof recalcPO === 'function') recalcPO();
}
window.recalcPOGroupRow = recalcPOGroupRow;

// Group-scoped save: mirrors confirmGeneratePO() — captures the PO
// paper as a PDF, uploads it, records the purchase_orders row (tagged
// with po_group_id so it's attributable to this specific vendor split),
// attaches it to the PR, comments, and advances the group's phase.
async function confirmGeneratePOGroupOrder(groupId) {
  showLoader(true);
  const poNumber = document.getElementById('poPreviewNum')?.value || '';
  const cgstPct = parseFloat(document.getElementById('cgstInput')?.value || 9);
  const sgstPct = parseFloat(document.getElementById('sgstInput')?.value || 9);
  const pnf = parseFloat(document.getElementById('pnfInput')?.value || 0);
  const base = window._poBaseAmt || 0;
  const netPayable = base + Math.round(base * cgstPct / 100 * 100) / 100 + Math.round(base * sgstPct / 100 * 100) / 100 + pnf;

  const { data: group } = await db.from('po_groups').select('*').eq('id', groupId).single();
  const currency = window._poCurrSymbol === '₹' ? 'INR' : (window._poCurrSymbol || 'INR');

  // A group can only ever get one purchase_orders row (Place Order isn't
  // re-clickable once order_placed). If one's already there, this call is
  // a PDF-attach retry (see "⚠️ PDF not attached" below) — reuse the
  // existing record instead of inserting a duplicate, and don't re-advance
  // the phase or re-post the "PO generated" comment a second time.
  const { data: existingPO } = await db.from('purchase_orders').select('*').eq('po_group_id', groupId).maybeSingle();

  if (!existingPO) {
    // Step 1: save the PO record itself, tagged to this group.
    // NOTE: purchase_orders.quotation_id has a foreign key into pr_quotations
    // (the legacy single-PO quotes table). This group flow selects from
    // po_group_quotations instead — a different table with its own id space —
    // so writing that id into quotation_id always violates the FK. It goes
    // into po_group_quotation_id (its own FK into po_group_quotations)
    // instead; quotation_id is left null for group-flow POs.
    const { error: poErr } = await db.from('purchase_orders').insert({
      pr_id: group.pr_id, po_group_id: groupId, po_number: poNumber, po_date: new Date().toISOString(),
      vendor_id: group.vendor_id, po_group_quotation_id: window._poGroupSelectedQuoteId || null,
      total_amount: netPayable, currency, generated_by: currentUser.id,
    });
    if (poErr) { showLoader(false); showToast('Error saving PO: ' + poErr.message, 'error'); return; }
  }

  // Step 2: render the PO paper to PDF and upload it. Everything above is
  // a plain DB write and basically can't fail; this step involves
  // html2canvas + jsPDF + a Storage upload, all of which can throw for
  // reasons outside our control (a slow-loading logo image, a storage
  // policy hiccup) — which is exactly why it's kept behind its own
  // try/catch instead of one wrapping the whole function: a failure here
  // must never take down the PO record that's already safely saved above.
  // The trade-off is that it CAN fail silently from the user's point of
  // view (PO shows up, no PDF) — that's what the retry affordance in
  // renderPOGroupDocsAndPayments() ("⚠️ PDF not attached — Generate PDF")
  // is for; it re-invokes this exact function, which is why the
  // existingPO check above matters.
  let pdfUrl = null;
  try {
    const previewEl = document.getElementById('poPreviewBox');
    const frozen = _freezePOInputs(previewEl);
    const canvas = await html2canvas(previewEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    _restorePOInputs(frozen);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const imgW = 210;
    const imgH = (canvas.height * imgW) / canvas.width;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, imgH);

    const pdfBlob = pdf.output('blob');
    const fileName = `${poNumber.replace(/\//g, '-')}_${Date.now()}.pdf`;
    const storagePath = `po/${group.pr_id}/${groupId}/${fileName}`;

    const { error: uploadErr } = await db.storage.from('attachments').upload(storagePath, pdfBlob, { contentType: 'application/pdf' });
    if (uploadErr) {
      console.warn('Storage upload failed:', uploadErr.message, '— falling back to base64 storage');
      try {
        const reader = new FileReader();
        const base64Url = await new Promise((res, rej) => { reader.onload = () => res(reader.result); reader.onerror = rej; reader.readAsDataURL(pdfBlob); });
        await db.from('pr_attachments').insert({
          pr_id: group.pr_id, po_group_id: groupId, uploaded_by: currentUser.id, attachment_type: 'other',
          file_name: `PO_${poNumber.replace(/\//g, '-')}.pdf`, file_url: base64Url,
        });
        pdfUrl = base64Url;
      } catch (fbErr) {
        console.warn('Base64 fallback also failed:', fbErr);
        showToast('PO saved — PDF could not be stored: ' + uploadErr.message, 'error');
      }
    } else {
      const { data: urlData } = db.storage.from('attachments').getPublicUrl(storagePath);
      pdfUrl = urlData?.publicUrl;
      await db.from('pr_attachments').insert({
        pr_id: group.pr_id, po_group_id: groupId, uploaded_by: currentUser.id, attachment_type: 'other',
        file_name: `PO_${poNumber.replace(/\//g, '-')}.pdf`, file_url: pdfUrl,
      });
    }
  } catch (pdfErr) {
    console.warn('PDF generation failed:', pdfErr);
    showToast('PO saved — PDF generation failed: ' + pdfErr.message, 'error');
  }

  // Step 3: advance phase + comment + notify — only the first time. A
  // retry that's just backfilling a missing PDF must not re-fire
  // notifications or bounce the phase (it's already order_placed, possibly
  // even further along by now).
  if (!existingPO) {
    await setPOGroupPhase(group, 'order_placed');
    const commentText = pdfUrl
      ? `📄 Purchase Order ${poNumber} generated for "${group.group_label}". Net Payable: ${window._poCurrSymbol || '₹'}${netPayable.toLocaleString('en-IN')} — [View PO PDF](${pdfUrl})`
      : `📄 Purchase Order ${poNumber} generated for "${group.group_label}". Net Payable: ${window._poCurrSymbol || '₹'}${netPayable.toLocaleString('en-IN')}`;
    if (typeof window.postComment === 'function') await window.postComment(group.pr_id, currentUser.id, commentText);
  } else if (pdfUrl && typeof window.postComment === 'function') {
    await window.postComment(group.pr_id, currentUser.id, `📎 PDF re-attached for Purchase Order ${poNumber} ("${group.group_label}") — [View PO PDF](${pdfUrl})`);
  }

  showLoader(false);
  if (!pdfUrl) {
    showToast(`PO ${poNumber} saved, but the PDF still failed to attach — check your connection and try "Generate PDF" again from the PO panel.`, 'error');
  } else {
    showToast(`PO ${poNumber} ${existingPO ? 'PDF attached' : 'generated & saved as attachment'}!`, 'success');
  }
  closeModal('poModal');
  await openPRNewModel(currentPR.id);
}
window.confirmGeneratePOGroupOrder = confirmGeneratePOGroupOrder;

async function handleInvokeGRNForGroup(groupId) {
  const { data: group } = await db.from('po_groups').select('*').eq('id', groupId).single();
  await setPOGroupPhase(group, 'grn_pending');
  notifyRoleOfPOGroupEvent(currentPR.id, `Goods received for "${group.group_label}" — GRN/QC needed on PR-${String(currentPR.request_number).padStart(4,'0')}.`, 'engineer');
  await openPRNewModel(currentPR.id);
}

async function handleSubmitGRN(groupId, passed) {
  const { data: group } = await db.from('po_groups').select('*').eq('id', groupId).single();
  const partLines = await fetchPartLines(currentPR.id);
  const groupParts = partLines.filter(p => p.po_group_id === groupId);
  const lines = groupParts.map((p, i) => ({
    name: p.name,
    received: parseFloat(document.getElementById(`grnRcvd-${groupId}-${i}`)?.value || 0),
    accepted: parseFloat(document.getElementById(`grnAccpt-${groupId}-${i}`)?.value || 0),
  }));
  await submitPOGroupGRN(groupId, {
    qc_result: passed ? 'qc_passed' : 'qc_failed',
    lines,
  }, currentUser?.id);
  const prLabel = `PR-${String(currentPR.request_number).padStart(4,'0')}`;
  if (passed) {
    notifyRoleOfPOGroupEvent(currentPR.id, `QC passed for "${group.group_label}" — ready for payment on ${prLabel}.`, 'accounts');
  } else {
    notifyRoleOfPOGroupEvent(currentPR.id, `QC failed for "${group.group_label}" on ${prLabel} — sent to Rework/Return.`, 'procurement');
  }
  await openPRNewModel(currentPR.id);
}

async function handleResubmitRework(groupId) {
  const { data: group } = await db.from('po_groups').select('*').eq('id', groupId).single();
  await resubmitAfterRework(group);
  notifyRoleOfPOGroupEvent(currentPR.id, `Vendor reshipped for "${group.group_label}" — GRN/QC needed again on PR-${String(currentPR.request_number).padStart(4,'0')}.`, 'engineer');
  await openPRNewModel(currentPR.id);
}

async function handleRecordPayment(groupId) {
  const type = document.getElementById(`payType-${groupId}`)?.value || 'full';
  const amt = parseFloat(document.getElementById(`payAmt-${groupId}`)?.value || 0);
  const poValue = parseFloat(document.getElementById(`payPoValue-${groupId}`)?.value || 0) || null;
  const smartsheetId = document.getElementById(`paySmartsheetId-${groupId}`)?.value?.trim() || null;
  const screenshotFile = document.getElementById(`payScreenshot-${groupId}`)?.files?.[0] || null;
  if (!amt) { showToast('Enter a payment amount.', 'error'); return; }
  let screenshotUrl = null;
  if (screenshotFile) {
    showLoader(true);
    try { screenshotUrl = (await uploadFileToStorage(screenshotFile, `pr/${currentPR.id}/po-group-payments`)).url; }
    catch (e) { showLoader(false); showToast('Screenshot upload error: ' + e.message, 'error'); return; }
    showLoader(false);
  }
  await recordPOGroupPayment(groupId, type, amt, 'INR', poValue, currentUser?.id, smartsheetId, screenshotUrl);
  const { data: group } = await db.from('po_groups').select('*').eq('id', groupId).single();
  if (group.phase === 'closed' && currentPR.created_by) {
    notifyUserOfPOGroupEvent(currentPR.id, currentPR.created_by, `"${group.group_label}" fully paid and closed on PR-${String(currentPR.request_number).padStart(4,'0')}.`);
  }
  await openPRNewModel(currentPR.id);
}

window.renderPOGroupActions = renderPOGroupActions;
window.handleCreatePOGroup = handleCreatePOGroup;
window.handleAddPOGroupQuote = handleAddPOGroupQuote;
window.handleSharePOGroupQuotes = handleSharePOGroupQuotes;
window.renderPOGroupQuotationCard = renderPOGroupQuotationCard;
window.handleRequoteGroup = handleRequoteGroup;
window.handlePMApproveGroup = handlePMApproveGroup;
window.handlePMRejectGroup = handlePMRejectGroup;
window.handlePlaceOrderForGroup = handlePlaceOrderForGroup;
window.handleInvokeGRNForGroup = handleInvokeGRNForGroup;
window.handleSubmitGRN = handleSubmitGRN;
window.handleResubmitRework = handleResubmitRework;
window.handleRecordPayment = handleRecordPayment;

// ── LIST-VIEW DECORATION ────────────────────────────────────────────
// Call after rendering a request table. For every row whose request is
// part/PO-group-tracked, replaces the placeholder phase-badge cell with
// the PO Group chip strip, and the lead-time cell with BOTH a per-request
// (worst-case, slowest PO) figure and, on hover/title, the per-PO figures
// — satisfying "both, shown separately" without needing a wider table.
// Expects the row markup to include `id="phase-cell-${req.id}"` and
// `id="leadtime-cell-${req.id}"` on the relevant <td> elements.
async function decoratePartLevelListRows(reqs) {
  const targets = (reqs || []).filter(r => r.is_legacy === false);
  if (!targets.length) return;

  const ids = targets.map(r => r.id);
  const allGroups = await dbFetch(
    () => db.from('po_groups').select('*, vendors(name)').in('pr_id', ids).eq('current_version', true),
    'list-view PO groups'
  );
  const byPr = {};
  (allGroups || []).forEach(g => (byPr[g.pr_id] = byPr[g.pr_id] || []).push(g));

  targets.forEach(r => {
    const groups = byPr[r.id] || [];
    const phaseCell = document.getElementById(`phase-cell-${r.id}`);
    if (phaseCell) phaseCell.innerHTML = renderPOGroupChips(groups);

    const ltCell = document.getElementById(`leadtime-cell-${r.id}`);
    if (ltCell) {
      const now = Date.now();
      const perPO = groups.map(g => {
        const created = new Date(g.created_at).getTime();
        const closedAt = PO_GROUP_TERMINAL.has(g.phase) ? new Date(g.updated_at).getTime() : now;
        return { label: g.group_label, days: Math.round((closedAt - created) / 86400000) };
      });
      const worst = perPO.length ? Math.max(...perPO.map(p => p.days)) : null;
      const title = perPO.map(p => `${p.label}: ${p.days}d`).join(' · ');
      ltCell.innerHTML = worst === null ? '—' :
        `<span title="${title}" style="font-family:var(--font-mono);font-size:0.75rem" data-sort-value="${worst}">${worst}d <span style="color:var(--gray-4)">(slowest PO)</span></span>`;
    }
  });
}
window.decoratePartLevelListRows = decoratePartLevelListRows;

// ── SORTABLE COLUMNS — generic client-side helper ───────────────────
// Attach to any <th> via onclick="sortRowsBy(reqsArray, 'created_at', renderFn, this)".
// Toggles asc/desc, re-renders via the passed render function, and marks
// the active header with a ▲/▼ indicator so it works consistently across
// every role's page without bespoke per-column sort code.
let _lastSortKey = null, _lastSortDir = 1;
function sortRowsBy(rows, key, renderFn, thEl) {
  _lastSortDir = (_lastSortKey === key) ? -_lastSortDir : 1;
  _lastSortKey = key;
  const sorted = [...rows].sort((a, b) => {
    let av = a[key], bv = b[key];
    // Prefer a data-sort-value if the cell computed one (e.g. lead time days)
    if (key === '__leadtime__') {
      const ac = document.getElementById(`leadtime-cell-${a.id}`);
      const bc = document.getElementById(`leadtime-cell-${b.id}`);
      av = ac?.querySelector('[data-sort-value]')?.dataset.sortValue ?? -1;
      bv = bc?.querySelector('[data-sort-value]')?.dataset.sortValue ?? -1;
    }
    if (av == null) av = '';
    if (bv == null) bv = '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    return av > bv ? _lastSortDir : av < bv ? -_lastSortDir : 0;
  });
  if (thEl) {
    thEl.parentNode.querySelectorAll('th').forEach(th => th.removeAttribute('data-sort-dir'));
    thEl.setAttribute('data-sort-dir', _lastSortDir === 1 ? 'asc' : 'desc');
  }
  renderFn(sorted);
}
window.sortRowsBy = sortRowsBy;

// ── QUEUE VISIBILITY: which requests need this role's attention ────
// Legacy pages filter their "action needed" tab by procurement_requests
// .phase — which freezes the instant a request becomes part-tracked
// (is_legacy=false), since the real state moved to po_groups. Without
// this, a part-tracked request needing e.g. PM approval would silently
// never appear in PM's Clearance/Final tabs. This computes the same
// thing from po_groups so every page's existing tab logic can OR it in.
const ROLE_ACTION_PHASES = {
  procurement: ['quotation_pending', 'pm_approved', 'order_placed'],
  engineer:    ['quoted', 'grn_pending'],
  pm:          ['pending_pm_approval'],
  accounts:    ['qc_passed', 'payment_pending'],
  master:      [],
};
const ROLE_TO_DB_ROLE = {
  procurement: 'procurement_manager',
  pm:          'project_manager',
  engineer:    'engineer',
  accounts:    'accounts',
  master:      'master',
};

// Returns a Set of procurement_requests.id that have at least one
// current-version PO Group sitting in a phase this role needs to act on.
// For 'procurement' specifically, also includes requests with parts that
// haven't been grouped to a vendor yet — grouping itself is an action.
async function fetchActionableRequestIds(prIds, role) {
  const phases = ROLE_ACTION_PHASES[role];
  const ids = (prIds || []).filter(Boolean);
  if (!ids.length) return new Set();

  const result = new Set();
  if (phases && phases.length) {
    const rows = await dbFetch(
      () => db.from('po_groups').select('pr_id').in('pr_id', ids).eq('current_version', true).in('phase', phases),
      'actionable PO groups'
    );
    (rows || []).forEach(r => result.add(r.pr_id));
  }
  if (role === 'procurement') {
    const ungrouped = await dbFetch(
      () => db.from('request_part_lines').select('pr_id').in('pr_id', ids).eq('status', 'unassigned'),
      'ungrouped part lines'
    );
    (ungrouped || []).forEach(r => result.add(r.pr_id));
  }
  return result;
}
window.fetchActionableRequestIds = fetchActionableRequestIds;

// Call once after a page loads its request list, before first render.
// Stamps `_hasPartLevelAction` onto each request object so existing
// tab-filter and needsAction logic can simply add `|| r._hasPartLevelAction`
// without needing to know anything about po_groups.
async function stampPartLevelActionFlags(requests, role) {
  const partTracked = (requests || []).filter(r => r.is_legacy === false);
  if (!partTracked.length) return requests;
  const actionable = await fetchActionableRequestIds(partTracked.map(r => r.id), role);
  requests.forEach(r => { r._hasPartLevelAction = actionable.has(r.id); });
  return requests;
}
window.stampPartLevelActionFlags = stampPartLevelActionFlags;

// ── IN-APP NOTIFICATIONS on PO Group handoffs ───────────────────────
// Uses the existing `notifications` table directly (same one @mentions
// use) rather than the notify-phase Edge Function, since that function
// is built around legacy phase strings — calling it with PO Group phase
// names (e.g. 'quotation_pending', 'pm_approved') risks a mismatched or
// silently wrong notification. This is self-contained and safe.
async function notifyRoleOfPOGroupEvent(prId, message, role) {
  try {
    const dbRole = ROLE_TO_DB_ROLE[role];
    if (!dbRole) return;
    const users = await dbFetch(() => db.from('users').select('id').eq('role', dbRole), 'role users');
    if (!users || !users.length) return;
    const rows = users.map(u => ({ user_id: u.id, pr_id: prId, message, is_read: false }));
    await db.from('notifications').insert(rows);
  } catch (e) {
    console.warn('[po-groups] notification (non-blocking):', e.message);
  }
}
async function notifyUserOfPOGroupEvent(prId, userId, message) {
  if (!userId) return;
  try { await db.from('notifications').insert({ user_id: userId, pr_id: prId, message, is_read: false }); }
  catch (e) { console.warn('[po-groups] notification (non-blocking):', e.message); }
}
window.notifyRoleOfPOGroupEvent = notifyRoleOfPOGroupEvent;
window.notifyUserOfPOGroupEvent = notifyUserOfPOGroupEvent;
window.PO_GROUP_PHASES = PO_GROUP_PHASES;
window.poGroupPhaseMeta = poGroupPhaseMeta;

// Every page names its list-reload function `loadRequests` (Procurement,
// Engineer, PM, Master) except Accounts, which has `loadPartLevelPayments`
// for its dedicated tab. Calling whichever exists on the current page
// keeps the background list honest the moment the modal closes.
function refreshUnderlyingList() {
  try {
    if (typeof window.loadRequests === 'function') window.loadRequests();
    else if (typeof window.loadPartLevelPayments === 'function') window.loadPartLevelPayments();
  } catch (e) { console.warn('[po-groups] list refresh on close failed (non-blocking):', e.message); }
}
window.refreshUnderlyingList = refreshUnderlyingList;
window.poGroupPhaseBadgeHTML = poGroupPhaseBadgeHTML;
window.ensurePartLinesExist = ensurePartLinesExist;
window.fetchPartLines = fetchPartLines;
window.fetchPOGroups = fetchPOGroups;
window.createPOGroupFromParts = createPOGroupFromParts;
window.ungroupPartLine = ungroupPartLine;
window.requoteCycle = requoteCycle;
window.setPOGroupPhase = setPOGroupPhase;
window.submitPOGroupGRN = submitPOGroupGRN;
window.resubmitAfterRework = resubmitAfterRework;
window.recordPOGroupPayment = recordPOGroupPayment;
window.computeRollupLabel = computeRollupLabel;
window.renderPOGroupChips = renderPOGroupChips;
window.renderPOGroupCard = renderPOGroupCard;
window.renderUngroupedPartsPanel = renderUngroupedPartsPanel;
