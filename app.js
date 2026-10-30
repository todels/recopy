import { clients } from './templates/index.js';

const $ = (sel) => document.querySelector(sel);
const stage = $('#stage');
const frame = $('#frame');
const canvas = $('#canvas');
const fileInput = $('#file');

const params = new URLSearchParams(location.search);
const onlyClient = params.get('client');
const visibleClients = onlyClient ? clients.filter((c) => c.id === onlyClient) : clients;
// ?bare renders just the post at 1:1 (for headless renders and pixel checks).
const bare = params.has('bare');
document.body.classList.toggle('bare', bare);

let current = null; // { client, tpl, root, state }
let pendingImageKey = null;

// ---------- storage ----------

const storeKey = (client, tpl) => `recopy:v1:${client.id}/${tpl.id}`;

function loadState(client, tpl) {
  try {
    return JSON.parse(localStorage.getItem(storeKey(client, tpl))) || { fields: {}, images: {} };
  } catch {
    return { fields: {}, images: {} };
  }
}

let savedTimer;
function saveState() {
  const { client, tpl, state } = current;
  try {
    localStorage.setItem(storeKey(client, tpl), JSON.stringify(state));
  } catch {
    // Quota hit (big images): keep the copy, drop the images.
    try { localStorage.setItem(storeKey(client, tpl), JSON.stringify({ ...state, images: {} })); } catch {}
  }
  const el = $('#saved');
  el.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => el.classList.remove('show'), 1200);
  refreshThumb(client, tpl);
}

// ---------- templates ----------

const htmlCache = new Map();

function ensureCss(href) {
  if (document.querySelector(`link[data-client-css="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.clientCss = href;
  document.head.appendChild(link);
}

async function fetchTemplate(tpl) {
  if (!htmlCache.has(tpl.file)) {
    const res = await fetch(tpl.file);
    if (!res.ok) throw new Error(`Could not load ${tpl.file}`);
    htmlCache.set(tpl.file, await res.text());
  }
  return htmlCache.get(tpl.file);
}

// Build a live copy of a template: asset paths resolved against the template file.
async function buildTemplate(tpl) {
  const t = document.createElement('template');
  t.innerHTML = await fetchTemplate(tpl);
  const base = new URL(tpl.file, location.href);
  t.content.querySelectorAll('img[src]').forEach((img) => {
    img.setAttribute('src', new URL(img.getAttribute('src'), base).pathname);
    img.dataset.original = img.getAttribute('src');
  });
  return t.content;
}

function applyState(root, state) {
  root.querySelectorAll('[data-field]').forEach((el) => {
    const v = state.fields[el.dataset.field];
    if (v != null) el.textContent = v;
  });
  root.querySelectorAll('[data-image]').forEach((el) => {
    el.src = state.images[el.dataset.image] || el.dataset.original;
  });
}

// ---------- auto-fit ----------

function fit(root) {
  root.querySelectorAll('[data-fit], [data-fit-h]').forEach((el) => {
    const maxW = Number(el.dataset.fit) || Infinity;
    const maxH = Number(el.dataset.fitH) || Infinity;
    if (el.dataset.fitMode === 'font') {
      // Shrink the font size until the copy fits (lets pills and rows reflow).
      if (!el.dataset.baseSize) el.dataset.baseSize = parseFloat(getComputedStyle(el).fontSize);
      const base = Number(el.dataset.baseSize);
      const fits = (k) => {
        el.style.fontSize = `${base * k}px`;
        return el.offsetWidth <= maxW + 0.5 && el.offsetHeight <= maxH + 0.5;
      };
      if (fits(1)) return;
      let lo = 0.2, hi = 1;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid; else hi = mid;
      }
      fits(lo);
    } else {
      el.style.setProperty('--fit', 1);
      const k = Math.min(1, maxW / el.offsetWidth, maxH / el.offsetHeight);
      el.style.setProperty('--fit', k.toFixed(4));
    }
  });
}

// ---------- stage ----------

function layoutStage() {
  if (!current) return;
  const { width, height } = current.tpl;
  const pad = 48;
  const k = bare ? 1 : Math.min((canvas.clientWidth - pad * 2) / width, (canvas.clientHeight - pad * 2) / height);
  frame.style.width = `${width * k}px`;
  frame.style.height = `${height * k}px`;
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.transform = `scale(${k})`;
}
new ResizeObserver(layoutStage).observe(canvas);

async function open(client, tpl) {
  ensureCss(client.css);
  const content = await buildTemplate(tpl);
  const state = loadState(client, tpl);
  stage.replaceChildren(content);
  stage.classList.toggle('editing', !bare);
  const root = stage.querySelector(`.${client.id}`) || stage.firstElementChild;
  current = { client, tpl, root, state };

  applyState(root, state);
  $('#client-name').textContent = client.name;
  $('#template-name').textContent = tpl.name;
  document.title = `${tpl.name} · ${client.name} · Recopy`;
  document.querySelectorAll('.tcard').forEach((b) => b.classList.toggle('active', b.dataset.key === `${client.id}/${tpl.id}`));
  if (location.hash.slice(1) !== `${client.id}/${tpl.id}`) history.replaceState(null, '', `${location.search}#${client.id}/${tpl.id}`);

  layoutStage();
  buildPanel(root);
  bindInline(root);
  await document.fonts.ready;
  fit(root);
}

// ---------- panel ----------

function groupBy(root, attr) {
  const map = new Map();
  root.querySelectorAll(`[${attr}]`).forEach((el) => {
    const key = el.getAttribute(attr);
    if (!map.has(key)) map.set(key, { label: el.dataset.label || key, multiline: el.hasAttribute('data-multiline'), els: [] });
    map.get(key).els.push(el);
    if (el.dataset.label) map.get(key).label = el.dataset.label;
  });
  return map;
}

function setField(key, value, from) {
  const { root, state } = current;
  root.querySelectorAll(`[data-field="${key}"]`).forEach((el) => { if (el !== from) el.textContent = value; });
  const input = document.querySelector(`#fields [data-key="${key}"]`);
  if (input && input !== from) input.value = value;
  state.fields[key] = value;
  fit(root);
  saveState();
}

function buildPanel(root) {
  const fields = $('#fields');
  fields.replaceChildren();
  // data-order sets the panel order when the DOM order reads oddly (stable otherwise).
  const order = ([, f]) => Number(f.els[0].dataset.order ?? 1000);
  for (const [key, f] of [...groupBy(root, 'data-field')].sort((a, b) => order(a) - order(b))) {
    const label = document.createElement('label');
    label.className = 'field';
    const span = document.createElement('span');
    span.textContent = f.label;
    const input = document.createElement(f.multiline ? 'textarea' : 'input');
    input.dataset.key = key;
    input.value = f.els[0].textContent;
    input.addEventListener('input', () => setField(key, input.value, input));
    label.append(span, input);
    fields.append(label);
  }

  const images = $('#images');
  images.replaceChildren();
  const imgFields = groupBy(root, 'data-image');
  $('#images-title').hidden = imgFields.size === 0;
  for (const [key, f] of imgFields) {
    const row = document.createElement('div');
    row.className = 'imgrow';
    row.dataset.key = key;
    const thumb = document.createElement('img');
    thumb.src = f.els[0].src;
    thumb.alt = '';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = '<b></b><small>Drop an image or pick one</small>';
    meta.querySelector('b').textContent = f.label;
    const pick = document.createElement('button');
    pick.className = 'btn';
    pick.type = 'button';
    pick.textContent = 'Replace';
    pick.addEventListener('click', () => chooseImage(key));
    row.append(thumb, meta, pick);
    if (current.state.images[key]) {
      const reset = document.createElement('button');
      reset.className = 'reset';
      reset.type = 'button';
      reset.textContent = 'Undo';
      reset.title = 'Back to the template image';
      reset.addEventListener('click', () => setImage(key, null));
      meta.querySelector('small').replaceWith(reset);
    }
    dropTarget(row, key);
    images.append(row);
  }
}

// ---------- inline editing ----------

function bindInline(root) {
  root.querySelectorAll('[data-field]').forEach((el) => {
    el.contentEditable = 'plaintext-only';
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.spellcheck = false;
    const multiline = el.hasAttribute('data-multiline');
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !multiline) { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') el.blur();
    });
    el.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, multiline ? text : text.replace(/\s*\n\s*/g, ' '));
    });
    el.addEventListener('input', () => setField(el.dataset.field, el.innerText.replace(/\n$/, ''), el));
  });
  root.querySelectorAll('[data-image]').forEach((el) => {
    el.addEventListener('click', () => chooseImage(el.dataset.image));
    dropTarget(el, el.dataset.image);
  });
}

// ---------- images ----------

function chooseImage(key) {
  pendingImageKey = key;
  fileInput.value = '';
  fileInput.click();
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (file && pendingImageKey) setImage(pendingImageKey, await readImage(file));
});

function dropTarget(el, key) {
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop'); });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.classList.remove('drop');
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (file) setImage(key, await readImage(file));
  });
}

// Downscale big uploads so they stay light in storage and export.
function readImage(file, max = 1000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(file.type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function setImage(key, dataUrl) {
  const { root, state } = current;
  if (dataUrl) state.images[key] = dataUrl; else delete state.images[key];
  root.querySelectorAll(`[data-image="${key}"]`).forEach((el) => { el.src = dataUrl || el.dataset.original; });
  buildPanel(root);
  saveState();
}

// ---------- sidebar ----------

const thumbs = new Map();

async function refreshThumb(client, tpl) {
  const box = thumbs.get(`${client.id}/${tpl.id}`);
  if (!box) return;
  const content = await buildTemplate(tpl);
  const holder = document.createElement('div');
  holder.style.width = `${tpl.width}px`;
  holder.style.height = `${tpl.height}px`;
  holder.inert = true;
  holder.append(content);
  applyState(holder, loadState(client, tpl));
  box.replaceChildren(holder);
  holder.style.transform = `scale(${box.clientWidth / tpl.width})`;
  await document.fonts.ready;
  fit(holder);
}

function buildSidebar() {
  const nav = $('#templates');
  for (const client of visibleClients) {
    ensureCss(client.css);
    const h = document.createElement('h3');
    h.textContent = client.name;
    nav.append(h);
    for (const tpl of client.templates) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tcard';
      btn.dataset.key = `${client.id}/${tpl.id}`;
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      const name = document.createElement('span');
      name.textContent = tpl.name;
      btn.append(thumb, name);
      btn.addEventListener('click', () => open(client, tpl));
      nav.append(btn);
      thumbs.set(btn.dataset.key, thumb);
      requestAnimationFrame(() => refreshThumb(client, tpl));
    }
  }
}

// ---------- export ----------

async function download() {
  const btn = $('#download');
  const { client, tpl, root } = current;
  btn.disabled = true;
  btn.textContent = 'Rendering…';
  document.activeElement?.blur();
  stage.classList.remove('editing');
  try {
    await document.fonts.ready;
    const opts = { width: tpl.width, height: tpl.height, pixelRatio: Number($('#scale').value), cacheBust: false };
    let url = await htmlToImage.toPng(root, opts);
    // Safari sometimes paints images on the second pass only.
    if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) url = await htmlToImage.toPng(root, opts);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${client.id}-${tpl.id}.png`;
    a.click();
  } catch (err) {
    console.error(err);
    alert('Export failed. Try again, or use Chrome.');
  } finally {
    stage.classList.toggle('editing', !bare);
    btn.disabled = false;
    btn.textContent = 'Download PNG';
  }
}

$('#download').addEventListener('click', download);

$('#reset').addEventListener('click', () => {
  if (!current || !confirm('Reset this post to the template copy and images?')) return;
  const { client, tpl } = current;
  try { localStorage.removeItem(storeKey(client, tpl)); } catch {}
  open(client, tpl);
  refreshThumb(client, tpl);
});

// ---------- boot ----------

function fromHash() {
  const [cid, tid] = location.hash.slice(1).split('/');
  const client = visibleClients.find((c) => c.id === cid) || visibleClients[0];
  const tpl = client?.templates.find((t) => t.id === tid) || client?.templates[0];
  return client && tpl ? { client, tpl } : null;
}

window.addEventListener('hashchange', () => {
  const hit = fromHash();
  if (hit && (hit.client !== current?.client || hit.tpl !== current?.tpl)) open(hit.client, hit.tpl);
});

if (!bare) buildSidebar();
const first = fromHash();
if (first) open(first.client, first.tpl);
