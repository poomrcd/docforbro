/* build.js — inline everything into a single index.html
   PrepSeek build system v1.0.1
   ------------------------------------------------------------------
   Notes:
   - Uses split().join() instead of String.replace() to avoid the
     special "$&", "$'", "$`", "$$" replacement patterns corrupting
     output. This is critical because the JS contains '$' literals.
   - Escapes any literal "</script>" inside JS as "<\/script>" so it
     can never terminate the <script> tag early.
   ------------------------------------------------------------------ */

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC  = path.join(ROOT, 'src');

/* ── Order matters. Top of list = top of output. ─────────────────── */
const CSS_FILES = [
  'css/tokens.css',
  'css/shell.css',
  'css/landing.css',
  'css/studio.css',
  'css/tools.css',
  'css/templates.css',
  'css/contacts.css',
  'css/notepad.css',
  'css/pages.css',
  'css/print.css',
];

const JS_FILES = [
  'js/00-imports.js',
  'js/01-config.js',
  'js/02-utils.js',
  'js/03-store.js',
  'js/04-auth.js',
  'js/05-studio.js',
  'js/05b-studio-editor.js',
  'js/05c-studio-export.js',
  'js/06-tools.js',
  'js/07-drive.js',
  'js/08-settings.js',
  'js/09-search.js',
  'js/10-templates.js',
  'js/11-contacts.js',
  'js/12-notepad.js',
  'js/14-page-starters.js',
  'js/13-pages.js',
  'js/99-boot.js',
];

/* ── Helpers ─────────────────────────────────────────────────────── */
function read(rel) {
  const p = path.join(SRC, rel);
  if (!fs.existsSync(p)) {
    console.warn(`  ⚠ missing: ${rel} — skipping (created as empty stub)`);
    return '';
  }
  return fs.readFileSync(p, 'utf8');
}

function stripSourceMapHints(s) {
  return s.replace(/\/\/# sourceMappingURL=.*$/gm, '');
}

/* Prevent any literal "</script>" inside JS from closing our tag. */
function escapeClosingScriptTag(s) {
  return s.replace(/<\/script>/gi, '<\\/script>');
}

/* ── Build ───────────────────────────────────────────────────────── */
function build() {
  const t0 = Date.now();

  const css = CSS_FILES
    .map(f => `/* ═══ ${f} ═══ */\n${read(f)}`)
    .join('\n');

  const js = JS_FILES
    .map(f => `/* ═══ ${f} ═══ */\n${escapeClosingScriptTag(stripSourceMapHints(read(f)))}`)
    .join('\n');

  let html = read('shell.html');
  if (!html) throw new Error('src/shell.html is required');

  /* ── IMPORTANT: split().join() — NOT .replace() ────────────────
     .replace() would interpret "$&", "$'", "$`", "$$" inside the
     replacement string as special patterns, mangling the output. */
  html = html.split('{{CSS}}').join(css);
  html = html.split('{{JS}}').join(js);

  // Warn if any placeholder was left un-replaced
  const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) console.warn('  ⚠ un-replaced placeholders:', leftover.join(', '));

  fs.writeFileSync(path.join(ROOT, 'index.html'), html, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`✓ index.html built — ${kb} KB — ${Date.now() - t0} ms`);
}

/* ── Watch mode (node build.js --watch) ──────────────────────────── */
function watch() {
  build();
  console.log('  watching src/ for changes… (ctrl+c to stop)');
  let t = null;
  fs.watch(SRC, { recursive: true }, () => {
    clearTimeout(t);
    t = setTimeout(() => {
      try { build(); } catch (e) { console.error('  ✗ build failed:', e.message); }
    }, 80);
  });
}

try {
  process.argv.includes('--watch') ? watch() : build();
} catch (e) {
  console.error('✗ build failed:', e.message);
  process.exit(1);
}