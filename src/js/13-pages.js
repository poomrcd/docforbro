/* ============================================================================
   13-pages.js — Pages (Drop 10A + 10B + 10C + 11A)
   Block editor. Rich blocks. Starter templates. Save as template.
   PDF export. Breadcrumb support. Icons removed.
   Depends on: 14-page-starters.js (PAGE_STARTERS)
   ============================================================================ */

/* ══════════════════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════════════════ */
var _pagesCache          = [];
var _pagesLoaded         = false;
var _pageTemplatesCache  = [];
var _pageTemplatesLoaded = false;
var _activePageId        = null;
var _pagesSearch         = '';
var _pagesViewMode       = 'pages';      /* 'pages' | 'templates' */
var _pagesMobileEditing  = false;
var _pageSaveTimer       = null;
var _pageDirty           = false;
var _draggingBlockId     = null;

/* Signed URL cache for image blocks */
var _imageUrlCache = {};

var CALLOUT_ICONS = ['💡','📌','❗','⚠','✅','🎯','📢','🔥'];

/* ══════════════════════════════════════════════════════════════════════
   MAPPERS
   ══════════════════════════════════════════════════════════════════════ */
function mapPageFromDb(row) {
  return {
    id:         row.id,
    title:      row.title || 'Untitled page',
    blocks:     Array.isArray(row.blocks) ? row.blocks : [],
    pinned:     !!row.pinned,
    contactId:  row.contact_id || null,
    projectId:  row.project_id || null,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at || row.created_at
  };
}

function buildPageDbPayload(page) {
  return {
    title:      (page.title || '').trim() || 'Untitled page',
    blocks:     Array.isArray(page.blocks) ? page.blocks : [],
    pinned:     !!page.pinned,
    contact_id: page.contactId || null,
    project_id: page.projectId || null
  };
}

function mapPageTemplateFromDb(row) {
  return {
    id:          row.id,
    name:        row.name || 'Untitled template',
    description: row.description || '',
    blocks:      Array.isArray(row.blocks) ? row.blocks : [],
    createdAt:   row.created_at,
    updatedAt:   row.updated_at || row.created_at
  };
}

function buildPageTemplateDbPayload(tpl) {
  return {
    name:        (tpl.name || '').trim() || 'Untitled template',
    description: tpl.description || null,
    blocks:      Array.isArray(tpl.blocks) ? tpl.blocks : []
  };
}

/* ══════════════════════════════════════════════════════════════════════
   LOAD
   ══════════════════════════════════════════════════════════════════════ */
async function loadPages(force) {
  if (!Store.isSignedIn()) { _pagesCache = []; _pagesLoaded = true; return []; }
  if (_pagesLoaded && !force) return _pagesCache;
  try {
    var rows = await Store.db.pages.list();
    _pagesCache = rows.map(mapPageFromDb);
  } catch (e) {
    console.warn('loadPages failed:', e.message);
    _pagesCache = [];
  }
  _pagesLoaded = true;
  return _pagesCache;
}

async function loadPageTemplates(force) {
  if (!Store.isSignedIn()) { _pageTemplatesCache = []; _pageTemplatesLoaded = true; return []; }
  if (_pageTemplatesLoaded && !force) return _pageTemplatesCache;
  try {
    var rows = await Store.db.pageTemplates.list();
    _pageTemplatesCache = rows.map(mapPageTemplateFromDb);
  } catch (e) {
    console.warn('loadPageTemplates failed:', e.message);
    _pageTemplatesCache = [];
  }
  _pageTemplatesLoaded = true;
  return _pageTemplatesCache;
}

function invalidatePagesCache()         { _pagesLoaded = false; }
function invalidatePageTemplatesCache() { _pageTemplatesLoaded = false; }
function getCachedPages()               { return _pagesCache || []; }
function getCachedPageTemplates()       { return _pageTemplatesCache || []; }
function getPageById(id)                { return _pagesCache.find(function (p) { return p.id === id; }) || null; }
function getPageTemplateById(id)        { return _pageTemplatesCache.find(function (t) { return t.id === id; }) || null; }

function updatePagesBadge() {
  var badge = document.querySelector('#navBadgePages');
  if (!badge) return;
  var n = _pagesCache.length;
  badge.textContent = n;
  badge.hidden = n === 0;
}

/* ══════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════ */
function uidBlock() {
  return 'blk-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function pagePreview(page) {
  var blocks = page.blocks || [];
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b.text && String(b.text).trim()) {
      var raw = String(b.text).replace(/\s+/g, ' ').trim();
      return raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
    }
    if (b.type === 'table' && b.rows && b.rows.length) {
      var first = (b.rows[0] || []).join(' · ');
      if (first) return first.slice(0, 80);
    }
    if (b.type === 'link' && (b.title || b.url)) {
      return (b.title || b.url).slice(0, 80);
    }
    if (b.type === 'image') return 'Image';
  }
  return 'Empty page';
}

function formatPageDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d)) return '';
  var now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  var diffDays = Math.floor((now - d) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getFilteredPages() {
  var items = _pagesCache.slice();
  if (_pagesSearch) {
    var q = _pagesSearch.toLowerCase();
    items = items.filter(function (p) {
      if ((p.title || '').toLowerCase().indexOf(q) !== -1) return true;
      if (pagePreview(p).toLowerCase().indexOf(q) !== -1) return true;
      return (p.blocks || []).some(function (b) {
        return b.text && String(b.text).toLowerCase().indexOf(q) !== -1;
      });
    });
  }
  items.sort(function (a, b) {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
  return items;
}

function getFilteredPageTemplates() {
  var items = _pageTemplatesCache.slice();
  if (_pagesSearch) {
    var q = _pagesSearch.toLowerCase();
    items = items.filter(function (t) {
      return (t.name || '').toLowerCase().indexOf(q) !== -1
          || (t.description || '').toLowerCase().indexOf(q) !== -1;
    });
  }
  items.sort(function (a, b) {
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
  return items;
}

async function getPageLinkOptions() {
  var contacts = [], projects = [];
  try {
    if (typeof loadContacts === 'function') {
      await loadContacts();
      contacts = (typeof getCachedContacts === 'function' ? getCachedContacts() : [])
        .slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    }
  } catch (e) {}
  try {
    if (typeof loadMarginProjectsFromCloud === 'function') {
      await loadMarginProjectsFromCloud();
    }
    if (typeof marginProjects !== 'undefined' && Array.isArray(marginProjects)) {
      projects = marginProjects.slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    }
  } catch (e) {}
  return { contacts: contacts, projects: projects };
}

function autosizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight + 2) + 'px';
}

async function resolveImageUrl(path) {
  if (!path) return null;
  var cached = _imageUrlCache[path];
  if (cached && cached.expiresAt > Date.now() + 100 * 1000) return cached.url;
  try {
    var url = await Store.storage.getLogoSignedUrl(path, 3600);
    if (!url) return null;
    _imageUrlCache[path] = { url: url, expiresAt: Date.now() + 3600 * 1000 };
    return url;
  } catch (e) {
    console.warn('signed URL failed for', path, ':', e.message);
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   MODAL SYSTEM
   ══════════════════════════════════════════════════════════════════════ */
function _modalEscHandler(e) { if (e.key === 'Escape') closeModalPanel(); }

function openModalPanel(html) {
  var root = document.querySelector('#modalRoot');
  if (!root) return null;
  root.innerHTML = '<div class="modal-scrim show" id="__modalScrim">' + html + '</div>';
  var scrim = document.getElementById('__modalScrim');
  scrim.addEventListener('click', function (e) {
    if (e.target === scrim) closeModalPanel();
  });
  document.addEventListener('keydown', _modalEscHandler);
  return root;
}

function closeModalPanel() {
  var root = document.querySelector('#modalRoot');
  if (root) root.innerHTML = '';
  document.removeEventListener('keydown', _modalEscHandler);
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER — main view
   ══════════════════════════════════════════════════════════════════════ */
async function renderPagesView() {
  var host = document.querySelector('#view-pages');
  if (!host) return;

  host.innerHTML = '<div class="tool-page">' + skeletonList(6) + '</div>';

  if (!_pagesLoaded || _pagesCache.length === 0) {
    await loadPages(true);
  }
  if (!_pageTemplatesLoaded || _pageTemplatesCache.length === 0) {
    await loadPageTemplates(true);
  }
  updatePagesBadge();

  host.innerHTML = buildPagesShellHTML();
  wirePagesShell();

  renderCurrentList();

  /* If a page is active (from search or cross-link), show it */
  if (_activePageId && getPageById(_activePageId)) {
    renderPageEditor();
  } else {
    renderPagesEmptyEditor();
  }
}

function buildPagesShellHTML() {
  return ''
    + '<div class="pages-wrap">'

      + '<aside class="pages-list-pane' + (_pagesMobileEditing ? ' hidden-mobile' : '') + '">'
        + '<header class="pages-list-head">'
          + '<h1>Pages</h1>'
          + '<div class="pages-list-actions">'
            + '<button class="icon-btn refresh-btn" id="pagesRefresh" title="Refresh"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg></button>'
            + '<button class="btn sm primary" id="pagesAdd">+ New</button>'
          + '</div>'
        + '</header>'

        + '<div class="pages-list-filter" id="pagesListFilter">'
          + '<button data-view="pages" class="' + (_pagesViewMode === 'pages' ? 'active' : '') + '">Pages</button>'
          + '<button data-view="templates" class="' + (_pagesViewMode === 'templates' ? 'active' : '') + '">My Templates</button>'
        + '</div>'

        + '<div class="pages-list-search">'
          + '<input type="search" id="pagesSearch" placeholder="Search…" value="' + esc(_pagesSearch) + '" autocomplete="off">'
        + '</div>'

        + '<div class="pages-list-scroll" id="pagesListScroll"></div>'
      + '</aside>'

      + '<section class="pages-editor-pane' + (!_pagesMobileEditing ? ' hidden-mobile' : '') + '">'
        + '<div id="pageEditorHost"></div>'
      + '</section>'

    + '</div>';
}

function wirePagesShell() {
  var refreshBtn = document.querySelector('#pagesRefresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async function () {
      refreshBtn.classList.add('spinning');
      invalidatePagesCache();
      invalidatePageTemplatesCache();
      await Promise.all([loadPages(true), loadPageTemplates(true)]);
      updatePagesBadge();
      renderCurrentList();
      setTimeout(function () { refreshBtn.classList.remove('spinning'); }, 300);
      toast('Refreshed');
    });
  }

  var addBtn = document.querySelector('#pagesAdd');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      openNewPageModal();
    });
  }

  var filterHost = document.querySelector('#pagesListFilter');
  if (filterHost) {
    filterHost.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-view]');
      if (!btn) return;
      _pagesViewMode = btn.dataset.view;
      filterHost.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      renderCurrentList();
    });
  }

  var searchEl = document.querySelector('#pagesSearch');
  if (searchEl) {
    searchEl.addEventListener('input', function (e) {
      _pagesSearch = e.target.value;
      var cursor = e.target.selectionStart;
      renderCurrentList();
      var el = document.querySelector('#pagesSearch');
      if (el) { el.focus(); try { el.setSelectionRange(cursor, cursor); } catch (err) {} }
    });
  }
}

function renderCurrentList() {
  if (_pagesViewMode === 'templates') renderTemplatesList();
  else renderPagesList();
}

/* ══════════════════════════════════════════════════════════════════════
   LIST — pages
   ══════════════════════════════════════════════════════════════════════ */
function renderPagesList() {
  var scroll = document.querySelector('#pagesListScroll');
  if (!scroll) return;

  var filtered = getFilteredPages();

  if (!filtered.length) {
    scroll.innerHTML = '<div class="pages-list-empty">'
      + (_pagesCache.length === 0
          ? 'No pages yet.<br>Click <strong>+ New</strong> to start.'
          : 'No pages match your search.')
      + '</div>';
    return;
  }

  var pinned = filtered.filter(function (p) { return p.pinned; });
  var rest   = filtered.filter(function (p) { return !p.pinned; });

  var html = '';
  if (pinned.length) {
    html += '<div class="pages-list-label">Pinned</div>';
    pinned.forEach(function (p) { html += pageCardHTML(p); });
  }
  if (rest.length) {
    if (pinned.length) html += '<div class="pages-list-label">Pages</div>';
    rest.forEach(function (p) { html += pageCardHTML(p); });
  }
  scroll.innerHTML = html;

  scroll.querySelectorAll('.page-card').forEach(function (card) {
    card.addEventListener('click', function () {
      _activePageId = card.dataset.id;
      _pagesMobileEditing = true;
      renderPagesList();
      renderPageEditor();
    });
  });
}

function pageCardHTML(p) {
  var active = p.id === _activePageId ? ' active' : '';
  var preview = pagePreview(p);

  return ''
    + '<div class="page-card' + active + '" data-id="' + esc(p.id) + '">'
      + '<div class="page-card-meta">'
        + '<div class="page-card-title">' + esc(p.title) + '</div>'
        + '<div class="page-card-preview">' + esc(preview) + '</div>'
        + '<div class="page-card-meta-row">'
          + '<span>' + esc(formatPageDate(p.updatedAt)) + '</span>'
          + (p.contactId || p.projectId ? '<span>🔗</span>' : '')
          + (p.pinned ? '<span class="page-card-pin">📌</span>' : '')
        + '</div>'
      + '</div>'
    + '</div>';
}

/* ══════════════════════════════════════════════════════════════════════
   LIST — templates
   ══════════════════════════════════════════════════════════════════════ */
function renderTemplatesList() {
  var scroll = document.querySelector('#pagesListScroll');
  if (!scroll) return;

  var filtered = getFilteredPageTemplates();

  if (!filtered.length) {
    scroll.innerHTML = '<div class="pages-list-empty">'
      + (_pageTemplatesCache.length === 0
          ? 'No templates yet.<br>Open a page and click <strong>Save as template</strong>.'
          : 'No templates match your search.')
      + '</div>';
    return;
  }

  scroll.innerHTML = filtered.map(templateCardHTML).join('');

  scroll.querySelectorAll('.template-card').forEach(function (card) {
    var id = card.dataset.id;

    card.addEventListener('click', function (e) {
      if (e.target.closest('.page-card-actions')) return;
      useTemplate(id);
    });

    card.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var act = btn.dataset.act;
        if (act === 'rename')    renameTemplate(id);
        if (act === 'duplicate') duplicateTemplate(id);
        if (act === 'delete')    deleteTemplate(id);
      });
    });
  });
}

function templateCardHTML(t) {
  var blocksCount = (t.blocks || []).length;

  return ''
    + '<div class="page-card template-card" data-id="' + esc(t.id) + '">'
      + '<div class="page-card-meta">'
        + '<div class="page-card-title">' + esc(t.name) + '</div>'
        + '<div class="page-card-preview">' + esc(t.description || (blocksCount + ' block' + (blocksCount === 1 ? '' : 's'))) + '</div>'
        + '<div class="page-card-meta-row">'
          + '<span>' + blocksCount + ' block' + (blocksCount === 1 ? '' : 's') + '</span>'
          + '<span>Use →</span>'
        + '</div>'
      + '</div>'
      + '<div class="page-card-actions">'
        + '<button data-act="rename" title="Rename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>'
        + '<button data-act="duplicate" title="Duplicate"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>'
        + '<button class="danger" data-act="delete" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>'
      + '</div>'
    + '</div>';
}

/* ══════════════════════════════════════════════════════════════════════
   NEW PAGE MODAL
   ══════════════════════════════════════════════════════════════════════ */
function openNewPageModal() {
  var cards = PAGE_STARTERS.map(function (s) {
    return '<button class="starter-card" data-starter="' + esc(s.id) + '">'
      + '<span class="name">' + esc(s.name) + '</span>'
      + '<span class="desc">' + esc(s.description) + '</span>'
      + '</button>';
  }).join('');

  openModalPanel(
    '<div class="modal">'
      + '<div class="modal-head">'
        + '<h2>New page</h2>'
        + '<p>Pick a starting point — you can edit everything afterwards.</p>'
      + '</div>'
      + '<div class="modal-body">'
        + '<div class="new-page-modal">' + cards + '</div>'
      + '</div>'
      + '<div class="modal-foot">'
        + '<button class="btn ghost" data-close>Cancel</button>'
      + '</div>'
    + '</div>'
  );

  var root = document.querySelector('#modalRoot');
  if (!root) return;
  var closeBtn = root.querySelector('[data-close]');
  if (closeBtn) closeBtn.addEventListener('click', closeModalPanel);
  root.querySelectorAll('.starter-card').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var starterId = btn.dataset.starter;
      closeModalPanel();
      createPageFromStarter(starterId);
    });
  });
}

async function createPageFromStarter(starterId) {
  var starter = PAGE_STARTERS.find(function (s) { return s.id === starterId; });
  if (!starter) return;
  var preset = starter.build();

  try {
    var created = await Store.db.pages.create({
      title:  preset.title,
      blocks: preset.blocks,
      pinned: false,
    });
    invalidatePagesCache();
    await loadPages(true);
    updatePagesBadge();
    _activePageId = created.id;
    _pagesMobileEditing = true;
    renderPagesList();
    renderPageEditor();
    toast('Page created');
  } catch (e) {
    console.warn('createPageFromStarter failed:', e.message);
    toast('Could not create page: ' + e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   SAVE AS TEMPLATE
   ══════════════════════════════════════════════════════════════════════ */
function openSaveAsTemplateModal() {
  var page = getPageById(_activePageId);
  if (!page) return;

  openModalPanel(
    '<div class="modal">'
      + '<div class="modal-head">'
        + '<h2>Save as template</h2>'
        + '<p>Reuse this page structure for future projects. Only the layout is saved — no links or pinned state.</p>'
      + '</div>'
      + '<div class="modal-body">'
        + '<div class="field">'
          + '<label>Template name</label>'
          + '<input type="text" id="__tplName" value="' + esc(page.title || 'Untitled template') + '" autocomplete="off">'
        + '</div>'
        + '<div class="field">'
          + '<label>Description <span style="color:var(--muted-soft);font-weight:400">(optional)</span></label>'
          + '<input type="text" id="__tplDesc" placeholder="What is this template for?" autocomplete="off">'
        + '</div>'
      + '</div>'
      + '<div class="modal-foot">'
        + '<button class="btn ghost" data-close>Cancel</button>'
        + '<button class="btn primary" id="__tplSave">Save template</button>'
      + '</div>'
    + '</div>'
  );

  var root = document.querySelector('#modalRoot');
  if (!root) return;
  var closeBtn = root.querySelector('[data-close]');
  if (closeBtn) closeBtn.addEventListener('click', closeModalPanel);
  var saveBtn = root.querySelector('#__tplSave');
  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      var name = root.querySelector('#__tplName').value.trim();
      var desc = root.querySelector('#__tplDesc').value.trim();
      if (!name) { root.querySelector('#__tplName').focus(); return; }
      closeModalPanel();
      savePageAsTemplate(page, name, desc);
    });
  }
  setTimeout(function () {
    var el = root.querySelector('#__tplName');
    if (el) { el.focus(); el.select(); }
  }, 60);
}

async function savePageAsTemplate(page, name, desc) {
  try {
    var tpl = {
      name:        name,
      description: desc,
      blocks:      JSON.parse(JSON.stringify(page.blocks || [])),
    };
    await Store.db.pageTemplates.create(buildPageTemplateDbPayload(tpl));
    invalidatePageTemplatesCache();
    await loadPageTemplates(true);
    toast('Template saved · ' + name);
  } catch (e) {
    console.warn('savePageAsTemplate failed:', e.message);
    toast('Could not save template: ' + e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   TEMPLATE ACTIONS
   ══════════════════════════════════════════════════════════════════════ */
async function useTemplate(tplId) {
  var tpl = getPageTemplateById(tplId);
  if (!tpl) return;

  var blocks = JSON.parse(JSON.stringify(tpl.blocks || []));
  blocks.forEach(function (b) { b.id = uidBlock(); });

  try {
    var created = await Store.db.pages.create({
      title:  tpl.name,
      blocks: blocks,
      pinned: false,
    });
    invalidatePagesCache();
    await loadPages(true);
    updatePagesBadge();
    _pagesViewMode = 'pages';
    _activePageId = created.id;
    _pagesMobileEditing = true;
    var host = document.querySelector('#view-pages');
    if (host) {
      host.innerHTML = buildPagesShellHTML();
      wirePagesShell();
      renderCurrentList();
      renderPageEditor();
    }
    toast('Page created from template');
  } catch (e) {
    console.warn('useTemplate failed:', e.message);
    toast('Could not use template: ' + e.message);
  }
}

function renameTemplate(tplId) {
  var tpl = getPageTemplateById(tplId);
  if (!tpl) return;

  openModalPanel(
    '<div class="modal">'
      + '<div class="modal-head"><h2>Rename template</h2></div>'
      + '<div class="modal-body">'
        + '<div class="field">'
          + '<label>Template name</label>'
          + '<input type="text" id="__tplRename" value="' + esc(tpl.name) + '" autocomplete="off">'
        + '</div>'
      + '</div>'
      + '<div class="modal-foot">'
        + '<button class="btn ghost" data-close>Cancel</button>'
        + '<button class="btn primary" id="__tplRenameSave">Rename</button>'
      + '</div>'
    + '</div>'
  );

  var root = document.querySelector('#modalRoot');
  if (!root) return;
  var closeBtn = root.querySelector('[data-close]');
  if (closeBtn) closeBtn.addEventListener('click', closeModalPanel);
  var saveBtn = root.querySelector('#__tplRenameSave');
  if (saveBtn) {
    saveBtn.addEventListener('click', async function () {
      var newName = root.querySelector('#__tplRename').value.trim();
      if (!newName) return;
      closeModalPanel();
      try {
        await Store.db.pageTemplates.update(tplId, { name: newName });
        invalidatePageTemplatesCache();
        await loadPageTemplates(true);
        renderTemplatesList();
        toast('Renamed');
      } catch (e) {
        toast('Could not rename: ' + e.message);
      }
    });
  }
  setTimeout(function () {
    var el = root.querySelector('#__tplRename');
    if (el) { el.focus(); el.select(); }
  }, 60);
}

async function duplicateTemplate(tplId) {
  var tpl = getPageTemplateById(tplId);
  if (!tpl) return;

  var names = _pageTemplatesCache.map(function (t) { return t.name; });
  var base = tpl.name || 'Template';
  var newName = base;
  var i = 2;
  while (names.indexOf(newName) !== -1) { newName = base + ' (' + i + ')'; i++; }

  try {
    await Store.db.pageTemplates.create(buildPageTemplateDbPayload({
      name:        newName,
      description: tpl.description,
      blocks:      tpl.blocks,
    }));
    invalidatePageTemplatesCache();
    await loadPageTemplates(true);
    renderTemplatesList();
    toast('Duplicated');
  } catch (e) {
    toast('Could not duplicate: ' + e.message);
  }
}

async function deleteTemplate(tplId) {
  var tpl = getPageTemplateById(tplId);
  if (!tpl) return;

  var ok = await confirmDialog({
    title: 'Delete "' + tpl.name + '"?',
    message: 'Moved to Trash. You can restore it later.',
    confirmLabel: 'Delete',
    danger: true
  });
  if (!ok) return;

  try {
    await Store.db.trash.create({
      kind: 'page_template',
      name: tpl.name,
      record: clone(tpl),
    });
    await Store.db.pageTemplates.remove(tplId);
    invalidatePageTemplatesCache();
    await loadPageTemplates(true);
    renderTemplatesList();
    toast('Template deleted');
  } catch (e) {
    toast('Could not delete: ' + e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   EDITOR
   ══════════════════════════════════════════════════════════════════════ */
async function renderPageEditor() {
  var host = document.querySelector('#pageEditorHost');
  if (!host) return;

  var page = getPageById(_activePageId);
  if (!page) {
    _activePageId = null;
    renderPagesEmptyEditor();
    return;
  }

  var links = await getPageLinkOptions();

  var contactOptions = '<option value="">— None —</option>'
    + links.contacts.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (page.contactId === c.id ? ' selected' : '') + '>' + esc(c.name) + (c.company ? ' · ' + esc(c.company) : '') + '</option>';
      }).join('');

  var projectOptions = '<option value="">— None —</option>'
    + links.projects.map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (page.projectId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
      }).join('');

  host.innerHTML = ''
    + '<div class="page-editor">'

      + breadcrumbHTML()

      + '<header class="page-editor-head">'
        + '<span class="page-save-state" id="pageSaveState"></span>'
        + '<span class="grow"></span>'
        + '<button class="icon-btn" id="pageExport" title="Export as PDF">'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
        + '</button>'
        + '<button class="icon-btn" id="pageSaveTemplate" title="Save as template">'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>'
        + '</button>'
        + '<button class="icon-btn" id="pagePin" title="' + (page.pinned ? 'Unpin' : 'Pin') + '">'
          + (page.pinned
              ? '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24z"/></svg>')
        + '</button>'
        + '<button class="icon-btn danger" id="pageDelete" title="Delete">'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>'
        + '</button>'
        + '<button class="icon-btn page-close-btn" id="pageClose" title="Close page">'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        + '</button>'
      + '</header>'

      + '<div class="page-editor-body" id="pageEditorBody">'
        + '<div class="page-editor-inner">'
          + '<input type="text" class="page-title-input" id="pageTitleInput" placeholder="Untitled" value="' + esc(page.title) + '" spellcheck="true">'
          + '<div class="page-blocks" id="pageBlocks"></div>'
          + '<div class="add-block-wrap">'
            + '<button class="btn-add-block" id="btnAddBlock">+ Add block</button>'
          + '</div>'
        + '</div>'
      + '</div>'

      + '<div class="page-editor-links">'
        + '<label class="page-link-row">'
          + '<span class="page-link-label">Contact</span>'
          + '<select id="pageContactSelect">' + contactOptions + '</select>'
        + '</label>'
        + '<label class="page-link-row">'
          + '<span class="page-link-label">Project</span>'
          + '<select id="pageProjectSelect">' + projectOptions + '</select>'
        + '</label>'
      + '</div>'

    + '</div>';

  renderBlocks(page.blocks || []);
  wirePageEditor(page);
  if (typeof wireBreadcrumb === 'function') wireBreadcrumb(host);
}

function renderPagesEmptyEditor() {
  var host = document.querySelector('#pageEditorHost');
  if (!host) return;
  host.innerHTML = ''
    + '<div class="pages-empty-editor">'
      + '<div class="emoji">📄</div>'
      + '<h2>Your pages</h2>'
      + '<p>Pick a page from the list, or create a new one.</p>'
      + '<button class="btn primary sm" id="pageEmptyAdd">+ New page</button>'
    + '</div>';
  var addBtn = document.querySelector('#pageEmptyAdd');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      openNewPageModal();
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════
   BLOCK RENDERING
   ══════════════════════════════════════════════════════════════════════ */
function renderBlocks(blocks) {
  var host = document.querySelector('#pageBlocks');
  if (!host) return;

  if (!blocks.length) {
    host.innerHTML = '<div class="tool-empty" style="padding:24px;text-align:center;color:var(--muted);font-size:13px">No blocks yet. Click <strong>+ Add block</strong> below.</div>';
    return;
  }

  host.innerHTML = blocks.map(blockHTML).join('');

  host.querySelectorAll('.page-block').forEach(function (blockEl) {
    wireBlock(blockEl);
  });

  host.querySelectorAll('textarea:not([data-no-autosize])').forEach(autosizeTextarea);

  host.querySelectorAll('.page-block[data-type="image"]').forEach(function (blockEl) {
    var id = blockEl.dataset.id;
    var page = getPageById(_activePageId);
    if (!page) return;
    var block = page.blocks.find(function (b) { return b.id === id; });
    if (!block || !block.storagePath) return;

    var img = blockEl.querySelector('img[data-storage-path]');
    if (!img) return;

    resolveImageUrl(block.storagePath).then(function (url) {
      if (!url) return;
      img.src = url;
      block.url = url;
    });
  });
}

function blockHTML(b) {
  var tools = '<div class="block-tools">'
    + '<span class="block-handle" draggable="true" title="Drag to reorder">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>'
    + '</span>'
    + '<button class="block-remove" title="Remove block">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    + '</button>'
    + '</div>';

  var body = blockBodyHTML(b);

  return '<div class="page-block" data-id="' + esc(b.id) + '" data-type="' + esc(b.type) + '">'
    + tools
    + '<div class="block-body">' + body + '</div>'
    + '</div>';
}

function blockBodyHTML(b) {
  var text = esc(b.text || '');

  switch (b.type) {
    case 'h1': return '<input type="text" data-field="text" value="' + text + '" placeholder="Heading 1">';
    case 'h2': return '<input type="text" data-field="text" value="' + text + '" placeholder="Heading 2">';
    case 'h3': return '<input type="text" data-field="text" value="' + text + '" placeholder="Heading 3">';
    case 'paragraph': return '<textarea data-field="text" rows="1" placeholder="Start writing…">' + text + '</textarea>';
    case 'quote':     return '<textarea data-field="text" rows="1" placeholder="Quote…">' + text + '</textarea>';
    case 'code':      return '<textarea data-field="text" rows="3" placeholder="Code…" spellcheck="false">' + text + '</textarea>';
    case 'callout':
      return '<button class="callout-emoji-btn" title="Change icon">' + esc(b.icon || '💡') + '</button>'
        + '<textarea data-field="text" rows="1" placeholder="Callout…">' + text + '</textarea>';
    case 'divider':
      return '<hr>';
    case 'bullet':
    case 'numbered': {
      var items = Array.isArray(b.items) && b.items.length ? b.items : [''];
      var tag = b.type === 'bullet' ? '•' : null;
      return '<div class="bullet-list">'
        + items.map(function (item, idx) {
          var marker = tag ? tag : (idx + 1) + '.';
          return '<div class="bullet-row" data-item="' + idx + '">'
            + '<span class="bullet-marker">' + marker + '</span>'
            + '<textarea data-field="item" data-idx="' + idx + '" rows="1" placeholder="List item">' + esc(item) + '</textarea>'
            + '</div>';
        }).join('')
        + '</div>';
    }
    case 'todo': {
      var checked = b.checked ? ' checked' : '';
      var doneClass = b.checked ? ' done' : '';
      return '<div class="todo-row' + doneClass + '">'
        + '<input type="checkbox" data-field="checked"' + checked + '>'
        + '<textarea data-field="text" rows="1" placeholder="To-do…">' + text + '</textarea>'
        + '</div>';
    }
    case 'image':
      return imageBlockBodyHTML(b);
    case 'table':
      return tableBlockBodyHTML(b);
    case 'link':
      return linkBlockBodyHTML(b);
    default:
      return '<textarea data-field="text" rows="1" placeholder="Text…">' + text + '</textarea>';
  }
}

function imageBlockBodyHTML(b) {
  var hasImage = !!(b.url || b.storagePath);
  if (!hasImage) {
    return ''
      + '<div class="image-placeholder">'
        + '<div class="ico">📷</div>'
        + '<p>Add an image</p>'
        + '<div class="image-placeholder-actions">'
          + '<input type="text" data-field="urlInput" placeholder="Paste image URL…" value="">'
          + '<button class="btn sm" data-field="applyUrl">Apply</button>'
        + '</div>'
        + '<button class="btn sm" data-field="uploadBtn" style="margin-top:8px">Upload from computer</button>'
        + '<input type="file" data-field="fileInput" accept="image/png,image/jpeg,image/webp,image/gif" hidden>'
      + '</div>';
  }
  return ''
    + '<div class="image-block">'
      + '<div class="image-block-frame">'
        + '<img src="' + esc(b.url || '') + '" data-storage-path="' + esc(b.storagePath || '') + '" alt="" loading="lazy">'
        + '<div class="image-block-tools">'
          + '<button data-field="replace" title="Replace"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg></button>'
          + '<button class="danger" data-field="remove" title="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
        + '</div>'
        + '<input type="file" data-field="fileInput" accept="image/png,image/jpeg,image/webp,image/gif" hidden>'
      + '</div>'
      + '<input type="text" class="image-block-caption" data-field="caption" placeholder="Add a caption…" value="' + esc(b.caption || '') + '">'
    + '</div>';
}

function tableBlockBodyHTML(b) {
  var rows = Array.isArray(b.rows) && b.rows.length ? b.rows : [['', ''], ['', '']];
  var colCount = rows[0].length;

  var thead = '<thead><tr>'
    + rows[0].map(function (cell, cIdx) {
        return '<th><input type="text" data-row="0" data-col="' + cIdx + '" value="' + esc(cell) + '" placeholder="Header ' + (cIdx + 1) + '"></th>';
      }).join('')
    + '</tr></thead>';

  var tbody = '<tbody>'
    + rows.slice(1).map(function (row, rIdx) {
        var realRow = rIdx + 1;
        return '<tr>'
          + row.map(function (cell, cIdx) {
              return '<td><input type="text" data-row="' + realRow + '" data-col="' + cIdx + '" value="' + esc(cell) + '" placeholder=""></td>';
            }).join('')
          + '</tr>';
      }).join('')
    + '</tbody>';

  return ''
    + '<div class="table-block">'
      + '<div class="table-block-scroll">'
        + '<table>' + thead + tbody + '</table>'
      + '</div>'
      + '<div class="table-block-toolbar">'
        + '<button data-field="addRow">+ Row</button>'
        + '<button data-field="removeRow" ' + (rows.length <= 2 ? 'disabled' : '') + '>− Row</button>'
        + '<button data-field="addCol">+ Column</button>'
        + '<button data-field="removeCol" ' + (colCount <= 1 ? 'disabled' : '') + '>− Column</button>'
      + '</div>'
    + '</div>';
}

function linkBlockBodyHTML(b) {
  var url = b.url || '';
  var title = b.title || '';
  var desc = b.description || '';
  return ''
    + '<div class="link-card">'
      + '<div class="link-card-url-row">'
        + '<input type="text" data-field="url" placeholder="https://example.com" value="' + esc(url) + '">'
      + '</div>'
      + '<input type="text" class="link-card-title" data-field="title" placeholder="Link title" value="' + esc(title) + '">'
      + '<textarea class="link-card-desc" data-field="description" data-no-autosize="1" rows="2" placeholder="Short description (optional)">' + esc(desc) + '</textarea>'
      + (url ? '<a class="link-card-open" href="' + esc(url) + '" target="_blank" rel="noopener">Open link ↗</a>' : '')
    + '</div>';
}

/* ══════════════════════════════════════════════════════════════════════
   BLOCK WIRING — shared
   ══════════════════════════════════════════════════════════════════════ */
function wireBlock(blockEl) {
  var id = blockEl.dataset.id;
  var page = getPageById(_activePageId);
  if (!page) return;

  var block = page.blocks.find(function (b) { return b.id === id; });
  if (!block) return;

  var removeBtn = blockEl.querySelector('.block-remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', function () {
      var idx = page.blocks.findIndex(function (b) { return b.id === id; });
      if (idx < 0) return;
      page.blocks.splice(idx, 1);
      markPageDirty();
      schedulePageSave();
      renderBlocks(page.blocks);
    });
  }

  blockEl.querySelectorAll('[data-field="text"], [data-field="item"], [data-field="checked"]').forEach(function (el) {
    var field = el.dataset.field;

    if (field === 'checked') {
      el.addEventListener('change', function () {
        block.checked = el.checked;
        var row = el.closest('.todo-row');
        if (row) row.classList.toggle('done', el.checked);
        markPageDirty();
        schedulePageSave();
      });
      return;
    }

    if (field === 'item') {
      el.addEventListener('input', function () {
        var idx = parseInt(el.dataset.idx, 10);
        if (!Array.isArray(block.items)) block.items = [];
        block.items[idx] = el.value;
        autosizeTextarea(el);
        markPageDirty();
        schedulePageSave();
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          var idx = parseInt(el.dataset.idx, 10);
          if (!Array.isArray(block.items)) block.items = [];
          block.items.splice(idx + 1, 0, '');
          markPageDirty();
          schedulePageSave();
          renderBlocks(page.blocks);
          setTimeout(function () {
            var rows = document.querySelectorAll('.page-block[data-id="' + id + '"] .bullet-row');
            var target = rows[idx + 1];
            if (target) {
              var ta = target.querySelector('textarea');
              if (ta) ta.focus();
            }
          }, 30);
        } else if (e.key === 'Backspace' && !el.value && (block.items || []).length > 1) {
          e.preventDefault();
          var idx2 = parseInt(el.dataset.idx, 10);
          block.items.splice(idx2, 1);
          markPageDirty();
          schedulePageSave();
          renderBlocks(page.blocks);
        }
      });
      return;
    }

    el.addEventListener('input', function () {
      block.text = el.value;
      autosizeTextarea(el);
      markPageDirty();
      schedulePageSave();
      var cardPreview = document.querySelector('.page-card.active .page-card-preview');
      if (cardPreview && _activePageId) {
        var activePage = getPageById(_activePageId);
        if (activePage) cardPreview.textContent = pagePreview(activePage);
      }
    });
  });

  var calloutEmojiBtn = blockEl.querySelector('.callout-emoji-btn');
  if (calloutEmojiBtn) {
    calloutEmojiBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openCalloutPicker(calloutEmojiBtn, block);
    });
  }

  if (block.type === 'image') wireImageBlock(blockEl, block, page);
  if (block.type === 'table') wireTableBlock(blockEl, block, page);
  if (block.type === 'link')  wireLinkBlock(blockEl, block, page);

  var handle = blockEl.querySelector('.block-handle');
  if (handle) {
    handle.addEventListener('dragstart', function (e) {
      _draggingBlockId = id;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', id); } catch (err) {}
      blockEl.classList.add('dragging');
    });
    handle.addEventListener('dragend', function () {
      _draggingBlockId = null;
      document.querySelectorAll('.page-block').forEach(function (b) {
        b.classList.remove('dragging', 'drop-above', 'drop-below');
      });
    });
  }

  blockEl.addEventListener('dragover', function (e) {
    if (!_draggingBlockId || _draggingBlockId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var rect = blockEl.getBoundingClientRect();
    var before = e.clientY < rect.top + rect.height / 2;
    blockEl.classList.toggle('drop-above', before);
    blockEl.classList.toggle('drop-below', !before);
  });

  blockEl.addEventListener('dragleave', function () {
    blockEl.classList.remove('drop-above', 'drop-below');
  });

  blockEl.addEventListener('drop', function (e) {
    e.preventDefault();
    blockEl.classList.remove('drop-above', 'drop-below');
    if (!_draggingBlockId || _draggingBlockId === id) return;
    var rect = blockEl.getBoundingClientRect();
    var before = e.clientY < rect.top + rect.height / 2;
    reorderBlocks(_draggingBlockId, id, before);
  });
}

function wireImageBlock(blockEl, block, page) {
  var fileInput = blockEl.querySelector('input[type="file"][data-field="fileInput"]');
  var uploadBtn = blockEl.querySelector('[data-field="uploadBtn"]');
  var applyUrlBtn = blockEl.querySelector('[data-field="applyUrl"]');
  var urlInput = blockEl.querySelector('[data-field="urlInput"]');
  var replaceBtn = blockEl.querySelector('[data-field="replace"]');
  var removeImgBtn = blockEl.querySelector('[data-field="remove"]');
  var captionInput = blockEl.querySelector('[data-field="caption"]');

  function pickFile() {
    if (fileInput) fileInput.click();
  }

  if (uploadBtn) uploadBtn.addEventListener('click', pickFile);
  if (replaceBtn) replaceBtn.addEventListener('click', pickFile);

  if (fileInput) {
    fileInput.addEventListener('change', async function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { toast('Image must be under 5 MB'); e.target.value = ''; return; }
      var ext = (f.name.split('.').pop() || 'png').toLowerCase();
      try {
        var up = await Store.storage.uploadLogo(f, ext);
        block.storagePath = up.path;
        block.url = await resolveImageUrl(up.path);
        markPageDirty();
        schedulePageSave();
        renderBlocks(page.blocks);
        toast('Image added');
      } catch (upErr) {
        console.warn('image upload failed:', upErr.message);
        toast('Upload failed: ' + upErr.message);
      }
      e.target.value = '';
    });
  }

  if (applyUrlBtn && urlInput) {
    applyUrlBtn.addEventListener('click', function () {
      var url = urlInput.value.trim();
      if (!url) return;
      block.url = url;
      block.storagePath = null;
      markPageDirty();
      schedulePageSave();
      renderBlocks(page.blocks);
    });
    urlInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyUrlBtn.click();
      }
    });
  }

  if (removeImgBtn) {
    removeImgBtn.addEventListener('click', function () {
      block.url = '';
      block.storagePath = null;
      block.caption = '';
      markPageDirty();
      schedulePageSave();
      renderBlocks(page.blocks);
    });
  }

  if (captionInput) {
    captionInput.addEventListener('input', function () {
      block.caption = captionInput.value;
      markPageDirty();
      schedulePageSave();
    });
  }
}

function wireTableBlock(blockEl, block, page) {
  if (!Array.isArray(block.rows) || !block.rows.length) {
    block.rows = [['', ''], ['', '']];
  }

  blockEl.querySelectorAll('input[data-row]').forEach(function (cell) {
    var row = parseInt(cell.dataset.row, 10);
    var col = parseInt(cell.dataset.col, 10);

    cell.addEventListener('input', function () {
      if (!block.rows[row]) block.rows[row] = [];
      block.rows[row][col] = cell.value;
      markPageDirty();
      schedulePageSave();
    });

    cell.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var allInputs = Array.from(blockEl.querySelectorAll('input[data-row]'));
        var idx = allInputs.indexOf(cell);
        var next = allInputs[idx + (e.shiftKey ? -1 : 1)];
        if (next) next.focus();
        else if (!e.shiftKey) {
          block.rows.push(new Array(block.rows[0].length).fill(''));
          markPageDirty();
          schedulePageSave();
          renderBlocks(page.blocks);
          setTimeout(function () {
            var inputs = document.querySelectorAll('.page-block[data-id="' + block.id + '"] input[data-row]');
            if (inputs.length) inputs[inputs.length - block.rows[0].length].focus();
          }, 30);
        }
      }
    });
  });

  var addRowBtn = blockEl.querySelector('[data-field="addRow"]');
  if (addRowBtn) {
    addRowBtn.addEventListener('click', function () {
      block.rows.push(new Array(block.rows[0].length).fill(''));
      markPageDirty();
      schedulePageSave();
      renderBlocks(page.blocks);
    });
  }

  var removeRowBtn = blockEl.querySelector('[data-field="removeRow"]');
  if (removeRowBtn) {
    removeRowBtn.addEventListener('click', function () {
      if (block.rows.length <= 2) return;
      block.rows.pop();
      markPageDirty();
      schedulePageSave();
      renderBlocks(page.blocks);
    });
  }

  var addColBtn = blockEl.querySelector('[data-field="addCol"]');
  if (addColBtn) {
    addColBtn.addEventListener('click', function () {
      block.rows.forEach(function (row) { row.push(''); });
      markPageDirty();
      schedulePageSave();
      renderBlocks(page.blocks);
    });
  }

  var removeColBtn = blockEl.querySelector('[data-field="removeCol"]');
  if (removeColBtn) {
    removeColBtn.addEventListener('click', function () {
      if (block.rows[0].length <= 1) return;
      block.rows.forEach(function (row) { row.pop(); });
      markPageDirty();
      schedulePageSave();
      renderBlocks(page.blocks);
    });
  }
}

function wireLinkBlock(blockEl, block, page) {
  var urlInput = blockEl.querySelector('[data-field="url"]');
  var titleInput = blockEl.querySelector('[data-field="title"]');
  var descInput = blockEl.querySelector('[data-field="description"]');
  var openLink = blockEl.querySelector('.link-card-open');

  if (urlInput) {
    urlInput.addEventListener('input', function () {
      block.url = urlInput.value;
      markPageDirty();
      schedulePageSave();
      if (openLink) {
        if (block.url) {
          openLink.href = block.url;
          openLink.style.display = '';
        } else {
          openLink.style.display = 'none';
        }
      }
    });
    urlInput.addEventListener('blur', function () {
      if (!block.title && block.url) {
        var domain = extractDomain(block.url);
        if (domain) {
          block.title = domain;
          markPageDirty();
          schedulePageSave();
          renderBlocks(page.blocks);
        }
      }
    });
  }

  if (titleInput) {
    titleInput.addEventListener('input', function () {
      block.title = titleInput.value;
      markPageDirty();
      schedulePageSave();
    });
  }

  if (descInput) {
    descInput.addEventListener('input', function () {
      block.description = descInput.value;
      markPageDirty();
      schedulePageSave();
    });
  }
}

function extractDomain(url) {
  try {
    var u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch (e) {
    try {
      var u2 = new URL('https://' + url);
      return u2.hostname.replace(/^www\./, '');
    } catch (e2) { return null; }
  }
}

/* ══════════════════════════════════════════════════════════════════════
   REORDER
   ══════════════════════════════════════════════════════════════════════ */
function reorderBlocks(fromId, toId, before) {
  var page = getPageById(_activePageId);
  if (!page) return;
  var blocks = page.blocks;
  var fromIdx = blocks.findIndex(function (b) { return b.id === fromId; });
  var toIdx   = blocks.findIndex(function (b) { return b.id === toId; });
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

  var moved = blocks.splice(fromIdx, 1)[0];
  toIdx = blocks.findIndex(function (b) { return b.id === toId; });
  if (!before) toIdx += 1;
  blocks.splice(toIdx, 0, moved);

  markPageDirty();
  schedulePageSave();
  renderBlocks(page.blocks);
}

/* ══════════════════════════════════════════════════════════════════════
   EDITOR SHELL WIRING
   ══════════════════════════════════════════════════════════════════════ */
function wirePageEditor(page) {
  var closeBtn = document.querySelector('#pageClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', async function () {
      if (_pageDirty) await flushPageSave();
      _activePageId = null;
      _pagesMobileEditing = false;
      if (typeof clearBreadcrumb === 'function') clearBreadcrumb();
      renderPagesList();
      renderPagesEmptyEditor();
    });
  }

  var titleInput = document.querySelector('#pageTitleInput');
  if (titleInput) {
    titleInput.addEventListener('input', function () {
      page.title = titleInput.value;
      markPageDirty();
      schedulePageSave();
      var cardTitle = document.querySelector('.page-card.active .page-card-title');
      if (cardTitle) cardTitle.textContent = page.title || 'Untitled page';
    });
  }

  var addBtn = document.querySelector('#btnAddBlock');
  if (addBtn) {
    addBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openAddBlockMenu(addBtn, page);
    });
  }

  var exportBtn = document.querySelector('#pageExport');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportPageAsPDF);
  }

  var saveTplBtn = document.querySelector('#pageSaveTemplate');
  if (saveTplBtn) {
    saveTplBtn.addEventListener('click', function () {
      openSaveAsTemplateModal();
    });
  }

  var pinBtn = document.querySelector('#pagePin');
  if (pinBtn) {
    pinBtn.addEventListener('click', async function () {
      page.pinned = !page.pinned;
      try {
        await Store.db.pages.update(page.id, { pinned: page.pinned });
        invalidatePagesCache();
        await loadPages(true);
        updatePagesBadge();
        renderPagesList();
        renderPageEditor();
        toast(page.pinned ? 'Pinned' : 'Unpinned');
      } catch (e) { toast('Could not pin: ' + e.message); }
    });
  }

  var delBtn = document.querySelector('#pageDelete');
  if (delBtn) {
    delBtn.addEventListener('click', async function () {
      var ok = await confirmDialog({
        title: 'Delete "' + (page.title || 'Untitled page') + '"?',
        message: 'Moved to Trash. You can restore it later.',
        confirmLabel: 'Delete',
        danger: true
      });
      if (!ok) return;
      try {
        await Store.db.trash.create({
          kind: 'page',
          name: page.title || 'Untitled page',
          record: clone(page)
        });
        await Store.db.pages.remove(page.id);
        invalidatePagesCache();
        await loadPages(true);
        updatePagesBadge();
        _activePageId = null;
        _pagesMobileEditing = false;
        if (typeof clearBreadcrumb === 'function') clearBreadcrumb();
        renderPagesList();
        renderPagesEmptyEditor();
        toast('Page deleted');
      } catch (e) {
        toast('Could not delete: ' + e.message);
      }
    });
  }

  var contactSel = document.querySelector('#pageContactSelect');
  if (contactSel) {
    contactSel.addEventListener('change', function () {
      page.contactId = contactSel.value || null;
      markPageDirty();
      schedulePageSave();
      renderPagesList();
    });
  }
  var projectSel = document.querySelector('#pageProjectSelect');
  if (projectSel) {
    projectSel.addEventListener('change', function () {
      page.projectId = projectSel.value || null;
      markPageDirty();
      schedulePageSave();
      renderPagesList();
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════
   ADD BLOCK MENU
   ══════════════════════════════════════════════════════════════════════ */
function openAddBlockMenu(anchorEl, page) {
  closeAnyMenu();

  var menu = document.createElement('div');
  menu.className = 'add-block-menu';
  menu.id = '__addBlockMenu';

  var types = [
    { type: 'h1',        icon: 'H1',  label: 'Heading 1' },
    { type: 'h2',        icon: 'H2',  label: 'Heading 2' },
    { type: 'h3',        icon: 'H3',  label: 'Heading 3' },
    { type: 'paragraph', icon: '¶',   label: 'Paragraph' },
    { type: 'bullet',    icon: '•',   label: 'Bullet list' },
    { type: 'numbered',  icon: '1.',  label: 'Numbered list' },
    { type: 'todo',      icon: '☐',   label: 'To-do' },
    { type: 'quote',     icon: '"',   label: 'Quote' },
    { type: 'callout',   icon: '💡',  label: 'Callout' },
    { type: 'code',      icon: '</>', label: 'Code' },
    { type: 'divider',   icon: '—',   label: 'Divider' },
    { type: 'image',     icon: '📷',  label: 'Image' },
    { type: 'table',     icon: '▦',   label: 'Table' },
    { type: 'link',      icon: '🔗',  label: 'Link card' }
  ];

  menu.innerHTML = types.map(function (t) {
    return '<button data-block-type="' + t.type + '"><span class="ico">' + esc(t.icon) + '</span>' + t.label + '</button>';
  }).join('');

  var wrap = anchorEl.closest('.add-block-wrap');
  if (!wrap) return;
  wrap.appendChild(menu);

  menu.querySelectorAll('button[data-block-type]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var type = btn.dataset.blockType;
      closeAnyMenu();
      addBlockOfType(type, page);
    });
  });

  setTimeout(function () {
    document.addEventListener('click', closeAnyMenuOnOutsideClick);
  }, 0);
}

function closeAnyMenu() {
  var menu = document.querySelector('#__addBlockMenu');
  if (menu) menu.remove();
  var cpicker = document.querySelector('#__calloutPicker');
  if (cpicker) cpicker.remove();
  document.removeEventListener('click', closeAnyMenuOnOutsideClick);
}

function closeAnyMenuOnOutsideClick(e) {
  if (!e.target.closest('.add-block-menu') &&
      !e.target.closest('.callout-emoji-picker') &&
      !e.target.closest('#btnAddBlock') &&
      !e.target.closest('.callout-emoji-btn')) {
    closeAnyMenu();
  }
}

function addBlockOfType(type, page) {
  var newBlock;
  switch (type) {
    case 'h1': newBlock = { id: uidBlock(), type: 'h1', text: '' }; break;
    case 'h2': newBlock = { id: uidBlock(), type: 'h2', text: '' }; break;
    case 'h3': newBlock = { id: uidBlock(), type: 'h3', text: '' }; break;
    case 'paragraph': newBlock = { id: uidBlock(), type: 'paragraph', text: '' }; break;
    case 'bullet': newBlock = { id: uidBlock(), type: 'bullet', items: [''] }; break;
    case 'numbered': newBlock = { id: uidBlock(), type: 'numbered', items: [''] }; break;
    case 'todo': newBlock = { id: uidBlock(), type: 'todo', text: '', checked: false }; break;
    case 'quote': newBlock = { id: uidBlock(), type: 'quote', text: '' }; break;
    case 'callout': newBlock = { id: uidBlock(), type: 'callout', icon: '💡', text: '' }; break;
    case 'code': newBlock = { id: uidBlock(), type: 'code', text: '' }; break;
    case 'divider': newBlock = { id: uidBlock(), type: 'divider' }; break;
    case 'image': newBlock = { id: uidBlock(), type: 'image', url: '', storagePath: null, caption: '' }; break;
    case 'table': newBlock = { id: uidBlock(), type: 'table', rows: [['', ''], ['', '']] }; break;
    case 'link':  newBlock = { id: uidBlock(), type: 'link', url: '', title: '', description: '' }; break;
    default: newBlock = { id: uidBlock(), type: 'paragraph', text: '' };
  }
  page.blocks.push(newBlock);
  markPageDirty();
  schedulePageSave();
  renderBlocks(page.blocks);

  setTimeout(function () {
    var el = document.querySelector('.page-block[data-id="' + newBlock.id + '"] input, .page-block[data-id="' + newBlock.id + '"] textarea');
    if (el) { el.focus(); if (el.select) el.select(); }
  }, 40);
}

/* ══════════════════════════════════════════════════════════════════════
   CALLOUT EMOJI PICKER (kept — this is per-block, not page icon)
   ══════════════════════════════════════════════════════════════════════ */
function openCalloutPicker(anchorEl, block) {
  closeAnyMenu();

  var picker = document.createElement('div');
  picker.className = 'callout-emoji-picker';
  picker.id = '__calloutPicker';
  picker.innerHTML = CALLOUT_ICONS.map(function (emo) {
    return '<button data-emoji="' + esc(emo) + '">' + emo + '</button>';
  }).join('');

  var wrap = anchorEl.closest('.block-body');
  if (!wrap) return;
  wrap.appendChild(picker);

  picker.querySelectorAll('button[data-emoji]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      block.icon = btn.dataset.emoji;
      markPageDirty();
      schedulePageSave();
      closeAnyMenu();
      var page = getPageById(_activePageId);
      if (page) renderBlocks(page.blocks);
    });
  });

  setTimeout(function () {
    document.addEventListener('click', closeAnyMenuOnOutsideClick);
  }, 0);
}

/* ══════════════════════════════════════════════════════════════════════
   PUBLIC — open a page by id from search or cross-links
   ══════════════════════════════════════════════════════════════════════ */
async function openPageById(id) {
  if (!_pagesLoaded || _pagesCache.length === 0) {
    await loadPages(true);
  }
  var page = getPageById(id);
  if (!page) { toast('Page not found'); return; }
  _activePageId = id;
  _pagesMobileEditing = true;
  _pagesViewMode = 'pages';

  var host = document.querySelector('#view-pages');
  if (host && host.classList.contains('active')) {
    /* Rebuild shell so the filter reflects 'pages' mode */
    host.innerHTML = buildPagesShellHTML();
    wirePagesShell();
    renderCurrentList();
    renderPageEditor();
  } else {
    showView('pages');
  }
}

/* ══════════════════════════════════════════════════════════════════════
   AUTO-SAVE
   ══════════════════════════════════════════════════════════════════════ */
function markPageDirty() {
  _pageDirty = true;
  updatePageSaveState('Saving…');
}

function updatePageSaveState(text) {
  var el = document.querySelector('#pageSaveState');
  if (el) el.textContent = text || '';
}

function schedulePageSave() {
  clearTimeout(_pageSaveTimer);
  _pageSaveTimer = setTimeout(function () { flushPageSave(); }, 900);
}

async function flushPageSave() {
  clearTimeout(_pageSaveTimer);
  if (!_pageDirty) return;
  var page = getPageById(_activePageId);
  if (!page) return;
  _pageDirty = false;
  try {
    await Store.db.pages.update(page.id, buildPageDbPayload(page));
    page.updatedAt = new Date().toISOString();
    updatePageSaveState('Saved');
    setTimeout(function () { updatePageSaveState(''); }, 2000);
  } catch (e) {
    console.warn('page save failed:', e.message);
    updatePageSaveState('Save failed');
    _pageDirty = true;
  }
}

document.addEventListener('click', function (e) {
  var nav = e.target.closest('[data-nav]');
  if (nav && nav.dataset.nav !== 'pages') {
    if (_pageDirty) flushPageSave();
  }
});

window.addEventListener('beforeunload', function () {
  if (_pageDirty && _activePageId) {
    var page = getPageById(_activePageId);
    if (page) Store.db.pages.update(page.id, buildPageDbPayload(page)).catch(function () {});
  }
});

/* ══════════════════════════════════════════════════════════════════════
   PAGE PDF EXPORT
   ══════════════════════════════════════════════════════════════════════ */
async function exportPageAsPDF() {
  var page = getPageById(_activePageId);
  if (!page) { toast('No page to export'); return; }

  if (typeof ensurePdfLibs !== 'function') {
    toast('PDF library not available');
    return;
  }

  var exportBtn = document.querySelector('#pageExport');
  if (exportBtn) exportBtn.disabled = true;

  try {
    await ensurePdfLibs();

    var printEl = buildPagePrintEl(page);

    var holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;background:#fff;z-index:-1;';
    holder.appendChild(printEl);
    document.body.appendChild(holder);

    if (typeof waitForImages === 'function') await waitForImages(printEl);

    var canvas = await window.html2canvas(printEl, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      width: printEl.offsetWidth,
      height: printEl.offsetHeight,
      windowWidth: printEl.offsetWidth,
      windowHeight: printEl.offsetHeight,
    });

    var jsPDF = window.jspdf.jsPDF;
    var pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    var pdfPageW = 210;
    var pdfPageH = 297;

    var pxPerMm = canvas.width / pdfPageW;
    var totalHeightMm = canvas.height / pxPerMm;
    var pagesNeeded = Math.max(1, Math.ceil(totalHeightMm / pdfPageH));

    var pxPerPage = Math.floor(pdfPageH * pxPerMm);

    for (var i = 0; i < pagesNeeded; i++) {
      var sliceTop = i * pxPerPage;
      var sliceHeightPx = Math.min(pxPerPage, canvas.height - sliceTop);
      if (sliceHeightPx <= 0) break;

      var slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeightPx;
      var ctx = slice.getContext('2d');
      ctx.drawImage(
        canvas,
        0, sliceTop, canvas.width, sliceHeightPx,
        0, 0, slice.width, slice.height
      );

      var imgData = slice.toDataURL('image/jpeg', 0.95);
      var sliceHeightMm = sliceHeightPx / pxPerMm;

      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfPageW, sliceHeightMm);
    }

    var safe = (page.title || 'page').replace(/[^\w\-]+/g, '-').toLowerCase();
    var date = new Date().toISOString().slice(0, 10);
    pdf.save('docforbro-' + safe + '-' + date + '.pdf');

    holder.remove();
    toast('PDF exported');
  } catch (e) {
    console.error('page PDF export failed:', e);
    toast('PDF export failed: ' + (e.message || 'unknown error'));
  } finally {
    if (exportBtn) exportBtn.disabled = false;
  }
}

function buildPagePrintEl(page) {
  var el = document.createElement('div');
  el.style.cssText =
    'width:210mm;background:#fff;color:#1a1a1a;padding:20mm 22mm;' +
    'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'font-size:12pt;line-height:1.65;box-sizing:border-box;';

  var html = '<h1 style="font-size:26pt;font-weight:800;margin:0 0 18pt;color:#111;letter-spacing:-0.02em;line-height:1.15;">'
    + esc(page.title || 'Untitled page')
    + '</h1>';

  (page.blocks || []).forEach(function (b) {
    html += renderBlockForPrint(b);
  });

  el.innerHTML = html;
  return el;
}

function renderBlockForPrint(b) {
  var text = esc(b.text || '');
  var items, rows;

  switch (b.type) {
    case 'h1':
      return '<h1 style="font-size:22pt;font-weight:800;margin:18pt 0 8pt;color:#111;letter-spacing:-0.02em;line-height:1.2;">' + text + '</h1>';
    case 'h2':
      return '<h2 style="font-size:17pt;font-weight:800;margin:16pt 0 6pt;color:#111;letter-spacing:-0.015em;line-height:1.25;">' + text + '</h2>';
    case 'h3':
      return '<h3 style="font-size:14pt;font-weight:700;margin:12pt 0 5pt;color:#111;line-height:1.3;">' + text + '</h3>';
    case 'paragraph':
      return '<p style="margin:0 0 10pt;white-space:pre-wrap;color:#333;">' + text + '</p>';
    case 'quote':
      return '<blockquote style="border-left:3pt solid #ccc;padding:0 0 0 12pt;margin:10pt 0;font-style:italic;color:#555;">' + text + '</blockquote>';
    case 'code':
      return '<pre style="background:#f4f4f4;border-radius:4pt;padding:10pt 12pt;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10pt;margin:10pt 0;white-space:pre-wrap;color:#111;">' + text + '</pre>';
    case 'callout':
      return '<div style="background:#f5f4ef;border-radius:6pt;padding:10pt 14pt;margin:10pt 0;display:flex;gap:10pt;align-items:flex-start;">'
        + '<span style="font-size:14pt;line-height:1;flex-shrink:0;">' + esc(b.icon || '💡') + '</span>'
        + '<span style="flex:1;white-space:pre-wrap;color:#333;">' + text + '</span>'
        + '</div>';
    case 'divider':
      return '<hr style="border:none;border-top:1pt solid #e0e0e0;margin:16pt 0;">';
    case 'bullet':
      items = b.items || [];
      return '<ul style="margin:0 0 10pt;padding-left:22pt;color:#333;">'
        + items.map(function (i) { return '<li style="margin-bottom:2pt;">' + esc(i) + '</li>'; }).join('')
        + '</ul>';
    case 'numbered':
      items = b.items || [];
      return '<ol style="margin:0 0 10pt;padding-left:22pt;color:#333;">'
        + items.map(function (i) { return '<li style="margin-bottom:2pt;">' + esc(i) + '</li>'; }).join('')
        + '</ol>';
    case 'todo':
      return '<div style="display:flex;gap:8pt;align-items:flex-start;margin:0 0 4pt;color:#333;">'
        + '<span style="font-size:12pt;line-height:1.3;flex-shrink:0;">' + (b.checked ? '☑' : '☐') + '</span>'
        + '<span style="flex:1;white-space:pre-wrap;' + (b.checked ? 'text-decoration:line-through;color:#999;' : '') + '">' + text + '</span>'
        + '</div>';
    case 'image':
      if (!b.url) return '';
      return '<figure style="margin:12pt 0;text-align:center;page-break-inside:avoid;">'
        + '<img src="' + esc(b.url) + '" crossorigin="anonymous" style="max-width:100%;max-height:120mm;border-radius:6pt;display:inline-block;">'
        + (b.caption ? '<figcaption style="font-size:10pt;color:#888;margin-top:6pt;font-style:italic;">' + esc(b.caption) + '</figcaption>' : '')
        + '</figure>';
    case 'table':
      rows = b.rows || [];
      if (!rows.length) return '';
      return '<table style="width:100%;border-collapse:collapse;margin:12pt 0;font-size:10.5pt;page-break-inside:avoid;">'
        + rows.map(function (row, rIdx) {
            var isHeader = rIdx === 0;
            var tag = isHeader ? 'th' : 'td';
            var cellStyle = isHeader
              ? 'border:1pt solid #ddd;padding:7pt 9pt;text-align:left;background:#f5f5f5;font-weight:700;color:#111;'
              : 'border:1pt solid #ddd;padding:7pt 9pt;text-align:left;color:#333;';
            return '<tr>' + row.map(function (cell) {
              return '<' + tag + ' style="' + cellStyle + '">' + esc(cell) + '</' + tag + '>';
            }).join('') + '</tr>';
          }).join('')
        + '</table>';
    case 'link':
      if (!b.url) return '';
      return '<div style="border:1pt solid #e0e0e0;border-radius:6pt;padding:10pt 14pt;margin:10pt 0;background:#fafaf7;page-break-inside:avoid;">'
        + '<div style="font-weight:700;margin-bottom:2pt;color:#111;">' + esc(b.title || b.url) + '</div>'
        + (b.description ? '<div style="font-size:10.5pt;color:#555;margin-bottom:4pt;">' + esc(b.description) + '</div>' : '')
        + '<div style="font-size:9pt;color:#888;word-break:break-all;">' + esc(b.url) + '</div>'
        + '</div>';
    default:
      return '';
  }
}

/* ══════════════════════════════════════════════════════════════════════
   AUTH REACTIVITY
   ══════════════════════════════════════════════════════════════════════ */
if (typeof Store !== 'undefined' && Store.whenAuthReady) {
  Store.whenAuthReady().then(function () {
    if (Store.isSignedIn()) {
      Promise.all([loadPages(true), loadPageTemplates(true)]).then(updatePagesBadge);
    }
  });
  Store.onAuthChange(function (user) {
    if (user) {
      Promise.all([loadPages(true), loadPageTemplates(true)]).then(updatePagesBadge);
    } else {
      _pagesCache = [];
      _pagesLoaded = false;
      _pageTemplatesCache = [];
      _pageTemplatesLoaded = false;
      _activePageId = null;
      _pageDirty = false;
      _imageUrlCache = {};
      clearTimeout(_pageSaveTimer);
      updatePagesBadge();
    }
  });
}