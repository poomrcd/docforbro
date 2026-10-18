/* ============================================================================
   12-notepad.js — Notepad (Drop 9 v2 + Drop 11A)
   Plain-text notes. No markdown, no preview, no toolbar.
   Breadcrumb support for cross-links. openNoteById() for search.
   ============================================================================ */

/* ══════════════════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════════════════ */
var _notesCache = [];
var _notesLoaded = false;
var _activeNoteId = null;
var _notesSearch = '';
var _notesMobileEditing = false;
var _notesSaveTimer = null;
var _notesDirty = false;

/* ══════════════════════════════════════════════════════════════════════
   MAPPERS
   ══════════════════════════════════════════════════════════════════════ */
function mapNoteFromDb(row) {
  return {
    id:         row.id,
    title:      row.title || 'Untitled note',
    content:    row.content || '',
    pinned:     !!row.pinned,
    contactId:  row.contact_id || null,
    projectId:  row.project_id || null,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at || row.created_at
  };
}

function buildNoteDbPayload(note) {
  return {
    title:      (note.title || '').trim() || 'Untitled note',
    content:    note.content || '',
    pinned:     !!note.pinned,
    contact_id: note.contactId || null,
    project_id: note.projectId || null
  };
}

/* ══════════════════════════════════════════════════════════════════════
   LOAD
   ══════════════════════════════════════════════════════════════════════ */
async function loadNotes(force) {
  if (!Store.isSignedIn()) { _notesCache = []; _notesLoaded = true; return []; }
  if (_notesLoaded && !force) return _notesCache;

  try {
    var rows = await Store.db.notes.list();
    _notesCache = rows.map(mapNoteFromDb);
  } catch (e) {
    console.warn('loadNotes failed:', e.message);
    _notesCache = [];
  }
  _notesLoaded = true;
  return _notesCache;
}

function invalidateNotesCache() { _notesLoaded = false; }
function getCachedNotes()       { return _notesCache || []; }
function getNoteById(id)        { return _notesCache.find(function (n) { return n.id === id; }) || null; }

function updateNotesBadge() {
  var badge = document.querySelector('#navBadgeNotes');
  if (!badge) return;
  var n = _notesCache.length;
  badge.textContent = n;
  badge.hidden = n === 0;
}

/* ══════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════ */
function notePreview(text) {
  var raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (raw.length > 90) raw = raw.slice(0, 90) + '…';
  return raw || 'Empty note';
}

function formatNoteDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d)) return '';
  var now = new Date();
  var sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  var diffDays = Math.floor((now - d) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getFilteredNotes() {
  var items = _notesCache.slice();
  if (_notesSearch) {
    var q = _notesSearch.toLowerCase();
    items = items.filter(function (n) {
      return (n.title || '').toLowerCase().indexOf(q) !== -1
          || (n.content || '').toLowerCase().indexOf(q) !== -1;
    });
  }
  items.sort(function (a, b) {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
  return items;
}

async function getLinkOptions() {
  var contacts = [], projects = [];
  try {
    if (typeof loadContacts === 'function') {
      await loadContacts();
      contacts = (typeof getCachedContacts === 'function' ? getCachedContacts() : [])
        .slice()
        .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
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

/* ══════════════════════════════════════════════════════════════════════
   RENDER — main view
   ══════════════════════════════════════════════════════════════════════ */
async function renderNotepadView() {
  var host = document.querySelector('#view-notepad');
  if (!host) return;

  host.innerHTML = '<div class="tool-page">' + skeletonList(6) + '</div>';

  if (!_notesLoaded || _notesCache.length === 0) {
    await loadNotes(true);
  }
  updateNotesBadge();

  host.innerHTML = buildNotepadShellHTML();
  wireNotepadShell();

  renderNotesList();

  /* If a note is active (from search or cross-link), show it */
  if (_activeNoteId && getNoteById(_activeNoteId)) {
    renderNoteEditor();
  } else {
    renderNotesEmptyEditor();
  }
}

function buildNotepadShellHTML() {
  return ''
    + '<div class="notepad-wrap">'

      + '<aside class="notepad-list-pane' + (_notesMobileEditing ? ' hidden-mobile' : '') + '">'
        + '<header class="notepad-list-head">'
          + '<h1>Notes</h1>'
          + '<div class="notepad-list-actions">'
            + '<button class="icon-btn refresh-btn" id="notesRefresh" title="Refresh"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg></button>'
            + '<button class="btn sm primary" id="notesAdd">+ New</button>'
          + '</div>'
        + '</header>'
        + '<div class="notepad-list-search">'
          + '<input type="search" id="notesSearch" placeholder="Search notes…" value="' + esc(_notesSearch) + '" autocomplete="off">'
        + '</div>'
        + '<div class="notepad-list-scroll" id="notesListScroll"></div>'
      + '</aside>'

      + '<section class="notepad-editor-pane' + (!_notesMobileEditing ? ' hidden-mobile' : '') + '">'
        + '<div id="noteEditorHost"></div>'
      + '</section>'

    + '</div>';
}

function wireNotepadShell() {
  var refreshBtn = document.querySelector('#notesRefresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async function () {
      refreshBtn.classList.add('spinning');
      invalidateNotesCache();
      await loadNotes(true);
      updateNotesBadge();
      renderNotesList();
      setTimeout(function () { refreshBtn.classList.remove('spinning'); }, 300);
      toast('Refreshed');
    });
  }

  var addBtn = document.querySelector('#notesAdd');
  if (addBtn) {
    addBtn.addEventListener('click', async function () {
      try {
        var created = await Store.db.notes.create({
          title: 'Untitled note',
          content: ''
        });
        invalidateNotesCache();
        await loadNotes(true);
        updateNotesBadge();
        _activeNoteId = created.id;
        _notesMobileEditing = true;
        renderNotesList();
        renderNoteEditor();
        setTimeout(function () {
          var titleInput = document.querySelector('#noteTitleInput');
          if (titleInput) { titleInput.focus(); titleInput.select(); }
        }, 50);
      } catch (e) {
        console.warn('create note failed:', e.message);
        toast('Could not create note: ' + e.message);
      }
    });
  }

  var searchEl = document.querySelector('#notesSearch');
  if (searchEl) {
    searchEl.addEventListener('input', function (e) {
      _notesSearch = e.target.value;
      var cursor = e.target.selectionStart;
      renderNotesList();
      var el = document.querySelector('#notesSearch');
      if (el) {
        el.focus();
        try { el.setSelectionRange(cursor, cursor); } catch (err) {}
      }
    });
  }
}

function renderNotesList() {
  var scroll = document.querySelector('#notesListScroll');
  if (!scroll) return;

  var filtered = getFilteredNotes();

  if (!filtered.length) {
    scroll.innerHTML = '<div class="notepad-list-empty">'
      + (_notesCache.length === 0
          ? 'No notes yet.<br>Click <strong>+ New</strong> to start.'
          : 'No notes match your search.')
      + '</div>';
    return;
  }

  var pinned = filtered.filter(function (n) { return n.pinned; });
  var rest   = filtered.filter(function (n) { return !n.pinned; });

  var html = '';
  if (pinned.length) {
    html += '<div class="notepad-list-label">Pinned</div>';
    pinned.forEach(function (n) { html += noteCardHTML(n); });
  }
  if (rest.length) {
    if (pinned.length) html += '<div class="notepad-list-label">Notes</div>';
    rest.forEach(function (n) { html += noteCardHTML(n); });
  }
  scroll.innerHTML = html;

  scroll.querySelectorAll('.note-card').forEach(function (card) {
    card.addEventListener('click', function () {
      _activeNoteId = card.dataset.id;
      _notesMobileEditing = true;
      renderNotesList();
      renderNoteEditor();
    });
  });
}

function noteCardHTML(n) {
  var active = n.id === _activeNoteId ? ' active' : '';
  var preview = notePreview(n.content);
  return ''
    + '<div class="note-card' + active + '" data-id="' + esc(n.id) + '">'
      + '<div class="note-card-row1">'
        + (n.pinned ? '<span class="note-pin" title="Pinned">📌</span>' : '')
        + '<span class="note-card-title">' + esc(n.title) + '</span>'
        + '<span class="note-card-date">' + esc(formatNoteDate(n.updatedAt)) + '</span>'
      + '</div>'
      + '<div class="note-card-preview">' + esc(preview) + '</div>'
      + (n.contactId || n.projectId ? '<div class="note-card-links">🔗 Linked</div>' : '')
    + '</div>';
}

/* ══════════════════════════════════════════════════════════════════════
   EDITOR
   ══════════════════════════════════════════════════════════════════════ */
async function renderNoteEditor() {
  var host = document.querySelector('#noteEditorHost');
  if (!host) return;

  var note = getNoteById(_activeNoteId);
  if (!note) {
    _activeNoteId = null;
    renderNotesEmptyEditor();
    return;
  }

  var links = await getLinkOptions();

  var contactOptions = '<option value="">— None —</option>'
    + links.contacts.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (note.contactId === c.id ? ' selected' : '') + '>' + esc(c.name) + (c.company ? ' · ' + esc(c.company) : '') + '</option>';
      }).join('');

  var projectOptions = '<option value="">— None —</option>'
    + links.projects.map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (note.projectId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
      }).join('');

  host.innerHTML = ''
    + '<div class="note-editor">'

      + breadcrumbHTML()

      + '<header class="note-editor-head">'
        + '<span class="note-save-state" id="noteSaveState"></span>'
        + '<span class="grow"></span>'
        + '<button class="icon-btn" id="notePin" title="' + (note.pinned ? 'Unpin' : 'Pin') + '">'
          + (note.pinned
              ? '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24z"/></svg>')
        + '</button>'
        + '<button class="icon-btn" id="noteExport" title="Export as text">'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
        + '</button>'
        + '<button class="icon-btn danger" id="noteDelete" title="Delete">'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>'
        + '</button>'
        + '<button class="icon-btn note-close" id="noteClose" title="Close note">'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        + '</button>'
      + '</header>'

      + '<input type="text" class="note-title-input" id="noteTitleInput" placeholder="Untitled note" value="' + esc(note.title) + '" spellcheck="true">'

      + '<div class="note-editor-body">'
        + '<textarea class="note-content-input" id="noteContentInput" placeholder="Start writing…" spellcheck="true">' + esc(note.content) + '</textarea>'
      + '</div>'

      + '<div class="note-editor-links">'
        + '<label class="note-link-row">'
          + '<span class="note-link-label">Contact</span>'
          + '<select id="noteContactSelect">' + contactOptions + '</select>'
        + '</label>'
        + '<label class="note-link-row">'
          + '<span class="note-link-label">Project</span>'
          + '<select id="noteProjectSelect">' + projectOptions + '</select>'
        + '</label>'
      + '</div>'

    + '</div>';

  wireNoteEditor(note);
  if (typeof wireBreadcrumb === 'function') wireBreadcrumb(host);
}

function renderNotesEmptyEditor() {
  var host = document.querySelector('#noteEditorHost');
  if (!host) return;
  host.innerHTML = ''
    + '<div class="notepad-empty-editor">'
      + '<div class="notepad-empty-emoji">📝</div>'
      + '<h2>Your notes</h2>'
      + '<p>Pick a note from the list, or create a new one.</p>'
      + '<button class="btn primary sm" id="noteEmptyAdd">+ New note</button>'
    + '</div>';
  var addBtn = document.querySelector('#noteEmptyAdd');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      var newBtn = document.querySelector('#notesAdd');
      if (newBtn) newBtn.click();
    });
  }
}

function wireNoteEditor(note) {
  /* Close button */
  var closeBtn = document.querySelector('#noteClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', async function () {
      if (_notesDirty) await flushNoteSave();
      _activeNoteId = null;
      _notesMobileEditing = false;
      if (typeof clearBreadcrumb === 'function') clearBreadcrumb();
      renderNotesList();
      renderNotesEmptyEditor();
    });
  }

  /* Title */
  var titleInput = document.querySelector('#noteTitleInput');
  if (titleInput) {
    titleInput.addEventListener('input', function () {
      var n = getNoteById(_activeNoteId);
      if (!n) return;
      n.title = titleInput.value;
      markNotesDirty();
      scheduleNoteSave();
      var cardTitle = document.querySelector('.note-card.active .note-card-title');
      if (cardTitle) cardTitle.textContent = n.title || 'Untitled note';
    });
    titleInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var contentInput = document.querySelector('#noteContentInput');
        if (contentInput) contentInput.focus();
      }
    });
  }

  /* Content */
  var contentInput = document.querySelector('#noteContentInput');
  if (contentInput) {
    contentInput.addEventListener('input', function () {
      var n = getNoteById(_activeNoteId);
      if (!n) return;
      n.content = contentInput.value;
      markNotesDirty();
      scheduleNoteSave();
      var cardPreview = document.querySelector('.note-card.active .note-card-preview');
      if (cardPreview) cardPreview.textContent = notePreview(n.content);
    });
  }

  /* Pin */
  var pinBtn = document.querySelector('#notePin');
  if (pinBtn) {
    pinBtn.addEventListener('click', async function () {
      var n = getNoteById(_activeNoteId);
      if (!n) return;
      n.pinned = !n.pinned;
      try {
        await Store.db.notes.update(n.id, { pinned: n.pinned });
        invalidateNotesCache();
        await loadNotes(true);
        updateNotesBadge();
        renderNotesList();
        renderNoteEditor();
        toast(n.pinned ? 'Pinned' : 'Unpinned');
      } catch (e) { toast('Could not pin: ' + e.message); }
    });
  }

  /* Export */
  var exportBtn = document.querySelector('#noteExport');
  if (exportBtn) {
    exportBtn.addEventListener('click', function () {
      var n = getNoteById(_activeNoteId);
      if (!n) return;
      var body = (n.title || 'Untitled note') + '\n\n' + (n.content || '');
      var blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var safe = (n.title || 'note').replace(/[^\w\-]+/g, '-').toLowerCase();
      a.href = url;
      a.download = safe + '-' + new Date().toISOString().slice(0, 10) + '.txt';
      a.click();
      URL.revokeObjectURL(url);
      toast('Note exported');
    });
  }

  /* Delete */
  var delBtn = document.querySelector('#noteDelete');
  if (delBtn) {
    delBtn.addEventListener('click', async function () {
      var n = getNoteById(_activeNoteId);
      if (!n) return;
      var ok = await confirmDialog({
        title: 'Delete "' + (n.title || 'Untitled note') + '"?',
        message: 'Moved to Trash. You can restore it later.',
        confirmLabel: 'Delete',
        danger: true
      });
      if (!ok) return;
      try {
        await Store.db.trash.create({
          kind: 'note',
          name: n.title || 'Untitled note',
          record: clone(n)
        });
        await Store.db.notes.remove(n.id);
        invalidateNotesCache();
        await loadNotes(true);
        updateNotesBadge();
        _activeNoteId = null;
        _notesMobileEditing = false;
        if (typeof clearBreadcrumb === 'function') clearBreadcrumb();
        renderNotesList();
        renderNotesEmptyEditor();
        toast('Note deleted');
      } catch (e) {
        toast('Could not delete: ' + e.message);
      }
    });
  }

  /* Link selectors */
  var contactSel = document.querySelector('#noteContactSelect');
  if (contactSel) {
    contactSel.addEventListener('change', function () {
      var n = getNoteById(_activeNoteId);
      if (!n) return;
      n.contactId = contactSel.value || null;
      markNotesDirty();
      scheduleNoteSave();
    });
  }
  var projectSel = document.querySelector('#noteProjectSelect');
  if (projectSel) {
    projectSel.addEventListener('change', function () {
      var n = getNoteById(_activeNoteId);
      if (!n) return;
      n.projectId = projectSel.value || null;
      markNotesDirty();
      scheduleNoteSave();
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════
   PUBLIC — open a note by id from search or cross-links
   ══════════════════════════════════════════════════════════════════════ */
async function openNoteById(id) {
  if (!_notesLoaded || _notesCache.length === 0) {
    await loadNotes(true);
  }
  var note = getNoteById(id);
  if (!note) { toast('Note not found'); return; }
  _activeNoteId = id;
  _notesMobileEditing = true;

  var host = document.querySelector('#view-notepad');
  if (host && host.classList.contains('active')) {
    renderNotesList();
    renderNoteEditor();
  } else {
    showView('notepad');
  }
}

/* ══════════════════════════════════════════════════════════════════════
   AUTO-SAVE
   ══════════════════════════════════════════════════════════════════════ */
function markNotesDirty() {
  _notesDirty = true;
  updateNoteSaveState('Saving…');
}

function updateNoteSaveState(text) {
  var el = document.querySelector('#noteSaveState');
  if (el) el.textContent = text || '';
}

function scheduleNoteSave() {
  clearTimeout(_notesSaveTimer);
  _notesSaveTimer = setTimeout(function () { flushNoteSave(); }, 800);
}

async function flushNoteSave() {
  clearTimeout(_notesSaveTimer);
  if (!_notesDirty) return;
  var n = getNoteById(_activeNoteId);
  if (!n) return;
  _notesDirty = false;
  try {
    await Store.db.notes.update(n.id, buildNoteDbPayload(n));
    n.updatedAt = new Date().toISOString();
    updateNoteSaveState('Saved');
    setTimeout(function () { updateNoteSaveState(''); }, 2000);
  } catch (e) {
    console.warn('note save failed:', e.message);
    updateNoteSaveState('Save failed');
    _notesDirty = true;
  }
}

document.addEventListener('click', function (e) {
  var nav = e.target.closest('[data-nav]');
  if (nav && nav.dataset.nav !== 'notepad') {
    if (_notesDirty) flushNoteSave();
  }
});

window.addEventListener('beforeunload', function () {
  if (_notesDirty && _activeNoteId) {
    var n = getNoteById(_activeNoteId);
    if (n) Store.db.notes.update(n.id, buildNoteDbPayload(n)).catch(function () {});
  }
});

/* ══════════════════════════════════════════════════════════════════════
   AUTH REACTIVITY
   ══════════════════════════════════════════════════════════════════════ */
if (typeof Store !== 'undefined' && Store.whenAuthReady) {
  Store.whenAuthReady().then(function () {
    if (Store.isSignedIn()) loadNotes(true).then(updateNotesBadge);
  });
  Store.onAuthChange(function (user) {
    if (user) {
      loadNotes(true).then(updateNotesBadge);
    } else {
      _notesCache = [];
      _notesLoaded = false;
      _activeNoteId = null;
      _notesDirty = false;
      clearTimeout(_notesSaveTimer);
      updateNotesBadge();
    }
  });
}