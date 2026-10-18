/* ============================================================================
   05b-studio-editor.js — Content editor + Signature tab
   v5 — Adds dirty state tracking for content and signature changes.
   ============================================================================ */

/* ══════════════════════════════════════════════════════════════════════
   CONTENT PANE
   ══════════════════════════════════════════════════════════════════════ */
function renderContentPane() {
  const pane = $('#pane-content');
  if (!pane || !studio) return;

  let h = `<div class="card">
    <h3 class="card-title">Document</h3>
    <div class="frow"><label>Title</label><input data-path="doc.title"></div>
    <div class="frow"><label>Subtitle</label><input data-path="doc.subtitle" placeholder="Optional"></div>
  </div>`;

  if (studio.meta.length) {
    h += `<div class="card"><h3 class="card-title">Header details</h3>`;
    studio.meta.forEach((m, i) => {
      h += `<div class="frow">
        <input class="mini-label" data-path="meta.${i}.label" value="${esc(m.label)}" placeholder="Label">
        <input data-path="meta.${i}.value" value="${esc(m.value)}">
      </div>`;
    });
    h += `</div>`;
  }

  studio.sections.forEach((s, i) => { h += sectionCardHTML(s, i); });

  h += `<div class="add-wrap">
    <button class="btn-add" data-act="toggle-add">+ Add Section</button>
    <div class="add-menu" id="addMenu" hidden>
      <button data-act="new-section" data-kind="fields">Fields block</button>
      <button data-act="new-section" data-kind="text">Text block</button>
      <button data-act="new-section" data-kind="signature">Signature</button>
      <button data-act="new-section" data-kind="notice">Notice box</button>
    </div>
  </div>`;

  pane.innerHTML = h;
  bindStaticEditorInputs();

  /* Keep the signature pane in sync — sections may have changed */
  if (typeof renderSignaturePane === 'function' && document.querySelector('#pane-sign')) {
    renderSignaturePane();
  }
}

function bindStaticEditorInputs() {
  $$('#pane-content [data-path]').forEach(el => {
    if (el.closest('.sec-card')) return;
    const path = el.dataset.path.split('.');
    let v = studio;
    path.forEach(k => v = v?.[k]);
    el.value = v ?? '';
  });
}

function sectionCardHTML(s, i) {
  const head = `<div class="sec-head">
    <input class="sec-title" data-path="sections.${i}.title" value="${esc(s.title || '')}" placeholder="Section title">
    <div class="sec-tools">
      <button data-act="sec-up" data-i="${i}" title="Move up">↑</button>
      <button data-act="sec-down" data-i="${i}" title="Move down">↓</button>
      <button class="del" data-act="sec-del" data-i="${i}" title="Delete">✕</button>
    </div>
  </div>`;

  let body = '';
  if (s.type === 'fields') {
    body = `<div class="sec-body">
      ${s.fields.map((f, j) => fieldRowHTML(s, i, f, j)).join('')}
    </div>
    <div class="sec-foot"><button class="btn-mini" data-act="add-field" data-i="${i}">+ Add field</button></div>`;
  } else if (s.type === 'text' || s.type === 'notice') {
    body = `<div class="sec-body">
      <textarea class="val" rows="4" data-path="sections.${i}.value"
        placeholder="Write a paragraph. Start lines with \"- \" for bullet points.">${esc(s.value)}</textarea>
    </div>`;
  } else if (s.type === 'signature') {
    body = `<div class="sec-body">
      ${(s.slots || []).map((sl, k) => `
        <div class="frow">
          <input class="mini-label" data-path="sections.${i}.slots.${k}.label" value="${esc(sl.label)}">
          <input data-path="sections.${i}.slots.${k}.name" value="${esc(sl.name)}" placeholder="Name">
        </div>`).join('')}
    </div>`;
  } else if (s.type === 'table') {
    body = tableCardHTML(s, i);
  }

  return `<div class="sec-card" data-sec="${i}">${head}${body}</div>`;
}

function fieldRowHTML(s, i, f, j) {
  const control = f.type === 'textarea'
    ? `<textarea class="val" rows="3" data-path="sections.${i}.fields.${j}.value">${esc(f.value)}</textarea>`
    : `<input class="val" data-path="sections.${i}.fields.${j}.value" value="${esc(f.value)}">`;
  return `<div class="field-row">
    <input class="mini-label" data-path="sections.${i}.fields.${j}.label" value="${esc(f.label)}" placeholder="Label">
    ${control}
    <button class="del-btn" data-act="field-del" data-i="${i}" data-j="${j}" title="Remove field">✕</button>
  </div>`;
}

function tableCardHTML(s, i) {
  const t = calcTotals(s);
  const rows = s.rows.map((r, j) => `
    <div class="irow">
      <input data-path="sections.${i}.rows.${j}.description" value="${esc(r.description)}" placeholder="Description">
      <input type="number" step="0.01" data-num="1" data-path="sections.${i}.rows.${j}.qty" value="${r.qty}">
      <input type="number" step="0.01" data-num="1" data-path="sections.${i}.rows.${j}.rate" value="${r.rate}">
      <span class="iamt" data-amt="${j}">${docMoney((+r.qty || 0) * (+r.rate || 0))}</span>
      <button class="del-btn" data-act="row-del" data-i="${i}" data-j="${j}">✕</button>
    </div>`).join('');

  return `<div class="sec-body">
    <div class="irow-head"><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span><span></span></div>
    ${rows}
    <button class="btn-mini" data-act="add-row" data-i="${i}" style="margin-top:6px">+ Add line item</button>
    <div class="totals-edit">
      <label>Discount
        <input type="number" step="0.01" data-num="1" data-path="sections.${i}.totals.discountValue" value="${s.totals?.discountValue ?? 0}">
        <select data-path="sections.${i}.totals.discountType">
          <option value="percent" ${s.totals?.discountType === 'percent' ? 'selected' : ''}>%</option>
          <option value="flat"    ${s.totals?.discountType === 'flat'    ? 'selected' : ''}>flat</option>
        </select>
      </label>
      <label>Tax %
        <input type="number" step="0.01" data-num="1" data-path="sections.${i}.totals.taxRate" value="${s.totals?.taxRate ?? 0}">
      </label>
    </div>
    <div class="totals-preview">
      <span>Subtotal ${docMoney(t.subtotal)}</span>
      <span>Total <strong>${docMoney(t.total)}</strong></span>
    </div>
  </div>`;
}

function onContentInput(e) {
  const el = e.target.closest('[data-path]');
  if (!el || !el.closest('#pane-content')) return;

  isStudioDirty = true; // Mark dirty on any content input

  const path = el.dataset.path.split('.');
  const last = path.pop();
  let obj = studio;
  for (const k of path) obj = obj[k];

  let value = el.value;
  if (el.dataset.num !== undefined) value = value === '' ? 0 : (parseFloat(value) || 0);

  obj[last] = value;

  if (path[0] === 'sections') {
    const i = parseInt(path[1], 10);
    const card = el.closest('.sec-card');
    const s = studio.sections[i];
    if (s && s.type === 'table' && card) {
      card.querySelectorAll('[data-amt]').forEach(span => {
        const j = parseInt(span.dataset.amt, 10);
        const r = s.rows[j];
        if (r) span.textContent = docMoney((+r.qty || 0) * (+r.rate || 0));
      });
      const tp = card.querySelector('.totals-preview');
      if (tp) {
        const t = calcTotals(s);
        tp.innerHTML = `<span>Subtotal ${docMoney(t.subtotal)}</span>
                        <span>Total <strong>${docMoney(t.total)}</strong></span>`;
      }
    }
  }

  renderPreview();
}

function onContentClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || !btn.closest('#pane-content')) return;
  const act = btn.dataset.act;
  const i = btn.dataset.i !== undefined ? parseInt(btn.dataset.i, 10) : -1;
  const j = btn.dataset.j !== undefined ? parseInt(btn.dataset.j, 10) : -1;

  switch (act) {
    case 'toggle-add': {
      const menu = $('#addMenu');
      if (menu) menu.hidden = !menu.hidden;
      return;
    }
    case 'new-section': {
      isStudioDirty = true;
      const kind = btn.dataset.kind;
      if (kind === 'fields')         studio.sections.push(sec('New Section', [fld('Field One', ''), fld('Field Two', '')]));
      else if (kind === 'text')      studio.sections.push(txt('New Section', 'Write your content here.'));
      else if (kind === 'signature') studio.sections.push(sig('Signatures'));
      else if (kind === 'notice')    studio.sections.push(note('Add an important note here.'));
      renderContentPane(); renderPreview();
      return;
    }
    case 'sec-up':   
      if (i > 0) { isStudioDirty = true; const a = studio.sections; [a[i-1], a[i]] = [a[i], a[i-1]]; } 
      break;
    case 'sec-down': 
      if (i < studio.sections.length - 1) { isStudioDirty = true; const a = studio.sections; [a[i+1], a[i]] = [a[i], a[i+1]]; } 
      break;
    case 'sec-del':
      if (!confirm('Delete this section? This removes it from the document.')) return;
      isStudioDirty = true;
      studio.sections.splice(i, 1);
      renderContentPane(); renderPreview();
      return;
    case 'add-field':
      isStudioDirty = true;
      studio.sections[i].fields.push(fld('New Field', ''));
      renderContentPane(); renderPreview();
      return;
    case 'field-del':
      isStudioDirty = true;
      studio.sections[i].fields.splice(j, 1);
      renderContentPane(); renderPreview();
      return;
    case 'add-row':
      isStudioDirty = true;
      studio.sections[i].rows.push({ description: 'New item', qty: 1, rate: 0 });
      renderContentPane(); renderPreview();
      return;
    case 'row-del':
      isStudioDirty = true;
      studio.sections[i].rows.splice(j, 1);
      renderContentPane(); renderPreview();
      return;
  }

  if (['sec-up', 'sec-down'].includes(act)) {
    renderContentPane(); renderPreview();
  }
}

/* ══════════════════════════════════════════════════════════════════════
   SIGNATURE PANE
   ══════════════════════════════════════════════════════════════════════ */
let sigCtx = null;
let sigDrawing = false;
let sigLast = null;
let sigHasInk = false;

function renderSignaturePane() {
  const pane = $('#pane-sign');
  if (!pane || !studio) return;

  const sig = studio.signature;
  const hasSigSection = studio.sections.some(s => s.type === 'signature');

  pane.innerHTML = `
    ${!hasSigSection ? `
      <div class="warn show" style="display:flex">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div>
          <b>This document has no signature area yet.</b><br>
          Add one from the Content tab (Add Section → Signature).
          <button type="button" class="btn sm" data-act="add-sig-section" style="margin-top:8px">Add signature section now</button>
        </div>
      </div>` : ''}

    <div class="card">
      <h3 class="card-title">Placement</h3>
      <div class="frow"><label>Show in</label>
        <select id="sigSlot">
          <option value="freelancer" ${sig.slot === 'freelancer' ? 'selected' : ''}>Freelancer block</option>
          <option value="client"     ${sig.slot === 'client'     ? 'selected' : ''}>Client block</option>
        </select>
      </div>
      <div class="frow"><label>Size</label>
        <input type="range" min="0.6" max="2" step="0.05" id="sigScale" value="${sig.scale || 1}">
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">Your signature</h3>
      <div class="seg" id="sigSeg">
        <button type="button" data-mode="none"   class="${sig.mode === 'none'   ? 'active' : ''}">None</button>
        <button type="button" data-mode="upload" class="${sig.mode === 'upload' ? 'active' : ''}">Upload</button>
        <button type="button" data-mode="draw"   class="${sig.mode === 'draw'   ? 'active' : ''}">Draw</button>
      </div>

      <div id="sigUploadBox" ${sig.mode !== 'upload' ? 'hidden' : ''}>
        <div class="sig-drop">
          <p>PNG, JPG, or WebP. Transparent PNG preferred.</p>
          <label class="btn sm" style="cursor:pointer;display:inline-flex;position:relative;overflow:hidden">
            Choose file
            <input type="file" id="sigFile" accept="image/png,image/jpeg,image/webp"
                   style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
          </label>
        </div>
      </div>

      <div id="sigDrawBox" ${sig.mode !== 'draw' ? 'hidden' : ''}>
        <div class="canvas-wrap">
          <canvas id="sigCanvas"></canvas>
        </div>
        <div class="canvas-tools">
          <button type="button" class="btn sm" data-act="sig-clear">Clear</button>
          <span class="grow"></span>
          <button type="button" class="btn primary sm" data-act="sig-use">Use signature</button>
        </div>
      </div>

      <div class="sig-preview ${sig.dataUrl ? 'show' : ''}" id="sigPreview">
        ${sig.dataUrl ? `<img id="sigPreviewImg" src="${sig.dataUrl}" alt="">` : ''}
        <div class="meta">
          <strong id="sigPreviewTitle">${sig.mode === 'draw' ? 'Drawn signature' : 'Uploaded signature'}</strong>
          <span id="sigPreviewMeta">Placed in the ${sig.slot} block</span>
        </div>
        <button type="button" class="btn ghost sm" data-act="sig-remove">Remove</button>
      </div>
    </div>
  `;

  /* Per-element listeners — rebind on every render */
  const fileInput = $('#sigFile');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        studio.signature.mode = 'upload';
        studio.signature.dataUrl = ev.target.result;
        isStudioDirty = true; // Mark dirty
        renderSignaturePane();
        renderPreview();
        toast('Signature uploaded');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });
  }

  const slot = $('#sigSlot');
  if (slot) {
    slot.addEventListener('change', e => {
      studio.signature.slot = e.target.value;
      isStudioDirty = true; // Mark dirty
      renderPreview();
    });
  }

  const scale = $('#sigScale');
  if (scale) {
    scale.addEventListener('input', e => {
      studio.signature.scale = parseFloat(e.target.value) || 1;
      isStudioDirty = true; // Mark dirty
      renderPreview();
    });
  }

  if (sig.mode === 'draw') requestAnimationFrame(setupSigCanvas);
}

function onSignatureClick(e) {
  const pane = e.target.closest('#pane-sign');
  if (!pane) return;

  /* Mode seg buttons — handled here via delegation */
  const modeBtn = e.target.closest('button[data-mode]');
  if (modeBtn) {
    const mode = modeBtn.dataset.mode;
    studio.signature.mode = mode;
    isStudioDirty = true; // Mark dirty
    if (mode === 'none') studio.signature.dataUrl = null;
    renderSignaturePane();
    renderPreview();
    return;
  }

  /* Action buttons */
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;

  switch (act) {
    case 'add-sig-section':
      isStudioDirty = true;
      studio.sections.push(sig('Signatures'));
      renderContentPane();
      renderSignaturePane();
      renderPreview();
      return;

    case 'sig-clear':
      clearSigCanvas();
      return;

    case 'sig-use': {
      if (!sigHasInk || !sigCtx) { alert('Draw your signature first.'); return; }
      const canvas = $('#sigCanvas');
      studio.signature.mode = 'draw';
      studio.signature.dataUrl = canvas.toDataURL('image/png');
      isStudioDirty = true; // Mark dirty
      renderSignaturePane();
      renderPreview();
      return;
    }

    case 'sig-remove':
      studio.signature.dataUrl = null;
      studio.signature.mode = 'none';
      isStudioDirty = true; // Mark dirty
      clearSigCanvas();
      renderSignaturePane();
      renderPreview();
      return;
  }
}

function setupSigCanvas() {
  const canvas = $('#sigCanvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);
  sigCtx = canvas.getContext('2d');
  sigCtx.setTransform(1, 0, 0, 1, 0, 0);
  sigCtx.scale(dpr, dpr);
  sigCtx.lineWidth = 2.4;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';
  sigCtx.strokeStyle = '#111827';
  sigHasInk = false;

  if (!canvas._wired) {
    canvas._wired = true;
    const pos = e => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      sigDrawing = true;
      sigLast = pos(e);
      sigCtx.beginPath();
      sigCtx.moveTo(sigLast.x, sigLast.y);
      sigCtx.lineTo(sigLast.x + 0.01, sigLast.y);
      sigCtx.stroke();
      sigHasInk = true;
    });
    canvas.addEventListener('pointermove', e => {
      if (!sigDrawing || !sigCtx) return;
      e.preventDefault();
      const p = pos(e);
      sigCtx.beginPath();
      sigCtx.moveTo(sigLast.x, sigLast.y);
      sigCtx.lineTo(p.x, p.y);
      sigCtx.stroke();
      sigLast = p;
    });
    const stop = () => { sigDrawing = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', stop);
  }
}

function clearSigCanvas() {
  const canvas = $('#sigCanvas');
  if (!canvas || !sigCtx) return;
  sigCtx.clearRect(0, 0, canvas.width, canvas.height);
  sigHasInk = false;
}

/* Kept as a no-op for backward compatibility with bindEditorEvents */
function bindSignatureSeg() { /* mode seg handled in onSignatureClick */ }