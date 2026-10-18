/* ============================================================================
   10-templates.js — Personal templates (Supabase) + Buy Me a Coffee
   v3 — Cloud-backed. Deletes go to Trash + undo toast (unified with Drive).
   ============================================================================ */

const USER_TPL_CATEGORIES = [
  'Custom', 'Client Intake', 'Discovery', 'Legal',
  'Billing', 'Delivery', 'Client Experience',
];

/* Support button config */
const SUPPORT = {
  url:    'https://buymeacoffee.com/poomrcd',
  label:  'Feed My Cat',
  avatar: 'cat-avatar.png',
};

/* Generate a unique template name — appends " (2)", " (3)" etc. if it exists */
function uniqueTemplateName(base, existing) {
  base = (base || 'Untitled').trim() || 'Untitled';
  const list = Array.isArray(existing) ? existing : [];
  if (!list.includes(base)) return base;
  let i = 2;
  while (list.includes(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

/* ══════════════════════════════════════════════════════════════════════
   CACHE
   ══════════════════════════════════════════════════════════════════════ */
var _userTemplatesCache  = [];
var _userTemplatesLoaded = false;

function getUserTemplateById(id) {
  return _userTemplatesCache.find(t => t.id === id) || null;
}

function getCachedUserTemplates() {
  return _userTemplatesCache || [];
}

function invalidateUserTemplatesCache() {
  _userTemplatesCache  = [];
  _userTemplatesLoaded = false;
}

/* ══════════════════════════════════════════════════════════════════════
   MAPPERS — DB row ↔ local shape
   ══════════════════════════════════════════════════════════════════════ */
function mapUserTemplateFromDb(row) {
  const data = row.data || {};
  return {
    id:        row.id,
    isUser:    true,
    name:      row.name || 'Untitled template',
    category:  row.category || 'Custom',
    desc:      row.description || '',
    accent:    row.accent || '#2A2A2E',
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    doc:       clone(data.doc       || { title: 'Untitled', subtitle: '' }),
    brand:     clone(data.brand     || DEFAULT_BRAND),
    meta:      clone(data.meta      || []),
    sections:  clone(data.sections  || []),
    signature: clone(data.signature || { mode: 'none', dataUrl: null, scale: 1, slot: 'freelancer' }),
  };
}

/* Build the DB payload from a local template object */
function buildTemplateDbPayload(tpl) {
  return {
    name:        tpl.name || 'Untitled template',
    category:    tpl.category || 'Custom',
    description: tpl.desc || null,
    accent:      tpl.accent || null,
    data: {
      doc:       tpl.doc       || null,
      brand:     tpl.brand     || null,
      meta:      tpl.meta      || null,
      sections:  tpl.sections  || null,
      signature: tpl.signature || null,
    },
  };
}

/* Build template object from studio (used when saving as template) */
function buildTemplateFromStudio(name, category, description) {
  if (!studio) return null;
  return {
    isUser:    true,
    name:      (name || 'Untitled template').trim(),
    category:  category || 'Custom',
    desc:      description || '',
    accent:    studio.brand?.accent || '#2A2A2E',
    doc:       clone(studio.doc),
    brand:     clone(studio.brand),
    meta:      clone(studio.meta),
    sections:  clone(studio.sections),
    signature: clone(studio.signature || { mode: 'none', dataUrl: null, scale: 1, slot: 'freelancer' }),
  };
}

/* ══════════════════════════════════════════════════════════════════════
   LOAD
   ══════════════════════════════════════════════════════════════════════ */
async function loadUserTemplates(opts = {}) {
  if (!Store.isSignedIn()) {
    _userTemplatesCache  = [];
    _userTemplatesLoaded = true;
    return [];
  }
  if (_userTemplatesLoaded && !opts.force) return _userTemplatesCache;

  try {
    const rows = await Store.db.userTemplates.list();
    _userTemplatesCache = rows.map(mapUserTemplateFromDb);
  } catch (e) {
    console.warn('loadUserTemplates failed:', e.message);
    _userTemplatesCache = [];
  }
  _userTemplatesLoaded = true;
  return _userTemplatesCache;
}

/* ══════════════════════════════════════════════════════════════════════
   SAVE AS TEMPLATE
   ══════════════════════════════════════════════════════════════════════ */
function promptSaveAsTemplate() {
  if (!studio) return;

  const isEdit = !!studio.editTemplateId;
  const existing = isEdit ? getUserTemplateById(studio.editTemplateId) : null;

  showTemplateModal({
    title: isEdit ? 'Update template' : 'Save as template',
    subtitle: isEdit
      ? 'Changes will be saved to this template.'
      : 'Your document will become a reusable template. It stays private to your account.',
    submitLabel: isEdit ? 'Update template' : 'Save template',
    defaultName: existing?.name || studio.doc.title || 'Untitled template',
    defaultCategory: existing?.category || 'Custom',
    defaultDesc: existing?.desc || '',
    onSubmit: (name, category, desc) => {
      if (isEdit) updateUserTemplate(studio.editTemplateId, name, category, desc);
      else        createUserTemplate(name, category, desc);
    },
  });
}

async function createUserTemplate(name, category, desc) {
  const base = buildTemplateFromStudio(name, category, desc);
  if (!base) return;

  const existing = _userTemplatesCache.map(t => t.name);
  base.name = uniqueTemplateName(base.name, existing);

  try {
    const created = await Store.db.userTemplates.create(buildTemplateDbPayload(base));
    await loadUserTemplates({ force: true });
    toast('Template saved · ' + created.name);
    if (typeof renderGallery === 'function') renderGallery();
  } catch (e) {
    console.warn('createUserTemplate failed:', e.message);
    toast('Could not save template: ' + e.message);
  }
}

async function updateUserTemplate(id, name, category, desc) {
  const existing = getUserTemplateById(id);
  if (!existing) { toast('Template not found'); return; }

  const others = _userTemplatesCache.filter(t => t.id !== id).map(t => t.name);
  const finalName = uniqueTemplateName((name || '').trim() || 'Untitled template', others);

  const base = buildTemplateFromStudio(finalName, category, desc);
  if (!base) return;

  try {
    await Store.db.userTemplates.update(id, buildTemplateDbPayload(base));
    await loadUserTemplates({ force: true });
    toast('Template updated');
    if (typeof renderGallery === 'function') renderGallery();
    if (studio && studio.editTemplateId === id) {
      if (typeof updateEditModeUI === 'function') updateEditModeUI();
    }
  } catch (e) {
    console.warn('updateUserTemplate failed:', e.message);
    toast('Could not update: ' + e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   EDIT TEMPLATE
   ══════════════════════════════════════════════════════════════════════ */
function openUserTemplateForEdit(id) {
  const tpl = getUserTemplateById(id);
  if (!tpl) { toast('Template not found'); return; }

  studio = {
    templateId: tpl.id,
    editTemplateId: tpl.id,
    draftId: null,
    draftName: null,
    doc:       clone(tpl.doc || { title: 'Untitled', subtitle: '' }),
    brand:     clone(tpl.brand || DEFAULT_BRAND),
    meta:      clone(tpl.meta || []),
    sections:  clone(tpl.sections || []),
    signature: clone(tpl.signature || { mode: 'none', dataUrl: null, scale: 1, slot: 'freelancer' }),
  };

  renderWorkspace();
  showView('workspace');
  requestAnimationFrame(fitPreview);
  if (typeof updateEditModeUI === 'function') updateEditModeUI();
}

function updateEditModeUI() {
  const banner = $('#editModeBanner');
  if (!banner) return;
  if (studio?.editTemplateId) {
    const tpl = getUserTemplateById(studio.editTemplateId);
    banner.hidden = false;
    const nameEl = banner.querySelector('.edit-name');
    if (nameEl) nameEl.textContent = tpl?.name || 'template';
  } else {
    banner.hidden = true;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   RENAME / DELETE / DUPLICATE
   ══════════════════════════════════════════════════════════════════════ */
async function renameUserTemplate(id) {
  const tpl = getUserTemplateById(id);
  if (!tpl) return;
  const others = _userTemplatesCache.filter(t => t.id !== id).map(t => t.name);
  const next = prompt('Rename template', tpl.name);
  if (next === null) return;
  const trimmed = (next || '').trim();
  if (!trimmed) return;

  const newName = uniqueTemplateName(trimmed, others);
  try {
    await Store.db.userTemplates.update(id, { name: newName });
    await loadUserTemplates({ force: true });
    toast('Renamed');
    if (typeof renderGallery === 'function') renderGallery();
  } catch (e) {
    toast('Could not rename: ' + e.message);
  }
}

async function deleteUserTemplate(id) {
  const tpl = getUserTemplateById(id);
  if (!tpl) return;

  if (typeof moveToTrashWithUndo === 'function') {
    /* Unified delete — Trash + undo toast */
    await moveToTrashWithUndo('template', id, tpl);
    /* The moveToTrashWithUndo helper refreshes the drive cache; we also
       need to refresh the templates cache and the gallery */
    invalidateUserTemplatesCache();
    await loadUserTemplates({ force: true });
    if (typeof renderGallery === 'function') renderGallery();
  } else {
    /* Fallback — hard delete */
    if (!confirm(`Delete "${tpl.name}"?`)) return;
    try {
      await Store.db.userTemplates.remove(id);
      invalidateUserTemplatesCache();
      await loadUserTemplates({ force: true });
      toast('Template deleted');
      if (typeof renderGallery === 'function') renderGallery();
    } catch (e) {
      toast('Could not delete: ' + e.message);
    }
  }
}

async function duplicateUserTemplate(id) {
  const tpl = getUserTemplateById(id);
  if (!tpl) return;

  const names = _userTemplatesCache.map(t => t.name);
  const copy = {
    ...clone(tpl),
    name: uniqueTemplateName(tpl.name, names),
  };

  try {
    await Store.db.userTemplates.create(buildTemplateDbPayload(copy));
    await loadUserTemplates({ force: true });
    toast('Duplicated');
    if (typeof renderGallery === 'function') renderGallery();
  } catch (e) {
    toast('Could not duplicate: ' + e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   EXPORT / IMPORT — single template
   ══════════════════════════════════════════════════════════════════════ */
function exportUserTemplate(id) {
  const tpl = getUserTemplateById(id);
  if (!tpl) return;

  const payload = {
    format: 'docforbro-template',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    template: clone(tpl),
  };

  const safeName = (tpl.name || 'template').replace(/[^\w\-]+/g, '-').toLowerCase();
  const date = new Date().toISOString().slice(0, 10);

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `docforbro-template-${safeName}-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Template exported');
}

function importUserTemplateFromFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.format === 'docforbro-backup') {
          alert("That's a full backup file. Use Settings → Import backup to restore it.");
          return;
        }
        if (data.format !== 'docforbro-template' || !data.template) {
          alert("That doesn't look like a DocForBro template file.");
          return;
        }
        handleTemplateImport(data.template);
      } catch (err) {
        alert('Could not read file: ' + (err.message || err));
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

async function handleTemplateImport(tpl) {
  const existing = _userTemplatesCache.find(t =>
    (t.name || '').toLowerCase() === String(tpl.name || '').toLowerCase());

  const proceed = async mode => {
    const names = _userTemplatesCache.map(t => t.name);
    const freshName = mode === 'replace' && existing
      ? existing.name
      : uniqueTemplateName(tpl.name || 'Imported template', names);

    const fresh = {
      isUser:    true,
      name:      freshName,
      category:  tpl.category || 'Custom',
      desc:      tpl.desc || '',
      accent:    tpl.accent || '#2A2A2E',
      doc:       clone(tpl.doc       || {}),
      brand:     clone(tpl.brand     || DEFAULT_BRAND),
      meta:      clone(tpl.meta      || []),
      sections:  clone(tpl.sections  || []),
      signature: clone(tpl.signature || { mode: 'none', dataUrl: null, scale: 1, slot: 'freelancer' }),
    };

    try {
      if (mode === 'replace' && existing) {
        await Store.db.userTemplates.update(existing.id, buildTemplateDbPayload(fresh));
        toast('Template replaced');
      } else {
        await Store.db.userTemplates.create(buildTemplateDbPayload(fresh));
        toast('Template imported');
      }
      await loadUserTemplates({ force: true });
      if (typeof renderGallery === 'function') renderGallery();
    } catch (e) {
      toast('Import failed: ' + e.message);
    }
  };

  if (existing) showImportConflictModal(existing.name, proceed);
  else await proceed('copy');
}

/* ══════════════════════════════════════════════════════════════════════
   MODALS
   ══════════════════════════════════════════════════════════════════════ */
function showTemplateModal(opts) {
  const modal = document.createElement('div');
  modal.className = 'modal-scrim show';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h2>${esc(opts.title)}</h2>
        <p>${esc(opts.subtitle || 'Give your template a name and category.')}</p>
      </div>
      <div class="modal-body">
        <div class="field">
          <label>Template name</label>
          <input type="text" id="tplName" value="${esc(opts.defaultName || '')}">
        </div>
        <div class="field">
          <label>Category</label>
          <select id="tplCategory">
            ${USER_TPL_CATEGORIES.map(c => `<option value="${c}" ${opts.defaultCategory === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Description <span style="color:var(--muted-soft);font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
          <input type="text" id="tplDesc" value="${esc(opts.defaultDesc || '')}" placeholder="What is this template for?">
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" data-action="cancel">Cancel</button>
        <button class="btn primary" data-action="confirm">${esc(opts.submitLabel || 'Save')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  const confirm = () => {
    const name = modal.querySelector('#tplName').value.trim();
    if (!name) { modal.querySelector('#tplName').focus(); return; }
    const category = modal.querySelector('#tplCategory').value;
    const desc = modal.querySelector('#tplDesc').value.trim();
    close();
    opts.onSubmit(name, category, desc);
  };

  modal.querySelector('[data-action="cancel"]').addEventListener('click', close);
  modal.querySelector('[data-action="confirm"]').addEventListener('click', confirm);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  modal.querySelector('#tplName')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirm(); }
  });
  setTimeout(() => modal.querySelector('#tplName')?.focus(), 50);
}

function showImportConflictModal(name, proceed) {
  const modal = document.createElement('div');
  modal.className = 'modal-scrim show';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h2>Template already exists</h2>
        <p>You already have a template called "<strong>${esc(name)}</strong>". What would you like to do?</p>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" data-action="cancel">Cancel</button>
        <button class="btn" data-action="copy">Import as copy</button>
        <button class="btn primary" data-action="replace">Replace existing</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('[data-action="cancel"]').addEventListener('click', close);
  modal.querySelector('[data-action="copy"]').addEventListener('click', () => { close(); proceed('copy'); });
  modal.querySelector('[data-action="replace"]').addEventListener('click', () => { close(); proceed('replace'); });
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

/* ══════════════════════════════════════════════════════════════════════
   CARD MENU
   ══════════════════════════════════════════════════════════════════════ */
function openTemplateCardMenu(anchorEl, templateId) {
  closeTemplateCardMenu();
  const tpl = getUserTemplateById(templateId);
  if (!tpl) return;

  const menu = document.createElement('div');
  menu.className = 'card-menu';
  menu.id = 'activeCardMenu';
  menu.innerHTML = `
    <button data-action="edit">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
      Edit
    </button>
    <button data-action="rename">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="4" y1="12" x2="20" y2="12"/>
      </svg>
      Rename
    </button>
    <button data-action="duplicate">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
      </svg>
      Duplicate
    </button>
    <button data-action="export">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Export
    </button>
    <div class="menu-divider"></div>
    <button data-action="delete" class="danger">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
      </svg>
      Delete
    </button>
  `;
  document.body.appendChild(menu);

  const rect = anchorEl.getBoundingClientRect();
  const mr = menu.getBoundingClientRect();
  let top = rect.bottom + 4;
  let left = rect.right - mr.width;
  if (top + mr.height > window.innerHeight) top = rect.top - mr.height - 4;
  if (left < 8) left = 8;
  menu.style.top = top + 'px';
  menu.style.left = left + 'px';

  menu.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      closeTemplateCardMenu();
      if (action === 'edit')      openUserTemplateForEdit(templateId);
      if (action === 'rename')    renameUserTemplate(templateId);
      if (action === 'duplicate') duplicateUserTemplate(templateId);
      if (action === 'export')    exportUserTemplate(templateId);
      if (action === 'delete')    deleteUserTemplate(templateId);
    });
  });

  setTimeout(() => document.addEventListener('click', closeOnOutsideClick), 0);
}

function closeTemplateCardMenu() {
  document.getElementById('activeCardMenu')?.remove();
  document.removeEventListener('click', closeOnOutsideClick);
}

function closeOnOutsideClick(e) {
  if (!e.target.closest('#activeCardMenu') && !e.target.closest('[data-card-menu]')) {
    closeTemplateCardMenu();
  }
}

/* ══════════════════════════════════════════════════════════════════════
   SUPPORT BUTTON
   ══════════════════════════════════════════════════════════════════════ */
function buildSupportButton() {
  const btn = document.createElement('a');
  btn.className = 'bmc-float';
  btn.href = SUPPORT.url;
  btn.target = '_blank';
  btn.rel = 'noopener noreferrer';
  btn.setAttribute('aria-label', SUPPORT.label);
  btn.innerHTML = `
    <span class="bmc-avatar">
      <img src="${esc(SUPPORT.avatar)}" alt="" loading="lazy"
           onerror="this.style.display='none'">
    </span>
    <span class="bmc-label">${esc(SUPPORT.label)}</span>
  `;
  return btn;
}

function initSupportButton() {
  const app = document.getElementById('app');
  if (!app) return;
  let shown = false;
  const check = () => {
    const appVisible = !app.hidden;
    const exists = document.querySelector('.bmc-float');
    if (appVisible && !shown && !exists) {
      document.body.appendChild(buildSupportButton());
      shown = true;
    } else if (!appVisible && shown) {
      document.querySelector('.bmc-float')?.remove();
      shown = false;
    }
  };
  check();
  const mo = new MutationObserver(check);
  mo.observe(app, { attributes: true, attributeFilter: ['hidden'] });
}

function supportButtonHTML(label) {
  return `
    <a class="bmc-inline" href="${esc(SUPPORT.url)}" target="_blank" rel="noopener noreferrer">
      <span class="bmc-avatar">
        <img src="${esc(SUPPORT.avatar)}" alt="" loading="lazy"
             onerror="this.style.display='none'">
      </span>
      <span class="bmc-label">${esc(label || SUPPORT.label)}</span>
    </a>
  `;
}

/* ══════════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════════ */
function initTemplates() {
  initSupportButton();
}

Store.whenAuthReady().then(async () => {
  if (Store.isSignedIn()) {
    await loadUserTemplates();
    if ($('#view-gallery')?.classList.contains('active')) {
      if (typeof renderGallery === 'function') renderGallery();
    }
  }
});

Store.onAuthChange(async user => {
  if (user) {
    await loadUserTemplates({ force: true });
    if ($('#view-gallery')?.classList.contains('active')) {
      if (typeof renderGallery === 'function') renderGallery();
    }
  } else {
    invalidateUserTemplatesCache();
    if (typeof renderGallery === 'function') renderGallery();
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTemplates);
} else {
  initTemplates();
}