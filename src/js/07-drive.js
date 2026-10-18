/* ============================================================================
   07-drive.js — Drafts, exports, trash, Drive view, Trash view
   v12 — Persists contact_id across all operations and clears studio dirty flag.
   ============================================================================ */

/* ══════════════════════════════════════════════════════════════════════
   MAPPERS
   ══════════════════════════════════════════════════════════════════════ */
function mapDocumentFromDb(row) {
  return {
    id:           row.id,
    name:         row.name || 'Untitled',
    templateId:   row.template_id,
    templateName: row.template_name || 'Document',
    savedAt:      row.updated_at || row.created_at,
    data:         row.data,
    contactId:    row.contact_id || null,
  };
}

function mapExportFromDb(row) {
  return {
    id:           row.id,
    name:         row.name || 'Untitled',
    filename:     row.filename,
    templateId:   row.template_id,
    templateName: row.template_name || 'Document',
    exportedAt:   row.exported_at || row.created_at,
    storagePath:  row.storage_path,
    sizeBytes:    row.size_bytes,
    snapshot:     row.snapshot,
    contactId:    row.contact_id || null,
  };
}

function mapTrashFromDb(row) {
  return {
    id:        row.id,
    kind:      row.kind,
    name:      row.name || 'Untitled',
    record:    row.record || {},
    deletedAt: row.deleted_at || row.created_at,
  };
}

/* ══════════════════════════════════════════════════════════════════════
   LOADERS
   ══════════════════════════════════════════════════════════════════════ */
async function loadDrafts() {
  try {
    const rows = await Store.db.documents.list();
    return rows.map(mapDocumentFromDb);
  } catch (e) { console.warn('loadDrafts failed:', e.message); return []; }
}

async function loadExports() {
  try {
    const rows = await Store.db.exports.list();
    return rows.map(mapExportFromDb);
  } catch (e) { console.warn('loadExports failed:', e.message); return []; }
}

async function loadTrash() {
  try {
    const rows = await Store.db.trash.list();
    return rows.map(mapTrashFromDb);
  } catch (e) { console.warn('loadTrash failed:', e.message); return []; }
}

/* ══════════════════════════════════════════════════════════════════════
   CACHE
   ══════════════════════════════════════════════════════════════════════ */
let _driveCache = { drafts: [], exports: [], trash: [] };
let _driveAllItems = [];

async function refreshDriveCache() {
  var results = await Promise.all([
    loadDrafts(),
    loadExports(),
    loadTrash(),
    (typeof loadRateProfilesFromCloud === 'function')
      ? loadRateProfilesFromCloud() : Promise.resolve(),
    (typeof loadMarginProjectsFromCloud === 'function')
      ? loadMarginProjectsFromCloud() : Promise.resolve(),
  ]);
  _driveCache.drafts  = results[0];
  _driveCache.exports = results[1];
  _driveCache.trash   = results[2];
  return _driveCache;
}

function invalidateDriveCache() {
  _driveAllItems = [];
  _driveCache = { drafts: [], exports: [], trash: [] };
}

/* ══════════════════════════════════════════════════════════════════════
   SAVE DRAFT
   ══════════════════════════════════════════════════════════════════════ */
function snapshotStudio() {
  return clone({
    doc:       studio.doc,
    brand:     studio.brand,
    meta:      studio.meta,
    sections:  studio.sections,
    signature: studio.signature,
    contactId: studio.contactId || null,
  });
}

async function promptSaveDraft() {
  if (!studio) return;
  if (studio.editTemplateId) {
    toast('This is a template — use "Update template" instead.');
    return;
  }
  const drafts = await loadDrafts();
  const existing = studio.draftId ? drafts.find(d => d.id === studio.draftId) : null;
  const suggested = existing?.name || studio.doc.title || 'Untitled document';
  const name = prompt(existing ? 'Rename draft' : 'Save draft as', suggested);
  if (name === null) return;
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  await saveCurrentDraft(trimmed);
}

async function saveCurrentDraft(name) {
  if (!studio) return false;
  const template = TEMPLATES.find(t => t.id === studio.templateId);
  const data = snapshotStudio();
  try {
    if (studio.draftId) {
      await Store.db.documents.update(studio.draftId, {
        name,
        template_id:   studio.templateId,
        template_name: template?.name || 'Document',
        data,
        contact_id:    studio.contactId || null,
      });
    } else {
      const created = await Store.db.documents.create({
        name,
        template_id:   studio.templateId,
        template_name: template?.name || 'Document',
        data,
        contact_id:    studio.contactId || null,
      });
      studio.draftId = created.id;
    }
    studio.draftName = name;
    isStudioDirty = false; // Clear dirty flag on successful save
    await refreshDriveCache();
    invalidateDriveCache();
    updateDraftIndicator();
    toast(studio.draftId ? 'Draft saved' : 'Draft updated');
    return true;
  } catch (e) {
    console.warn('saveCurrentDraft failed:', e.message);
    toast('Could not save draft: ' + (e.message || 'unknown error'));
    return false;
  }
}

function updateDraftIndicator() {
  const pill  = $('#draftPill');
  const label = $('#draftPillLabel');
  if (!pill || !label) return;
  if (studio && studio.draftId) {
    pill.hidden = false;
    label.textContent = studio.draftName || 'Draft';
    pill.dataset.modified = 'false';
  } else {
    pill.hidden = true;
  }
  updateDriveBadge();
}

async function updateDriveBadge() {
  const badge = $('#navBadgeDrive');
  if (!badge) return;
  if (!Store.isSignedIn()) { badge.hidden = true; return; }
  await refreshDriveCache();
  const n = _driveCache.drafts.length
          + _driveCache.exports.length
          + (typeof rateProfiles !== 'undefined' ? rateProfiles.length : 0)
          + (typeof marginProjects !== 'undefined' ? marginProjects.length : 0);
  badge.textContent = n;
  badge.hidden = n === 0;
}

/* ══════════════════════════════════════════════════════════════════════
   EXPORT HISTORY
   ══════════════════════════════════════════════════════════════════════ */
async function recordExport(filename, storagePath) {
  if (!studio || !Store.isSignedIn()) return;
  const template = TEMPLATES.find(t => t.id === studio.templateId);
  try {
    await Store.db.exports.create({
      name:          studio.doc.title || 'Untitled',
      filename:      filename || 'document.pdf',
      template_id:   studio.templateId,
      template_name: template?.name || 'Document',
      storage_path:  storagePath || null,
      snapshot:      snapshotStudio(),
      contact_id:    studio.contactId || null,
    });
    await refreshDriveCache();
    invalidateDriveCache();
    updateDriveBadge();
  } catch (e) { console.warn('recordExport failed:', e.message); }
}

/* ══════════════════════════════════════════════════════════════════════
   MOVE TO TRASH WITH UNDO
   ══════════════════════════════════════════════════════════════════════ */
async function moveToTrashWithUndo(type, id, rec) {
  const displayName = rec.name || 'Item';
  driveSelected?.delete(`${type}:${id}`);

  let trashRowId = null;

  try {
    const trashRow = await Store.db.trash.create({
      kind:   type,
      name:   displayName,
      record: clone(rec),
    });
    trashRowId = trashRow.id;

    if (type === 'draft') {
      await Store.db.documents.remove(id);
      if (studio && studio.draftId === id) {
        studio.draftId = null;
        studio.draftName = null;
        updateDraftIndicator();
      }
    } else if (type === 'export') {
      await Store.db.exports.remove(id);
    } else if (type === 'profile') {
      await Store.db.rateProfiles.remove(id);
      if (typeof rateProfiles !== 'undefined') {
        rateProfiles = rateProfiles.filter(x => x.id !== id);
        if (typeof activeRateProfileId !== 'undefined' && activeRateProfileId === id) {
          activeRateProfileId = null;
        }
        saveToolsState();
        if (typeof renderRateProfileControls === 'function') renderRateProfileControls();
      }
    } else if (type === 'project') {
      await Store.db.marginProjects.remove(id);
      if (typeof marginProjects !== 'undefined') {
        marginProjects = marginProjects.filter(x => x.id !== id);
        if (typeof selectedProjectIds !== 'undefined') selectedProjectIds.delete(id);
        if (typeof editingProjectId !== 'undefined' && editingProjectId === id) {
          if (typeof resetMarginForm === 'function') resetMarginForm();
        }
        saveToolsState();
        if (typeof renderMarginList === 'function') renderMarginList();
        if (typeof renderMarginInsights === 'function') renderMarginInsights();
      }
    } else if (type === 'template') {
      await Store.db.userTemplates.remove(id);
      if (typeof invalidateUserTemplatesCache === 'function') invalidateUserTemplatesCache();
      if (typeof loadUserTemplates === 'function') await loadUserTemplates({ force: true });
      if (typeof renderGallery === 'function') renderGallery();
    }

    await refreshDriveCache();
    invalidateDriveCache();
    updateDriveBadge();
    if ($('#driveShell')) {
      _driveAllItems = await driveItems();
      updateDriveChips();
      renderDriveTable();
    }

    toastWithAction(
      `"${displayName}" moved to trash`,
      'Undo',
      async () => {
        try {
          if (trashRowId) {
            try { await Store.db.trash.remove(trashRowId); } catch (e) { console.warn(e.message); }
          }

          if (type === 'draft') {
            await Store.db.documents.create({
              name: rec.name,
              template_id: rec.templateId,
              template_name: rec.templateName,
              data: rec.data,
              contact_id: rec.contactId || null,
            });
          } else if (type === 'export') {
            await Store.db.exports.create({
              name: rec.name,
              filename: rec.filename,
              template_id: rec.templateId,
              template_name: rec.templateName,
              snapshot: rec.snapshot,
              contact_id: rec.contactId || null,
            });
          } else if (type === 'profile') {
            await Store.db.rateProfiles.create({ name: rec.name, data: rec.data });
            if (typeof loadRateProfilesFromCloud === 'function') await loadRateProfilesFromCloud();
          } else if (type === 'project') {
            await Store.db.marginProjects.create({
              name:           rec.name,
              client:         rec.client,
              contact_id:     rec.contactId || null,
              revenue:        rec.revenue,
              quoted_hours:   rec.quotedHours,
              actual_hours:   rec.actualHours,
              expenses:       rec.expenses,
              expenses_total: rec.expensesTotal,
              labor_cost:     rec.laborCost,
              margin:         rec.margin,
              margin_pct:     rec.marginPct,
              effective_rate: rec.effectiveRate,
              date:           rec.date || new Date().toISOString(),
            });
            if (typeof loadMarginProjectsFromCloud === 'function') await loadMarginProjectsFromCloud();
          } else if (type === 'template') {
            await Store.db.userTemplates.create({
              name:        rec.name,
              category:    rec.category || 'Custom',
              description: rec.desc || null,
              accent:      rec.accent || null,
              data: {
                doc:       rec.doc,
                brand:     rec.brand,
                meta:      rec.meta,
                sections:  rec.sections,
                signature: rec.signature,
              },
            });
            if (typeof invalidateUserTemplatesCache === 'function') invalidateUserTemplatesCache();
            if (typeof loadUserTemplates === 'function') await loadUserTemplates({ force: true });
            if (typeof renderGallery === 'function') renderGallery();
          }

          await refreshDriveCache();
          invalidateDriveCache();
          updateDriveBadge();
          if ($('#driveShell')) {
            _driveAllItems = await driveItems();
            updateDriveChips();
            renderDriveTable();
          }
          if (typeof renderRateView === 'function' && $('#view-rate')?.classList.contains('active')) {
            renderRateView();
          }
          if (typeof renderMarginView === 'function' && $('#view-margin')?.classList.contains('active')) {
            renderMarginView();
          }
          toast('Restored');
        } catch (e) {
          console.warn('undo failed:', e);
          toast('Could not undo: ' + e.message);
        }
      },
      6000
    );
  } catch (e) {
    console.warn('moveToTrashWithUndo failed:', e.message);
    toast('Could not delete: ' + e.message);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   DRIVE — open / delete / duplicate / rename
   ══════════════════════════════════════════════════════════════════════ */
async function openDriveItem(type, id) {
  if (type === 'draft' || type === 'export') {
    const list = type === 'draft' ? await loadDrafts() : await loadExports();
    const rec = list.find(x => x.id === id);
    if (!rec) { toast('Item not found'); return; }
    const data = rec.data || rec.snapshot;
    if (!data) { toast('Item is empty'); return; }

    studio = {
      templateId: rec.templateId,
      editTemplateId: null,
      draftId: type === 'draft' ? rec.id : null,
      draftName: type === 'draft' ? rec.name : null,
      contactId: rec.contactId || null,
      doc:       clone(data.doc || {}),
      brand:     clone(data.brand || DEFAULT_BRAND),
      meta:      clone(data.meta || []),
      sections:  clone(data.sections || []),
      signature: clone(data.signature || { mode: 'none', dataUrl: null, scale: 1, slot: 'freelancer' }),
    };
    isStudioDirty = false; // Reset dirty flag on open
    renderWorkspace();
    showView('workspace');
    requestAnimationFrame(fitPreview);
    toast(type === 'draft' ? 'Draft opened' : 'Export restored');
    return;
  }
  if (type === 'profile') {
    if (typeof loadRateProfile === 'function') loadRateProfile(id);
    showView('rate');
    return;
  }
  if (type === 'project') {
    if (typeof editMarginProject === 'function') editMarginProject(id);
    showView('margin');
    return;
  }
}

async function deleteDriveItem(type, id) {
  let rec;
  if (type === 'draft')        rec = (await loadDrafts()).find(x => x.id === id);
  else if (type === 'export')  rec = (await loadExports()).find(x => x.id === id);
  else if (type === 'profile') rec = (typeof rateProfiles !== 'undefined' ? rateProfiles : []).find(x => x.id === id);
  else if (type === 'project') rec = (typeof marginProjects !== 'undefined' ? marginProjects : []).find(x => x.id === id);
  if (!rec) return;
  await moveToTrashWithUndo(type, id, rec);
}

async function duplicateDriveItem(type, id) {
  try {
    if (type === 'draft' || type === 'export') {
      const list = type === 'draft' ? await loadDrafts() : await loadExports();
      const rec = list.find(x => x.id === id);
      if (!rec) return;
      const names = list.map(x => x.name);
      const newName = uniqueNameLocal(rec.name, names);
      if (type === 'draft') {
        await Store.db.documents.create({
          name: newName,
          template_id: rec.templateId,
          template_name: rec.templateName,
          data: rec.data,
          contact_id: rec.contactId || null,
        });
      } else {
        await Store.db.exports.create({
          name: newName,
          filename: rec.filename,
          template_id: rec.templateId,
          template_name: rec.templateName,
          snapshot: rec.snapshot,
          contact_id: rec.contactId || null,
        });
      }
    } else if (type === 'profile') {
      const rec = (typeof rateProfiles !== 'undefined' ? rateProfiles : []).find(x => x.id === id);
      if (!rec) return;
      const names = rateProfiles.map(x => x.name);
      const copy = {
        id: uid(),
        name: uniqueNameLocal(rec.name, names),
        data: clone(rec.data),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      rateProfiles.push(copy);
      saveToolsState();
    } else if (type === 'project') {
      if (typeof duplicateMarginProject === 'function') duplicateMarginProject(id);
    }
    await refreshDriveCache();
    invalidateDriveCache();
    updateDriveBadge();
    if ($('#driveShell')) {
      _driveAllItems = await driveItems();
      updateDriveChips();
      renderDriveTable();
    }
    toast('Duplicated');
  } catch (e) {
    console.warn('duplicateDriveItem failed:', e.message);
    toast('Could not duplicate');
  }
}

async function renameDriveItem(type, id) {
  let rec;
  if (type === 'draft')        rec = (await loadDrafts()).find(x => x.id === id);
  else if (type === 'export')  rec = (await loadExports()).find(x => x.id === id);
  else if (type === 'profile') rec = (typeof rateProfiles !== 'undefined' ? rateProfiles : []).find(x => x.id === id);
  else if (type === 'project') rec = (typeof marginProjects !== 'undefined' ? marginProjects : []).find(x => x.id === id);
  if (!rec) return;

  const next = prompt('Rename', rec.name);
  if (next === null) return;
  const trimmed = (next || '').trim();
  if (!trimmed) return;

  try {
    if (type === 'draft') {
      await Store.db.documents.update(id, { name: trimmed });
      if (studio && studio.draftId === id) {
        studio.draftName = trimmed;
        updateDraftIndicator();
      }
    } else if (type === 'export') {
      await Store.db.exports.update(id, { name: trimmed });
    } else {
      rec.name = trimmed;
      saveToolsState();
      if (typeof renderRateProfileControls === 'function') renderRateProfileControls();
      if (typeof renderMarginList === 'function') renderMarginList();
    }
    await refreshDriveCache();
    invalidateDriveCache();
    if ($('#driveShell')) {
      _driveAllItems = await driveItems();
      updateDriveChips();
      renderDriveTable();
    }
    toast('Renamed');
  } catch (e) {
    console.warn('renameDriveItem failed:', e.message);
    toast('Could not rename');
  }
}

function uniqueNameLocal(base, existing) {
  base = (base || 'Untitled').trim() || 'Untitled';
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

/* ══════════════════════════════════════════════════════════════════════
   BULK DELETE — with undo
   ══════════════════════════════════════════════════════════════════════ */
async function bulkDeleteDriveItems(keys) {
  if (!keys.length) return 0;

  const byType = { draft: [], export: [], profile: [], project: [], template: [] };
  keys.forEach(key => {
    const [type, id] = key.split(':');
    if (byType[type]) byType[type].push(id);
  });

  const drafts  = await loadDrafts();
  const exports = await loadExports();

  const entries = [];
  byType.draft.forEach(id => {
    const rec = drafts.find(x => x.id === id);
    if (rec) entries.push({ type: 'draft', id, rec });
  });
  byType.export.forEach(id => {
    const rec = exports.find(x => x.id === id);
    if (rec) entries.push({ type: 'export', id, rec });
  });
  byType.profile.forEach(id => {
    const rec = (typeof rateProfiles !== 'undefined' ? rateProfiles : []).find(x => x.id === id);
    if (rec) entries.push({ type: 'profile', id, rec });
  });
  byType.project.forEach(id => {
    const rec = (typeof marginProjects !== 'undefined' ? marginProjects : []).find(x => x.id === id);
    if (rec) entries.push({ type: 'project', id, rec });
  });

  if (!entries.length) return 0;

  const trashRowIds = [];
  for (const e of entries) {
    try {
      const t = await Store.db.trash.create({
        kind:   e.type,
        name:   e.rec.name,
        record: clone(e.rec),
      });
      trashRowIds.push(t.id);
    } catch (err) { console.warn('trash insert failed:', err.message); }
  }

  for (const id of byType.draft)   { try { await Store.db.documents.remove(id); }      catch (e) { console.warn(e.message); } }
  for (const id of byType.export)  { try { await Store.db.exports.remove(id); }        catch (e) { console.warn(e.message); } }
  for (const id of byType.profile) { try { await Store.db.rateProfiles.remove(id); }   catch (e) { console.warn(e.message); } }
  for (const id of byType.project) { try { await Store.db.marginProjects.remove(id); } catch (e) { console.warn(e.message); } }

  if (byType.draft.length && studio && byType.draft.includes(studio.draftId)) {
    studio.draftId = null;
    studio.draftName = null;
    updateDraftIndicator();
  }

  if (byType.profile.length && typeof rateProfiles !== 'undefined') {
    rateProfiles = rateProfiles.filter(x => !byType.profile.includes(x.id));
    if (typeof activeRateProfileId !== 'undefined' && byType.profile.includes(activeRateProfileId)) {
      activeRateProfileId = null;
    }
    saveToolsState();
    if (typeof renderRateProfileControls === 'function') renderRateProfileControls();
  }
  if (byType.project.length && typeof marginProjects !== 'undefined') {
    marginProjects = marginProjects.filter(x => !byType.project.includes(x.id));
    byType.project.forEach(id => { if (typeof selectedProjectIds !== 'undefined') selectedProjectIds.delete(id); });
    byType.project.forEach(id => {
      if (typeof editingProjectId !== 'undefined' && editingProjectId === id) {
        if (typeof resetMarginForm === 'function') resetMarginForm();
      }
    });
    saveToolsState();
    if (typeof renderMarginList === 'function') renderMarginList();
    if (typeof renderMarginInsights === 'function') renderMarginInsights();
  }

  await refreshDriveCache();

  toastWithAction(
    `${entries.length} item${entries.length === 1 ? '' : 's'} moved to trash`,
    'Undo',
    async () => {
      try {
        for (const tid of trashRowIds) {
          try { await Store.db.trash.remove(tid); } catch (e) { console.warn(e.message); }
        }
        for (const e of entries) {
          try {
            if (e.type === 'draft') {
              await Store.db.documents.create({
                name: e.rec.name,
                template_id: e.rec.templateId,
                template_name: e.rec.templateName,
                data: e.rec.data,
                contact_id: e.rec.contactId || null,
              });
            } else if (e.type === 'export') {
              await Store.db.exports.create({
                name: e.rec.name,
                filename: e.rec.filename,
                template_id: e.rec.templateId,
                template_name: e.rec.templateName,
                snapshot: e.rec.snapshot,
                contact_id: e.rec.contactId || null,
              });
            } else if (e.type === 'profile') {
              await Store.db.rateProfiles.create({ name: e.rec.name, data: e.rec.data });
            } else if (e.type === 'project') {
              await Store.db.marginProjects.create({
                name: e.rec.name,
                client: e.rec.client,
                contact_id: e.rec.contactId || null,
                revenue: e.rec.revenue,
                quoted_hours: e.rec.quotedHours,
                actual_hours: e.rec.actualHours,
                expenses: e.rec.expenses,
                expenses_total: e.rec.expensesTotal,
                labor_cost: e.rec.laborCost,
                margin: e.rec.margin,
                margin_pct: e.rec.marginPct,
                effective_rate: e.rec.effectiveRate,
                date: e.rec.date || new Date().toISOString(),
              });
            }
          } catch (err) { console.warn('restore entry failed:', err.message); }
        }
        if (typeof loadRateProfilesFromCloud === 'function')   await loadRateProfilesFromCloud();
        if (typeof loadMarginProjectsFromCloud === 'function') await loadMarginProjectsFromCloud();
        await refreshDriveCache();
        invalidateDriveCache();
        updateDriveBadge();
        if ($('#driveShell')) {
          _driveAllItems = await driveItems();
          updateDriveChips();
          renderDriveTable();
        }
        toast('Restored');
      } catch (err) {
        toast('Could not undo: ' + err.message);
      }
    },
    6000
  );

  return entries.length;
}

/* ══════════════════════════════════════════════════════════════════════
   BULK RESTORE / HARD DELETE
   ══════════════════════════════════════════════════════════════════════ */
async function bulkRestoreFromTrash(trashIds) {
  if (!trashIds.length) return 0;
  const trash = await loadTrash();
  const toRestore = trash.filter(x => trashIds.includes(x.id));
  if (!toRestore.length) return 0;

  let restored = 0;
  for (const item of toRestore) {
    try {
      const rec = item.record;
      if (item.kind === 'draft') {
        await Store.db.documents.create({
          name: rec.name || 'Untitled',
          template_id: rec.templateId,
          template_name: rec.templateName,
          data: rec.data,
          contact_id: rec.contactId || null,
        });
      } else if (item.kind === 'export') {
        await Store.db.exports.create({
          name: rec.name || 'Untitled',
          filename: rec.filename,
          template_id: rec.templateId,
          template_name: rec.templateName,
          snapshot: rec.snapshot,
          contact_id: rec.contactId || null,
        });
      } else if (item.kind === 'profile') {
        await Store.db.rateProfiles.create({ name: rec.name, data: rec.data });
        if (typeof loadRateProfilesFromCloud === 'function') await loadRateProfilesFromCloud();
      } else if (item.kind === 'project') {
        await Store.db.marginProjects.create({
          name: rec.name,
          client: rec.client,
          contact_id: rec.contactId || null,
          revenue: rec.revenue,
          quoted_hours: rec.quotedHours,
          actual_hours: rec.actualHours,
          expenses: rec.expenses,
          expenses_total: rec.expensesTotal,
          labor_cost: rec.laborCost,
          margin: rec.margin,
          margin_pct: rec.marginPct,
          effective_rate: rec.effectiveRate,
          date: rec.date || new Date().toISOString(),
        });
        if (typeof loadMarginProjectsFromCloud === 'function') await loadMarginProjectsFromCloud();
      } else if (item.kind === 'template') {
        await Store.db.userTemplates.create({
          name:        rec.name,
          category:    rec.category || 'Custom',
          description: rec.desc || null,
          accent:      rec.accent || null,
          data: {
            doc:       rec.doc,
            brand:     rec.brand,
            meta:      rec.meta,
            sections:  rec.sections,
            signature: rec.signature,
          },
        });
        if (typeof invalidateUserTemplatesCache === 'function') invalidateUserTemplatesCache();
        if (typeof loadUserTemplates === 'function') await loadUserTemplates({ force: true });
        if (typeof renderGallery === 'function') renderGallery();
      } else if (item.kind === 'note') {
        await Store.db.notes.create({
          title:      rec.title || 'Untitled note',
          content:    rec.content || '',
          pinned:     !!rec.pinned,
          contact_id: rec.contactId || null,
          project_id: rec.projectId || null,
        });
        if (typeof invalidateNotesCache === 'function') invalidateNotesCache();
        if (typeof loadNotes === 'function') await loadNotes(true);
        if (typeof updateNotesBadge === 'function') updateNotesBadge();
      } else if (item.kind === 'contact') {
        await Store.db.contacts.create({
          name:        rec.name || 'Untitled',
          company:     rec.company || null,
          email:       rec.email || null,
          phone:       rec.phone || null,
          address:     rec.address || null,
          website:     rec.website || null,
          role:        rec.role || null,
          notes:       rec.notes || null,
          tags:        Array.isArray(rec.tags) ? rec.tags : [],
          avatar_path: rec.avatarPath || null,   
        });
        if (typeof invalidateContactsCache === 'function') invalidateContactsCache();
        if (typeof loadContacts === 'function') await loadContacts(true);
        if (typeof updateContactsBadge === 'function') updateContactsBadge();
      } else if (item.kind === 'page') {
        await Store.db.pages.create({
          title:      rec.title || 'Untitled page',
          icon:       rec.icon || null,
          blocks:     Array.isArray(rec.blocks) ? rec.blocks : [],
          pinned:     !!rec.pinned,
          contact_id: rec.contactId || null,
          project_id: rec.projectId || null,
        });
        if (typeof invalidatePagesCache === 'function') invalidatePagesCache();
        if (typeof loadPages === 'function') await loadPages(true);
        if (typeof updatePagesBadge === 'function') updatePagesBadge();
      } else if (item.kind === 'page_template') {
        await Store.db.pageTemplates.create({
          name:        rec.name || 'Untitled template',
          description: rec.description || null,
          icon:        rec.icon || null,
          blocks:      Array.isArray(rec.blocks) ? rec.blocks : [],
        });
      }
      await Store.db.trash.remove(item.id);
      restored++;
    } catch (e) { console.warn('restore failed:', e.message); }
  }

  await refreshDriveCache();
  invalidateDriveCache();
  return restored;
}

async function bulkDeleteFromTrashForever(trashIds) {
  if (!trashIds.length) return 0;

  const trash = await loadTrash();
  const items = trash.filter(function (x) { return trashIds.indexOf(x.id) !== -1; });

  for (const item of items) {
    if (item.kind === 'contact' && item.record && item.record.avatarPath) {
      try { await Store.storage.deleteLogo(item.record.avatarPath); } catch (e) {}
      if (typeof _signedUrlCache !== 'undefined') delete _signedUrlCache[item.record.avatarPath];
    }
  }

  let removed = 0;
  for (const id of trashIds) {
    try { await Store.db.trash.remove(id); removed++; } catch (e) { console.warn(e.message); }
  }
  await refreshDriveCache();
  return removed;
}

/* ══════════════════════════════════════════════════════════════════════
   DRIVE STATE
   ══════════════════════════════════════════════════════════════════════ */
let driveFilter   = 'all';
let driveSearch   = '';
let driveSelected = new Set();
let trashSelected = new Set();

const DRIVE_FILTERS = [
  { key: 'all',     label: 'All' },
  { key: 'draft',   label: 'Documents' },
  { key: 'export',  label: 'Exports' },
  { key: 'profile', label: 'Profiles' },
  { key: 'project', label: 'Projects' },
];

const DRIVE_TYPE_LABEL = {
  draft:         'Document',
  export:        'Export',
  profile:       'Profile',
  project:       'Project',
  template:      'Template',
  note:          'Note',
  contact:       'Contact',
  page:          'Page',
  page_template: 'Page Template',
};

async function driveItems() {
  const [drafts, exports] = await Promise.all([loadDrafts(), loadExports()]);
  const items = [];

  drafts.forEach(d => items.push({
    type: 'draft', id: d.id, name: d.name,
    sub:  d.templateName || 'Document',
    meta: formatWhen(d.savedAt),
    when: d.savedAt,
  }));
  exports.forEach(e => items.push({
    type: 'export', id: e.id, name: e.name,
    sub:  `${e.templateName || 'Document'} · PDF`,
    meta: formatWhen(e.exportedAt),
    when: e.exportedAt,
  }));
  (typeof rateProfiles !== 'undefined' ? rateProfiles : []).forEach(p => {
    const d = p.data || {};
    items.push({
      type: 'profile', id: p.id, name: p.name,
      sub:  `Rate profile · ${d.currency || 'USD'}`,
      meta: formatWhen(p.updatedAt || p.createdAt),
      when: p.updatedAt || p.createdAt,
    });
  });
  (typeof marginProjects !== 'undefined' ? marginProjects : []).forEach(p => {
    items.push({
      type: 'project', id: p.id, name: p.name,
      sub:  `Project · ${p.client || 'No client'}`,
      meta: formatWhen(p.date),
      when: p.date,
    });
  });

  return items.sort((a, b) => (b.when || '').localeCompare(a.when || ''));
}

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ══════════════════════════════════════════════════════════════════════
   DRIVE VIEW
   ══════════════════════════════════════════════════════════════════════ */
async function renderDriveView(options = {}) {
  const host = $('#view-drive');
  if (!host) return;

  const forceRefresh = !!options.forceRefresh;
  const hasShell = !!host.querySelector('#driveShell');

  if (!hasShell) {
    host.innerHTML = buildDriveShellHTML();
    wireDriveShell();
  }

  const needsFetch = forceRefresh || _driveAllItems.length === 0;
  if (needsFetch) {
    showDriveSkeleton();
    await refreshDriveCache();
    _driveAllItems = await driveItems();
  }

  updateDriveChips();
  renderDriveTable();
}

function buildDriveShellHTML() {
  return ''
    + '<div class="tool-page" id="driveShell">'
      + '<div class="tool-head" style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap">'
        + '<div style="min-width:0;flex:1">'
          + '<h1>Drive</h1>'
          + '<p>Everything you\'ve saved — documents, exports, rate profiles, and projects — in one place.</p>'
        + '</div>'
        + '<button class="icon-btn refresh-btn" id="driveRefresh" title="Refresh" aria-label="Refresh">'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
            + '<polyline points="23 4 23 10 17 10"/>'
            + '<polyline points="1 20 1 14 7 14"/>'
            + '<path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>'
          + '</svg>'
        + '</button>'
      + '</div>'
      + '<div class="drive-toolbar">'
        + '<input type="search" class="list-search" id="driveSearch" placeholder="Search…" value="' + esc(driveSearch) + '" autocomplete="off">'
        + '<div class="chip-row" id="driveChips"></div>'
      + '</div>'
      + '<div id="driveSelectionHost"></div>'
      + '<div class="card" id="driveTableCard" style="padding:0;overflow:hidden"></div>'
    + '</div>';
}

function wireDriveShell() {
  document.querySelector('#driveRefresh')?.addEventListener('click', refreshDriveNow);
  document.querySelector('#driveSearch')?.addEventListener('input', function (e) {
    driveSearch = e.target.value;
    renderDriveTable();
  });
  document.querySelector('#driveChips')?.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    driveFilter = chip.dataset.filter;
    driveSelected.clear();
    updateDriveChips();
    renderDriveTable();
  });
}

function showDriveSkeleton() {
  var cardHost = document.querySelector('#driveTableCard');
  var selHost  = document.querySelector('#driveSelectionHost');
  var chipsHost = document.querySelector('#driveChips');
  if (cardHost) cardHost.innerHTML = skeletonList(6);
  if (selHost) selHost.innerHTML = '';
  if (chipsHost) chipsHost.innerHTML = '';
}

async function refreshDriveNow() {
  const btn = document.querySelector('#driveRefresh');
  if (btn) btn.classList.add('spinning');
  showDriveSkeleton();
  const t0 = Date.now();
  try {
    await refreshDriveCache();
    _driveAllItems = await driveItems();
    updateDriveChips();
    renderDriveTable();
    updateDriveBadge();
    const dt = Date.now() - t0;
    if (dt > 300) toast('Refreshed');
  } catch (e) {
    toast('Could not refresh: ' + e.message);
  } finally {
    if (btn) setTimeout(() => btn.classList.remove('spinning'), 300);
  }
}

function updateDriveChips() {
  const host = $('#driveChips');
  if (!host) return;
  host.innerHTML = DRIVE_FILTERS.map(f => {
    const n = f.key === 'all'
      ? _driveAllItems.length
      : _driveAllItems.filter(i => i.type === f.key).length;
    return `<button class="chip ${driveFilter === f.key ? 'active' : ''}" data-filter="${f.key}">${esc(f.label)}<span class="cnt">${n}</span></button>`;
  }).join('');
}

function getVisibleDriveItems() {
  let items = _driveAllItems;
  if (driveFilter !== 'all') items = items.filter(i => i.type === driveFilter);
  if (driveSearch) {
    const q = driveSearch.toLowerCase();
    items = items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.sub || '').toLowerCase().includes(q));
  }
  return items;
}

function renderDriveTable() {
  const selHost  = $('#driveSelectionHost');
  const cardHost = $('#driveTableCard');
  if (!selHost || !cardHost) return;

  const items = getVisibleDriveItems();

  const visibleKeys = new Set(items.map(i => `${i.type}:${i.id}`));
  driveSelected.forEach(k => { if (!visibleKeys.has(k)) driveSelected.delete(k); });

  const selCount = driveSelected.size;
  const allSelected = items.length > 0 && items.every(i => driveSelected.has(`${i.type}:${i.id}`));

  selHost.innerHTML = items.length > 0 ? `
    <div class="selection-bar">
      <div class="count"><strong>${selCount}</strong> selected</div>
      <button class="btn sm" id="driveSelSelectAll">${allSelected ? 'Deselect all' : 'Select all'}</button>
      <button class="btn sm" id="driveSelClear" ${selCount === 0 ? 'disabled' : ''}>Clear</button>
      <button class="btn sm danger" id="driveSelDelete" ${selCount === 0 ? 'disabled' : ''}>Delete selected</button>
    </div>
  ` : '';

  cardHost.innerHTML = items.length === 0
    ? `<div class="tool-empty" style="margin:16px">${_driveAllItems.length === 0 ? 'Nothing saved yet. Save a draft, export a document, or track a project and it will appear here.' : 'No items match this filter.'}</div>`
    : `
      <table class="data-table">
        <thead><tr>
          <th class="center" style="width:36px"><input type="checkbox" id="driveSelAllCb" ${allSelected ? 'checked' : ''}></th>
          <th style="width:100px">Type</th>
          <th style="min-width:180px">Name</th>
          <th>Details</th>
          <th style="width:120px">Saved</th>
          <th style="text-align:right;width:170px">Actions</th>
        </tr></thead>
        <tbody>
          ${items.map(i => {
            const key = `${i.type}:${i.id}`;
            const checked = driveSelected.has(key) ? ' checked' : '';
            return `
            <tr data-type="${i.type}" data-id="${i.id}">
              <td class="center"><input type="checkbox" class="row-cb" data-key="${esc(key)}"${checked}></td>
              <td><span class="type-badge ${i.type}">${esc(DRIVE_TYPE_LABEL[i.type])}</span></td>
              <td><span style="font-weight:700;color:var(--ink)">${esc(i.name)}</span></td>
              <td><span class="text-muted text-sm">${esc(i.sub)}</span></td>
              <td><span class="text-muted text-sm">${esc(i.meta)}</span></td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn" data-act="open" title="Open">
                    <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
                  </button>
                  <button class="icon-btn" data-act="duplicate" title="Duplicate">
                    <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  </button>
                  <button class="icon-btn" data-act="rename" title="Rename">
                    <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  </button>
                  <button class="icon-btn danger" data-act="delete" title="Delete">
                    <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                  </button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;

  wireDriveSelectionBar(items);
  wireDriveTableRows(items, cardHost);
}

function updateDriveSelectionUI() {
  const selHost  = $('#driveSelectionHost');
  const cardHost = $('#driveTableCard');
  if (!selHost || !cardHost) return;

  const items = getVisibleDriveItems();
  const selCount = driveSelected.size;
  const allSelected = items.length > 0 && items.every(i => driveSelected.has(`${i.type}:${i.id}`));

  const countEl = selHost.querySelector('.count strong');
  if (countEl) countEl.textContent = selCount;
  const clearBtn = selHost.querySelector('#driveSelClear');
  if (clearBtn) clearBtn.disabled = selCount === 0;
  const delBtn = selHost.querySelector('#driveSelDelete');
  if (delBtn) delBtn.disabled = selCount === 0;
  const selectAllBtn = selHost.querySelector('#driveSelSelectAll');
  if (selectAllBtn) selectAllBtn.textContent = allSelected ? 'Deselect all' : 'Select all';
  const allCb = cardHost.querySelector('#driveSelAllCb');
  if (allCb) {
    allCb.checked = allSelected;
    allCb.indeterminate = !allSelected && selCount > 0;
  }
}

function wireDriveSelectionBar(items) {
  const selHost = $('#driveSelectionHost');
  if (!selHost) return;

  selHost.querySelector('#driveSelSelectAll')?.addEventListener('click', () => {
    const allSelected = items.length > 0 && items.every(i => driveSelected.has(`${i.type}:${i.id}`));
    if (allSelected) driveSelected.clear();
    else items.forEach(i => driveSelected.add(`${i.type}:${i.id}`));
    const cardHost = $('#driveTableCard');
    cardHost?.querySelectorAll('.row-cb').forEach(cb => {
      cb.checked = driveSelected.has(cb.dataset.key);
    });
    updateDriveSelectionUI();
  });

  selHost.querySelector('#driveSelClear')?.addEventListener('click', () => {
    driveSelected.clear();
    $('#driveTableCard')?.querySelectorAll('.row-cb').forEach(cb => { cb.checked = false; });
    updateDriveSelectionUI();
  });

  selHost.querySelector('#driveSelDelete')?.addEventListener('click', async () => {
    const n = driveSelected.size;
    if (!n) return;
    const keys = Array.from(driveSelected);
    driveSelected.clear();
    const moved = await bulkDeleteDriveItems(keys);
    await refreshDriveCache();
    _driveAllItems = await driveItems();
    updateDriveBadge();
    updateDriveChips();
    renderDriveTable();
  });
}

function wireDriveTableRows(items, cardHost) {
  const allCb = cardHost.querySelector('#driveSelAllCb');
  if (allCb) {
    allCb.addEventListener('change', e => {
      if (e.target.checked) items.forEach(i => driveSelected.add(`${i.type}:${i.id}`));
      else driveSelected.clear();
      cardHost.querySelectorAll('.row-cb').forEach(cb => {
        cb.checked = driveSelected.has(cb.dataset.key);
      });
      updateDriveSelectionUI();
    });
  }

  cardHost.querySelectorAll('.row-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.key;
      if (cb.checked) driveSelected.add(key);
      else driveSelected.delete(key);
      updateDriveSelectionUI();
    });
  });

  cardHost.querySelectorAll('tr[data-type]').forEach(row => {
    const type = row.dataset.type;
    const id   = row.dataset.id;
    row.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === 'open')      openDriveItem(type, id);
        if (act === 'duplicate') duplicateDriveItem(type, id);
        if (act === 'rename')    renameDriveItem(type, id);
        if (act === 'delete')    deleteDriveItem(type, id);
      });
    });
  });
}

/* ══════════════════════════════════════════════════════════════════════
   TRASH VIEW
   ══════════════════════════════════════════════════════════════════════ */
let _trashItems = [];

async function renderTrashView() {
  const host = $('#view-trash');
  if (!host) return;

    host.innerHTML = '<div class="tool-page">' + skeletonList(5) + '</div>';

  _trashItems = (await loadTrash()).sort((a, b) =>
    (b.deletedAt || '').localeCompare(a.deletedAt || ''));

  const visibleIds = new Set(_trashItems.map(t => t.id));
  trashSelected.forEach(id => { if (!visibleIds.has(id)) trashSelected.delete(id); });

  const items = _trashItems;
  const selCount = trashSelected.size;
  const allSelected = items.length > 0 && items.every(t => trashSelected.has(t.id));

  host.innerHTML = `
    <div class="tool-page">
      <div class="tool-head" style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap">
        <div style="min-width:0;flex:1">
          <h1>Trash</h1>
          <p>Deleted items stay here until you restore them or empty the trash.</p>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          <button class="icon-btn refresh-btn" id="trashRefresh" title="Refresh" aria-label="Refresh">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          ${items.length ? `<button class="btn danger sm" id="btnEmptyTrash">Empty trash</button>` : ''}
        </div>
      </div>

      <div id="trashSelectionHost">
        ${items.length > 0 ? `
          <div class="selection-bar">
            <div class="count"><strong>${selCount}</strong> selected</div>
            <button class="btn sm" id="trashSelSelectAll">${allSelected ? 'Deselect all' : 'Select all'}</button>
            <button class="btn sm" id="trashSelClear" ${selCount === 0 ? 'disabled' : ''}>Clear</button>
            <button class="btn sm primary" id="trashSelRestore" ${selCount === 0 ? 'disabled' : ''}>Restore selected</button>
            <button class="btn sm danger" id="trashSelDelete" ${selCount === 0 ? 'disabled' : ''}>Delete forever</button>
          </div>
        ` : ''}
      </div>

      <div class="card" id="trashTableCard" style="padding:0;overflow:hidden">
        ${items.length === 0
          ? `<div class="tool-empty" style="margin:16px">Trash is empty.</div>`
          : `
          <table class="data-table">
            <thead><tr>
              <th class="center" style="width:36px"><input type="checkbox" id="trashSelAllCb" ${allSelected ? 'checked' : ''}></th>
              <th style="width:100px">Type</th>
              <th style="min-width:180px">Name</th>
              <th style="width:140px">Deleted</th>
              <th style="text-align:right;width:120px">Actions</th>
            </tr></thead>
            <tbody>
              ${items.map(t => {
                const checked = trashSelected.has(t.id) ? ' checked' : '';
                return `
                <tr data-id="${t.id}">
                  <td class="center"><input type="checkbox" class="row-cb" data-id="${t.id}"${checked}></td>
                  <td><span class="type-badge ${t.kind}">${esc(DRIVE_TYPE_LABEL[t.kind] || t.kind)}</span></td>
                  <td><span style="font-weight:700;color:var(--ink)">${esc(t.name)}</span></td>
                  <td><span class="text-muted text-sm">${esc(formatWhen(t.deletedAt))}</span></td>
                  <td>
                    <div class="row-actions">
                      <button class="icon-btn" data-act="restore" title="Restore">
                        <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                      </button>
                      <button class="icon-btn danger" data-act="forever" title="Delete forever">
                        <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `;

  host.querySelector('#trashRefresh')?.addEventListener('click', async () => {
    const btn = $('#trashRefresh');
    if (btn) btn.classList.add('spinning');
    const t0 = Date.now();
    await renderTrashView();
    const dt = Date.now() - t0;
    const btn2 = $('#trashRefresh');
    if (btn2) setTimeout(() => btn2.classList.remove('spinning'), 300);
    if (dt > 300) toast('Refreshed');
  });

  const selHost = $('#trashSelectionHost');
  const cardHost = $('#trashTableCard');

  cardHost.querySelector('#trashSelAllCb')?.addEventListener('change', e => {
    if (e.target.checked) items.forEach(t => trashSelected.add(t.id));
    else trashSelected.clear();
    cardHost.querySelectorAll('.row-cb').forEach(cb => { cb.checked = trashSelected.has(cb.dataset.id); });
    updateTrashSelectionUI();
  });

  cardHost.querySelectorAll('.row-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.id;
      if (cb.checked) trashSelected.add(id);
      else trashSelected.delete(id);
      updateTrashSelectionUI();
    });
  });

  selHost.querySelector('#trashSelSelectAll')?.addEventListener('click', () => {
    const allSelectedNow = items.length > 0 && items.every(t => trashSelected.has(t.id));
    if (allSelectedNow) trashSelected.clear();
    else items.forEach(t => trashSelected.add(t.id));
    cardHost.querySelectorAll('.row-cb').forEach(cb => { cb.checked = trashSelected.has(cb.dataset.id); });
    updateTrashSelectionUI();
  });

  selHost.querySelector('#trashSelClear')?.addEventListener('click', () => {
    trashSelected.clear();
    cardHost.querySelectorAll('.row-cb').forEach(cb => { cb.checked = false; });
    updateTrashSelectionUI();
  });

  selHost.querySelector('#trashSelRestore')?.addEventListener('click', async () => {
    const n = trashSelected.size;
    if (!n) return;
    const ids = Array.from(trashSelected);
    trashSelected.clear();
    const restored = await bulkRestoreFromTrash(ids);
    updateDriveBadge();
    renderTrashView();
    toast(`Restored ${restored} item${restored === 1 ? '' : 's'}`);
  });

  selHost.querySelector('#trashSelDelete')?.addEventListener('click', async () => {
    const n = trashSelected.size;
    if (!n) return;
    if (!confirm(`Permanently delete ${n} item${n === 1 ? '' : 's'}? This cannot be undone.`)) return;
    const ids = Array.from(trashSelected);
    trashSelected.clear();
    const removed = await bulkDeleteFromTrashForever(ids);
    updateDriveBadge();
    renderTrashView();
    toast(`Deleted ${removed} item${removed === 1 ? '' : 's'}`);
  });

  cardHost.querySelectorAll('tr[data-id]').forEach(row => {
    const id = row.dataset.id;
    row.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'restore') {
          await bulkRestoreFromTrash([id]);
          updateDriveBadge();
          renderTrashView();
          toast('Restored');
        }
        if (act === 'forever') {
          const item = (await loadTrash()).find(x => x.id === id);
          if (!item) return;
          if (!confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
          await bulkDeleteFromTrashForever([id]);
          trashSelected.delete(id);
          updateDriveBadge();
          renderTrashView();
          toast('Deleted');
        }
      });
    });
  });

  host.querySelector('#btnEmptyTrash')?.addEventListener('click', async () => {
    if (!confirm('Permanently delete everything in the trash? This cannot be undone.')) return;
    try {
      const allItems = await loadTrash();
      for (const item of allItems) {
        if (item.kind === 'contact' && item.record && item.record.avatarPath) {
          try { await Store.storage.deleteLogo(item.record.avatarPath); } catch (e) {}
          if (typeof _signedUrlCache !== 'undefined') delete _signedUrlCache[item.record.avatarPath];
        }
      }

      await Store.db.trash.clear();
      trashSelected.clear();
      await refreshDriveCache();
      invalidateDriveCache();
      updateDriveBadge();
      renderTrashView();
      toast('Trash emptied');
    } catch (e) {
      toast('Could not empty trash: ' + e.message);
    }
  });
}

function updateTrashSelectionUI() {
  const selHost  = $('#trashSelectionHost');
  const cardHost = $('#trashTableCard');
  if (!selHost || !cardHost) return;

  const items = _trashItems;
  const selCount = trashSelected.size;
  const allSelected = items.length > 0 && items.every(t => trashSelected.has(t.id));

  const countEl = selHost.querySelector('.count strong');
  if (countEl) countEl.textContent = selCount;
  const clearBtn = selHost.querySelector('#trashSelClear');
  if (clearBtn) clearBtn.disabled = selCount === 0;
  const restoreBtn = selHost.querySelector('#trashSelRestore');
  if (restoreBtn) restoreBtn.disabled = selCount === 0;
  const deleteBtn = selHost.querySelector('#trashSelDelete');
  if (deleteBtn) deleteBtn.disabled = selCount === 0;
  const selectAllBtn = selHost.querySelector('#trashSelSelectAll');
  if (selectAllBtn) selectAllBtn.textContent = allSelected ? 'Deselect all' : 'Select all';

  const allCb = cardHost.querySelector('#trashSelAllCb');
  if (allCb) {
    allCb.checked = allSelected;
    allCb.indeterminate = !allSelected && selCount > 0;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════════ */
function initDrive() {
  if (!Store.isSignedIn()) return;
  refreshDriveCache().then(() => updateDriveBadge());
}

Store.whenAuthReady().then(() => {
  if (Store.isSignedIn()) initDrive();
});

Store.onAuthChange(user => {
  if (user) initDrive();
  else {
    invalidateDriveCache();
    _trashItems = [];
    const badge = $('#navBadgeDrive');
    if (badge) badge.hidden = true;
  }
});