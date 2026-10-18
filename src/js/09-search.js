/* ============================================================================
   09-search.js — Global search across the whole app
   v4 — Drop 11A: adds contacts, notes, pages to the index.
   ============================================================================ */

let searchResults       = [];
let searchActiveIndex   = 0;
let searchIsOpen        = false;

const SEARCH_TYPE_LABELS = {
  contact:  'Contacts',
  page:     'Pages',
  note:     'Notes',
  template: 'Templates',
  draft:    'Documents',
  export:   'Exports',
  profile:  'Rate Profiles',
  project:  'Projects',
  trash:    'Trash',
};

const SEARCH_TYPE_ORDER = [
  'contact', 'page', 'note', 'template',
  'draft', 'export', 'profile', 'project', 'trash'
];

/* ══════════════════════════════════════════════════════════════════════
   INDEX
   ══════════════════════════════════════════════════════════════════════ */
async function buildSearchIndex() {
  const items = [];

  /* ── Built-in templates (sync) ───────────────────────────────── */
  (typeof TEMPLATES !== 'undefined' ? TEMPLATES : []).forEach(t => {
    items.push({
      type: 'template',
      id: t.id,
      title: t.name,
      sub: t.category,
      haystack: `${t.name} ${t.category} ${t.desc || ''}`.toLowerCase(),
      run: () => {
        const tpl = TEMPLATES.find(x => x.id === t.id);
        if (tpl) openTemplate(tpl);
      },
    });
  });

  /* ── User templates (sync cache) ─────────────────────────────── */
  (typeof getCachedUserTemplates === 'function' ? getCachedUserTemplates() : []).forEach(t => {
    items.push({
      type: 'template',
      id: t.id,
      title: t.name,
      sub: `My template · ${t.category}`,
      haystack: `${t.name} ${t.category} ${t.desc || ''}`.toLowerCase(),
      run: () => {
        const tpl = typeof getUserTemplateById === 'function' ? getUserTemplateById(t.id) : null;
        if (tpl) openTemplate(tpl);
      },
    });
  });

  /* ── Contacts (async) ────────────────────────────────────────── */
  if (typeof loadContacts === 'function') {
    try {
      const contacts = await loadContacts();
      (contacts || []).forEach(c => {
        items.push({
          type: 'contact',
          id: c.id,
          title: c.name,
          sub: [c.company, c.email, c.role].filter(Boolean).join(' · ') || 'Contact',
          haystack: `${c.name} ${c.company || ''} ${c.email || ''} ${c.phone || ''} ${c.role || ''} ${c.notes || ''}`.toLowerCase(),
          run: () => {
            if (typeof openContactDetail === 'function') openContactDetail(c.id);
            else showView('contacts');
          },
        });
      });
    } catch (e) { console.warn('search: contacts failed', e.message); }
  }

  /* ── Notes (async) ───────────────────────────────────────────── */
  if (typeof loadNotes === 'function') {
    try {
      const notes = await loadNotes();
      (notes || []).forEach(n => {
        items.push({
          type: 'note',
          id: n.id,
          title: n.title || 'Untitled note',
          sub: 'Note',
          haystack: `${n.title || ''} ${n.content || ''}`.toLowerCase(),
          run: () => {
            if (typeof openNoteById === 'function') openNoteById(n.id);
            else showView('notepad');
          },
        });
      });
    } catch (e) { console.warn('search: notes failed', e.message); }
  }

  /* ── Pages (async) ───────────────────────────────────────────── */
  if (typeof loadPages === 'function') {
    try {
      const pages = await loadPages();
      (pages || []).forEach(p => {
        const blockText = (p.blocks || []).map(b => b.text || '').filter(Boolean).join(' ');
        items.push({
          type: 'page',
          id: p.id,
          title: p.title || 'Untitled page',
          sub: 'Page',
          haystack: `${p.title || ''} ${blockText}`.toLowerCase(),
          run: () => {
            if (typeof openPageById === 'function') openPageById(p.id);
            else showView('pages');
          },
        });
      });
    } catch (e) { console.warn('search: pages failed', e.message); }
  }

  /* ── Drafts (async) ──────────────────────────────────────────── */
  if (typeof loadDrafts === 'function') {
    try {
      const drafts = await loadDrafts();
      (drafts || []).forEach(d => {
        items.push({
          type: 'draft',
          id: d.id,
          title: d.name,
          sub: d.templateName || 'Document',
          haystack: `${d.name} ${d.templateName || ''}`.toLowerCase(),
          run: () => openDriveItem('draft', d.id),
        });
      });
    } catch (e) { console.warn('search: drafts failed', e.message); }
  }

  /* ── Exports (async) ─────────────────────────────────────────── */
  if (typeof loadExports === 'function') {
    try {
      const exports = await loadExports();
      (exports || []).forEach(x => {
        items.push({
          type: 'export',
          id: x.id,
          title: x.name,
          sub: `${x.templateName || 'Document'} · PDF`,
          haystack: `${x.name} ${x.templateName || ''}`.toLowerCase(),
          run: () => openDriveItem('export', x.id),
        });
      });
    } catch (e) { console.warn('search: exports failed', e.message); }
  }

  /* ── Rate profiles (sync) ────────────────────────────────────── */
  (typeof rateProfiles !== 'undefined' ? rateProfiles : []).forEach(p => {
    items.push({
      type: 'profile',
      id: p.id,
      title: p.name,
      sub: 'Rate profile',
      haystack: p.name.toLowerCase(),
      run: () => {
        if (typeof loadRateProfile === 'function') loadRateProfile(p.id);
        showView('rate');
      },
    });
  });

  /* ── Margin projects (sync) ──────────────────────────────────── */
  (typeof marginProjects !== 'undefined' ? marginProjects : []).forEach(p => {
    items.push({
      type: 'project',
      id: p.id,
      title: p.name,
      sub: p.client ? `Project · ${p.client}` : 'Project',
      haystack: `${p.name} ${p.client || ''}`.toLowerCase(),
      run: () => {
        if (typeof editMarginProject === 'function') editMarginProject(p.id);
        showView('margin');
      },
    });
  });

  /* ── Trash (async) ───────────────────────────────────────────── */
  if (typeof loadTrash === 'function') {
    try {
      const trash = await loadTrash();
      (trash || []).forEach(t => {
        items.push({
          type: 'trash',
          id: t.id,
          title: t.name,
          sub: `In Trash · ${t.kind}`,
          haystack: `${t.name} ${t.kind}`.toLowerCase(),
          run: () => showView('trash'),
        });
      });
    } catch (e) { console.warn('search: trash failed', e.message); }
  }

  return items;
}

async function performSearch(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const all = await buildSearchIndex();
  return all.filter(item => item.haystack.includes(q)).slice(0, 50);
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════════════ */
let _searchReqToken = 0;

async function renderSearchDropdown(query) {
  const dropdown = document.querySelector('#searchResults');
  if (!dropdown) return;

  const q = String(query || '').trim();
  if (!q) { closeSearchDropdown(); return; }

  const myToken = ++_searchReqToken;
  searchResults = await performSearch(q);
  if (myToken !== _searchReqToken) return;

  searchActiveIndex = 0;

  if (!searchResults.length) {
    dropdown.innerHTML = `
      <div class="search-empty">
        <strong>No matches for "${esc(q)}"</strong>
        <span>Try a different word, or check the spelling.</span>
      </div>
    `;
  } else {
    const groups = {};
    searchResults.forEach(r => {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    });

    let html = '';
    let flatIndex = 0;

    SEARCH_TYPE_ORDER.forEach(type => {
      if (!groups[type] || !groups[type].length) return;
      html += `<div class="search-group">`;
      html += `<div class="search-group-label">${esc(SEARCH_TYPE_LABELS[type])}<span class="cnt">${groups[type].length}</span></div>`;
      groups[type].forEach(item => {
        const active = flatIndex === searchActiveIndex ? ' active' : '';
        html += `
          <button class="search-result${active}" data-index="${flatIndex}" type="button">
            <span class="sr-title">${highlightMatch(item.title, q)}</span>
            <span class="sr-sub">${esc(item.sub)}</span>
          </button>
        `;
        flatIndex++;
      });
      html += `</div>`;
    });

    html += `
      <div class="search-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>Esc</kbd> close</span>
      </div>
    `;
    dropdown.innerHTML = html;

    dropdown.querySelectorAll('.search-result').forEach(btn => {
      btn.addEventListener('click', () => openSearchResult(parseInt(btn.dataset.index, 10)));
      btn.addEventListener('mouseenter', () => setSearchActive(parseInt(btn.dataset.index, 10)));
    });
  }

  positionSearchDropdown();
  dropdown.hidden = false;
  searchIsOpen = true;
}

function highlightMatch(text, query) {
  const str = String(text || '');
  const q = String(query || '');
  if (!q) return esc(str);
  const idx = str.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return esc(str);
  return esc(str.slice(0, idx))
       + '<mark>' + esc(str.slice(idx, idx + q.length)) + '</mark>'
       + esc(str.slice(idx + q.length));
}

function positionSearchDropdown() {
  const input    = document.querySelector('#globalSearch');
  const dropdown = document.querySelector('#searchResults');
  if (!input || !dropdown) return;
  const rect = input.getBoundingClientRect();
  const width = Math.max(420, Math.min(rect.width + 140, window.innerWidth - 24));
  dropdown.style.top   = (rect.bottom + 6) + 'px';
  dropdown.style.left  = Math.min(rect.left, window.innerWidth - width - 12) + 'px';
  dropdown.style.width = width + 'px';
}

function setSearchActive(index) {
  const dropdown = document.querySelector('#searchResults');
  if (!dropdown) return;
  if (!searchResults.length) return;
  searchActiveIndex = (index + searchResults.length) % searchResults.length;
  dropdown.querySelectorAll('.search-result').forEach(btn => {
    const idx = parseInt(btn.dataset.index, 10);
    const active = idx === searchActiveIndex;
    btn.classList.toggle('active', active);
    if (active) btn.scrollIntoView({ block: 'nearest' });
  });
}

function moveSearchSelection(delta) {
  if (!searchResults.length) return;
  setSearchActive(searchActiveIndex + delta);
}

function openSearchResult(index) {
  const item = searchResults[index];
  if (!item) return;
  const title = item.title;
  closeSearchDropdown();
  const input = document.querySelector('#globalSearch');
  if (input) input.value = '';
  try { item.run(); } catch (e) { console.warn('search action failed:', e); }
  toast('Opened · ' + title);
}

function closeSearchDropdown() {
  const dropdown = document.querySelector('#searchResults');
  if (dropdown) { dropdown.hidden = true; dropdown.innerHTML = ''; }
  searchIsOpen = false;
  searchResults = [];
  searchActiveIndex = 0;
  _searchReqToken++;
}

/* ══════════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════════ */
function initSearch() {
  const input = document.querySelector('#globalSearch');
  if (!input) return;

  let debTimer = null;
  input.addEventListener('input', e => {
    const value = e.target.value;
    clearTimeout(debTimer);
    debTimer = setTimeout(() => renderSearchDropdown(value), 180);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      input.value = '';
      closeSearchDropdown();
      input.blur();
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSearchSelection(1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); moveSearchSelection(-1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length) openSearchResult(searchActiveIndex);
      return;
    }
  });

  input.addEventListener('focus', () => {
    if (input.value.trim()) renderSearchDropdown(input.value);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search') && !e.target.closest('#searchResults')) {
      closeSearchDropdown();
    }
  });

  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) closeSearchDropdown();
  });

  window.addEventListener('resize', () => {
    if (searchIsOpen) positionSearchDropdown();
  });
  window.addEventListener('scroll', () => {
    if (searchIsOpen) positionSearchDropdown();
  }, true);

  document.addEventListener('keydown', e => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const isCmdK = (isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k';
    if (!isCmdK) return;
    e.preventDefault();
    if (document.activeElement === input) {
      input.blur();
      closeSearchDropdown();
    } else {
      input.focus();
      input.select();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSearch);
} else {
  initSearch();
}