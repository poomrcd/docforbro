/* ============================================================================
   11-contacts.js — Contacts (Drop 8 + Drop 11B)
   v3 — Fixes Info/Activity tab CSS by using built-in .tabs class.
        Adds cross-link count badges to contact list rows.
   ============================================================================ */

/* ══════════════════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════════════════ */
var _contactsCache = [];
var _contactsLoaded = false;
var _contactsSelected = new Set();
var _contactsSearch = '';
var _contactsTagFilter = 'all';
var _activeContactId = null;
var _pendingAvatarDataUrl = null;
var _contactDetailTab = 'info'; /* 'info' | 'activity' */

/* Signed URL cache for avatars */
var _signedUrlCache = {};

/* ══════════════════════════════════════════════════════════════════════
   MAPPERS
   ══════════════════════════════════════════════════════════════════════ */
function mapContactFromDb(row) {
  return {
    id:         row.id,
    name:       row.name || 'Untitled',
    company:    row.company || '',
    email:      row.email || '',
    phone:      row.phone || '',
    address:    row.address || '',
    website:    row.website || '',
    role:       row.role || '',
    notes:      row.notes || '',
    tags:       Array.isArray(row.tags) ? row.tags : [],
    avatarUrl:  null,
    avatarPath: row.avatar_path || null,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at || row.created_at
  };
}

function buildContactDbPayload(contact) {
  return {
    name:        (contact.name || '').trim() || 'Untitled',
    company:     contact.company || null,
    email:       contact.email || null,
    phone:       contact.phone || null,
    address:     contact.address || null,
    website:     contact.website || null,
    role:        contact.role || null,
    notes:       contact.notes || null,
    tags:        Array.isArray(contact.tags) ? contact.tags : [],
    avatar_path: contact.avatarPath || null
  };
}

/* ══════════════════════════════════════════════════════════════════════
   SIGNED URL CACHE
   ══════════════════════════════════════════════════════════════════════ */
async function getSignedUrlCached(path) {
  if (!path) return null;
  var cached = _signedUrlCache[path];
  if (cached && cached.expiresAt > Date.now() + 100 * 1000) return cached.url;
  try {
    var url = await Store.storage.getLogoSignedUrl(path, 3600);
    if (!url) return null;
    _signedUrlCache[path] = { url: url, expiresAt: Date.now() + 3600 * 1000 };
    return url;
  } catch (e) {
    console.warn('signed URL failed:', e.message);
    return null;
  }
}

function clearSignedUrlCache() {
  _signedUrlCache = {};
}

/* ══════════════════════════════════════════════════════════════════════
   LOAD
   ══════════════════════════════════════════════════════════════════════ */
async function loadContacts(force) {
  if (!Store.isSignedIn()) { _contactsCache = []; _contactsLoaded = true; return []; }
  if (_contactsLoaded && !force) return _contactsCache;

  try {
    var rows = await Store.db.contacts.list();
    var mapped = rows.map(mapContactFromDb);

    await Promise.all(mapped.map(async function (c) {
      if (c.avatarPath) c.avatarUrl = await getSignedUrlCached(c.avatarPath);
    }));

    _contactsCache = mapped;
  } catch (e) {
    console.warn('loadContacts failed:', e.message);
    _contactsCache = [];
  }
  _contactsLoaded = true;
  return _contactsCache;
}

function invalidateContactsCache() { _contactsLoaded = false; }
function getCachedContacts()       { return _contactsCache || []; }
function getContactById(id)        { return _contactsCache.find(function (c) { return c.id === id; }) || null; }

function updateContactsBadge() {
  var badge = document.querySelector('#navBadgeContacts');
  if (!badge) return;
  var n = _contactsCache.length;
  badge.textContent = n;
  badge.hidden = n === 0;
}

/* ══════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════ */
function contactInitials(name) {
  var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function contactColor(seed) {
  var colors = ['#4f46e5', '#0f766e', '#b45309', '#be123c', '#7c3aed', '#15803d', '#1d4ed8'];
  var h = 0;
  var s = String(seed || '');
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}

function allContactTags() {
  var set = {};
  _contactsCache.forEach(function (c) {
    (c.tags || []).forEach(function (t) {
      var tag = String(t || '').trim();
      if (tag) set[tag] = true;
    });
  });
  return Object.keys(set).sort();
}

function parseTagsInput(str) {
  return String(str || '')
    .split(',')
    .map(function (t) { return t.trim(); })
    .filter(function (t, i, arr) { return t && arr.indexOf(t) === i; });
}

function contactsCSVEscape(v) {
  var s = String(v == null ? '' : v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/* ══════════════════════════════════════════════════════════════════════
   FILTERING
   ══════════════════════════════════════════════════════════════════════ */
function getFilteredContacts() {
  var items = _contactsCache.slice();
  if (_contactsTagFilter !== 'all') {
    items = items.filter(function (c) { return (c.tags || []).indexOf(_contactsTagFilter) !== -1; });
  }
  if (_contactsSearch) {
    var q = _contactsSearch.toLowerCase();
    items = items.filter(function (c) {
      return (c.name || '').toLowerCase().indexOf(q) !== -1
          || (c.company || '').toLowerCase().indexOf(q) !== -1
          || (c.email || '').toLowerCase().indexOf(q) !== -1
          || (c.phone || '').toLowerCase().indexOf(q) !== -1
          || (c.role || '').toLowerCase().indexOf(q) !== -1
          || (c.notes || '').toLowerCase().indexOf(q) !== -1;
    });
  }
  items.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
  return items;
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER — LIST
   ══════════════════════════════════════════════════════════════════════ */
async function renderContactsView() {
  var host = document.querySelector('#view-contacts');
  if (!host) return;

  host.innerHTML = '<div class="tool-page">' + skeletonList(6, { avatar: true }) + '</div>';

  if (!_contactsLoaded || _contactsCache.length === 0) {
    await loadContacts(true);
  }
  updateContactsBadge();

  var filtered = getFilteredContacts();
  var tags = allContactTags();
  var visibleIds = new Set(filtered.map(function (c) { return c.id; }));
  _contactsSelected.forEach(function (id) { if (!visibleIds.has(id)) _contactsSelected.delete(id); });

  var allSelected = filtered.length > 0 && filtered.every(function (c) { return _contactsSelected.has(c.id); });
  var selCount = _contactsSelected.size;

  var tagsHTML = '<button class="chip ' + (_contactsTagFilter === 'all' ? 'active' : '') + '" data-tag="all">All <span class="cnt">' + _contactsCache.length + '</span></button>';
  tags.forEach(function (t) {
    var count = _contactsCache.filter(function (c) { return (c.tags || []).indexOf(t) !== -1; }).length;
    tagsHTML += '<button class="chip ' + (_contactsTagFilter === t ? 'active' : '') + '" data-tag="' + esc(t) + '">' + esc(t) + ' <span class="cnt">' + count + '</span></button>';
  });

  var rowsHTML = '';
  if (filtered.length === 0) {
    rowsHTML = '<div class="tool-empty" style="margin:16px">'
      + (_contactsCache.length === 0 ? 'No contacts yet. Add your first client or import a CSV.' : 'No contacts match this filter.')
      + '</div>';
  } else {
    rowsHTML = '<table class="data-table contacts-table">'
      + '<thead><tr>'
      + '<th class="center" style="width:36px"><input type="checkbox" id="contactsSelectAllCb" ' + (allSelected ? 'checked' : '') + '></th>'
      + '<th style="width:48px"></th>'
      + '<th style="min-width:160px">Name</th>'
      + '<th>Company</th>'
      + '<th>Email</th>'
      + '<th>Phone</th>'
      + '<th>Tags</th>'
      + '<th style="text-align:right;width:120px">Actions</th>'
      + '</tr></thead><tbody>';

    filtered.forEach(function (c) {
      var checked = _contactsSelected.has(c.id) ? ' checked' : '';
      var tagsCell = (c.tags || []).map(function (t) { return '<span class="contact-tag">' + esc(t) + '</span>'; }).join('');
      var avatarInner = c.avatarUrl ? '<img src="' + esc(c.avatarUrl) + '" alt="">' : esc(contactInitials(c.name));

      // Calculate cross-linked items for the badge
      var linksCount = 0;
      if (typeof getCachedDrafts === 'function') linksCount += getCachedDrafts().filter(function(d){ return d.contactId === c.id; }).length;
      if (typeof marginProjects !== 'undefined' && Array.isArray(marginProjects)) linksCount += marginProjects.filter(function(p){ return p.contactId === c.id; }).length;
      if (typeof getCachedNotes === 'function') linksCount += getCachedNotes().filter(function(n){ return n.contactId === c.id; }).length;
      if (typeof getCachedPages === 'function') linksCount += getCachedPages().filter(function(p){ return p.contactId === c.id; }).length;
      
      var linkBadge = linksCount > 0 
        ? '<span class="type-badge draft" style="margin-left:6px; background:var(--panel-hover); color:var(--muted); font-size:10px; padding:2px 6px;" title="Linked items">🔗 ' + linksCount + '</span>' 
        : '';

      rowsHTML += '<tr data-id="' + esc(c.id) + '">'
        + '<td class="center"><input type="checkbox" class="row-cb" data-id="' + esc(c.id) + '"' + checked + '></td>'
        + '<td><span class="contact-avatar" style="background:' + contactColor(c.id) + '">' + avatarInner + '</span></td>'
        + '<td>'
          + '<div style="display:flex; align-items:center;">'
            + '<span class="contact-name" data-open="' + esc(c.id) + '">' + esc(c.name) + '</span>'
            + linkBadge
          + '</div>'
          + (c.role ? '<div class="subtle">' + esc(c.role) + '</div>' : '')
        + '</td>'
        + '<td>' + esc(c.company || '—') + '</td>'
        + '<td>' + (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '—') + '</td>'
        + '<td>' + (c.phone ? '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '—') + '</td>'
        + '<td>' + (tagsCell || '<span class="subtle">—</span>') + '</td>'
        + '<td>'
          + '<div class="row-actions">'
            + '<button class="icon-btn" data-act="edit" title="Edit"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>'
            + '<button class="icon-btn" data-act="duplicate" title="Duplicate"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>'
            + '<button class="icon-btn danger" data-act="delete" title="Delete"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>'
          + '</div>'
        + '</td>'
        + '</tr>';
    });
    rowsHTML += '</tbody></table>';
  }

  host.innerHTML = `
    <div class="tool-page" id="contactsShell">
      <div class="tool-head" style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap">
        <div style="min-width:0;flex:1">
          <h1>Contacts</h1>
          <p>Your clients, prospects, and collaborators — all in one place.</p>
        </div>
        <div class="row" style="gap:8px;flex-shrink:0">
          <button class="icon-btn refresh-btn" id="contactsRefresh" title="Refresh"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg></button>
          <button class="btn sm" id="contactsImport">Import CSV</button>
          <button class="btn sm" id="contactsExport">Export</button>
          <button class="btn sm primary" id="contactsAdd">+ Add contact</button>
        </div>
      </div>

      <div class="contacts-toolbar">
        <input type="search" class="list-search" id="contactsSearch" placeholder="Search by name, company, email…" value="${esc(_contactsSearch)}" autocomplete="off">
        <div class="chip-row" id="contactsTags">${tagsHTML}</div>
      </div>

      <div id="contactsSelectionHost">
        ${filtered.length > 0 ? `
          <div class="selection-bar">
            <div class="count"><strong>${selCount}</strong> selected</div>
            <button class="btn sm" id="contactsSelectAll">${allSelected ? 'Deselect all' : 'Select all'}</button>
            <button class="btn sm" id="contactsClear" ${selCount === 0 ? 'disabled' : ''}>Clear</button>
            <button class="btn sm danger" id="contactsDeleteSel" ${selCount === 0 ? 'disabled' : ''}>Delete selected</button>
          </div>
        ` : ''}
      </div>

      <div class="card" id="contactsTableCard" style="padding:0;overflow:hidden">${rowsHTML}</div>
    </div>
  `;

  wireContactsList(filtered, allSelected);
}

function wireContactsList(filtered, allSelected) {
  var refreshBtn = document.querySelector('#contactsRefresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async function () {
      refreshBtn.classList.add('spinning');
      invalidateContactsCache();
      await loadContacts(true);
      updateContactsBadge();
      renderContactsView();
      setTimeout(function () { refreshBtn.classList.remove('spinning'); }, 300);
      toast('Refreshed');
    });
  }

  var addBtn = document.querySelector('#contactsAdd');
  if (addBtn) addBtn.addEventListener('click', function () { openContactDetail(null); });

  var impBtn = document.querySelector('#contactsImport');
  if (impBtn) impBtn.addEventListener('click', importContactsCSV);

  var expBtn = document.querySelector('#contactsExport');
  if (expBtn) expBtn.addEventListener('click', function () {
    var menu = document.createElement('div');
    menu.className = 'card-menu';
    menu.id = 'contactsExportMenu';
    menu.innerHTML =
      '<button data-exp="csv-all">Export all as CSV</button>'
      + '<button data-exp="csv-sel" ' + (_contactsSelected.size === 0 ? 'disabled' : '') + '>Export selected as CSV</button>'
      + '<button data-exp="json-all">Export all as JSON</button>';
    document.body.appendChild(menu);
    var rect = expBtn.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = (rect.right - menu.offsetWidth) + 'px';
    setTimeout(function () {
      document.addEventListener('click', function closeMenu(ev) {
        if (!ev.target.closest('#contactsExportMenu')) { menu.remove(); document.removeEventListener('click', closeMenu); }
      });
    }, 0);
    menu.querySelectorAll('button[data-exp]').forEach(function (b) {
      b.addEventListener('click', function () {
        var mode = b.dataset.exp; menu.remove();
        if (mode === 'csv-all')  exportContactsCSV(null);
        if (mode === 'csv-sel')  exportContactsCSV(Array.from(_contactsSelected));
        if (mode === 'json-all') exportContactsJSON(null);
      });
    });
  });

  var searchEl = document.querySelector('#contactsSearch');
  if (searchEl) {
    searchEl.addEventListener('input', function (e) {
      _contactsSearch = e.target.value;
      var cursor = e.target.selectionStart;
      renderContactsView().then(function () {
        var inp = document.querySelector('#contactsSearch');
        if (inp) { inp.focus(); try { inp.setSelectionRange(cursor, cursor); } catch (err) {} }
      });
    });
  }

  var tagsHost = document.querySelector('#contactsTags');
  if (tagsHost) {
    tagsHost.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-tag]');
      if (!chip) return;
      _contactsTagFilter = chip.dataset.tag;
      _contactsSelected.clear();
      renderContactsView();
    });
  }

  var selAllBtn = document.querySelector('#contactsSelectAll');
  if (selAllBtn) {
    selAllBtn.addEventListener('click', function () {
      if (allSelected) _contactsSelected.clear();
      else filtered.forEach(function (c) { _contactsSelected.add(c.id); });
      renderContactsView();
    });
  }
  var clearBtn = document.querySelector('#contactsClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () { _contactsSelected.clear(); renderContactsView(); });
  }
  var delSelBtn = document.querySelector('#contactsDeleteSel');
  if (delSelBtn) {
    delSelBtn.addEventListener('click', async function () {
      var ids = Array.from(_contactsSelected);
      if (!ids.length) return;
      var ok = await confirmDialog({
        title: 'Delete ' + ids.length + ' contact' + (ids.length === 1 ? '' : 's') + '?',
        message: 'They will be moved to Trash. You can restore them later.',
        confirmLabel: 'Delete', danger: true
      });
      if (!ok) return;
      await bulkDeleteContacts(ids);
      _contactsSelected.clear();
      await loadContacts(true);
      updateContactsBadge();
      renderContactsView();
    });
  }

  var card = document.querySelector('#contactsTableCard');
  if (card) {
    var allCb = card.querySelector('#contactsSelectAllCb');
    if (allCb) {
      allCb.addEventListener('change', function (e) {
        if (e.target.checked) filtered.forEach(function (c) { _contactsSelected.add(c.id); });
        else _contactsSelected.clear();
        card.querySelectorAll('.row-cb').forEach(function (cb) { cb.checked = _contactsSelected.has(cb.dataset.id); });
        updateContactsSelectionUI(filtered);
      });
    }
    card.querySelectorAll('.row-cb').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (cb.checked) _contactsSelected.add(cb.dataset.id);
        else _contactsSelected.delete(cb.dataset.id);
        updateContactsSelectionUI(filtered);
      });
    });
    card.querySelectorAll('[data-open]').forEach(function (el) {
      el.addEventListener('click', function () { openContactDetail(el.dataset.open); });
    });
    card.querySelectorAll('tr[data-id]').forEach(function (row) {
      var id = row.dataset.id;
      row.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.addEventListener('click', async function (e) {
          e.stopPropagation();
          var act = btn.dataset.act;
          if (act === 'edit')      openContactDetail(id);
          if (act === 'duplicate') await duplicateContact(id);
          if (act === 'delete')    await deleteContactWithUndo(id);
        });
      });
    });
  }
}

function updateContactsSelectionUI(filtered) {
  var selCount = _contactsSelected.size;
  var allSelected = filtered.length > 0 && filtered.every(function (c) { return _contactsSelected.has(c.id); });

  var countEl = document.querySelector('#contactsSelectionHost .count strong');
  if (countEl) countEl.textContent = selCount;
  var clearBtn = document.querySelector('#contactsClear');
  if (clearBtn) clearBtn.disabled = selCount === 0;
  var delBtn = document.querySelector('#contactsDeleteSel');
  if (delBtn) delBtn.disabled = selCount === 0;
  var selBtn = document.querySelector('#contactsSelectAll');
  if (selBtn) selBtn.textContent = allSelected ? 'Deselect all' : 'Select all';
  var allCb = document.querySelector('#contactsSelectAllCb');
  if (allCb) {
    allCb.checked = allSelected;
    allCb.indeterminate = !allSelected && selCount > 0;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   DETAIL PANEL (slide-in)
   ══════════════════════════════════════════════════════════════════════ */
function openContactDetail(id, tab) {
  _activeContactId = id;
  _pendingAvatarDataUrl = null;
  _contactDetailTab = tab || 'info';
  var existing = id ? getContactById(id) : null;

  var panel = document.querySelector('#contactDetailPanel');
  if (!panel) {
    panel = document.createElement('aside');
    panel.className = 'contact-detail-panel';
    panel.id = 'contactDetailPanel';
    document.body.appendChild(panel);
  }

  panel.hidden = false;
  renderContactPanelContent(existing, panel);
}

function renderContactPanelContent(contact, panel) {
  var isNew = !contact;
  var c = contact || {
    name: '', company: '', email: '', phone: '', address: '', website: '', role: '', notes: '', tags: [], avatarUrl: null, avatarPath: null
  };
  
  var initials = contactInitials(c.name || '?');
  var bg = contactColor(c.id || 'new');

  panel.innerHTML = `
    <div class="contact-detail-head">
      <h2>${isNew ? 'New contact' : esc(c.name)}</h2>
      <button class="icon-btn" id="contactClose" title="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    ${!isNew ? `
      <div class="tabs" style="padding: 0 20px; margin-bottom: 16px;">
        <button class="tab ${_contactDetailTab === 'info' ? 'active' : ''}" data-tab="info">Info</button>
        <button class="tab ${_contactDetailTab === 'activity' ? 'active' : ''}" data-tab="activity">Activity</button>
      </div>
    ` : ''}

    <div class="contact-detail-body" id="contactBodyScroll">
      ${(!isNew && _contactDetailTab === 'activity') ? renderContactActivity(c) : renderContactInfoTab(c, isNew, initials, bg)}
    </div>

    ${(!isNew && _contactDetailTab === 'activity') ? '' : `
      <div class="contact-detail-foot">
        ${isNew ? '' : '<button class="btn danger sm" id="contactDelete">Delete</button>'}
        <span class="grow"></span>
        <button class="btn ghost sm" id="contactCancel">Cancel</button>
        <button class="btn primary sm" id="contactSave">${isNew ? 'Create' : 'Save'}</button>
      </div>
    `}
  `;

  // Wire basic actions
  panel.querySelector('#contactClose')?.addEventListener('click', closeContactDetail);
  panel.querySelector('#contactCancel')?.addEventListener('click', closeContactDetail);
  
  if (!isNew) {
    panel.querySelector('#contactDelete')?.addEventListener('click', async function () {
      await deleteContactWithUndo(c.id);
      closeContactDetail();
    });
    
    // Wire tabs
    panel.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _contactDetailTab = btn.dataset.tab;
        renderContactPanelContent(c, panel);
      });
    });
    
    // Wire activity links
    if (_contactDetailTab === 'activity') {
      wireContactActivity(panel, c);
    }
  }

  if (_contactDetailTab === 'info') {
    wireContactInfoForm(panel, c, isNew);
  }
}

function renderContactInfoTab(c, isNew, initials, bg) {
  return `
    <div class="contact-avatar-row">
      <div class="contact-avatar-lg" id="contactAvatarThumb" style="background:${bg}">
        ${c.avatarUrl ? `<img src="${esc(c.avatarUrl)}" alt="">` : esc(initials)}
      </div>
      <div class="col" style="gap:6px">
        <input type="file" id="contactAvatarFile" accept="image/png,image/jpeg,image/webp" hidden>
        <button class="btn sm" id="contactPickAvatar">Upload photo</button>
        <button class="btn ghost sm" id="contactRemoveAvatar">Remove</button>
      </div>
    </div>

    <div class="frow"><label>Name *</label><input type="text" id="contactName" value="${esc(c.name)}" placeholder="Jane Smith"></div>
    <div class="frow"><label>Company</label><input type="text" id="contactCompany" value="${esc(c.company)}" placeholder="Acme Inc."></div>
    <div class="frow"><label>Role</label><input type="text" id="contactRole" value="${esc(c.role)}" placeholder="Marketing Director"></div>
    <div class="frow"><label>Email</label><input type="email" id="contactEmail" value="${esc(c.email)}" placeholder="jane@acme.com"></div>
    <div class="frow"><label>Phone</label><input type="tel" id="contactPhone" value="${esc(c.phone)}" placeholder="+1 555 000 0000"></div>
    <div class="frow"><label>Website</label><input type="url" id="contactWebsite" value="${esc(c.website)}" placeholder="acme.com"></div>
    <div class="frow"><label>Address</label><textarea id="contactAddress" rows="2" placeholder="123 Main St, City">${esc(c.address)}</textarea></div>
    <div class="frow"><label>Tags</label><input type="text" id="contactTags" value="${esc((c.tags || []).join(', '))}" placeholder="client, VIP, prospect"></div>
    <div class="frow"><label>Notes</label><textarea id="contactNotes" rows="4" placeholder="Anything worth remembering…">${esc(c.notes)}</textarea></div>
  `;
}

function renderContactActivity(c) {
  var linkedDocs = typeof getCachedDrafts === 'function' ? getCachedDrafts().filter(d => d.contactId === c.id) : [];
  var linkedProjects = typeof marginProjects !== 'undefined' ? marginProjects.filter(p => p.contactId === c.id) : [];
  var linkedNotes = typeof getCachedNotes === 'function' ? getCachedNotes().filter(n => n.contactId === c.id) : [];
  var linkedPages = typeof getCachedPages === 'function' ? getCachedPages().filter(p => p.contactId === c.id) : [];

  var total = linkedDocs.length + linkedProjects.length + linkedNotes.length + linkedPages.length;

  if (total === 0) {
    return '<div class="tool-empty" style="margin-top:20px">No activity linked to this contact yet.</div>';
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

  if (linkedProjects.length) {
    html += '<div class="activity-section"><div class="activity-header">Projects</div>';
    linkedProjects.forEach(p => {
      html += `<div class="activity-row" data-type="project" data-id="${p.id}">
        <span class="activity-title">${esc(p.name)}</span>
        <span class="type-badge project">Project</span>
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
    linkedPages.forEach(p => {
      html += `<div class="activity-row" data-type="page" data-id="${p.id}">
        <span class="activity-title">${esc(p.title)}</span>
        <span class="type-badge page">Page</span>
      </div>`;
    });
    html += '</div>';
  }

  return html;
}

function wireContactActivity(panel, contact) {
  panel.querySelectorAll('.activity-row').forEach(row => {
    row.addEventListener('click', () => {
      var type = row.dataset.type;
      var id = row.dataset.id;

      // Set breadcrumb to return to this contact
      if (typeof setBreadcrumb === 'function') {
        setBreadcrumb(contact.name, 'contacts', () => openContactDetail(contact.id, 'activity'));
      }

      if (type === 'draft') {
        if (typeof openDriveItem === 'function') openDriveItem('draft', id);
      } else if (type === 'project') {
        if (typeof editMarginProject === 'function') editMarginProject(id);
        showView('margin');
      } else if (type === 'note') {
        if (typeof openNoteById === 'function') openNoteById(id);
      } else if (type === 'page') {
        if (typeof openPageById === 'function') openPageById(id);
      }
      
      closeContactDetail();
    });
  });
}

function wireContactInfoForm(panel, c, isNew) {
  var pickBtn = panel.querySelector('#contactPickAvatar');
  var fileInput = panel.querySelector('#contactAvatarFile');
  var removeBtn = panel.querySelector('#contactRemoveAvatar');
  
  if (pickBtn && fileInput) {
    pickBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) { toast('Avatar must be under 2 MB'); return; }
      var reader = new FileReader();
      reader.onload = function (ev) {
        _pendingAvatarDataUrl = ev.target.result;
        var thumb = panel.querySelector('#contactAvatarThumb');
        if (thumb) thumb.innerHTML = '<img src="' + ev.target.result + '" alt="">';
      };
      reader.readAsDataURL(f);
      e.target.value = '';
    });
  }
  if (removeBtn) {
    removeBtn.addEventListener('click', function () {
      _pendingAvatarDataUrl = '__REMOVE__';
      var thumb = panel.querySelector('#contactAvatarThumb');
      if (thumb) {
        thumb.innerHTML = contactInitials(panel.querySelector('#contactName').value);
        thumb.style.background = contactColor(c.id || 'new');
      }
    });
  }

  var saveBtn = panel.querySelector('#contactSave');
  if (saveBtn) saveBtn.addEventListener('click', () => saveContactFromDetail(panel));
}

function closeContactDetail() {
  var panel = document.querySelector('#contactDetailPanel');
  if (!panel) return;
  panel.hidden = true;
  panel.innerHTML = '';
  _activeContactId = null;
  _pendingAvatarDataUrl = null;
}

async function saveContactFromDetail(panel) {
  var name = panel.querySelector('#contactName').value.trim();
  if (!name) { panel.querySelector('#contactName').focus(); toast('Name is required'); return; }

  var data = {
    name:    name,
    company: panel.querySelector('#contactCompany').value.trim(),
    role:    panel.querySelector('#contactRole').value.trim(),
    email:   panel.querySelector('#contactEmail').value.trim(),
    phone:   panel.querySelector('#contactPhone').value.trim(),
    website: panel.querySelector('#contactWebsite').value.trim(),
    address: panel.querySelector('#contactAddress').value.trim(),
    notes:   panel.querySelector('#contactNotes').value.trim(),
    tags:    parseTagsInput(panel.querySelector('#contactTags').value)
  };

  var saveBtn = panel.querySelector('#contactSave');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    if (_activeContactId) {
      var payload = buildContactDbPayload(data);

      if (_pendingAvatarDataUrl === '__REMOVE__') {
        var old = getContactById(_activeContactId);
        if (old && old.avatarPath) {
          try { await Store.storage.deleteLogo(old.avatarPath); } catch (e) {}
          delete _signedUrlCache[old.avatarPath];
        }
        payload.avatar_path = null;
      } else if (_pendingAvatarDataUrl && _pendingAvatarDataUrl !== '__REMOVE__') {
        try {
          var blob = await (await fetch(_pendingAvatarDataUrl)).blob();
          var ext = (blob.type.split('/')[1] || 'png').toLowerCase();
          var up = await Store.storage.uploadLogo(new File([blob], 'avatar.' + ext, { type: blob.type }), ext);
          payload.avatar_path = up.path;
        } catch (upErr) {
          console.warn('avatar upload failed:', upErr.message);
          toast('Avatar upload failed: ' + upErr.message);
        }
      }

      await Store.db.contacts.update(_activeContactId, payload);
      toast('Contact updated');
    } else {
      var payload2 = buildContactDbPayload(data);
      var created = await Store.db.contacts.create(payload2);

      if (_pendingAvatarDataUrl && _pendingAvatarDataUrl !== '__REMOVE__') {
        try {
          var blob2 = await (await fetch(_pendingAvatarDataUrl)).blob();
          var ext2 = (blob2.type.split('/')[1] || 'png').toLowerCase();
          var up2 = await Store.storage.uploadLogo(new File([blob2], 'avatar.' + ext2, { type: blob2.type }), ext2);
          await Store.db.contacts.update(created.id, { avatar_path: up2.path });
        } catch (upErr) {
          console.warn('avatar upload failed:', upErr.message);
        }
      }
      toast('Contact created');
    }

    invalidateContactsCache();
    await loadContacts(true);
    updateContactsBadge();
    closeContactDetail();
    renderContactsView();
  } catch (e) {
    console.warn('saveContactFromDetail failed:', e.message);
    toast('Could not save: ' + e.message);
    saveBtn.disabled = false;
    saveBtn.textContent = _activeContactId ? 'Save' : 'Create';
  }
}

/* ══════════════════════════════════════════════════════════════════════
   DELETE / DUPLICATE
   ══════════════════════════════════════════════════════════════════════ */
async function deleteContactWithUndo(id) {
  var c = getContactById(id);
  if (!c) return;

  var ok = await confirmDialog({
    title: 'Delete "' + c.name + '"?',
    message: 'This cannot be undone.',
    confirmLabel: 'Delete', danger: true
  });
  if (!ok) return;

  try {
    await Store.db.trash.create({
      kind: 'contact',
      name: c.name,
      record: clone(c)
    });

    await Store.db.contacts.remove(id);
    invalidateContactsCache();
    await loadContacts(true);
    updateContactsBadge();
    renderContactsView();
    toast('"' + c.name + '" deleted');
  } catch (e) {
    console.warn('delete failed:', e.message);
    toast('Could not delete: ' + e.message);
  }
}

async function bulkDeleteContacts(ids) {
  if (!ids.length) return;
  for (var i = 0; i < ids.length; i++) {
    var c = getContactById(ids[i]);
    if (!c) continue;
    try { await Store.db.trash.create({ kind: 'contact', name: c.name, record: clone(c) }); } catch (e) {}
    try { await Store.db.contacts.remove(ids[i]); } catch (e) { console.warn('bulk delete failed:', e.message); }
  }
  toast(ids.length + ' contact' + (ids.length === 1 ? '' : 's') + ' deleted');
}

async function duplicateContact(id) {
  var c = getContactById(id);
  if (!c) return;
  var names = _contactsCache.map(function (x) { return x.name; });
  var base = c.name || 'Contact';
  var newName = base;
  var i = 2;
  while (names.indexOf(newName) !== -1) { newName = base + ' (' + i + ')'; i++; }

  try {
    await Store.db.contacts.create(buildContactDbPayload({
      name: newName, company: c.company, email: c.email, phone: c.phone,
      address: c.address, website: c.website, role: c.role, notes: c.notes,
      tags: c.tags, avatarPath: null
    }));
    invalidateContactsCache();
    await loadContacts(true);
    updateContactsBadge();
    renderContactsView();
    toast('Duplicated');
  } catch (e) {
    toast('Could not duplicate: ' + e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   CSV IMPORT
   ══════════════════════════════════════════════════════════════════════ */
function parseCSV(text) {
  var rows = [], row = [], field = '', inQuotes = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch !== '\r') field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (v) { return String(v).trim(); }); });
}

function mapCSVHeader(h) {
  var k = String(h || '').trim().toLowerCase();
  if (k === 'name' || k === 'full name' || k === 'fullname' || k === 'display name') return 'name';
  if (k === 'first name' || k === 'firstname') return 'first';
  if (k === 'last name' || k === 'lastname') return 'last';
  if (k === 'company' || k === 'organization' || k === 'organisation') return 'company';
  if (k === 'email' || k === 'email address' || k === 'e-mail' || k === 'email 1' || k === 'primary email') return 'email';
  if (k === 'phone' || k === 'phone number' || k === 'mobile' || k === 'telephone' || k === 'phone 1' || k === 'primary phone') return 'phone';
  if (k === 'address' || k === 'street' || k === 'full address') return 'address';
  if (k === 'website' || k === 'url' || k === 'homepage') return 'website';
  if (k === 'role' || k === 'title' || k === 'position' || k === 'job title') return 'role';
  if (k === 'notes' || k === 'note' || k === 'comment' || k === 'comments') return 'notes';
  if (k === 'tags' || k === 'labels' || k === 'groups') return 'tags';
  return null;
}

function importContactsCSV() {
  var input = document.createElement('input');
  input.type = 'file'; input.accept = '.csv,text/csv';
  input.addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function (ev) {
      try {
        var rows = parseCSV(ev.target.result);
        if (rows.length < 2) { alert('CSV is empty or has no data rows'); return; }
        var headers = rows[0].map(mapCSVHeader);
        var contactsToImport = [];

        for (var r = 1; r < rows.length; r++) {
          var obj = { name: '', company: '', email: '', phone: '', address: '', website: '', role: '', notes: '', tags: [] };
          var first = '', last = '';
          for (var cIdx = 0; cIdx < rows[r].length; cIdx++) {
            var val = String(rows[r][cIdx] || '').trim();
            if (!val) continue;
            var key = headers[cIdx];
            if (!key) continue;
            if (key === 'first') first = val;
            else if (key === 'last') last = val;
            else if (key === 'tags') obj.tags = parseTagsInput(val);
            else obj[key] = val;
          }
          if (!obj.name && (first || last)) obj.name = (first + ' ' + last).trim();
          if (obj.name) contactsToImport.push(obj);
        }

        if (!contactsToImport.length) { alert('No valid contacts found in CSV'); return; }

        var ok = await confirmDialog({
          title: 'Import ' + contactsToImport.length + ' contact' + (contactsToImport.length === 1 ? '' : 's') + '?',
          message: 'They will be added to your contacts list. Existing contacts are not affected.',
          confirmLabel: 'Import'
        });
        if (!ok) return;

        var added = 0;
        for (var k = 0; k < contactsToImport.length; k++) {
          try { await Store.db.contacts.create(buildContactDbPayload(contactsToImport[k])); added++; }
          catch (err) { console.warn('row import failed:', err.message); }
        }
        invalidateContactsCache();
        await loadContacts(true);
        updateContactsBadge();
        renderContactsView();
        toast('Imported ' + added + ' contact' + (added === 1 ? '' : 's'));
      } catch (err) { console.error(err); alert('Import failed: ' + (err.message || err)); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
  input.click();
}

/* ══════════════════════════════════════════════════════════════════════
   CSV / JSON EXPORT
   ══════════════════════════════════════════════════════════════════════ */
function exportContactsCSV(ids) {
  var items = ids ? _contactsCache.filter(function (c) { return ids.indexOf(c.id) !== -1; }) : _contactsCache;
  if (!items.length) { toast('No contacts to export'); return; }

  var headers = ['Name', 'Company', 'Role', 'Email', 'Phone', 'Website', 'Address', 'Tags', 'Notes'];
  var rows = items.map(function (c) {
    return [c.name || '', c.company || '', c.role || '', c.email || '', c.phone || '', c.website || '', c.address || '', (c.tags || []).join('; '), c.notes || ''];
  });

  var csv = '\uFEFF' + [
    headers.map(contactsCSVEscape).join(','),
    ...rows.map(function (r) { return r.map(contactsCSVEscape).join(','); })
  ].join('\r\n');

  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'docforbro-contacts-' + new Date().toISOString().slice(0, 10) + (ids ? '-selection' : '') + '.csv';
  a.click(); URL.revokeObjectURL(url);
  toast('Exported ' + items.length + ' contact' + (items.length === 1 ? '' : 's'));
}

function exportContactsJSON(ids) {
  var items = ids ? _contactsCache.filter(function (c) { return ids.indexOf(c.id) !== -1; }) : _contactsCache;
  if (!items.length) { toast('No contacts to export'); return; }

  var payload = { format: 'docforbro-contacts', version: '1.0.0', exportedAt: new Date().toISOString(), count: items.length, contacts: items };
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'docforbro-contacts-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click(); URL.revokeObjectURL(url);
  toast('Exported ' + items.length + ' contact' + (items.length === 1 ? '' : 's'));
}

/* ══════════════════════════════════════════════════════════════════════
   AUTH REACTIVITY
   ══════════════════════════════════════════════════════════════════════ */
if (typeof Store !== 'undefined' && Store.whenAuthReady) {
  Store.whenAuthReady().then(function () {
    if (Store.isSignedIn()) loadContacts(true).then(updateContactsBadge);
  });
  Store.onAuthChange(function (user) {
    if (user) {
      loadContacts(true).then(updateContactsBadge);
    } else {
      _contactsCache = [];
      _contactsLoaded = false;
      _contactsSelected.clear();
      clearSignedUrlCache();
      updateContactsBadge();
    }
  });
}