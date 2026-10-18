/* ============================================================================
   06-tools.js — Rate Calculator + Margin Engine
   v6 — Adds dirty state tracking for the Margin Engine.
   ============================================================================ */

/* ══════════════════════════════════════════════════════════════════════
   CONSTANTS & STATE
   ══════════════════════════════════════════════════════════════════════ */
const RATE_CURRENCIES = ['USD','EUR','GBP','AUD','CAD','INR','SGD','THB','JPY','MYR','IDR','VND','PHP','CNY'];

const TOOLS_LS = {
  rate: 'docforbro:rateState',
};

function defaultRateState() {
  return {
    currency: 'USD',
    income: 70000,
    tax: 28,
    expenses: [
      { id: uid(), name: 'Software',  amount: 60,  freq: 'monthly' },
      { id: uid(), name: 'Equipment', amount: 150, freq: 'monthly' },
    ],
    totalHours: 40,
    billableHours: 25,
    vacation: 4,
    revRounds: 3,
    revHours: 2,
  };
}

function defaultMarginForm() {
  return {
    name: '', client: '', contactId: '',
    revenue: 2000,
    quotedHours: 10,
    actualHours: 16,
    expenses: [],
  };
}

let rateState           = defaultRateState();
let rateProfiles        = [];
let activeRateProfileId = null;

let marginProjects     = [];
let editingProjectId   = null;
let selectedProjectIds = new Set();
let marginFormState    = defaultMarginForm();
let marginSearch       = '';

let _activeProjectId   = null;
let _projectDetailTab  = 'info'; /* 'info' | 'activity' */

/* ══════════════════════════════════════════════════════════════════════
   MAPPERS
   ══════════════════════════════════════════════════════════════════════ */
function mapRateProfileFromDb(row) {
  return {
    id:        row.id,
    name:      row.name || 'Rate profile',
    data:      row.data || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

function mapMarginProjectFromDb(row) {
  return {
    id:            row.id,
    name:          row.name || 'Project',
    client:        row.client || '',
    contactId:     row.contact_id || null,
    revenue:       Number(row.revenue) || 0,
    quotedHours:   Number(row.quoted_hours) || 0,
    actualHours:   Number(row.actual_hours) || 0,
    expenses:      Array.isArray(row.expenses) ? row.expenses : [],
    expensesTotal: Number(row.expenses_total) || 0,
    laborCost:     Number(row.labor_cost) || 0,
    margin:        Number(row.margin) || 0,
    marginPct:     Number(row.margin_pct) || 0,
    effectiveRate: Number(row.effective_rate) || 0,
    date:          row.date,
  };
}

/* ══════════════════════════════════════════════════════════════════════
   STORAGE & LOAD
   ══════════════════════════════════════════════════════════════════════ */
function loadLocalRateState() {
  try {
    const raw = localStorage.getItem(TOOLS_LS.rate);
    if (raw) rateState = { ...defaultRateState(), ...JSON.parse(raw) };
  } catch (e) { console.warn('loadLocalRateState failed:', e); }
}

let _rateStateSaveTimer = null;
function saveLocalRateState() {
  clearTimeout(_rateStateSaveTimer);
  _rateStateSaveTimer = setTimeout(() => {
    try { localStorage.setItem(TOOLS_LS.rate, JSON.stringify(rateState)); } catch {}
  }, 250);
}

function saveToolsState() { saveLocalRateState(); }

async function loadRateProfilesFromCloud() {
  if (!Store.isSignedIn()) { rateProfiles = []; return; }
  try {
    const rows = await Store.db.rateProfiles.list();
    rateProfiles = rows.map(mapRateProfileFromDb);
  } catch (e) { console.warn('loadRateProfilesFromCloud failed:', e.message); rateProfiles = []; }
}

async function loadMarginProjectsFromCloud() {
  if (!Store.isSignedIn()) { marginProjects = []; return; }
  try {
    const rows = await Store.db.marginProjects.list();
    marginProjects = rows.map(mapMarginProjectFromDb);
  } catch (e) { console.warn('loadMarginProjectsFromCloud failed:', e.message); marginProjects = []; }
}

async function loadAllToolsFromCloud() {
  await Promise.all([loadRateProfilesFromCloud(), loadMarginProjectsFromCloud()]);
  if ($('#view-rate')?.classList.contains('active'))   renderRateView();
  if ($('#view-margin')?.classList.contains('active')) renderMarginView();
  if (typeof updateDriveBadge === 'function') updateDriveBadge();
}

/* ══════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════ */
function rateMoney(n) { return money(n, rateState.currency || 'USD'); }
function rateMoney2(n) {
  const sym = CURRENCY_SYMBOLS[rateState.currency] || '$';
  return sym + ' ' + (Number(n) || 0).toFixed(2);
}
function rateCurrencySymbol() { return CURRENCY_SYMBOLS[rateState.currency] || '$'; }

function uniqueName(base, existing) {
  base = (base || 'Untitled').trim() || 'Untitled';
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

/* ══════════════════════════════════════════════════════════════════════
   RATE CALCULATOR
   ══════════════════════════════════════════════════════════════════════ */
function calcRate() {
  const r = rateState;
  const expensesMonthly = (r.expenses || []).reduce((sum, e) => {
    const a = parseFloat(e.amount) || 0;
    return sum + (e.freq === 'yearly' ? a / 12 : a);
  }, 0);

  const grossIncome    = r.tax < 100 ? r.income / (1 - r.tax / 100) : r.income;
  const annualExpenses = expensesMonthly * 12;
  const revenueNeeded  = grossIncome + annualExpenses;
  const billableWeeks  = Math.max(1, 52 - (r.vacation || 0));
  const billableHoursPerYear = Math.max(1, (r.billableHours || 0) * billableWeeks);
  const baseHourly           = billableHoursPerYear > 0 ? revenueNeeded / billableHoursPerYear : 0;
  const refHours   = 10;
  const revRounds  = r.revRounds || 0;
  const revHours   = r.revHours || 0;
  const multiplier = 1 + (revRounds * revHours) / refHours;
  const adjustedHourly = baseHourly * multiplier;
  const effectiveIfBase = baseHourly > 0 ? baseHourly / multiplier : 0;
  const payCut = baseHourly > 0 ? ((baseHourly - effectiveIfBase) / baseHourly) * 100 : 0;

  return {
    expensesMonthly, annualExpenses, grossIncome, revenueNeeded,
    billableWeeks, billableHoursPerYear, baseHourly, multiplier, adjustedHourly,
    dayRate:  adjustedHourly * 8, weekRate: adjustedHourly * 40,
    proj10:   adjustedHourly * 10, proj40: adjustedHourly * 40,
    effectiveIfBase, payCut, revRounds, revHours,
  };
}

function renderRateView() {
  const host = $('#view-rate');
  if (!host) return;

  host.innerHTML = `
    <div class="tool-page">
      <div class="tool-head">
        <h1>Rate Calculator</h1>
        <p>Work out the hourly rate that actually pays your bills — accounting for tax, business expenses, admin time, and the revisions clients always ask for.</p>
      </div>

      <div class="tool-action-bar">
        <div class="status" id="rateProfileStatus"><span class="dot"></span>Working profile</div>
        <select class="ctrl-select" id="rateProfileLoader" style="padding:6px 10px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--panel);font-size:var(--fs-sm)">
          <option value="">Load profile…</option>
        </select>
        <button class="btn sm" id="rateSaveProfile">Save as profile</button>
        <button class="btn sm" id="rateUpdateProfile" style="display:none">Update profile</button>
        <select class="ctrl-select" id="rateCurrency" style="padding:6px 10px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--panel);font-size:var(--fs-sm)">
          ${RATE_CURRENCIES.map(c => `<option value="${c}">${c} ${CURRENCY_SYMBOLS[c] || ''}</option>`).join('')}
        </select>
      </div>

      <div class="tool-grid">
        <div>
          <div class="card">
            <h3 class="card-title">1 · Income goal</h3>
            <div class="frow"><label>Desired annual take-home</label><div style="position:relative"><span class="rate-prefix" style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--muted);font-weight:600;pointer-events:none">${rateCurrencySymbol()}</span><input type="number" id="rate_income" min="0" step="1000" style="padding-left:30px"></div></div>
            <div class="frow"><label>Effective tax rate (%)</label><input type="number" id="rate_tax" min="0" max="60" step="1"></div>
          </div>

          <div class="card">
            <h3 class="card-title">2 · Business expenses</h3>
            <div class="dyn-list" id="rate_expensesList"></div>
            <button class="btn sm" id="rate_addExpense"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg> Add expense</button>
            <table class="rate-breakdown">
              <tr><td>Total monthly</td><td id="rate_expTotal">$0</td></tr>
              <tr><td>Total annual</td><td id="rate_expAnnual">$0</td></tr>
            </table>
          </div>

          <div class="card">
            <h3 class="card-title">3 · Billable capacity</h3>
            <div class="frow"><label>Working hours per week</label><input type="number" id="rate_totalHours" min="1" max="120" step="1"></div>
            <div class="frow"><label>Non-billable hours per week</label><input type="number" id="rate_nonBillableHours" min="0" max="120" step="1"><div class="hint" style="font-size:11px;color:var(--muted);margin-top:2px">Admin, emails, sales, learning</div></div>
            <div class="frow"><label>Billable hours per week</label><input type="text" id="rate_billableComputed" readonly style="background:var(--panel-soft);color:var(--muted)"></div>
            <div class="frow"><label>Vacation weeks / year</label><input type="number" id="rate_vacation" min="0" max="52" step="1"></div>
          </div>

          <div class="card">
            <h3 class="card-title">4 · Revision reality</h3>
            <div class="frow"><label>Revision rounds per project</label><input type="number" id="rate_revRounds" min="0" max="20" step="1"></div>
            <div class="frow"><label>Hours per revision round</label><input type="number" id="rate_revHours" min="0" max="100" step="0.5"></div>
            <p class="text-sm text-muted" style="margin:0">How many extra hours one round of changes takes. This is baked into your recommended rate.</p>
          </div>

          <div class="card" id="rateSavedProfilesCard" hidden>
            <h3 class="card-title">Saved profiles</h3>
            <div id="rateSavedProfilesList"></div>
          </div>
        </div>

        <div>
          <div class="card">
            <h3 class="card-title">Your recommended rate</h3>
            <div class="rate-hero"><div class="value" id="rate_hourly">$0</div><div class="label">Recommended hourly rate</div></div>
            <div class="rate-grid">
              <div class="rate-stat"><div class="v" id="rate_day">$0</div><div class="l">Day rate (8h)</div></div>
              <div class="rate-stat"><div class="v" id="rate_week">$0</div><div class="l">Week (40h)</div></div>
            </div>
            <div class="rate-grid">
              <div class="rate-stat"><div class="v" id="rate_proj10">$0</div><div class="l">10-hr project</div></div>
              <div class="rate-stat"><div class="v" id="rate_proj40">$0</div><div class="l">40-hr project</div></div>
            </div>
          </div>

          <div class="card">
            <h3 class="card-title">Rate breakdown</h3>
            <table class="rate-breakdown">
              <tr><td>Gross income needed</td><td id="rate_bd_gross">$0</td></tr>
              <tr><td>Annual business expenses</td><td id="rate_bd_exp">$0</td></tr>
              <tr><td>Total revenue needed</td><td id="rate_bd_rev">$0</td></tr>
              <tr><td>Effective billable weeks</td><td id="rate_bd_weeks">0</td></tr>
              <tr><td>Billable hours / year</td><td id="rate_bd_hours">0</td></tr>
              <tr><td>Base hourly (no revisions)</td><td id="rate_bd_base">$0</td></tr>
              <tr><td>Revision multiplier</td><td id="rate_bd_mult">1.00×</td></tr>
              <tr><td>Adjusted hourly rate</td><td id="rate_bd_adj">$0</td></tr>
            </table>
          </div>

          <div class="card">
            <h3 class="card-title">What revisions really cost you</h3>
            <div class="rev-viz">
              <p class="text-sm" id="rate_revSummary" style="margin:0"></p>
              <div class="bar"><div class="bar-fill-base" id="rate_revBarBase" style="width:60%"></div><div class="bar-fill-rev" id="rate_revBarRev" style="width:40%"></div></div>
              <div class="legend">
                <span><i style="background:var(--brand)"></i>Base: <b id="rate_revLegendBase">$0</b></span>
                <span><i style="background:var(--warn-bd)"></i>Revisions: <b id="rate_revLegendRev">$0</b></span>
              </div>
              <p class="sub" id="rate_revPaycut" style="margin-top:var(--s-2)"></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindRateInputs();
  renderRateExpenses();
  renderRateProfileControls();
  calcAndRenderRate();
  bindRateEvents();
}

function bindRateInputs() {
  const r = rateState;
  const set = (id, v) => { const el = $(id); if (el) el.value = v; };
  set('#rate_income',            r.income);
  set('#rate_tax',               r.tax);
  set('#rate_totalHours',        r.totalHours);
  var nonBillable = Math.max(0, (r.totalHours || 0) - (r.billableHours || 0));
  set('#rate_nonBillableHours',  nonBillable);
  set('#rate_vacation',          r.vacation);
  set('#rate_revRounds',         r.revRounds);
  set('#rate_revHours',          r.revHours);
  const cc = $('#rateCurrency'); if (cc) cc.value = r.currency || 'USD';
}

function renderRateExpenses() {
  const c = $('#rate_expensesList');
  if (!c) return;
  const items = rateState.expenses || [];

  if (!items.length) {
    c.innerHTML = '<div class="tool-empty" style="padding:var(--s-3);font-size:var(--fs-sm)">No expenses yet. Add one below.</div>';
  } else {
    c.innerHTML = items.map(e => `
      <div class="dyn-row expense-row" data-id="${e.id}">
        <input type="text" class="exp-name" value="${esc(e.name)}" placeholder="Name">
        <input type="number" class="exp-amount" value="${e.amount}" min="0" step="1" placeholder="0">
        <select class="exp-freq">
          <option value="monthly" ${e.freq === 'monthly' ? 'selected' : ''}>Monthly</option>
          <option value="yearly"  ${e.freq === 'yearly'  ? 'selected' : ''}>Yearly</option>
        </select>
        <button class="remove-btn" data-id="${e.id}" title="Remove"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>`).join('');
  }

  c.querySelectorAll('.exp-name').forEach(inp => {
    inp.addEventListener('input', e => {
      const id = e.target.closest('.dyn-row').dataset.id;
      const item = rateState.expenses.find(x => x.id === id);
      if (item) { item.name = e.target.value; saveLocalRateState(); }
    });
  });
  c.querySelectorAll('.exp-amount').forEach(inp => {
    inp.addEventListener('input', e => {
      const id = e.target.closest('.dyn-row').dataset.id;
      const item = rateState.expenses.find(x => x.id === id);
      if (item) item.amount = parseFloat(e.target.value) || 0;
      calcAndRenderRate();
    });
  });
  c.querySelectorAll('.exp-freq').forEach(sel => {
    sel.addEventListener('change', e => {
      const id = e.target.closest('.dyn-row').dataset.id;
      const item = rateState.expenses.find(x => x.id === id);
      if (item) item.freq = e.target.value;
      calcAndRenderRate();
    });
  });
  c.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.dyn-row').dataset.id;
      rateState.expenses = rateState.expenses.filter(x => x.id !== id);
      renderRateExpenses();
      calcAndRenderRate();
    });
  });
}

function addRateExpense() {
  rateState.expenses = rateState.expenses || [];
  rateState.expenses.push({ id: uid(), name: '', amount: 0, freq: 'monthly' });
  renderRateExpenses();
  calcAndRenderRate();
}

function calcAndRenderRate() {
  const r = calcRate();
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };

  set('#rate_hourly', rateMoney(r.adjustedHourly));
  set('#rate_day',    rateMoney(r.dayRate));
  set('#rate_week',   rateMoney(r.weekRate));
  set('#rate_proj10', rateMoney(r.proj10));
  set('#rate_proj40', rateMoney(r.proj40));

  set('#rate_expTotal',  rateMoney(r.expensesMonthly));
  set('#rate_expAnnual', rateMoney(r.annualExpenses));

  const total = rateState.totalHours || 0;
  const bill  = rateState.billableHours || 0;
  const billPct = total > 0 ? ((bill / total) * 100).toFixed(0) : 0;
  const billEl = $('#rate_billableComputed');
  if (billEl) billEl.value = bill + ' h/wk (' + billPct + '%)';

  set('#rate_bd_gross', rateMoney(r.grossIncome));
  set('#rate_bd_exp',   rateMoney(r.annualExpenses));
  set('#rate_bd_rev',   rateMoney(r.revenueNeeded));
  set('#rate_bd_weeks', r.billableWeeks.toFixed(1));
  set('#rate_bd_hours', Math.round(r.billableHoursPerYear).toLocaleString());
  set('#rate_bd_base',  rateMoney2(r.baseHourly));
  set('#rate_bd_mult',  r.multiplier.toFixed(2) + '×');
  set('#rate_bd_adj',   rateMoney2(r.adjustedHourly));

  const pctHigher = ((r.multiplier - 1) * 100).toFixed(0);
  const rs = $('#rate_revSummary');
  if (rs) rs.textContent = `Because clients typically ask for ${r.revRounds} rounds of changes, your rate needs to be about ${pctHigher}% higher than the base rate to actually earn what you want.`;

  const baseW = (1 / r.multiplier) * 100;
  const bb = $('#rate_revBarBase'); if (bb) bb.style.width = baseW + '%';
  const br = $('#rate_revBarRev');  if (br) br.style.width = (100 - baseW) + '%';

  set('#rate_revLegendBase', rateMoney2(r.baseHourly));
  set('#rate_revLegendRev',  rateMoney2(r.adjustedHourly - r.baseHourly));

  const pc = $('#rate_revPaycut');
  if (pc) pc.textContent = `If you quoted based on the base rate and absorbed all revisions, your effective rate would drop to ${rateMoney2(r.effectiveIfBase)}/hr — a ${r.payCut.toFixed(0)}% pay cut.`;

  saveLocalRateState();
}

function renderRateProfileControls() {
  const loader = $('#rateProfileLoader');
  if (!loader) return;

  loader.innerHTML = '<option value="">Load profile…</option>' +
    rateProfiles
      .slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .map(p => `<option value="${p.id}" ${p.id === activeRateProfileId ? 'selected' : ''}>${esc(p.name)}</option>`)
      .join('');

  const status  = $('#rateProfileStatus');
  const update  = $('#rateUpdateProfile');
  if (activeRateProfileId) {
    const p = rateProfiles.find(x => x.id === activeRateProfileId);
    if (p && status) {
      status.innerHTML = `<span class="dot saved"></span>Profile: <strong>${esc(p.name)}</strong>`;
      if (update) update.style.display = '';
    } else {
      activeRateProfileId = null;
      if (status) status.innerHTML = '<span class="dot"></span>Working profile';
      if (update) update.style.display = 'none';
    }
  } else {
    if (status) status.innerHTML = '<span class="dot"></span>Working profile';
    if (update) update.style.display = 'none';
  }

  renderSavedProfilesList();
}

function renderSavedProfilesList() {
  const card = $('#rateSavedProfilesCard');
  const list = $('#rateSavedProfilesList');
  if (!card || !list) return;

  if (!rateProfiles.length) { card.hidden = true; return; }
  card.hidden = false;

  const sorted = rateProfiles.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  list.innerHTML = sorted.map(p => `
    <div class="dyn-row" style="grid-template-columns:1fr auto auto;padding:6px 0;border-bottom:1px solid var(--line-soft);align-items:center" data-id="${p.id}">
      <div style="min-width:0">
        <div style="font-weight:600;color:var(--ink);font-size:var(--fs-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</div>
        <div style="font-size:var(--fs-xs);color:var(--muted)">${timeAgo(new Date(p.updatedAt).getTime())}</div>
      </div>
      <button class="icon-btn" data-action="rename-profile" data-id="${p.id}" title="Rename" style="width:28px;height:28px;border-radius:6px;color:var(--muted-soft);display:grid;place-items:center;background:transparent;border:none;cursor:pointer">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      </button>
      <button class="icon-btn" data-action="delete-profile" data-id="${p.id}" title="Delete" style="width:28px;height:28px;border-radius:6px;color:var(--muted-soft);display:grid;place-items:center;background:transparent;border:none;cursor:pointer">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      </button>
    </div>
  `).join('');

  const active = activeRateProfileId;
  list.querySelectorAll('[data-id]').forEach(row => {
    if (row.dataset.id === active) {
      row.style.background = 'var(--brand-soft)';
      row.style.borderRadius = 'var(--r-sm)';
      row.style.paddingLeft = '8px';
      row.style.paddingRight = '8px';
    }
  });

  list.querySelectorAll('[data-action="rename-profile"]').forEach(btn => {
    btn.addEventListener('click', () => renameRateProfile(btn.dataset.id));
  });
  list.querySelectorAll('[data-action="delete-profile"]').forEach(btn => {
    btn.addEventListener('click', () => deleteRateProfile(btn.dataset.id));
  });
}

async function renameRateProfile(id) {
  const p = rateProfiles.find(x => x.id === id);
  if (!p) return;
  const others = rateProfiles.filter(x => x.id !== id).map(x => x.name);
  const next = prompt('Rename profile', p.name);
  if (next === null) return;
  const trimmed = (next || '').trim();
  if (!trimmed) return;
  const newName = uniqueName(trimmed, others);
  try {
    await Store.db.rateProfiles.update(id, { name: newName });
    p.name = newName;
    p.updatedAt = new Date().toISOString();
    renderRateProfileControls();
    if (typeof updateDriveBadge === 'function') updateDriveBadge();
    toast('Profile renamed');
  } catch (e) { toast('Could not rename: ' + e.message); }
}

async function deleteRateProfile(id) {
  const p = rateProfiles.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Delete profile "${p.name}"? This cannot be undone.`)) return;
  try {
    await Store.db.rateProfiles.remove(id);
    rateProfiles = rateProfiles.filter(x => x.id !== id);
    if (activeRateProfileId === id) activeRateProfileId = null;
    renderRateProfileControls();
    if (typeof updateDriveBadge === 'function') updateDriveBadge();
    toast('Profile deleted');
  } catch (e) { toast('Could not delete: ' + e.message); }
}

async function saveRateProfile() {
  const existing = rateProfiles.map(p => p.name);
  const suggested = activeRateProfileId
    ? (rateProfiles.find(p => p.id === activeRateProfileId)?.name || 'My rate')
    : 'My rate profile';

  let name = prompt('Name this rate profile', uniqueName(suggested, existing));
  if (name === null) return;
  name = (name || '').trim() || 'My rate profile';
  name = uniqueName(name, existing);

  const dataSnapshot = clone({ ...rateState, expenses: rateState.expenses });
  try {
    const created = await Store.db.rateProfiles.create({ name, data: dataSnapshot });
    const profile = mapRateProfileFromDb(created);
    rateProfiles.push(profile);
    activeRateProfileId = profile.id;
    renderRateProfileControls();
    if (typeof updateDriveBadge === 'function') updateDriveBadge();
    toast('Rate profile saved');
  } catch (e) { toast('Could not save: ' + e.message); }
}

async function updateRateProfile() {
  if (!activeRateProfileId) return;
  const p = rateProfiles.find(x => x.id === activeRateProfileId);
  if (!p) return;
  const dataSnapshot = clone({ ...rateState, expenses: rateState.expenses });
  try {
    await Store.db.rateProfiles.update(activeRateProfileId, { data: dataSnapshot });
    p.data = dataSnapshot;
    p.updatedAt = new Date().toISOString();
    renderRateProfileControls();
    if (typeof updateDriveBadge === 'function') updateDriveBadge();
    toast('Rate profile updated');
  } catch (e) { toast('Could not update: ' + e.message); }
}

function loadRateProfile(id) {
  const p = rateProfiles.find(x => x.id === id);
  if (!p) return;
  rateState = { ...defaultRateState(), ...clone(p.data) };
  activeRateProfileId = p.id;
  saveLocalRateState();
  bindRateInputs();
  renderRateExpenses();
  renderRateProfileControls();
  calcAndRenderRate();
  toast('Loaded · ' + p.name);
}

function bindRateEvents() {
  [
    ['#rate_income',        'income'],
    ['#rate_tax',           'tax'],
    ['#rate_totalHours',    'totalHours'],
    ['#rate_vacation',      'vacation'],
    ['#rate_revRounds',     'revRounds'],
    ['#rate_revHours',      'revHours'],
  ].forEach(([sel, key]) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('input', () => {
      rateState[key] = parseFloat(el.value) || 0;
      if (key === 'totalHours') {
        var nonBillableEl = $('#rate_nonBillableHours');
        var nonBillable = nonBillableEl ? (parseFloat(nonBillableEl.value) || 0) : 0;
        rateState.billableHours = Math.max(0, rateState.totalHours - nonBillable);
      }
      calcAndRenderRate();
    });
  });

  var nbEl = $('#rate_nonBillableHours');
  if (nbEl) {
    nbEl.addEventListener('input', function () {
      var nonBillable = parseFloat(nbEl.value) || 0;
      var total = rateState.totalHours || 0;
      rateState.billableHours = Math.max(0, total - nonBillable);
      calcAndRenderRate();
    });
  }

  $('#rate_addExpense')?.addEventListener('click', addRateExpense);
  $('#rateSaveProfile')?.addEventListener('click', saveRateProfile);
  $('#rateUpdateProfile')?.addEventListener('click', updateRateProfile);

  $('#rateProfileLoader')?.addEventListener('change', e => {
    const id = e.target.value;
    if (id) loadRateProfile(id);
  });

  $('#rateCurrency')?.addEventListener('change', e => {
    rateState.currency = e.target.value;
    const pfx = document.querySelector('.rate-prefix');
    if (pfx) pfx.textContent = rateCurrencySymbol();
    calcAndRenderRate();
    renderRateExpenses();
  });
}

/* ══════════════════════════════════════════════════════════════════════
   MARGIN ENGINE — render
   ══════════════════════════════════════════════════════════════════════ */
function renderMarginView() {
  const host = $('#view-margin');
  if (!host) return;

  // Reset dirty flag when rendering a fresh view
  isMarginDirty = false;

  var contacts = typeof getCachedContacts === 'function' ? getCachedContacts() : [];
  var contactOptions = '<option value="">— None —</option>'
    + contacts.map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.name) + (c.company ? ' · ' + esc(c.company) : '') + '</option>';
      }).join('');

  host.innerHTML = `
    <div class="tool-page">
      <div class="tool-head">
        <h1>Margin Engine</h1>
        <p>Track quoted versus actual hours on every project. See which work actually pays, after real expenses and real time spent.</p>
      </div>

      <div class="tool-grid">
        <div class="card" id="marginFormCard">
          <h3 class="card-title" id="marginFormTitle">Add project</h3>

          <div class="frow"><label>Project name</label><input type="text" id="m_name" placeholder="Wedding — Smith"></div>
          <div class="frow"><label>Client (optional)</label><input type="text" id="m_client" placeholder=""></div>
          <div class="frow"><label>Contact (optional)</label>
            <select id="m_contact">${contactOptions}</select>
          </div>
          <div class="frow">
            <label>Revenue</label>
            <div style="position:relative">
              <span class="margin-prefix" style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--muted);font-weight:600;pointer-events:none">${rateCurrencySymbol()}</span>
              <input type="number" id="m_revenue" min="0" step="50" style="padding-left:30px">
            </div>
          </div>
          <div class="frow"><label>Quoted hours</label><input type="number" id="m_qhours" min="0" step="0.5"></div>
          <div class="frow"><label>Actual hours spent</label><input type="number" id="m_ahours" min="0" step="0.5"></div>

          <label style="display:block;font-size:var(--fs-sm);font-weight:600;color:var(--muted);margin:var(--s-3) 0 6px">Project expenses</label>
          <div class="dyn-list" id="margin_expList"></div>
          <button class="btn sm" id="margin_addExp"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg> Add expense</button>

          <div class="row" style="margin-top:var(--s-4);gap:var(--s-2)">
            <button class="btn primary" id="marginSave">Save project</button>
            <button class="btn ghost" id="marginCancel">Cancel</button>
          </div>
        </div>

        <div>
          <div class="card">
            <h3 class="card-title">Saved projects</h3>
            <input type="search" class="list-search" id="marginSearch" placeholder="Search by name or client…">
            <div class="selection-bar" id="marginSelectionBar">
              <div class="count"><strong id="marginSelectedCount">0</strong> selected</div>
              <button class="btn sm" id="marginSelectAll">Select all</button>
              <button class="btn sm" id="marginClearSelection">Clear</button>
              <button class="btn sm primary" id="marginExportSelected" disabled>Export CSV</button>
              <button class="btn sm" id="marginExportAll">Export all</button>
            </div>
            <div id="marginList"><div class="tool-empty">No projects tracked yet.</div></div>
          </div>

          <div class="card">
            <h3 class="card-title">Insights</h3>
            <div id="marginInsights"><div class="tool-empty">Add a project to see insights.</div></div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindMarginFormInputs();
  renderMarginExpenses();
  renderMarginList();
  renderMarginInsights();
  bindMarginEvents();
}

function bindMarginFormInputs() {
  const f = marginFormState;
  const set = (id, v) => { const el = $(id); if (el) el.value = v ?? ''; };
  set('#m_name',    f.name);
  set('#m_client',  f.client);
  set('#m_contact', f.contactId);
  set('#m_revenue', f.revenue);
  set('#m_qhours',  f.quotedHours);
  set('#m_ahours',  f.actualHours);

  const title = $('#marginFormTitle');
  if (title) title.textContent = editingProjectId ? 'Edit project' : 'Add project';
  const save = $('#marginSave');
  if (save) save.textContent = editingProjectId ? 'Update project' : 'Save project';
  const cancel = $('#marginCancel');
  if (cancel) cancel.textContent = editingProjectId ? 'Cancel edit' : 'Cancel';
}

function renderMarginExpenses() {
  const c = $('#margin_expList');
  if (!c) return;
  const items = marginFormState.expenses || [];

  if (!items.length) {
    c.innerHTML = '<div class="tool-empty" style="padding:var(--s-3);font-size:var(--fs-sm)">No expenses yet.</div>';
  } else {
    c.innerHTML = items.map(e => `
      <div class="dyn-row margin-expense-row" data-id="${e.id}">
        <input type="text" class="mexp-desc" value="${esc(e.desc || '')}" placeholder="Description">
        <input type="number" class="mexp-amount" value="${e.amount || 0}" min="0" step="1" placeholder="0">
        <input type="date" class="mexp-date" value="${e.date || ''}">
        <input type="text" class="mexp-cat" value="${esc(e.cat || '')}" placeholder="Category">
        <button class="remove-btn" data-id="${e.id}" title="Remove"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>`).join('');
  }

  c.querySelectorAll('.dyn-row').forEach(row => {
    const id = row.dataset.id;
    const item = marginFormState.expenses.find(x => x.id === id);
    if (!item) return;
    row.querySelector('.mexp-desc').addEventListener('input', e => { item.desc = e.target.value; isMarginDirty = true; });
    row.querySelector('.mexp-amount').addEventListener('input', e => { item.amount = parseFloat(e.target.value) || 0; isMarginDirty = true; });
    row.querySelector('.mexp-date').addEventListener('input', e => { item.date = e.target.value; isMarginDirty = true; });
    row.querySelector('.mexp-cat').addEventListener('input', e => { item.cat = e.target.value; isMarginDirty = true; });
    row.querySelector('.remove-btn').addEventListener('click', () => {
      marginFormState.expenses = marginFormState.expenses.filter(x => x.id !== id);
      isMarginDirty = true;
      renderMarginExpenses();
    });
  });
}

function addMarginExpense() {
  marginFormState.expenses = marginFormState.expenses || [];
  marginFormState.expenses.push({ id: uid(), desc: '', amount: 0, date: '', cat: '' });
  isMarginDirty = true;
  renderMarginExpenses();
}

function resetMarginForm() {
  editingProjectId = null;
  marginFormState = defaultMarginForm();
  isMarginDirty = false; // Reset dirty flag on clear
  bindMarginFormInputs();
  renderMarginExpenses();
  renderMarginList();
}

async function saveMarginProject() {
  const name = ($('#m_name')?.value || '').trim();
  if (!name) { toast('Project name is required'); $('#m_name')?.focus(); return; }

  const revenue      = parseFloat($('#m_revenue')?.value)  || 0;
  const quotedHours  = parseFloat($('#m_qhours')?.value)   || 0;
  const actualHours  = parseFloat($('#m_ahours')?.value)   || 0;
  const client       = ($('#m_client')?.value || '').trim();
  const contactId    = $('#m_contact')?.value || null;

  const expenses = (marginFormState.expenses || []).filter(e => (e.desc || e.amount));
  const expensesTotal = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

  const { adjustedHourly } = calcRate();
  const laborCost      = actualHours * adjustedHourly;
  const margin         = revenue - expensesTotal - laborCost;
  const marginPct      = revenue > 0 ? (margin / revenue) * 100 : 0;
  const effectiveRate  = actualHours > 0 ? revenue / actualHours : 0;

  const payload = {
    name, client, contact_id: contactId, revenue,
    quoted_hours:   quotedHours,
    actual_hours:   actualHours,
    expenses:       clone(expenses),
    expenses_total: expensesTotal,
    labor_cost:     laborCost,
    margin,
    margin_pct:     marginPct,
    effective_rate: effectiveRate,
    date:           new Date().toISOString(),
  };

  try {
    if (editingProjectId) {
      await Store.db.marginProjects.update(editingProjectId, payload);
      toast('Project updated');
    } else {
      const created = await Store.db.marginProjects.create(payload);
      marginProjects.push(mapMarginProjectFromDb(created));
      toast('Project saved');
    }

    isMarginDirty = false; // Clear dirty flag on successful save
    await loadMarginProjectsFromCloud();
    if (typeof invalidateDriveCache === 'function') invalidateDriveCache();
    resetMarginForm();
    renderMarginInsights();
    renderMarginList();
    if (typeof updateDriveBadge === 'function') updateDriveBadge();
  } catch (e) {
    console.warn('saveMarginProject failed:', e.message);
    toast('Could not save: ' + e.message);
  }
}

function editMarginProject(id) {
  const p = marginProjects.find(x => x.id === id);
  if (!p) return;
  editingProjectId = id;
  marginFormState = {
    name: p.name || '', client: p.client || '', contactId: p.contactId || '',
    revenue: p.revenue || 0,
    quotedHours: p.quotedHours || 0,
    actualHours: p.actualHours || 0,
    expenses: clone(p.expenses || []),
  };
  isMarginDirty = false; // Reset dirty flag when loading a project to edit
  bindMarginFormInputs();
  renderMarginExpenses();
  renderMarginList();
  $('#m_name')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => $('#m_name')?.focus(), 300);
}

async function deleteMarginProject(id) {
  const p = marginProjects.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Remove "${p.name}"? This cannot be undone.`)) return;
  try {
    await Store.db.marginProjects.remove(id);
    marginProjects = marginProjects.filter(x => x.id !== id);
    selectedProjectIds.delete(id);
    if (editingProjectId === id) resetMarginForm();
    renderMarginList();
    renderMarginInsights();
    if (typeof updateDriveBadge === 'function') updateDriveBadge();
    toast('Project removed');
  } catch (e) { toast('Could not remove: ' + e.message); }
}

async function duplicateMarginProject(id) {
  const p = marginProjects.find(x => x.id === id);
  if (!p) return;
  const names = marginProjects.map(x => x.name);
  const newName = uniqueName(p.name, names);
  try {
    const created = await Store.db.marginProjects.create({
      name:           newName,
      client:         p.client,
      contact_id:     p.contactId,
      revenue:        p.revenue,
      quoted_hours:   p.quotedHours,
      actual_hours:   p.actualHours,
      expenses:       p.expenses,
      expenses_total: p.expensesTotal,
      labor_cost:     p.laborCost,
      margin:         p.margin,
      margin_pct:     p.marginPct,
      effective_rate: p.effectiveRate,
      date:           new Date().toISOString(),
    });
    marginProjects.push(mapMarginProjectFromDb(created));
    renderMarginList();
    renderMarginInsights();
    if (typeof updateDriveBadge === 'function') updateDriveBadge();
    toast('Project duplicated');
  } catch (e) { toast('Could not duplicate: ' + e.message); }
}

function filteredProjects() {
  if (!marginSearch) return marginProjects;
  const q = marginSearch.toLowerCase();
  return marginProjects.filter(p =>
    (p.name   || '').toLowerCase().includes(q) ||
    (p.client || '').toLowerCase().includes(q)
  );
}

function renderMarginList() {
  const c = $('#marginList');
  if (!c) return;

  const filtered = filteredProjects();

  if (!filtered.length) {
    c.innerHTML = marginSearch
      ? '<div class="tool-empty">No matches for that search.</div>'
      : '<div class="tool-empty">No projects tracked yet.</div>';
    updateMarginSelectionBar();
    return;
  }

  let html = `<table class="data-table"><thead><tr>
    <th class="center"><input type="checkbox" id="marginSelectAllCb"></th>
    <th>Project</th>
    <th class="right">Revenue</th>
    <th class="right">Hrs</th>
    <th class="right">Effective</th>
    <th class="right">Margin</th>
    <th style="text-align:right">Actions</th>
  </tr></thead><tbody>`;

  filtered.forEach(p => {
    const cls = p.margin >= 0 ? 'positive' : 'negative';
    const editing = editingProjectId === p.id ? ' editing' : '';
    const checked = selectedProjectIds.has(p.id) ? ' checked' : '';
    html += `<tr class="${editing}" data-id="${p.id}">
      <td class="center"><input type="checkbox" class="row-cb" data-id="${p.id}"${checked}></td>
      <td>
        <div class="contact-name" data-hub="${p.id}" style="font-weight:700;color:var(--ink);cursor:pointer">${esc(p.name)}</div>
        ${p.client ? `<div class="subtle">${esc(p.client)}</div>` : ''}
        ${p.contactId ? '<span class="type-badge contact" style="margin-top:4px">Linked</span>' : ''}
      </td>
      <td class="right mono">${rateMoney(p.revenue)}</td>
      <td class="right mono">${p.actualHours}h</td>
      <td class="right mono">${rateMoney2(p.effectiveRate)}</td>
      <td class="right ${cls} mono">${rateMoney(p.margin)}<br><span class="subtle">${(p.marginPct || 0).toFixed(0)}%</span></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-edit="${p.id}" title="Edit"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
          <button class="icon-btn" data-dup="${p.id}" title="Duplicate"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
          <button class="icon-btn danger" data-del="${p.id}" title="Remove"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
        </div>
      </td>
    </tr>`;
  });

  html += '</tbody></table>';
  c.innerHTML = html;

  c.querySelectorAll('[data-hub]').forEach(b => b.addEventListener('click', () => openProjectHub(b.dataset.hub)));
  c.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editMarginProject(b.dataset.edit)));
  c.querySelectorAll('[data-dup]').forEach(b  => b.addEventListener('click', () => duplicateMarginProject(b.dataset.dup)));
  c.querySelectorAll('[data-del]').forEach(b  => b.addEventListener('click', () => deleteMarginProject(b.dataset.del)));

  c.querySelectorAll('.row-cb').forEach(cb => cb.addEventListener('change', e => {
    const id = e.target.dataset.id;
    if (e.target.checked) selectedProjectIds.add(id);
    else selectedProjectIds.delete(id);
    updateMarginSelectionBar();
  }));

  const allCb = $('#marginSelectAllCb');
  if (allCb) {
    const allChecked = filtered.every(p => selectedProjectIds.has(p.id));
    allCb.checked = allChecked;
    allCb.indeterminate = !allChecked && filtered.some(p => selectedProjectIds.has(p.id));
    allCb.addEventListener('change', e => {
      if (e.target.checked) filtered.forEach(p => selectedProjectIds.add(p.id));
      else filtered.forEach(p => selectedProjectIds.delete(p.id));
      renderMarginList();
    });
  }

  updateMarginSelectionBar();
}

function updateMarginSelectionBar() {
  const count = selectedProjectIds.size;
  const el = $('#marginSelectedCount');
  if (el) el.textContent = count;
  const btn = $('#marginExportSelected');
  if (btn) btn.disabled = count === 0;
}

function renderMarginInsights() {
  const c = $('#marginInsights');
  if (!c) return;

  if (!marginProjects.length) {
    c.innerHTML = '<div class="tool-empty">Add a project to see insights.</div>';
    return;
  }

  const totalRev   = marginProjects.reduce((s, p) => s + p.revenue, 0);
  const totalHours = marginProjects.reduce((s, p) => s + p.actualHours, 0);
  const avgEffective = totalHours > 0 ? totalRev / totalHours : 0;
  const avgMarginPct = marginProjects.reduce((s, p) => s + (p.marginPct || 0), 0) / marginProjects.length;

  let verdictCls = 'ok';
  let verdictText = 'Your margins are healthy.';
  if (avgMarginPct < 0)      { verdictCls = 'danger'; verdictText = 'Some projects are running at a loss. Review your pricing.'; }
  else if (avgMarginPct < 20){ verdictCls = 'warn';   verdictText = 'Your margins are thin. Consider raising rates or reducing revisions.'; }

  c.innerHTML = `
    <div class="insights">
      <div class="insight"><div class="v">${marginProjects.length}</div><div class="l">Projects</div></div>
      <div class="insight"><div class="v">${rateMoney2(avgEffective)}</div><div class="l">Avg effective</div></div>
      <div class="insight"><div class="v">${avgMarginPct.toFixed(1)}%</div><div class="l">Avg margin</div></div>
    </div>
    <div class="insight-verdict ${verdictCls}">${esc(verdictText)}</div>
  `;
}

function exportMarginCSV(ids) {
  const projects = ids ? marginProjects.filter(p => ids.includes(p.id)) : marginProjects;
  if (!projects.length) { toast(ids ? 'Select at least one project' : 'No projects to export'); return; }

  const headers = ['Project','Client','Currency','Revenue','Quoted Hours','Actual Hours','Effective Rate','Expenses Total','Labor Cost','Margin','Margin %','Date'];
  const rows = projects.map(p => [
    p.name || '', p.client || '', rateState.currency || 'USD', p.revenue || 0,
    p.quotedHours || 0, p.actualHours || 0, (p.effectiveRate || 0).toFixed(2),
    (p.expensesTotal || 0).toFixed(2), (p.laborCost || 0).toFixed(2),
    (p.margin || 0).toFixed(2), (p.marginPct || 0).toFixed(2), p.date ? String(p.date).slice(0, 10) : ''
  ]);

  const csvEscape = v => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const csv = '\uFEFF' + [
    headers.map(csvEscape).join(','),
    ...rows.map(r => r.map(csvEscape).join(',')),
  ].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  const datePart = new Date().toISOString().slice(0, 10);
  const suffix   = ids && ids.length < marginProjects.length ? '-selection' : '-all';
  a.download = `docforbro-projects-${datePart}${suffix}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Exported ${projects.length} project(s) as CSV`);
}

function bindMarginEvents() {
  $('#margin_addExp')?.addEventListener('click', addMarginExpense);
  $('#marginSave')?.addEventListener('click', saveMarginProject);
  $('#marginCancel')?.addEventListener('click', () => resetMarginForm());

  $('#marginSearch')?.addEventListener('input', e => {
    marginSearch = e.target.value.trim();
    renderMarginList();
  });

  $('#marginSelectAll')?.addEventListener('click', () => {
    filteredProjects().forEach(p => selectedProjectIds.add(p.id));
    renderMarginList();
  });
  $('#marginClearSelection')?.addEventListener('click', () => {
    selectedProjectIds.clear();
    renderMarginList();
  });
  $('#marginExportSelected')?.addEventListener('click', () => {
    const ids = Array.from(selectedProjectIds);
    if (ids.length === 0) { toast('Select at least one project'); return; }
    exportMarginCSV(ids);
  });
  $('#marginExportAll')?.addEventListener('click', () => exportMarginCSV(null));

  // Catch any input in the form card to mark it dirty
  var formCard = document.querySelector('#marginFormCard');
  if (formCard && !formCard._dirtyWired) {
    formCard._dirtyWired = true;
    formCard.addEventListener('input', function() {
      isMarginDirty = true;
    });
    formCard.addEventListener('change', function() {
      isMarginDirty = true;
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════
   PROJECT HUB
   ══════════════════════════════════════════════════════════════════════ */
function openProjectHub(id, tab) {
  _activeProjectId = id;
  _projectDetailTab = tab || 'info';
  var existing = marginProjects.find(x => x.id === id);
  if (!existing) return;

  var panel = document.querySelector('#projectHubPanel');
  if (!panel) {
    panel = document.createElement('aside');
    panel.className = 'contact-detail-panel';
    panel.id = 'projectHubPanel';
    document.body.appendChild(panel);
  }

  panel.hidden = false;
  renderProjectHubContent(existing, panel);
}

function closeProjectHub() {
  var panel = document.querySelector('#projectHubPanel');
  if (!panel) return;
  panel.hidden = true;
  panel.innerHTML = '';
  _activeProjectId = null;
}

function renderProjectHubContent(p, panel) {
  var linkedContact = p.contactId && typeof getContactById === 'function' ? getContactById(p.contactId) : null;

  var contactChip = linkedContact 
    ? `<div class="activity-row" data-type="contact" data-id="${linkedContact.id}">
         <span class="activity-title">${esc(linkedContact.name)}</span>
         <span class="type-badge contact">Contact</span>
       </div>`
    : '<div class="subtle" style="padding:10px 0">No contact linked to this project.</div>';

  panel.innerHTML = `
    <div class="contact-detail-head">
      <h2>${esc(p.name)}</h2>
      <button class="icon-btn" id="projectClose" title="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div class="tabs" style="padding: 0 20px; margin-bottom: 16px;">
      <button class="tab ${_projectDetailTab === 'info' ? 'active' : ''}" data-tab="info">Info</button>
      <button class="tab ${_projectDetailTab === 'activity' ? 'active' : ''}" data-tab="activity">Activity</button>
    </div>

    <div class="contact-detail-body">
      ${_projectDetailTab === 'activity' ? renderProjectActivity(p) : `
        <div class="frow"><label>Client Name</label><div>${esc(p.client || '—')}</div></div>
        <div class="frow"><label>Revenue</label><div class="mono">${rateMoney(p.revenue)}</div></div>
        <div class="frow"><label>Quoted Hours</label><div class="mono">${p.quotedHours} h</div></div>
        <div class="frow"><label>Actual Hours</label><div class="mono">${p.actualHours} h</div></div>
        <div class="frow"><label>Effective Rate</label><div class="mono">${rateMoney2(p.effectiveRate)}</div></div>
        <div class="frow"><label>Margin</label><div class="mono ${p.margin >= 0 ? 'positive' : 'negative'}">${rateMoney(p.margin)} (${(p.marginPct||0).toFixed(0)}%)</div></div>
        
        <div class="activity-section" style="margin-top:24px">
          <div class="activity-header">Linked Contact</div>
          ${contactChip}
        </div>
      `}
    </div>

    ${_projectDetailTab === 'info' ? `
      <div class="contact-detail-foot">
        <span class="grow"></span>
        <button class="btn ghost sm" id="projectEditBtn">Edit Project</button>
      </div>
    ` : ''}
  `;

  panel.querySelector('#projectClose')?.addEventListener('click', closeProjectHub);
  
  panel.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _projectDetailTab = btn.dataset.tab;
      renderProjectHubContent(p, panel);
    });
  });

  if (_projectDetailTab === 'info') {
    panel.querySelector('#projectEditBtn')?.addEventListener('click', () => {
      editMarginProject(p.id);
      closeProjectHub();
    });

    var contactRow = panel.querySelector('.activity-row[data-type="contact"]');
    if (contactRow) {
      contactRow.addEventListener('click', () => {
        if (typeof openContactDetail === 'function') openContactDetail(linkedContact.id);
        closeProjectHub();
      });
    }
  } else {
    wireProjectActivity(panel, p);
  }
}

function renderProjectActivity(p) {
  var linkedDocs = typeof loadDrafts === 'function' ? getCachedDrafts().filter(d => d.projectId === p.id) : [];
  var linkedNotes = typeof getCachedNotes === 'function' ? getCachedNotes().filter(n => n.projectId === p.id) : [];
  var linkedPages = typeof getCachedPages === 'function' ? getCachedPages().filter(pg => pg.projectId === p.id) : [];

  var total = linkedDocs.length + linkedNotes.length + linkedPages.length;

  if (total === 0) {
    return '<div class="tool-empty" style="margin-top:20px">No activity linked to this project yet.</div>';
  }

  var html = '';

  if (linkedDocs.length) {
    html += '<div class="activity-section"><div class="activity-header">Documents</div>';
    linkedDocs.forEach(d => {
      html += `<div class="activity-row" data-type="draft" data-id="${d.id}">
        <span class="activity-title">${esc(d.name)}</span>
        <span class="type-badge draft">Document</span>
      </div>`;
    });
    html += '</div>';
  }

  if (linkedNotes.length) {
    html += '<div class="activity-section"><div class="activity-header">Notes</div>';
    linkedNotes.forEach(n => {
      html += `<div class="activity-row" data-type="note" data-id="${n.id}">
        <span class="activity-title">${esc(n.title)}</span>
        <span class="type-badge note">Note</span>
      </div>`;
    });
    html += '</div>';
  }

  if (linkedPages.length) {
    html += '<div class="activity-section"><div class="activity-header">Pages</div>';
    linkedPages.forEach(pg => {
      html += `<div class="activity-row" data-type="page" data-id="${pg.id}">
        <span class="activity-title">${esc(pg.title)}</span>
        <span class="type-badge page">Page</span>
      </div>`;
    });
    html += '</div>';
  }

  return html;
}

function wireProjectActivity(panel, project) {
  panel.querySelectorAll('.activity-row').forEach(row => {
    row.addEventListener('click', () => {
      var type = row.dataset.type;
      var id = row.dataset.id;

      if (typeof setBreadcrumb === 'function') {
        setBreadcrumb(project.name, 'margin', () => openProjectHub(project.id, 'activity'));
      }

      if (type === 'draft') {
        if (typeof openDriveItem === 'function') openDriveItem('draft', id);
      } else if (type === 'note') {
        if (typeof openNoteById === 'function') openNoteById(id);
      } else if (type === 'page') {
        if (typeof openPageById === 'function') openPageById(id);
      }
      
      closeProjectHub();
    });
  });
}

/* ══════════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════════ */
async function initTools() {
  loadLocalRateState();
  renderRateView();
  renderMarginView();

  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (!nav) return;
    const v = nav.dataset.nav;
    if (v === 'rate')   renderRateView();
    if (v === 'margin') renderMarginView();
  });

  if (Store.isSignedIn()) await loadAllToolsFromCloud();
}

Store.whenAuthReady().then(async () => {
  if (Store.isSignedIn()) await loadAllToolsFromCloud();
});

Store.onAuthChange(async user => {
  if (user) {
    await loadAllToolsFromCloud();
  } else {
    rateProfiles   = [];
    marginProjects = [];
    activeRateProfileId = null;
    editingProjectId = null;
    selectedProjectIds = new Set();
    if ($('#view-rate')?.classList.contains('active'))   renderRateView();
    if ($('#view-margin')?.classList.contains('active')) renderMarginView();
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { initTools(); });
} else {
  initTools();
}