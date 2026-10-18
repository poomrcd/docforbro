/* ============================================================================
   08-settings.js — Settings view
   v8 — Adds skeleton loader and routes sign out through safe handler.
   ============================================================================ */

var SETTINGS_LS = { theme: 'docforbro:theme' };
var _skipLocalImport = false;

function currentEmail() {
  if (typeof Store === 'undefined' || !Store || !Store.user) return 'not signed in';
  return Store.user.email || 'not signed in';
}

function currentInitial() {
  return (currentEmail()[0] || '?').toUpperCase();
}

function getLiveCounts() {
  var c = { drafts: 0, exports: 0, profiles: 0, projects: 0, templates: 0, trash: 0 };
  if (typeof Store === 'undefined' || !Store || !Store.isSignedIn || !Store.isSignedIn()) return Promise.resolve(c);
  return Promise.all([
    typeof loadDrafts === 'function' ? loadDrafts() : Promise.resolve([]),
    typeof loadExports === 'function' ? loadExports() : Promise.resolve([]),
    typeof loadTrash === 'function' ? loadTrash() : Promise.resolve([])
  ]).then(function (res) {
    c.drafts = res[0].length;
    c.exports = res[1].length;
    c.trash = res[2].length;
    c.profiles = (typeof rateProfiles !== 'undefined' && Array.isArray(rateProfiles)) ? rateProfiles.length : 0;
    c.projects = (typeof marginProjects !== 'undefined' && Array.isArray(marginProjects)) ? marginProjects.length : 0;
    c.templates = (typeof getCachedUserTemplates === 'function') ? getCachedUserTemplates().length : 0;
    return c;
  }).catch(function (e) {
    console.warn('getLiveCounts failed:', e.message);
    return c;
  });
}

function detectLocalData() {
  try {
    if (typeof Store !== 'undefined' && Store && Store.migrate && typeof Store.migrate.detect === 'function') {
      return Store.migrate.detect() || {};
    }
  } catch (e) {
    console.warn('detectLocalData failed:', e.message);
  }
  return {};
}

function renderSettingsView() {
  var host = document.querySelector('#view-settings');
  if (!host) return Promise.resolve();

  // ── SKELETON LOADER ──
  host.innerHTML = `
    <div class="tool-page">
      <div class="tool-head" style="margin-bottom:24px">
        <div class="skeleton skeleton-line w-30" style="height:32px;margin-bottom:8px"></div>
        <div class="skeleton skeleton-line w-50"></div>
      </div>
      <div class="settings-grid">
        <div>
          <div class="skeleton" style="height:180px;border-radius:var(--r);margin-bottom:16px"></div>
          <div class="skeleton" style="height:140px;border-radius:var(--r);margin-bottom:16px"></div>
          <div class="skeleton" style="height:220px;border-radius:var(--r);margin-bottom:16px"></div>
        </div>
        <div>
          <div class="skeleton" style="height:200px;border-radius:var(--r);margin-bottom:16px"></div>
          <div class="skeleton" style="height:160px;border-radius:var(--r);margin-bottom:16px"></div>
          <div class="skeleton" style="height:140px;border-radius:var(--r);margin-bottom:16px"></div>
        </div>
      </div>
    </div>
  `;

  return getLiveCounts().then(function (counts) {
    var theme = document.documentElement.dataset.theme || 'light';
    var local = detectLocalData();

    var localCounts = {
      profiles: Array.isArray(local.rateProfiles) ? local.rateProfiles.length : 0,
      projects: Array.isArray(local.marginProjects) ? local.marginProjects.length : 0,
      templates: Array.isArray(local.userTemplates) ? local.userTemplates.length : 0,
      drafts: Array.isArray(local.drafts) ? local.drafts.length : 0,
      exports: Array.isArray(local.exports) ? local.exports.length : 0
    };

    var localTotal = 0;
    for (var k in localCounts) { if (localCounts.hasOwnProperty(k)) localTotal += localCounts[k]; }

    var showLocalCard = localTotal > 0 && !_skipLocalImport;

    var localListHTML = '';
    if (localCounts.profiles > 0)  localListHTML += '<li>' + localCounts.profiles  + ' rate profile'   + (localCounts.profiles  === 1 ? '' : 's') + '</li>';
    if (localCounts.projects > 0)  localListHTML += '<li>' + localCounts.projects  + ' margin project' + (localCounts.projects  === 1 ? '' : 's') + '</li>';
    if (localCounts.templates > 0) localListHTML += '<li>' + localCounts.templates + ' personal template' + (localCounts.templates === 1 ? '' : 's') + '</li>';
    if (localCounts.drafts > 0)    localListHTML += '<li>' + localCounts.drafts    + ' draft'          + (localCounts.drafts    === 1 ? '' : 's') + '</li>';
    if (localCounts.exports > 0)   localListHTML += '<li>' + localCounts.exports   + ' export record'  + (localCounts.exports   === 1 ? '' : 's') + '</li>';

    var localCardHTML = '';
    if (showLocalCard) {
      localCardHTML =
        '<div class="settings-section" style="border-color:var(--warn-bd);background:var(--warn-bg)">' +
        '<h3 style="color:var(--warn-ink)">Local data detected</h3>' +
        '<p class="lead" style="color:var(--warn-ink)">This browser still has <strong>' + localTotal + ' item' + (localTotal === 1 ? '' : 's') + '</strong> saved from before you signed in. Import them to your cloud account so they\u2019re available on every device.</p>' +
        '<ul style="margin:0 0 14px 18px;padding:0;color:var(--warn-ink);font-size:12.5px;line-height:1.9">' + localListHTML + '</ul>' +
        '<div class="row" style="gap:8px">' +
        '<button class="btn primary sm" id="setImportLocal">Import to cloud</button>' +
        '<button class="btn ghost sm" id="setSkipImport">Not now</button>' +
        '</div></div>';
    }

    var currencyOptions = '';
    for (var ci = 0; ci < RATE_CURRENCIES.length; ci++) {
      var c = RATE_CURRENCIES[ci];
      var sel = (rateState && rateState.currency === c) ? ' selected' : '';
      currencyOptions += '<option value="' + c + '"' + sel + '>' + c + ' ' + (CURRENCY_SYMBOLS[c] || '') + '</option>';
    }

    host.innerHTML =
      '<div class="tool-page">' +
      '<div class="tool-head"><h1>Settings</h1><p>Manage your account, appearance, and data.</p></div>' +
      '<div class="settings-grid">' +

      '<div>' +

      '<div class="settings-section">' +
      '<h3>Account</h3>' +
      '<div class="account-chip">' +
      '<div class="account-avatar">' + esc(currentInitial()) + '</div>' +
      '<div class="account-info"><strong>' + esc(currentEmail()) + '</strong><span>Signed in \u00b7 Cloud sync enabled</span></div>' +
      '</div>' +
      '<div class="row" style="gap:8px;"><button class="btn sm" id="setSignOut">Sign out</button></div>' +
      '</div>' +

      localCardHTML +

      '<div class="settings-section">' +
      '<h3>Appearance</h3>' +
      '<div class="settings-row"><div><div class="label">Theme</div><div class="sub">Switch between Pearl White and Soft Charcoal.</div></div>' +
      '<div class="control"><button class="btn sm" id="setThemeToggle">' + (theme === 'dark' ? 'Switch to light' : 'Switch to dark') + '</button></div></div>' +
      '<div class="settings-row"><div><div class="label">Currency</div><div class="sub">Default currency for rate and margin tools.</div></div>' +
      '<div class="control"><select class="ctrl-select" id="setCurrency" style="padding:6px 10px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--panel);font-size:var(--fs-sm)">' + currencyOptions + '</select></div></div>' +
      '</div>' +

      '<div class="settings-section">' +
      '<h3>Keyboard shortcuts</h3>' +
      '<table class="kbd-table">' +
      '<tr><td><kbd>\u2318</kbd> <kbd>K</kbd></td><td>Search everything</td></tr>' +
      '<tr><td><kbd>\u2318</kbd> <kbd>S</kbd></td><td>Save current document as draft</td></tr>' +
      '<tr><td><kbd>\u2318</kbd> <kbd>P</kbd></td><td>Export current document as PDF</td></tr>' +
      '<tr><td><kbd>Esc</kbd></td><td>Close any modal, dropdown, or preview</td></tr>' +
      '</table>' +
      '<p class="lead" style="margin-top:12px;margin-bottom:0">Use <kbd>Ctrl</kbd> instead of <kbd>\u2318</kbd> on Windows and Linux.</p>' +
      '</div>' +

      '<div class="support-card">' +
      '<h3>Support DocForBro</h3>' +
      '<p>DocForBro is free to use. If it saves you time, feed my cat \u2014 every cup keeps the project going.</p>' +
      (typeof supportButtonHTML === 'function' ? supportButtonHTML('Feed My Cat') : '') +
      '</div>' +

      '</div>' +

      '<div>' +

      '<div class="settings-section">' +
      '<h3>Your data</h3>' +
      '<p class="lead">Everything synced to your DocForBro account.</p>' +
      '<div class="insights" style="grid-template-columns:repeat(2,minmax(0,1fr))">' +
      '<div class="insight"><div class="v">' + counts.drafts + '</div><div class="l">Documents</div></div>' +
      '<div class="insight"><div class="v">' + counts.exports + '</div><div class="l">Exports</div></div>' +
      '</div>' +
      '<div class="insights" style="grid-template-columns:repeat(4,minmax(0,1fr)); margin-bottom: 0;">' +
      '<div class="insight"><div class="v">' + counts.profiles + '</div><div class="l">Profiles</div></div>' +
      '<div class="insight"><div class="v">' + counts.projects + '</div><div class="l">Projects</div></div>' +
      '<div class="insight"><div class="v">' + counts.templates + '</div><div class="l">Templates</div></div>' +
      '<div class="insight"><div class="v">' + counts.trash + '</div><div class="l">In trash</div></div>' +
      '</div>' +
      '</div>' +

      '<div class="settings-section">' +
      '<h3>Backup</h3>' +
      '<p class="lead">Download a JSON snapshot of everything on your account \u2014 documents, exports, rate profiles, projects, and personal templates.</p>' +
      '<div class="row" style="gap:8px">' +
      '<button class="btn sm primary" id="setExportData">Download backup</button>' +
      '<button class="btn sm" id="setImportData">Import backup</button>' +
      '</div>' +
      '<p class="lead" style="margin-top:10px;margin-bottom:0;font-size:11px">Importing merges into your account \u2014 existing items are never duplicated.</p>' +
      '<input type="file" id="setImportFile" accept=".json,application/json" hidden>' +
      '</div>' +

      '<div class="danger-zone">' +
      '<h3>Danger zone</h3>' +
      '<p>Deleting your data clears every item from your DocForBro account. Your account itself remains active. There is no undo. Download a backup first.</p>' +
      '<div class="row" style="gap:8px"><button class="btn danger sm" id="setClearData">Delete all my data</button></div>' +
      '<p class="lead" style="margin-top:12px;margin-bottom:0;color:var(--danger);font-size:11.5px">To delete your account entirely, email <a href="mailto:hello@docforbro.com" style="color:inherit;text-decoration:underline">hello@docforbro.com</a>.</p>' +
      '</div>' +

      '<div class="settings-section">' +
      '<h3>About</h3>' +
      '<p class="lead" style="margin-bottom:8px"><strong style="color:var(--ink)">DocForBro</strong> pairs a freelance rate calculator and margin tracker with 19 client-ready business templates.</p>' +
      '<p class="lead" style="margin-bottom:0">Version ' + esc(CONFIG.version) + ' \u00b7 ' + esc(CONFIG.domain) + '<br>Free to use. No tracking.</p>' +
      '</div>' +

      '</div>' +
      '</div>' +
      '</div>';

    bindSettingsEvents();
    return counts;
  });
}

function bindSettingsEvents() {
  var signOutBtn = document.querySelector('#setSignOut');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', function () {
      if (typeof handleSignOut === 'function') {
        handleSignOut();
      } else {
        confirmDialog({
          title: 'Sign out?',
          message: 'Your data stays safe in the cloud. You can sign back in anytime.',
          confirmLabel: 'Sign out',
          cancelLabel: 'Cancel'
        }).then(function (ok) {
          if (!ok) return;
          Store.auth.signOut().catch(function (e) { toast('Sign out failed: ' + e.message); });
        });
      }
    });
  }

  var themeBtn = document.querySelector('#setThemeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var cur = document.documentElement.dataset.theme || 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(SETTINGS_LS.theme, next); } catch (e) {}
      renderSettingsView();
    });
  }

  var currencySel = document.querySelector('#setCurrency');
  if (currencySel) {
    currencySel.addEventListener('change', function (e) {
      if (typeof rateState !== 'undefined') {
        rateState.currency = e.target.value;
        if (typeof saveLocalRateState === 'function') saveLocalRateState();
        if (typeof renderRateView === 'function') renderRateView();
        if (typeof renderMarginView === 'function') renderMarginView();
      }
      toast('Currency updated');
    });
  }

  var importLocalBtn = document.querySelector('#setImportLocal');
  if (importLocalBtn) {
    importLocalBtn.addEventListener('click', function () {
      var total = 0;
      var detected = detectLocalData();
      for (var k in detected) {
        if (Array.isArray(detected[k])) total += detected[k].length;
      }
      if (!confirm('Import ' + total + ' local item' + (total === 1 ? '' : 's') + ' to your cloud account?')) return;

      importLocalBtn.disabled = true;
      importLocalBtn.textContent = 'Importing\u2026';

      Store.migrate.run().then(function (result) {
        var added = 0;
        var counts = result.counts || {};
        for (var k in counts) { if (counts.hasOwnProperty(k)) added += counts[k]; }

        if (result.errors && result.errors.length) {
          console.warn('Migration errors:', result.errors);
          alert('Some items could not be imported:\n\n' + result.errors.join('\n'));
        }

        if (added > 0) {
          Store.migrate.clearLocal();
          var chain = Promise.resolve();
          if (typeof loadAllToolsFromCloud === 'function') chain = chain.then(function () { return loadAllToolsFromCloud(); });
          if (typeof loadUserTemplates === 'function') chain = chain.then(function () { return loadUserTemplates({ force: true }); });
          chain = chain.then(function () {
            if (typeof invalidateDriveCache === 'function') invalidateDriveCache();
            if (typeof updateDriveBadge === 'function') updateDriveBadge();
            toast('Imported ' + added + ' item' + (added === 1 ? '' : 's') + ' to cloud');
            renderSettingsView();
          });
        } else {
          toast('Nothing new to import');
          renderSettingsView();
        }
      }).catch(function (e) {
        console.error('Import local data failed:', e);
        alert('Import failed: ' + (e.message || e));
        importLocalBtn.disabled = false;
        importLocalBtn.textContent = 'Import to cloud';
      });
    });
  }

  var skipBtn = document.querySelector('#setSkipImport');
  if (skipBtn) {
    skipBtn.addEventListener('click', function () {
      _skipLocalImport = true;
      renderSettingsView();
    });
  }

  var exportBtn = document.querySelector('#setExportData');
  if (exportBtn) {
    exportBtn.addEventListener('click', function () {
      if (!Store.isSignedIn()) { toast('Please sign in first'); return; }
      Promise.all([
        typeof loadDrafts === 'function' ? loadDrafts() : Promise.resolve([]),
        typeof loadExports === 'function' ? loadExports() : Promise.resolve([]),
        typeof loadTrash === 'function' ? loadTrash() : Promise.resolve([])
      ]).then(function (res) {
        var payload = {
          format: 'docforbro-backup',
          version: '2.0.0',
          exportedAt: new Date().toISOString(),
          drafts: res[0],
          exports: res[1],
          trash: res[2],
          profiles: (typeof rateProfiles !== 'undefined' && Array.isArray(rateProfiles)) ? rateProfiles : [],
          projects: (typeof marginProjects !== 'undefined' && Array.isArray(marginProjects)) ? marginProjects : [],
          userTemplates: (typeof getCachedUserTemplates === 'function') ? getCachedUserTemplates() : [],
          rate: typeof rateState !== 'undefined' ? rateState : null
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'docforbro-backup-' + new Date().toISOString().slice(0,10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        toast('Backup downloaded');
      }).catch(function (e) {
        toast('Could not export: ' + e.message);
      });
    });
  }

  var importDataBtn = document.querySelector('#setImportData');
  var importFileInput = document.querySelector('#setImportFile');
  if (importDataBtn && importFileInput) {
    importDataBtn.addEventListener('click', function () { importFileInput.click(); });
    importFileInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        var data;
        try { data = JSON.parse(ev.target.result); }
        catch (err) { alert('Invalid JSON file'); return; }

        if (data.format === 'docforbro-template') {
          alert('That is a single template file. Use Gallery > Import template instead.');
          return;
        }
        if (data.format !== 'docforbro-backup') {
          alert('Not a DocForBro backup');
          return;
        }
        if (!confirm('Import will merge with your current data. Continue?')) return;

        var tasks = [];
        var added = 0;

        if (Array.isArray(data.drafts)) {
          data.drafts.forEach(function (d) {
            tasks.push(Store.db.documents.create({
              name: d.name || 'Untitled',
              template_id: d.templateId || d.template_id,
              template_name: d.templateName || d.template_name || 'Document',
              data: d.data || d
            }).then(function () { added++; }).catch(function (err) { console.warn('draft import failed:', err.message); }));
          });
        }
        if (Array.isArray(data.exports)) {
          data.exports.forEach(function (x) {
            tasks.push(Store.db.exports.create({
              name: x.name || 'Untitled',
              filename: x.filename || null,
              template_id: x.templateId || x.template_id,
              template_name: x.templateName || x.template_name || 'Document',
              snapshot: x.snapshot || null
            }).then(function () { added++; }).catch(function (err) { console.warn('export import failed:', err.message); }));
          });
        }
        if (Array.isArray(data.profiles)) {
          data.profiles.forEach(function (p) {
            tasks.push(Store.db.rateProfiles.create({ name: p.name || 'Rate profile', data: p.data || p })
              .then(function () { added++; }).catch(function (err) { console.warn('profile import failed:', err.message); }));
          });
        }
        if (Array.isArray(data.projects)) {
          data.projects.forEach(function (p) {
            tasks.push(Store.db.marginProjects.create({
              name: p.name || 'Project',
              client: p.client || null,
              revenue: p.revenue || 0,
              quoted_hours: p.quotedHours || p.quoted_hours || 0,
              actual_hours: p.actualHours || p.actual_hours || 0,
              expenses: p.expenses || [],
              expenses_total: p.expensesTotal || p.expenses_total || 0,
              labor_cost: p.laborCost || p.labor_cost || 0,
              margin: p.margin || 0,
              margin_pct: p.marginPct || p.margin_pct || 0,
              effective_rate: p.effectiveRate || p.effective_rate || 0,
              date: p.date || new Date().toISOString()
            }).then(function () { added++; }).catch(function (err) { console.warn('project import failed:', err.message); }));
          });
        }
        if (Array.isArray(data.userTemplates)) {
          data.userTemplates.forEach(function (t) {
            tasks.push(Store.db.userTemplates.create({
              name: t.name || 'Template',
              category: t.category || 'Custom',
              description: t.desc || t.description || null,
              accent: t.accent || null,
              data: t.data || { doc: t.doc, brand: t.brand, meta: t.meta, sections: t.sections, signature: t.signature }
            }).then(function () { added++; }).catch(function (err) { console.warn('template import failed:', err.message); }));
          });
        }

        Promise.all(tasks).then(function () {
          var chain = Promise.resolve();
          if (typeof loadAllToolsFromCloud === 'function') chain = chain.then(function () { return loadAllToolsFromCloud(); });
          if (typeof loadUserTemplates === 'function') chain = chain.then(function () { return loadUserTemplates({ force: true }); });
          chain = chain.then(function () {
            if (typeof invalidateDriveCache === 'function') invalidateDriveCache();
            if (typeof updateDriveBadge === 'function') updateDriveBadge();
            toast('Backup imported \u2014 added ' + added + ' item' + (added === 1 ? '' : 's'));
            renderSettingsView();
          });
        });
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  var clearBtn = document.querySelector('#setClearData');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (!Store.isSignedIn()) return;
      if (!confirm('Delete every item from your DocForBro account?')) return;
      if (!confirm('Really delete everything? Last chance.')) return;

      var tables = ['documents', 'exports', 'rate_profiles', 'margin_projects', 'user_templates', 'trash'];
      var uid = Store.uid();
      var chain = Promise.resolve();
      var failed = 0;

      tables.forEach(function (t) {
        chain = chain.then(function () {
          return Store.client.from(t).delete().eq('user_id', uid).then(function (res) {
            if (res.error) { console.warn('Clear ' + t + ':', res.error.message); failed++; }
          }).catch(function (err) { console.warn('Clear ' + t + ' failed:', err.message); failed++; });
        });
      });

      chain.then(function () {
        toast(failed ? 'Cleared most data' : 'All data deleted');
        var c2 = Promise.resolve();
        if (typeof loadAllToolsFromCloud === 'function') c2 = c2.then(function () { return loadAllToolsFromCloud(); });
        if (typeof loadUserTemplates === 'function') c2 = c2.then(function () { return loadUserTemplates({ force: true }); });
        c2.then(function () {
          if (typeof invalidateDriveCache === 'function') invalidateDriveCache();
          if (typeof updateDriveBadge === 'function') updateDriveBadge();
          renderSettingsView();
        });
      });
    });
  }
}

if (typeof Store !== 'undefined' && Store.onAuthChange) {
  Store.onAuthChange(function () {
    var v = document.querySelector('#view-settings');
    if (v && v.classList.contains('active')) renderSettingsView();
  });
}