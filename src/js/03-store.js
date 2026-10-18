/* ============================================================================
   03-store.js — Supabase client + data layer
   Owns: auth state, session, all DB reads/writes, all Storage uploads.
   Every other file talks to Supabase through this one.
   ============================================================================ */

/* ══════════════════════════════════════════════════════════════════════
   STORE — global singleton
   ══════════════════════════════════════════════════════════════════════ */
const Store = {
  client:  null,
  user:    null,
  session: null,
  ready:   false,
  _authListeners: [],
  _authReadyResolve: null,
  _authReadyPromise: null,
};

/* Resolves once Supabase has told us whether there's a session or not */
Store.whenAuthReady = function () {
  if (!Store._authReadyPromise) {
    Store._authReadyPromise = new Promise(resolve => {
      Store._authReadyResolve = resolve;
    });
  }
  return Store._authReadyPromise;
};

Store.onAuthChange = function (cb) {
  Store._authListeners.push(cb);
  /* Fire immediately with the current state */
  cb(Store.user, Store.session);
};

/* ══════════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════════ */
Store.init = async function () {
  if (Store.ready) return;

  if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) {
    console.error('Store: missing Supabase credentials in 01-config.js');
    return;
  }

  Store.client = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: {
      persistSession:     true,
      autoRefreshToken:   true,
      detectSessionInUrl: true,
      flowType:           'pkce',
    },
  });

  /* Initial session load */
  const { data: { session } } = await Store.client.auth.getSession();
  Store.session = session || null;
  Store.user    = session?.user || null;

  /* Listen for auth state changes */
  Store.client.auth.onAuthStateChange((event, newSession) => {
    Store.session = newSession || null;
    Store.user    = newSession?.user || null;
    Store._authListeners.forEach(cb => {
      try { cb(Store.user, Store.session); }
      catch (e) { console.warn('auth listener error:', e); }
    });
  });

  Store.ready = true;
  if (Store._authReadyResolve) Store._authReadyResolve();

  console.log('Store ready —', Store.user ? `signed in as ${Store.user.email}` : 'signed out');
};

Store.uid = function () {
  return Store.user?.id || null;
};

Store.isSignedIn = function () {
  return !!Store.user;
};

/* ══════════════════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════════════════ */
Store.auth = {

  async signUp(email, password) {
    const { data, error } = await Store.client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: CONFIG.authRedirectTo },
    });
    if (error) throw error;
    /* If email confirmation is on, data.session will be null */
    return {
      needsConfirmation: !data.session,
      user: data.user,
    };
  },

  async signIn(email, password) {
    const { data, error } = await Store.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signInWithGoogle() {
    const { data, error } = await Store.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: CONFIG.authRedirectTo,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await Store.client.auth.signOut();
    if (error) throw error;
  },

  async resetPassword(email) {
    const { error } = await Store.client.auth.resetPasswordForEmail(email, {
      redirectTo: CONFIG.authRedirectTo + '?reset=1',
    });
    if (error) throw error;
  },

  async updatePassword(newPassword) {
    const { error } = await Store.client.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  async resendConfirmation(email) {
    const { error } = await Store.client.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: CONFIG.authRedirectTo },
    });
    if (error) throw error;
  },
};

/* ══════════════════════════════════════════════════════════════════════
   DB HELPERS — generic CRUD against any table
   Every helper takes/returns plain objects. Auth user is auto-injected.
   ══════════════════════════════════════════════════════════════════════ */
Store.db = {

  /* Internal — generic list with ordering */
  async _list(table, { order = 'updated_at', ascending = false } = {}) {
    const uid = Store.uid();
    if (!uid) return [];
    const { data, error } = await Store.client
      .from(table)
      .select('*')
      .eq('user_id', uid)
      .order(order, { ascending });
    if (error) { console.warn(`${table}.list error:`, error.message); return []; }
    return data || [];
  },

  /* Internal — insert one row, inject user_id */
  async _create(table, row) {
    const uid = Store.uid();
    if (!uid) throw new Error('Not signed in');
    const payload = { ...row, user_id: uid };
    delete payload.id;               /* let DB generate uuid */
    const { data, error } = await Store.client
      .from(table)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /* Internal — update by id, scoped to user */
  async _update(table, id, patch) {
    const uid = Store.uid();
    if (!uid) throw new Error('Not signed in');
    delete patch.user_id;            /* never allow reassignment */
    const { data, error } = await Store.client
      .from(table)
      .update(patch)
      .eq('id', id)
      .eq('user_id', uid)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /* Internal — delete by id, scoped to user */
  async _delete(table, id) {
    const uid = Store.uid();
    if (!uid) throw new Error('Not signed in');
    const { error } = await Store.client
      .from(table)
      .delete()
      .eq('id', id)
      .eq('user_id', uid);
    if (error) throw error;
  },

  /* Internal — upsert many rows for bulk migration (localStorage → cloud) */
  async _bulkInsert(table, rows) {
    const uid = Store.uid();
    if (!uid || !rows.length) return [];
    const payload = rows.map(r => {
      const copy = { ...r, user_id: uid };
      /* If the row uses a non-uuid id (like 'user-xxx'), strip it so DB generates one */
      if (copy.id && !/^[0-9a-f-]{36}$/i.test(copy.id)) delete copy.id;
      return copy;
    });
    const { data, error } = await Store.client
      .from(table)
      .insert(payload)
      .select();
    if (error) { console.warn(`${table}.bulkInsert error:`, error.message); return []; }
    return data || [];
  },

  /* ── Profiles ─────────────────────────────────────────────────── */
  async getProfile() {
    const uid = Store.uid();
    if (!uid) return null;
    const { data, error } = await Store.client
      .from('profiles')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) { console.warn('getProfile error:', error.message); return null; }
    return data;
  },

  async updateProfile(patch) {
    const uid = Store.uid();
    if (!uid) throw new Error('Not signed in');
    const { data, error } = await Store.client
      .from('profiles')
      .upsert({ user_id: uid, ...patch }, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /* ── Rate profiles ────────────────────────────────────────────── */
  rateProfiles: {
    list:   ()       => Store.db._list('rate_profiles'),
    create: (row)    => Store.db._create('rate_profiles', row),
    update: (id, p)  => Store.db._update('rate_profiles', id, p),
    remove: (id)     => Store.db._delete('rate_profiles', id),
    bulk:   (rows)   => Store.db._bulkInsert('rate_profiles', rows),
  },

  /* ── Margin projects ──────────────────────────────────────────── */
  marginProjects: {
    list:   ()       => Store.db._list('margin_projects', { order: 'date' }),
    create: (row)    => Store.db._create('margin_projects', row),
    update: (id, p)  => Store.db._update('margin_projects', id, p),
    remove: (id)     => Store.db._delete('margin_projects', id),
    bulk:   (rows)   => Store.db._bulkInsert('margin_projects', rows),
  },

  /* ── Documents (drafts) ──────────────────────────────────────── */
  documents: {
    list:   ()       => Store.db._list('documents'),
    create: (row)    => Store.db._create('documents', row),
    update: (id, p)  => Store.db._update('documents', id, p),
    remove: (id)     => Store.db._delete('documents', id),
    bulk:   (rows)   => Store.db._bulkInsert('documents', rows),
  },

  /* ── Exports history ─────────────────────────────────────────── */
  exports: {
    list:   ()       => Store.db._list('exports', { order: 'exported_at' }),
    create: (row)    => Store.db._create('exports', row),
    update: (id, p)  => Store.db._update('exports', id, p),
    remove: (id)     => Store.db._delete('exports', id),
    bulk:   (rows)   => Store.db._bulkInsert('exports', rows),
  },

  /* ── User templates ──────────────────────────────────────────── */
  userTemplates: {
    list:   ()       => Store.db._list('user_templates'),
    create: (row)    => Store.db._create('user_templates', row),
    update: (id, p)  => Store.db._update('user_templates', id, p),
    remove: (id)     => Store.db._delete('user_templates', id),
    bulk:   (rows)   => Store.db._bulkInsert('user_templates', rows),
  },

  /* ── Contacts (ready for Drop 8) ─────────────────────────────── */
  contacts: {
    list:   ()       => Store.db._list('contacts', { order: 'name', ascending: true }),
    create: (row)    => Store.db._create('contacts', row),
    update: (id, p)  => Store.db._update('contacts', id, p),
    remove: (id)     => Store.db._delete('contacts', id),
    bulk:   (rows)   => Store.db._bulkInsert('contacts', rows),
  },

  /* ── Notes (ready for Drop 9) ────────────────────────────────── */
  notes: {
    list:   ()       => Store.db._list('notes'),
    create: (row)    => Store.db._create('notes', row),
    update: (id, p)  => Store.db._update('notes', id, p),
    remove: (id)     => Store.db._delete('notes', id),
    bulk:   (rows)   => Store.db._bulkInsert('notes', rows),
  },

  /* ── Pages (ready for Drop 10) ───────────────────────────────── */
  pages: {
    list:   ()       => Store.db._list('pages'),
    create: (row)    => Store.db._create('pages', row),
    update: (id, p)  => Store.db._update('pages', id, p),
    remove: (id)     => Store.db._delete('pages', id),
    bulk:   (rows)   => Store.db._bulkInsert('pages', rows),
  },

  pageTemplates: {
    list:   ()       => Store.db._list('page_templates'),
    create: (row)    => Store.db._create('page_templates', row),
    update: (id, p)  => Store.db._update('page_templates', id, p),
    remove: (id)     => Store.db._delete('page_templates', id),
    bulk:   (rows)   => Store.db._bulkInsert('page_templates', rows),
  },

  /* ── Trash ───────────────────────────────────────────────────── */
  trash: {
    list:   ()       => Store.db._list('trash', { order: 'deleted_at' }),
    create: (row)    => Store.db._create('trash', row),
    remove: (id)     => Store.db._delete('trash', id),
    clear:  async () => {
      const uid = Store.uid();
      if (!uid) throw new Error('Not signed in');
      const { error } = await Store.client.from('trash').delete().eq('user_id', uid);
      if (error) throw error;
    },
  },
};

/* ══════════════════════════════════════════════════════════════════════
   STORAGE — logos + exports
   Files are stored under: <bucket>/<user_id>/<filename>
   ══════════════════════════════════════════════════════════════════════ */
Store.storage = {

  async uploadLogo(file, ext) {
    const uid = Store.uid();
    if (!uid) throw new Error('Not signed in');
    const safeExt = (ext || file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${uid}/logo-${Date.now()}.${safeExt}`;
    const { error } = await Store.client.storage
      .from(CONFIG.storage.logos)
      .upload(path, file, { upsert: false, cacheControl: '3600' });
    if (error) throw error;
    return { path };
  },

  async deleteLogo(path) {
    if (!path) return;
    const { error } = await Store.client.storage.from(CONFIG.storage.logos).remove([path]);
    if (error) console.warn('deleteLogo error:', error.message);
  },

  /* Returns a signed URL valid for 1 hour — private bucket */
  async getLogoSignedUrl(path, expiresIn = 3600) {
    if (!path) return null;
    const { data, error } = await Store.client.storage
      .from(CONFIG.storage.logos)
      .createSignedUrl(path, expiresIn);
    if (error) { console.warn('getLogoSignedUrl error:', error.message); return null; }
    return data.signedUrl;
  },

  async uploadExport(blob, filename) {
    const uid = Store.uid();
    if (!uid) throw new Error('Not signed in');
    const safeName = String(filename || 'document.pdf').replace(/[^\w\-.]+/g, '_');
    const path = `${uid}/${Date.now()}-${safeName}`;
    const { error } = await Store.client.storage
      .from(CONFIG.storage.exports)
      .upload(path, blob, { upsert: false, contentType: 'application/pdf' });
    if (error) throw error;
    return { path };
  },

  async getExportSignedUrl(path, expiresIn = 3600) {
    if (!path) return null;
    const { data, error } = await Store.client.storage
      .from(CONFIG.storage.exports)
      .createSignedUrl(path, expiresIn);
    if (error) { console.warn('getExportSignedUrl error:', error.message); return null; }
    return data.signedUrl;
  },

  async downloadExport(path) {
    const { data, error } = await Store.client.storage.from(CONFIG.storage.exports).download(path);
    if (error) throw error;
    return data;
  },

  async deleteExport(path) {
    if (!path) return;
    const { error } = await Store.client.storage.from(CONFIG.storage.exports).remove([path]);
    if (error) console.warn('deleteExport error:', error.message);
  },
};

/* ══════════════════════════════════════════════════════════════════════
   MIGRATION — localStorage → cloud (one-time, user-triggered)
   ══════════════════════════════════════════════════════════════════════ */
Store.migrate = {

  /* Read every docforbro:* key from localStorage and see if anything is there */
  detect() {
    const keys = {
      drafts:        'docforbro:drafts',
      exports:       'docforbro:exports',
      trash:         'docforbro:trash',
      rateProfiles:  'docforbro:rateProfiles',
      marginProjects:'docforbro:marginProjects',
      userTemplates: 'docforbro:userTemplates',
      rateState:     'docforbro:rateState',
    };
    const found = {};
    for (const [k, lsKey] of Object.entries(keys)) {
      try {
        const raw = localStorage.getItem(lsKey);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) found[k] = parsed;
        else if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) found[k] = parsed;
      } catch {}
    }
    return found;
  },

  hasData() {
    return Object.keys(Store.migrate.detect()).length > 0;
  },

  /* Perform the migration. Returns a per-table count of items uploaded. */
  async run() {
    const local = Store.migrate.detect();
    const counts = {};
    const errors = [];

    /* Drafts → documents */
    if (local.drafts?.length) {
      try {
        const rows = local.drafts.map(d => ({
          name:          d.name || 'Untitled',
          template_id:   d.templateId || null,
          template_name: d.templateName || 'Document',
          data:          d.data || d,
        }));
        const created = await Store.db.documents.bulk(rows);
        counts.documents = created.length;
      } catch (e) { errors.push('documents: ' + e.message); }
    }

    /* Exports history (without PDF file — those can't be auto-uploaded) */
    if (local.exports?.length) {
      try {
        const rows = local.exports.map(e => ({
          name:          e.name || 'Untitled',
          filename:      e.filename || null,
          template_id:   e.templateId || null,
          template_name: e.templateName || 'Document',
          snapshot:      e.snapshot || null,
          exported_at:   e.exportedAt || new Date().toISOString(),
        }));
        const created = await Store.db.exports.bulk(rows);
        counts.exports = created.length;
      } catch (e) { errors.push('exports: ' + e.message); }
    }

    /* Rate profiles */
    if (local.rateProfiles?.length) {
      try {
        const rows = local.rateProfiles.map(p => ({
          name: p.name || 'My profile',
          data: p.data || p,
        }));
        const created = await Store.db.rateProfiles.bulk(rows);
        counts.rateProfiles = created.length;
      } catch (e) { errors.push('rateProfiles: ' + e.message); }
    }

    /* Margin projects */
    if (local.marginProjects?.length) {
      try {
        const rows = local.marginProjects.map(p => ({
          name:           p.name || 'Project',
          client:         p.client || null,
          revenue:        p.revenue || 0,
          quoted_hours:   p.quotedHours || 0,
          actual_hours:   p.actualHours || 0,
          expenses:       p.expenses || [],
          expenses_total: p.expensesTotal || 0,
          labor_cost:     p.laborCost || 0,
          margin:         p.margin || 0,
          margin_pct:     p.marginPct || 0,
          effective_rate: p.effectiveRate || 0,
          date:           p.date || new Date().toISOString(),
        }));
        const created = await Store.db.marginProjects.bulk(rows);
        counts.marginProjects = created.length;
      } catch (e) { errors.push('marginProjects: ' + e.message); }
    }

    /* User templates */
    if (local.userTemplates?.length) {
      try {
        const rows = local.userTemplates.map(t => ({
          name:        t.name || 'Template',
          category:    t.category || 'Custom',
          description: t.desc || null,
          accent:      t.accent || null,
          data:        {
            doc:       t.doc,
            brand:     t.brand,
            meta:      t.meta,
            sections:  t.sections,
            signature: t.signature,
          },
        }));
        const created = await Store.db.userTemplates.bulk(rows);
        counts.userTemplates = created.length;
      } catch (e) { errors.push('userTemplates: ' + e.message); }
    }

    /* Trash */
    if (local.trash?.length) {
      try {
        const rows = local.trash.map(t => ({
          kind:       t.kind || 'unknown',
          name:       t.name || 'Untitled',
          record:     t.record || {},
          deleted_at: t.deletedAt || new Date().toISOString(),
        }));
        const created = await Store.db.trash.create ? await Store.db.trash.create(rows[0]) : null;
        /* Trash is trickier — iterate individually */
        let n = 0;
        for (const row of rows) {
          try { await Store.db.trash.create(row); n++; } catch {}
        }
        counts.trash = n;
      } catch (e) { errors.push('trash: ' + e.message); }
    }

    return { counts, errors };
  },

  /* Clear all docforbro:* keys after a successful migration */
  clearLocal() {
    const keys = [
      'docforbro:drafts',
      'docforbro:exports',
      'docforbro:trash',
      'docforbro:rateProfiles',
      'docforbro:marginProjects',
      'docforbro:userTemplates',
      'docforbro:rateActiveProfile',
    ];
    keys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
  },
};

/* ══════════════════════════════════════════════════════════════════════
   AUTO-INIT
   Runs as soon as this module loads, in parallel with other modules.
   Auth-dependent code waits on Store.whenAuthReady().
   ══════════════════════════════════════════════════════════════════════ */
Store.init().catch(err => console.error('Store.init failed:', err));