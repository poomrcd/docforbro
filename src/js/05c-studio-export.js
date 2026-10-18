/* ============================================================================
   05c-studio-export.js — Pagination + PDF export
   v3 — All constants namespaced under XP_ to avoid any identifier collisions.
   ============================================================================ */

const XP_MM        = 96 / 25.4;
const XP_PAGE_W    = 210 * XP_MM;
const XP_PAGE_H    = 297 * XP_MM;
const XP_CONTENT_H = XP_PAGE_H - (15 + 12) * XP_MM;
const XP_SAFETY    = 8;

/* ══════════════════════════════════════════════════════════════════════
   PAGINATION
   ══════════════════════════════════════════════════════════════════════ */
function buildBlocks() {
  const blocks = [];
  if (studio.meta.length) blocks.push({ html: metaHTML(), kind: 'atomic' });
  studio.sections.forEach(s => pushSectionBlocks(blocks, s));
  return blocks;
}

function groupFieldRows(fields, cols) {
  if (cols === 1) return fields.map(f => [f]);
  const rows = [];
  let pending = null;
  for (const f of fields) {
    if (f.width === 'full') {
      if (pending) { rows.push([pending]); pending = null; }
      rows.push([f]);
    } else {
      if (pending) { rows.push([pending, f]); pending = null; }
      else pending = f;
    }
  }
  if (pending) rows.push([pending]);
  return rows;
}

function pushSectionBlocks(blocks, s) {
  const key = s.id;

  if (s.type === 'text') {
    const paras = splitParagraphs(s.value);
    if (!paras.length) {
      blocks.push({
        html: `<section class="doc-sec">${s.title ? `<h2 class="sec-title">${esc(s.title)}</h2>` : ''}</section>`,
        kind: 'atomic',
      });
      return;
    }
    paras.forEach((p, idx) => {
      const isFirst = idx === 0;
      const isLast  = idx === paras.length - 1;
      const titleHTML = (isFirst && s.title) ? `<h2 class="sec-title">${esc(s.title)}</h2>` : '';
      blocks.push({
        html: `<section class="doc-sec tpart${isLast ? ' last' : ''}">${titleHTML}${p}</section>`,
        kind: 'part', sectionKey: key,
      });
    });
    return;
  }

  if (s.type === 'fields') {
    const cols = s.columns || 2;
    const rows = groupFieldRows(s.fields, cols);
    if (!rows.length) { blocks.push({ html: sectionHTML(s), kind: 'atomic' }); return; }
    rows.forEach((row, idx) => {
      const isFirst = idx === 0;
      const isLast  = idx === rows.length - 1;
      const titleHTML = (isFirst && s.title) ? `<h2 class="sec-title">${esc(s.title)}</h2>` : '';
      const items = row.map(fieldItemHTML).join('');
      blocks.push({
        html: `<section class="doc-sec fpart${isLast ? ' last' : ''}">${titleHTML}<div class="fgrid cols-${cols}">${items}</div></section>`,
        kind: 'part', sectionKey: key,
      });
    });
    return;
  }

  blocks.push({ html: sectionHTML(s), kind: 'atomic' });
}

function contHeaderHTML() {
  const b = studio.brand;
  return `<div class="doc-cont-head">
    <span class="dch-biz">${esc(b.businessName)}</span>
    <span class="dch-doc">${esc(studio.doc.title)} — continued</span>
  </div>`;
}

function measureAll(blocks) {
  const probe = document.createElement('article');
  probe.className = 'doc-page';
  applyDocStyleVars(probe);
  probe.style.cssText += ';position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;';
  document.body.appendChild(probe);

  const measure = html => {
    const holder = document.createElement('div');
    holder.innerHTML = html;
    probe.appendChild(holder);
    const el = holder.firstElementChild;
    if (!el) { probe.removeChild(holder); return 0; }
    const cs = getComputedStyle(el);
    const h = el.getBoundingClientRect().height
            + (parseFloat(cs.marginTop) || 0)
            + (parseFloat(cs.marginBottom) || 0);
    probe.removeChild(holder);
    return h;
  };

  const headH     = measure(headerHTML());
  const contHeadH = measure(contHeaderHTML());
  const footH     = measure(footerHTML()) || 24;
  const blockH    = blocks.map(b => measure(b.html));

  document.body.removeChild(probe);
  return { headH, contHeadH, footH, blockH };
}

function paginate(blocks, m) {
  const pages = [];
  let cur = [];
  let used = 0;

  const capFor = pageIdx =>
    XP_CONTENT_H - (pageIdx === 0 ? m.headH : m.contHeadH) - m.footH - XP_SAFETY;
  let cap = capFor(0);

  for (let i = 0; i < blocks.length; i++) {
    const cost = m.blockH[i];
    if (cur.length > 0 && used + cost > cap) {
      pages.push(cur);
      cur = [];
      used = 0;
      cap = capFor(pages.length);
    }
    cur.push(i);
    used += cost;
  }
  if (cur.length) pages.push(cur);
  if (!pages.length) pages.push([]);
  return pages;
}

function buildPageEl(idxs, pageIndex, pageCount, blocks) {
  const el = document.createElement('article');
  el.className = 'doc-page';
  applyDocStyleVars(el);

  const head = pageIndex === 0 ? headerHTML() : contHeaderHTML();
  const body = idxs.map(i => blocks[i].html).join('');
  const foot = footerHTML(pageIndex, pageCount);

  el.innerHTML = `${head}<div class="doc-body">${body}</div>${foot}`;
  return el;
}

function buildAllPages() {
  const blocks = buildBlocks();
  const m = measureAll(blocks);
  const pages = paginate(blocks, m);
  return pages.map((idxs, i) => buildPageEl(idxs, i, pages.length, blocks));
}

function renderPreviewPaginated() {
  const stack = $('#docStack');
  if (!stack || !studio) return;

  const pages = buildAllPages();
  stack.innerHTML = '';
  pages.forEach(p => stack.appendChild(p));
  fitPreview();
  checkOverflow();
}

function checkOverflow() {
  const pages = $$('#docStack .doc-page');
  let over = false;
  pages.forEach(p => { if (p.offsetHeight > XP_PAGE_H + 1.5) over = true; });
  const warn = $('#overflowWarn');
  if (warn) warn.classList.toggle('show', over);
}

/* ══════════════════════════════════════════════════════════════════════
   PDF EXPORT — official html2canvas + jspdf
   ══════════════════════════════════════════════════════════════════════ */
const XP_CDN = {
  html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  jspdf:       'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
};

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

async function ensurePdfLibs() {
  await loadScriptOnce(XP_CDN.html2canvas);
  await loadScriptOnce(XP_CDN.jspdf);
  if (typeof window.html2canvas !== 'function')
    throw new Error('html2canvas did not load correctly');
  if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function')
    throw new Error('jspdf did not load correctly');
}

async function exportPDF() {
  if (!studio) return;
  const btns = $$('.editor-foot .btn.primary');
  const orig = btns.map(b => b.textContent);
  btns.forEach(b => { b.disabled = true; b.textContent = 'Preparing…'; });

  try {
    await ensurePdfLibs();

    const pages = buildAllPages();

    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;background:#fff;z-index:-1;';
    document.body.appendChild(holder);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    for (let i = 0; i < pages.length; i++) {
      const el = pages[i];
      el.style.boxShadow = 'none';
      holder.appendChild(el);

      await waitForImages(el);

      const elW = el.offsetWidth;
      const elH = el.offsetHeight;

      const canvas = await window.html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        width: elW,
        height: elH,
        windowWidth: elW,
        windowHeight: elH,
      });

      const img = canvas.toDataURL('image/jpeg', 0.95);
      const k = Math.min(1, XP_PAGE_H / elH);
      const w = 210 * k;
      const h = 297 * k;
      const x = (210 - w) / 2;

      if (i > 0) pdf.addPage();
      pdf.addImage(img, 'JPEG', x, 0, w, h);

      holder.removeChild(el);
    }

    holder.remove();

    const safe = (studio.doc.title || 'document')
      .replace(/[^\w\-]+/g, '-').replace(/-+/g, '-');
    const date = new Date().toISOString().slice(0, 10);
        const filename = `${safe}-${date}.pdf`;
    pdf.save(filename);

    if (typeof recordExport === 'function') recordExport(filename);
    toast('PDF exported');
  } catch (err) {
    console.error('PDF export failed:', err);
    alert('PDF export failed: ' + (err.message || err));
  } finally {
    btns.forEach((b, i) => { b.disabled = false; b.textContent = orig[i] || 'Export PDF'; });
  }
}

function waitForImages(el) {
  const imgs = Array.from(el.querySelectorAll('img'));
  if (!imgs.length) return Promise.resolve();
  return Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth) return Promise.resolve();
    return new Promise(res => {
      img.addEventListener('load',  res, { once: true });
      img.addEventListener('error', res, { once: true });
      setTimeout(res, 1200);
    });
  }));
}