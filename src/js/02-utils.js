/* ============================================================================
   02-utils.js — Shared helpers
   v3 — Adds: toastWithAction, confirmDialog, skeletonList, breadcrumb.
   ============================================================================ */

/* ── DOM ───────────────────────────────────────────────────────── */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ── IDs & escaping ───────────────────────────────────────────── */
const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

const esc = v =>
  String(v ?? '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/* ── Money ────────────────────────────────────────────────────── */
const CURRENCY_SYMBOLS = {
  USD:'$', EUR:'€', GBP:'£', AUD:'A$', CAD:'C$', INR:'₹',
  SGD:'S$', MYR:'RM', IDR:'Rp', VND:'₫', PHP:'₱', JPY:'¥',
  CNY:'¥', THB:'฿',
};
function money(n, code = CONFIG.currency) {
  const sym = CURRENCY_SYMBOLS[code] || '$';
  const v = Number(n) || 0;
  return sym + v.toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/* ── Time ─────────────────────────────────────────────────────── */
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24); if (d < 7)  return `${d} day${d===1?'':'s'} ago`;
  return new Date(ts).toLocaleDateString();
}

/* ── Debounce ─────────────────────────────────────────────────── */
function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ── Toast (plain) ────────────────────────────────────────────── */
let _toastTimer = null;

function toast(msg, ms = 2400) {
  const el = $('#toast');
  if (!el) return;
  clearTimeout(_toastTimer);
  el.classList.remove('with-action');
  el.textContent = msg;
  el.classList.add('show');
  _toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ── Toast (with action button — used for Undo) ───────────────── */
function toastWithAction(msg, actionLabel, onAction, ms = 6000) {
  const el = $('#toast');
  if (!el) return null;

  clearTimeout(_toastTimer);

  el.innerHTML = `
    <span class="toast-msg">${esc(msg)}</span>
    <button class="toast-action" type="button">${esc(actionLabel)}</button>
  `;
  el.classList.add('show', 'with-action');

  const btn = el.querySelector('.toast-action');
  let handled = false;

  const dismiss = () => {
    if (handled) return;
    handled = true;
    el.classList.remove('show', 'with-action');
    setTimeout(() => { if (handled) el.innerHTML = ''; }, 250);
  };

  btn?.addEventListener('click', () => {
    if (handled) return;
    handled = true;
    el.classList.remove('show', 'with-action');
    try { Promise.resolve(onAction()).catch(e => console.warn('undo failed:', e)); }
    catch (e) { console.warn('undo failed:', e); }
    setTimeout(() => { if (handled) el.innerHTML = ''; }, 250);
  });

  _toastTimer = setTimeout(dismiss, ms);
  return { dismiss };
}

/* ── Confirm dialog — styled version of window.confirm() ──────── */
function confirmDialog(opts) {
  return new Promise(function (resolve) {
    var root = document.querySelector('#modalRoot');
    if (!root) { resolve(confirm(opts.message || opts.title || 'Continue?')); return; }

    var title        = opts.title        || 'Are you sure?';
    var message      = opts.message      || '';
    var confirmLabel = opts.confirmLabel || 'Confirm';
    var cancelLabel  = opts.cancelLabel  || 'Cancel';
    var dangerClass  = opts.danger ? 'btn danger' : 'btn primary';

    root.innerHTML =
      '<div class="modal-scrim show" id="confirmDialogScrim">' +
        '<div class="modal" role="dialog" aria-modal="true">' +
          '<div class="modal-head">' +
            '<h2>' + esc(title) + '</h2>' +
            (message ? '<p>' + esc(message) + '</p>' : '') +
          '</div>' +
          '<div class="modal-foot">' +
            '<button class="btn ghost" data-confirm="cancel">' + esc(cancelLabel) + '</button>' +
            '<button class="' + dangerClass + '" data-confirm="ok">' + esc(confirmLabel) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    var scrim = document.getElementById('confirmDialogScrim');
    function cleanup() { root.innerHTML = ''; }

    scrim.addEventListener('click', function (e) {
      if (e.target === scrim) { cleanup(); resolve(false); return; }
      var btn = e.target.closest('[data-confirm]');
      if (!btn) return;
      cleanup();
      resolve(btn.dataset.confirm === 'ok');
    });

    setTimeout(function () {
      var ok = scrim.querySelector('[data-confirm="ok"]');
      if (ok) ok.focus();
    }, 50);
  });
}

/* ── Theme ────────────────────────────────────────────────────── */
function getStoredTheme() {
  try { return localStorage.getItem('docforbro:theme') || 'light'; }
  catch { return 'light'; }
}
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('docforbro:theme', t); } catch {}
}
function toggleTheme() {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

/* ── Deep clone ───────────────────────────────────────────────── */
const clone = o => JSON.parse(JSON.stringify(o));

/* ══════════════════════════════════════════════════════════════════════
   SKELETON LOADER
   Renders pulsing placeholder rows while a view fetches data.
   Usage:
     skeletonList(6)                    → 6 rows of text lines
     skeletonList(6, { avatar: true })  → 6 rows with a circular avatar
   ══════════════════════════════════════════════════════════════════════ */
function skeletonList(rows, opts) {
  rows = rows || 6;
  opts = opts || {};
  var withAvatar = !!opts.avatar;
  var html = '<div class="skeleton-list">';
  for (var i = 0; i < rows; i++) {
    html += '<div class="skeleton-row' + (withAvatar ? ' with-avatar' : '') + '">';
    if (withAvatar) html += '<div class="skeleton skeleton-avatar"></div>';
    html += '<div class="skeleton-body">'
          + '<div class="skeleton skeleton-line w-40"></div>'
          + '<div class="skeleton skeleton-line w-70"></div>'
          + '</div>'
          + '</div>';
  }
  html += '</div>';
  return html;
}

/* ══════════════════════════════════════════════════════════════════════
   BREADCRUMB — global navigation context
   Views call breadcrumbHTML() + wireBreadcrumb() to display a
   "← Back to [label]" bar. Set via setBreadcrumb() before navigating.
   ══════════════════════════════════════════════════════════════════════ */
var _breadcrumb = null;

function setBreadcrumb(label, returnNav, returnFn) {
  _breadcrumb = {
    label: label || 'previous',
    returnNav: returnNav || null,
    returnFn: typeof returnFn === 'function' ? returnFn : null,
  };
}

function clearBreadcrumb() {
  _breadcrumb = null;
}

function getBreadcrumb() {
  return _breadcrumb;
}

function breadcrumbHTML() {
  if (!_breadcrumb) return '';
  return '<div class="breadcrumb">'
    + '<button class="breadcrumb-back" type="button">'
      + '<svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>'
      + 'Back to ' + esc(_breadcrumb.label)
    + '</button>'
    + '</div>';
}

function wireBreadcrumb(host) {
  if (!host) return;
  var btn = host.querySelector('.breadcrumb-back');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var bc = _breadcrumb;
    clearBreadcrumb();
    if (bc && typeof bc.returnFn === 'function') {
      bc.returnFn();
    } else if (bc && bc.returnNav && typeof showView === 'function') {
      showView(bc.returnNav);
    }
  });
}