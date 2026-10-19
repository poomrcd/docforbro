/* ============================================================================
   99-boot.js — DocForBro boot & router
   v14 — Exposes dirty flags to window.docforbro for easier QA.
   ============================================================================ */

const PUBLIC_VIEWS  = ['landing', 'auth'];
const PRIVATE_VIEWS = ['gallery', 'workspace', 'contacts', 'pages', 'notepad', 'rate', 'margin', 'drive', 'trash', 'settings'];

var isStudioDirty = false;
var isMarginDirty = false;

/* ══════════════════════════════════════════════════════════════════════
   ROUTER & SAFE NAVIGATION
   ══════════════════════════════════════════════════════════════════════ */
function showView(name) {
  if (PRIVATE_VIEWS.indexOf(name) !== -1 && !Store.isSignedIn()) {
    name = 'auth';
  }
  
  var landing = document.querySelector('#view-landing');
  var auth    = document.querySelector('#view-auth');
  var app     = document.querySelector('#app');

  var isAuthView    = (name === 'auth');
  var isLandingView = (name === 'landing');

  if (landing) {
    landing.hidden = !isLandingView;
    landing.style.display = isLandingView ? '' : 'none';
  }
  if (auth) {
    auth.hidden = !isAuthView;
    auth.style.display = isAuthView ? '' : 'none';
  }
  
  if (app) {
    app.hidden = (isLandingView || isAuthView);
    if (isLandingView || isAuthView) {
      app.style.setProperty('display', 'none', 'important');
    } else {
      app.style.removeProperty('display');
    }
  }

  if (!isLandingView && !isAuthView) {
    document.querySelectorAll('.main-view').forEach(function (el) {
      var match = el.dataset.view === name;
      el.classList.toggle('active', match);
      el.hidden = !match;
      if (match) {
        el.style.removeProperty('display');
      } else {
        el.style.setProperty('display', 'none', 'important');
      }
    });
    document.querySelectorAll('.side-item').forEach(function (el) {
      el.classList.toggle('active', el.dataset.nav === name);
    });

    if (name === 'gallery' && typeof renderGallery === 'function') {
      renderGallery();
    }
    if (name === 'contacts' && typeof renderContactsView === 'function') {
      renderContactsView();
    }
    if (name === 'pages' && typeof renderPagesView === 'function') {
      renderPagesView();
    }
    if (name === 'notepad' && typeof renderNotepadView === 'function') {
      renderNotepadView();
    }
    if (name === 'drive' && typeof renderDriveView === 'function') {
      renderDriveView({ forceRefresh: true });
    }
    if (name === 'trash' && typeof renderTrashView === 'function') {
      renderTrashView();
    }
    if (name === 'settings' && typeof renderSettingsView === 'function') {
      renderSettingsView();
    }
  }

  var main = document.querySelector('#main');
  if (main) main.scrollTop = 0;
}

function safeNavigate(targetView) {
  var currentView = document.querySelector('.main-view.active')?.dataset.view;

  if (currentView === 'workspace' && window.docforbro.isStudioDirty) {
    confirmDialog({
      title: 'Unsaved Changes',
      message: 'You have unsaved changes in your document. Are you sure you want to leave without saving?',
      confirmLabel: 'Leave anyway',
      cancelLabel: 'Keep editing',
      danger: true
    }).then(function (ok) {
      if (ok) {
        window.docforbro.isStudioDirty = false; 
        showView(targetView);
      }
    });
    return;
  }

  if (currentView === 'margin' && window.docforbro.isMarginDirty) {
    confirmDialog({
      title: 'Unsaved Changes',
      message: 'You have an unsaved project in the Margin Engine. Are you sure you want to leave?',
      confirmLabel: 'Leave anyway',
      cancelLabel: 'Keep editing',
      danger: true
    }).then(function (ok) {
      if (ok) {
        window.docforbro.isMarginDirty = false;
        showView(targetView);
      }
    });
    return;
  }

  showView(targetView);
}

/* ══════════════════════════════════════════════════════════════════════
   SIDEBAR USER CHIP
   ══════════════════════════════════════════════════════════════════════ */
function updateSidebarUser(user) {
  var container = document.querySelector('#sideUser');
  if (!container) return;

  if (!user || !user.email) {
    container.innerHTML = '';
    return;
  }

  var email = user.email;
  var initial = email[0].toUpperCase();
  var safeEmail = email.replace(/"/g, '&quot;');

  container.innerHTML =
    '<div class="su-avatar">' + initial + '</div>' +
    '<div class="su-meta">' +
      '<span class="su-email" title="' + safeEmail + '">' + email + '</span>' +
      '<span class="su-status">Cloud sync</span>' +
    '</div>' +
    '<button class="su-out" data-action="signout" title="Sign out" aria-label="Sign out">' +
      '<svg viewBox="0 0 24 24">' +
        '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>' +
        '<polyline points="16 17 21 12 16 7"/>' +
        '<line x1="21" y1="12" x2="9" y2="12"/>' +
      '</svg>' +
    '</button>';
}

/* ══════════════════════════════════════════════════════════════════════
   SIDEBAR TOGGLE
   ══════════════════════════════════════════════════════════════════════ */
function initSidebarToggle() {
  var app     = document.querySelector('#app');
  var sidebar = document.querySelector('#sidebar');
  var btn     = document.querySelector('#btnSideToggle');
  if (!app || !sidebar || !btn) return;

  var scrim = document.querySelector('.sidebar-scrim');
  if (!scrim) {
    scrim = document.createElement('div');
    scrim.className = 'sidebar-scrim';
    document.body.appendChild(scrim);
  }

  function isMobile() {
    return window.matchMedia('(max-width: 960px)').matches;
  }

  function closeMobile() {
    sidebar.classList.remove('open');
    scrim.classList.remove('show');
  }

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    if (isMobile()) {
      sidebar.classList.toggle('open');
      scrim.classList.toggle('show', sidebar.classList.contains('open'));
    } else {
      app.dataset.side = app.dataset.side === 'collapsed' ? 'expanded' : 'collapsed';
    }
  });

  scrim.addEventListener('click', closeMobile);

  document.addEventListener('click', function (e) {
    if (isMobile() && e.target.closest('.side-item')) closeMobile();
  });

  window.addEventListener('resize', function () {
    if (!isMobile()) closeMobile();
  });
}

/* ══════════════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════════════ */
function boot() {
  var y = document.querySelector('#landingYear');
  if (y) y.textContent = new Date().getFullYear();

  var themeBtn = document.querySelector('#btnTheme');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var cur = document.documentElement.dataset.theme || 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('docforbro:theme', next); } catch (e) {}
    });
  }

  document.addEventListener('click', function (e) {
    var nav = e.target.closest('[data-nav]');
    if (nav) {
      e.preventDefault();
      if (typeof clearBreadcrumb === 'function') clearBreadcrumb();
      safeNavigate(nav.dataset.nav);
      return;
    }
    var scr = e.target.closest('[data-scroll]');
    if (scr) {
      var t = document.getElementById(scr.dataset.scroll);
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
    }
  });

  if (typeof initStudio === 'function') initStudio();
  if (typeof initSidebarToggle === 'function') initSidebarToggle();

  Store.onAuthChange(function (user) {
    updateSidebarUser(user);
  });

  Store.whenAuthReady().then(function () {
    if (Store.isSignedIn()) {
      updateSidebarUser(Store.user);
      showView('gallery');
    } else {
      showView('landing');
    }
  });

  console.log('DocForBro ' + CONFIG.version + ' ready \u2014 build OK');
}

/* ══════════════════════════════════════════════════════════════════════
   DEBUG NAMESPACE
   ══════════════════════════════════════════════════════════════════════ */
window.docforbro = {
  CONFIG: CONFIG,
  Store: Store,
  showView: showView,
  safeNavigate: safeNavigate,
  
  // Expose dirty state setters/getters for QA
  get isStudioDirty() { return isStudioDirty; },
  set isStudioDirty(v) { isStudioDirty = v; },
  get isMarginDirty() { return isMarginDirty; },
  set isMarginDirty(v) { isMarginDirty = v; },

  openTemplate: function (t) { return openTemplate(t); },
  TEMPLATES: TEMPLATES,
  get studio() { return studio; },
  set studio(v) { studio = v; },
  gallery:   function () { return renderGallery       ? renderGallery()       : null; },
  preview:   function () { return renderPreview       ? renderPreview()       : null; },
  content:   function () { return renderContentPane   ? renderContentPane()   : null; },
  signature: function () { return renderSignaturePane ? renderSignaturePane() : null; },
  exportPDF: function () { return exportPDF           ? exportPDF()           : null; },
  drive:     function () { return renderDriveView     ? renderDriveView()     : null; },
  trash:     function () { return renderTrashView     ? renderTrashView()     : null; },
  contacts:  function () { return renderContactsView  ? renderContactsView()  : null; },
  notepad:   function () { return renderNotepadView   ? renderNotepadView()   : null; },
  notes:     function () { return getCachedNotes      ? getCachedNotes()      : []; },
  pages:     function () { return renderPagesView     ? renderPagesView()     : null; },
  getPages:  function () { return getCachedPages      ? getCachedPages()      : []; },
  settings:  function () { return renderSettingsView  ? renderSettingsView()  : null; },
  saveDraft: function () { return promptSaveDraft     ? promptSaveDraft()     : null; },
  getCachedUserTemplates: function () { return getCachedUserTemplates ? getCachedUserTemplates() : []; },
  getUserTemplateById:    function (id) { return getUserTemplateById ? getUserTemplateById(id) : null; },
  getCachedContacts:      function () { return getCachedContacts ? getCachedContacts() : [] },
  openNoteById:    function (id) { return typeof openNoteById === 'function' ? openNoteById(id) : null; },
  openPageById:    function (id) { return typeof openPageById === 'function' ? openPageById(id) : null; },
  setBreadcrumb:   function (label, nav, fn) { return typeof setBreadcrumb === 'function' ? setBreadcrumb(label, nav, fn) : null; },
  clearBreadcrumb: function () { return typeof clearBreadcrumb === 'function' ? clearBreadcrumb() : null; },
  getBreadcrumb:   function () { return typeof getBreadcrumb === 'function' ? getBreadcrumb() : null; }
};

document.addEventListener('DOMContentLoaded', boot);