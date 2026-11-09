// Right-hand sidebar: tool options, selected object properties (or plan summary),
// backgrounds and layers.
import { store } from '../core/store.js';
import { TYPES, STATUSES, translateObject } from '../core/types.js';
import { polyArea, pathLength, dist, uid } from '../core/geom.js';
import { fmtFt, fmtArea, parseLength } from '../core/units.js';
import { SURFACE_MATERIALS, texture } from '../render/textures.js';
import { TREE_FORMS, TREE_COLORS } from '../render/symbols.js';
import { activeTool, activeToolId, setTool, escapeHtml } from '../tools/manager.js';
import { ICONS } from './icons.js';
import { toast } from './toast.js';
import { confirmDialog } from './dialog.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = escapeHtml;

let el;
let sliderOpen = false;

export function initSidebar() {
  el = $('#sidebar');
  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  el.addEventListener('input', onInput);
  el.addEventListener('keydown', (e) => {
    e.stopPropagation(); // typing in fields never triggers canvas shortcuts
    if (e.key === 'Enter' && e.target.matches('input[type=text]')) e.target.blur();
  });
  store.on('change', ({ reason }) => {
    if (reason === 'live') { updateReadouts(); return; }
    if (sliderOpen && reason === 'quiet') return;
    render();
  });
  store.on('select', render);
}

export function render() {
  if (!el) return;
  // keep keyboard focus if the user is in a field
  const focusKey = document.activeElement && el.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  el.innerHTML = [toolSection(), propsSection(), backgroundSection(), layersSection()].join('');
  if (focusKey) { const f = el.querySelector(`[data-key="${focusKey}"]`); if (f) f.focus(); }
}

// ---- helpers ---------------------------------------------------------------

function section(title, body, cls = '') {
  return `<section class="panel ${cls}"><h3>${title}</h3>${body}</section>`;
}

const thumbCache = new Map();
function materialThumb(id) {
  if (thumbCache.has(id)) return thumbCache.get(id);
  const [name, variant] = id.split(':');
  const t = texture(name, variant);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const pat = ctx.createPattern(t.canvas, 'repeat');
  const s = (t.ft * 12) / t.canvas.width; // 64px shows about 5 ft
  pat.setTransform(new DOMMatrix().scale(s));
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, 64, 64);
  const url = c.toDataURL();
  thumbCache.set(id, url);
  return url;
}

function segmented(key, options, value) {
  return `<div class="seg">${options.map((o) => `<button class="${o.id === value ? 'on' : ''}" data-act="set" data-key="${key}" data-val="${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div>`;
}

// ---- tool options ----------------------------------------------------------

function toolSection() {
  const id = activeToolId();
  const t = activeTool();
  if (!t || id === 'select') return '';
  let body = '';
  if (t.allowRect) {
    body += `<label class="lbl">Shape</label>${segmented('tool.mode', [{ id: 'rect', label: 'Rectangle' }, { id: 'poly', label: 'Any shape' }], t.mode)}`;
  }
  if (id === 'driveway' || id === 'patio') {
    const cur = t.material || (id === 'driveway' ? 'concrete' : 'pavers:tan');
    body += `<label class="lbl">Surface</label>${materialPicker('tool.material', cur)}`;
  }
  if (id === 'tree') {
    body += `<label class="lbl">Form</label>${segmented('tool.form', TREE_FORMS, t.form)}`;
  }
  const status = t.status ? `<p class="hint">${t.status()}</p>` : '';
  const name = { pan: 'Pan', property: 'Property line', house: 'House', structure: 'Other building', driveway: 'Driveway', patio: 'Patio / walk', tree: 'Existing tree', measure: 'Measure', dimension: 'Dimension', calibrate: 'Set scale', moveBg: 'Move image' }[id] || id;
  return section(name, body + status, 'tool-panel');
}

function materialPicker(key, value) {
  return `<div class="swatches mat">${SURFACE_MATERIALS.map((m) => `<button class="sw ${m.id === value ? 'on' : ''}" title="${m.label}" data-act="set" data-key="${key}" data-val="${m.id}" style="background-image:url(${materialThumb(m.id)})"><span>${m.label}</span></button>`).join('')}</div>`;
}

// ---- properties ------------------------------------------------------------

function readouts(o) {
  const g = o.geometry;
  if (g.kind === 'polygon') {
    return `<div class="stats"><div><span>Area</span><b data-ro="area">${fmtArea(polyArea(g.points))}</b></div><div><span>Perimeter</span><b data-ro="perim">${fmtFt(pathLength(g.points, true))}</b></div><div><span>Corners</span><b data-ro="corners">${g.points.length}</b></div></div>`;
  }
  if (g.kind === 'circle') {
    return `<div class="stats"><div><span>Canopy</span><b data-ro="diam">${fmtFt(g.r * 2)}</b></div><div><span>Spread area</span><b data-ro="carea">${fmtArea(Math.PI * g.r * g.r)}</b></div></div>`;
  }
  if (g.kind === 'dimension') {
    return `<div class="stats"><div><span>Length</span><b data-ro="dlen">${fmtFt(dist(g.a, g.b), { precise: true })}</b></div></div>`;
  }
  return '';
}

function updateReadouts() {
  const o = store.selectedId && store.getObject(store.selectedId);
  if (!o || !el) return;
  const g = o.geometry;
  const set = (k, v) => { const n = el.querySelector(`[data-ro="${k}"]`); if (n) n.textContent = v; };
  if (g.kind === 'polygon') { set('area', fmtArea(polyArea(g.points))); set('perim', fmtFt(pathLength(g.points, true))); set('corners', g.points.length); }
  if (g.kind === 'circle') { set('diam', fmtFt(g.r * 2)); set('carea', fmtArea(Math.PI * g.r * g.r)); }
  if (g.kind === 'dimension') set('dlen', fmtFt(dist(g.a, g.b), { precise: true }));
}

function field(o, f) {
  const v = o.props[f.key];
  switch (f.type) {
    case 'text':
      return `<label class="lbl">${f.label}</label><input class="input" type="text" data-key="prop.${f.key}" value="${esc(v ?? '')}">`;
    case 'checkbox':
      return `<label class="check"><input type="checkbox" data-key="prop.${f.key}" ${v ? 'checked' : ''}><span>${f.label}</span></label>`;
    case 'material':
      return `<label class="lbl">${f.label}</label>${materialPicker(`prop.${f.key}`, v)}`;
    case 'length':
      if (f.key === 'diameter') return `<label class="lbl">${f.label}</label><input class="input" type="text" data-key="geom.diameter" value="${esc(fmtFt(o.geometry.r * 2))}">`;
      return '';
    case 'treeForm':
      return `<label class="lbl">${f.label}</label>${segmented(`prop.${f.key}`, TREE_FORMS, v || 'canopy')}`;
    case 'treeColor':
      return `<label class="lbl">${f.label}</label><div class="swatches">${TREE_COLORS.map((c) => `<button class="dot ${c === v ? 'on' : ''}" style="--c:${c}" title="${c}" data-act="set" data-key="prop.${f.key}" data-val="${c}"></button>`).join('')}</div>`;
    default:
      return '';
  }
}

function propsSection() {
  const o = store.selectedId && store.getObject(store.selectedId);
  if (!o) return planSection();
  const def = TYPES[o.type];
  const locked = !store.layerUsable(o.layer);
  let body = readouts(o);
  if (locked) body += `<p class="hint warn">${ICONS.lock} This layer is locked or hidden. Unlock it in Layers to edit.</p>`;
  body += `<fieldset ${locked ? 'disabled' : ''}>`;
  if (o.type !== 'notes.dimension' && o.type !== 'site.property') {
    body += `<label class="lbl">Status</label>${segmented('status', STATUSES, o.status || 'existing')}`;
  }
  for (const f of def.fields) body += field(o, f);
  body += `</fieldset>`;
  body += `<div class="row-actions"><button class="btn ghost small" data-act="duplicate" ${locked ? 'disabled' : ''}>Duplicate <kbd>Ctrl D</kbd></button><button class="btn ghost small danger" data-act="delete" ${locked ? 'disabled' : ''}>${ICONS.trash} Delete</button></div>`;
  if (o.geometry.kind === 'polygon') body += `<p class="hint">Drag corners to reshape. Drag a small dot to add a corner. Right-click a corner to remove it.</p>`;
  return section(def.label, body, 'props');
}

function planSection() {
  const p = store.project;
  const sum = (type) => p.objects.filter((o) => o.type === type && o.status !== 'remove').reduce((s, o) => s + polyArea(o.geometry.points), 0);
  const count = (type) => p.objects.filter((o) => o.type === type).length;
  const lot = sum('site.property');
  const rows = [
    ['Lot', lot ? fmtArea(lot) : '—'],
    lot ? ['Acres', (lot / 43560).toFixed(2)] : null,
    ['House', count('site.house') ? fmtArea(sum('site.house')) : '—'],
    ['Paving', fmtArea(sum('site.driveway') + sum('site.patio'))],
    ['Existing trees', String(count('site.tree'))],
  ].filter(Boolean);
  const body = `
    <div class="stats">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    <label class="lbl">North arrow direction</label>
    <div class="inline"><input class="range" type="range" min="-180" max="180" step="1" data-key="plan.north" value="${p.northRotationDeg || 0}"><input class="input num" type="text" data-key="plan.northText" value="${p.northRotationDeg || 0}°"></div>
    <p class="hint">Nothing selected. Click something on the plan to edit it.</p>`;
  return section('Plan', body, 'props');
}

// ---- backgrounds -----------------------------------------------------------

function backgroundSection() {
  const bgs = store.project.backgrounds;
  const items = bgs.map((bg) => {
    const im = store.images.get(bg.imageId);
    const thumb = im ? `<img src="${im.url}" alt="">` : '';
    const scaleNote = bg.calibrated
      ? `<span class="badge ok">${ICONS.check} Scaled</span>`
      : `<span class="badge warn">${ICONS.warn} Not scaled yet</span>`;
    return `<div class="bg-item" data-bg="${bg.id}">
      <div class="bg-head">
        <div class="thumb">${thumb}</div>
        <div class="bg-meta"><input class="input bare" type="text" data-key="bg.name" data-bg="${bg.id}" value="${esc(bg.name)}">${scaleNote}</div>
        <button class="icon-btn" title="${bg.visible ? 'Hide' : 'Show'}" data-act="bg.toggle" data-bg="${bg.id}">${bg.visible ? ICONS.eye : ICONS.eyeOff}</button>
      </div>
      <div class="bg-actions">
        <button class="btn ${bg.calibrated ? 'ghost' : 'primary'} small" data-act="bg.calibrate" data-bg="${bg.id}">${ICONS.scale} Set scale</button>
        <button class="btn ghost small" data-act="bg.move" data-bg="${bg.id}">${ICONS.move} Move</button>
        <button class="icon-btn" title="Remove image" data-act="bg.remove" data-bg="${bg.id}">${ICONS.trash}</button>
      </div>
      <label class="lbl">Opacity</label>
      <input class="range" type="range" min="0.1" max="1" step="0.05" data-key="bg.opacity" data-bg="${bg.id}" value="${bg.opacity}">
      <label class="lbl">Rotate</label>
      <div class="inline"><input class="range" type="range" min="-180" max="180" step="0.5" data-key="bg.rotation" data-bg="${bg.id}" value="${bg.rotationDeg || 0}"><input class="input num" type="text" data-key="bg.rotationText" data-bg="${bg.id}" value="${bg.rotationDeg || 0}°"></div>
    </div>`;
  }).join('');
  const add = `<button class="btn ghost small wide" data-act="bg.add">${ICONS.image} ${bgs.length ? 'Add another image' : 'Import screenshot or survey'}</button>`;
  return section('Background', (items || '<p class="hint">A Google Maps screenshot or a survey PDF to trace over.</p>') + add, 'bg-panel');
}

// ---- layers ----------------------------------------------------------------

function layersSection() {
  const rows = store.project.layers.map((l) => `<div class="layer-row ${l.visible ? '' : 'off'}">
    <span>${esc(l.name)}</span>
    <button class="icon-btn" title="${l.visible ? 'Hide' : 'Show'}" data-act="layer.visible" data-layer="${l.id}">${l.visible ? ICONS.eye : ICONS.eyeOff}</button>
    <button class="icon-btn ${l.locked ? 'on' : ''}" title="${l.locked ? 'Unlock' : 'Lock'}" data-act="layer.lock" data-layer="${l.id}">${l.locked ? ICONS.lock : ICONS.unlock}</button>
  </div>`).join('');
  return section('Layers', rows, 'layers');
}

// ---- events ----------------------------------------------------------------

function selected() { return store.selectedId && store.getObject(store.selectedId); }

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  const bgId = b.dataset.bg;
  const o = selected();

  if (act === 'set') {
    const key = b.dataset.key, val = b.dataset.val;
    if (key.startsWith('tool.')) {
      const t = activeTool();
      t[key.slice(5)] = val;
      render();
      return;
    }
    if (key === 'status' && o) store.commit('Change status', () => { o.status = val; });
    else if (key.startsWith('prop.') && o) store.commit('Edit', () => { o.props[key.slice(5)] = val; });
    return;
  }
  if (act === 'delete' && o) {
    store.commit('Delete', (p) => { p.objects = p.objects.filter((x) => x.id !== o.id); });
    store.select(null);
    return;
  }
  if (act === 'duplicate' && o) {
    const copy = structuredClone(o);
    copy.id = uid();
    translateObject(copy, 2, 2);
    store.commit('Duplicate', (p) => p.objects.push(copy));
    store.select(copy.id);
    return;
  }
  if (act === 'bg.add') { document.getElementById('file-bg').click(); return; }
  if (act === 'bg.toggle') { const bg = store.getBackground(bgId); store.commit('Toggle background', () => { bg.visible = !bg.visible; }); return; }
  if (act === 'bg.calibrate') {
    const bg = store.getBackground(bgId);
    if (!bg.visible) store.commit('Show background', () => { bg.visible = true; });
    const bgLayer = store.getLayer('background');
    if (!bgLayer.visible) store.commit('Show layer', () => { bgLayer.visible = true; });
    setTool('calibrate', { bgId });
    return;
  }
  if (act === 'bg.move') { setTool('moveBg', { bgId }); return; }
  if (act === 'bg.remove') {
    const ok = await confirmDialog({ title: 'Remove image?', message: 'The background image is removed from this plan. Your drawing stays. Undo can bring it back.', okLabel: 'Remove', danger: true });
    if (ok) store.commit('Remove background', (p) => { p.backgrounds = p.backgrounds.filter((x) => x.id !== bgId); });
    return;
  }
  if (act === 'layer.visible' || act === 'layer.lock') {
    const L = store.getLayer(b.dataset.layer);
    store.commit(act === 'layer.visible' ? 'Toggle layer' : 'Lock layer', () => {
      if (act === 'layer.visible') L.visible = !L.visible; else L.locked = !L.locked;
    });
  }
}

function onChange(e) {
  const t = e.target;
  const key = t.dataset.key;
  if (!key) return;
  const o = selected();
  if (key.startsWith('prop.') && o) {
    const k = key.slice(5);
    const v = t.type === 'checkbox' ? t.checked : t.value;
    store.commit('Edit', () => { o.props[k] = v; });
  } else if (key === 'geom.diameter' && o) {
    const d = parseLength(t.value);
    if (d && d > 0) store.commit('Resize tree', () => { o.geometry.r = d / 2; });
    else { toast('Enter a diameter like 25 or 25\'6"'); render(); }
  } else if (key === 'bg.name') {
    const bg = store.getBackground(t.dataset.bg);
    store.commit('Rename background', () => { bg.name = t.value; });
  } else if (key === 'bg.rotationText' || key === 'plan.northText') {
    const v = parseFloat(t.value);
    if (!isFinite(v)) { render(); return; }
    const deg = ((v + 180) % 360 + 360) % 360 - 180;
    if (key === 'plan.northText') store.commit('North arrow', (p) => { p.northRotationDeg = deg; });
    else { const bg = store.getBackground(t.dataset.bg); store.commit('Rotate background', () => { bg.rotationDeg = deg; }); }
  } else if (key === 'bg.opacity' || key === 'bg.rotation' || key === 'plan.north') {
    // slider released
    if (sliderOpen) { sliderOpen = false; store.end(); render(); }
  }
}

function onInput(e) {
  const t = e.target;
  const key = t.dataset.key;
  if (key !== 'bg.opacity' && key !== 'bg.rotation' && key !== 'plan.north') return;
  if (!sliderOpen) { sliderOpen = true; store.begin(key === 'plan.north' ? 'North arrow' : 'Adjust background'); }
  const v = parseFloat(t.value);
  if (key === 'plan.north') {
    store.project.northRotationDeg = v;
    const txt = el.querySelector('[data-key="plan.northText"]'); if (txt) txt.value = `${v}°`;
  } else {
    const bg = store.getBackground(t.dataset.bg);
    if (key === 'bg.opacity') bg.opacity = v; else bg.rotationDeg = v;
    const txt = el.querySelector(`[data-key="bg.rotationText"][data-bg="${bg.id}"]`);
    if (txt && key === 'bg.rotation') txt.value = `${v}°`;
  }
  store.emit('change', { reason: 'quiet' });
}
