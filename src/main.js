// App start-up: wires the store, view, tools, panels and file handling together.
import { store, blankProject } from './core/store.js';
import { view } from './core/view.js';
import { objectBoundsPts } from './core/types.js';
import { bounds } from './core/geom.js';
import { fmtFt } from './core/units.js';
import { renderAll } from './render/render.js';
import { initInput, registerTool, setTool, toolKey, setSpace, onToolChange, activeTool, activeToolId, onCursor, redrawOverlay } from './tools/manager.js';
import { selectTool } from './tools/select.js';
import { makePolygonTool } from './tools/draw-polygon.js';
import { treeTool, measureTool, dimensionTool, calibrateTool, moveBgTool, panTool } from './tools/other-tools.js';
import { importBackground } from './io/images.js';
import { exportProject, readProjectFile } from './io/project-file.js';
import { scheduleSave, loadRecovery, clearRecovery } from './io/recovery.js';
import { initSidebar, render as renderSidebar } from './ui/sidebar.js';
import { ICONS } from './ui/icons.js';
import { toast } from './ui/toast.js';
import { confirmDialog, infoDialog } from './ui/dialog.js';

const $ = (s) => document.querySelector(s);

// ---- tools ------------------------------------------------------------------
registerTool('select', selectTool);
registerTool('pan', panTool);
registerTool('property', makePolygonTool('site.property', { hint: 'Click a property corner' }));
registerTool('house', makePolygonTool('site.house', { allowRect: true, defaultRect: true }));
registerTool('structure', makePolygonTool('site.structure', { allowRect: true, defaultRect: true }));
registerTool('driveway', makePolygonTool('site.driveway', { allowRect: true, defaultRect: true }));
registerTool('patio', makePolygonTool('site.patio', { allowRect: true, defaultRect: true }));
registerTool('tree', treeTool);
registerTool('measure', measureTool);
registerTool('dimension', dimensionTool);
registerTool('calibrate', calibrateTool);
registerTool('moveBg', moveBgTool);

const RAIL = [
  { id: 'select', icon: 'select', label: 'Select', key: 'V' },
  { id: 'pan', icon: 'pan', label: 'Pan', key: 'H' },
  '---',
  { id: 'property', icon: 'property', label: 'Property', key: 'P' },
  { id: 'house', icon: 'house', label: 'House', key: 'B' },
  { id: 'structure', icon: 'shed', label: 'Building', key: 'O' },
  { id: 'driveway', icon: 'driveway', label: 'Driveway', key: 'D' },
  { id: 'patio', icon: 'patio', label: 'Patio', key: 'S' },
  { id: 'tree', icon: 'tree', label: 'Tree', key: 'T' },
  '---',
  { id: 'measure', icon: 'measure', label: 'Measure', key: 'M' },
  { id: 'dimension', icon: 'dimension', label: 'Dimension', key: 'N' },
];

function buildRail() {
  $('#rail').innerHTML = RAIL.map((t) => t === '---'
    ? '<hr>'
    : `<button class="tool" data-tool="${t.id}" title="${t.label} (${t.key})">${ICONS[t.icon]}<span>${t.label}</span></button>`).join('');
  $('#rail').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (b) setTool(b.dataset.tool);
  });
}

function syncRail(id) {
  document.querySelectorAll('#rail .tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === id));
  $('#status-hint').textContent = (activeTool() && activeTool().status && id !== 'select') ? activeTool().status() : 'Scroll to zoom · Space + drag or middle mouse to pan · ? for shortcuts';
}

// ---- top bar ---------------------------------------------------------------
function buildTopbar() {
  $('#brand').innerHTML = `${ICONS.logo}<span>swamp<b>druid</b>tool</span>`;
  $('#btn-new').innerHTML = `${ICONS.newDoc}<span>New</span>`;
  $('#btn-open').innerHTML = `${ICONS.open}<span>Open</span>`;
  $('#btn-export').innerHTML = `${ICONS.export}<span>Export</span>`;
  $('#btn-undo').innerHTML = ICONS.undo;
  $('#btn-redo').innerHTML = ICONS.redo;
  $('#btn-help').innerHTML = ICONS.help;
  $('#btn-fit').innerHTML = ICONS.fit;
  $('#btn-zin').innerHTML = ICONS.plus;
  $('#btn-zout').innerHTML = ICONS.minus;

  $('#btn-new').onclick = newPlan;
  $('#btn-open').onclick = () => $('#file-open').click();
  $('#btn-export').onclick = doExport;
  $('#btn-undo').onclick = () => store.undo();
  $('#btn-redo').onclick = () => store.redo();
  $('#btn-help').onclick = showHelp;
  $('#btn-fit').onclick = fitAll;
  $('#btn-zin').onclick = () => view.zoomBy(1.25);
  $('#btn-zout').onclick = () => view.zoomBy(0.8);

  const name = $('#plan-name');
  name.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') name.blur(); });
  name.addEventListener('change', () => store.commit('Rename plan', (p) => { p.name = name.value.trim() || 'Untitled plan'; }));

  $('#file-open').addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f); });
  $('#file-bg').addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) addBackground(f); });

  $('#tg-grid').onchange = (e) => store.quiet((p) => { p.settings.gridOn = e.target.checked; });
  $('#tg-snap').onchange = (e) => store.quiet((p) => { p.settings.snapOn = e.target.checked; });
  $('#tg-gridsnap').onchange = (e) => store.quiet((p) => { p.settings.gridSnap = e.target.checked; });
}

function syncTopbar() {
  $('#btn-undo').disabled = !store.canUndo();
  $('#btn-redo').disabled = !store.canRedo();
  $('#btn-undo').title = store.canUndo() ? `Undo ${store.undoStack[store.undoStack.length - 1].label.toLowerCase()} (Ctrl Z)` : 'Undo (Ctrl Z)';
  $('#btn-redo').title = store.canRedo() ? `Redo ${store.redoStack[store.redoStack.length - 1].label.toLowerCase()} (Ctrl Shift Z)` : 'Redo (Ctrl Shift Z)';
  const name = $('#plan-name');
  if (document.activeElement !== name) name.value = store.project.name;
  document.title = `${store.project.name} · swampdruidtool`;
  const st = $('#save-state');
  const empty = !store.project.objects.length && !store.project.backgrounds.length;
  st.textContent = empty ? '' : store.dirty ? 'Not exported' : 'Exported';
  st.className = store.dirty ? 'save-state dirty' : 'save-state';
  const s = store.project.settings;
  $('#tg-grid').checked = s.gridOn; $('#tg-snap').checked = s.snapOn; $('#tg-gridsnap').checked = s.gridSnap;
  $('#empty').hidden = !empty;
}

// ---- overlays: north arrow, scale bar, coords -------------------------------
function drawNorth() {
  $('#north').style.transform = `rotate(${store.project.northRotationDeg || 0}deg)`;
}

function drawScaleBar() {
  // pick a round length that is 80-160 px on screen
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const ft = nice.find((n) => n * view.scale >= 80) || 1000;
  const px = ft * view.scale;
  $('#scalebar').innerHTML = `<div class="bar" style="width:${px}px"><i></i><i></i><i></i><i></i></div><div class="lab"><span>0</span><span>${ft / 2}'</span><span>${ft}'</span></div>`;
}

onCursor((inp) => {
  const [x, y] = inp.raw;
  $('#coords').textContent = `${fmtFt(x)}, ${fmtFt(y)}`;
});

// ---- files -----------------------------------------------------------------
async function addBackground(file) {
  try {
    const center = view.toWorld({ x: view.stage.width() / 2, y: view.stage.height() / 2 });
    const bg = await importBackground(file, { center });
    if (!bg) return;
    const im = store.images.get(bg.imageId);
    const w = im.width / bg.pxPerFt, h = im.height / bg.pxPerFt;
    view.fitBounds({ minX: bg.x - w / 2, minY: bg.y - h / 2, maxX: bg.x + w / 2, maxY: bg.y + h / 2 }, 30);
    toast('Image added. Now set the scale: click both ends of a distance you know.', 5000);
    setTool('calibrate', { bgId: bg.id });
  } catch (err) {
    console.error(err);
    toast(err.message || 'Could not import that file');
  }
}

async function openFile(file) {
  if (/\.(png|jpe?g|webp|gif|pdf)$/i.test(file.name)) { addBackground(file); return; }
  if (store.dirty && hasContent()) {
    const ok = await confirmDialog({ title: 'Open another plan?', message: 'Your current plan has changes that are not exported. Opening a file replaces it.', okLabel: 'Open anyway', danger: true });
    if (!ok) return;
  }
  try {
    const { project, images } = await readProjectFile(file);
    store.load(project, images);
    setTool('select');
    if (project.view) view.setViewState(project.view); else fitAll();
    toast(`Opened ${project.name}`);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Could not open that file');
  }
}

async function doExport() {
  try {
    await exportProject();
    toast('Plan exported. Keep the .sdt file and open it here any time.');
    syncTopbar();
  } catch (err) {
    console.error(err);
    toast('Export failed: ' + err.message);
  }
}

async function newPlan() {
  if (hasContent() && store.dirty) {
    const ok = await confirmDialog({ title: 'Start a new plan?', message: 'Your current plan has changes that are not exported. They will be lost.', okLabel: 'Start new', danger: true });
    if (!ok) return;
  }
  store.load(blankProject());
  await clearRecovery();
  view.setViewState({ x: view.stage.width() / 2, y: view.stage.height() / 2, scale: 4 });
  setTool('select');
}

const hasContent = () => store.project.objects.length > 0 || store.project.backgrounds.length > 0;

function fitAll() {
  const pts = [];
  for (const o of store.project.objects) pts.push(...objectBoundsPts(o));
  for (const bg of store.project.backgrounds) {
    if (!bg.visible) continue;
    const im = store.images.get(bg.imageId);
    if (!im) continue;
    const w = im.width / bg.pxPerFt, h = im.height / bg.pxPerFt;
    pts.push([bg.x - w / 2, bg.y - h / 2], [bg.x + w / 2, bg.y + h / 2]);
  }
  if (!pts.length) return;
  view.fitBounds(bounds(pts));
}

// drag and drop files onto the window
function initDrop() {
  const zone = $('#dropzone');
  let depth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { depth++; zone.hidden = false; } });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) zone.hidden = true; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault(); depth = 0; zone.hidden = true;
    const f = e.dataTransfer.files[0];
    if (f) openFile(f);
  });
  // paste a screenshot straight from the clipboard
  window.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    const blob = item.getAsFile();
    addBackground(new File([blob], 'Pasted screenshot.png', { type: blob.type }));
  });
}

// ---- keyboard --------------------------------------------------------------
const KEYS = { v: 'select', h: 'pan', p: 'property', b: 'house', o: 'structure', d: 'driveway', s: 'patio', t: 'tree', m: 'measure', n: 'dimension' };

function initKeys() {
  window.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-back')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();

    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); store.redo(); return; }
    if (mod && k === 's') { e.preventDefault(); doExport(); return; }
    if (mod && k === 'o') { e.preventDefault(); $('#file-open').click(); return; }

    if (e.key === ' ' && !e.repeat) { setSpace(true); e.preventDefault(); return; }
    if (toolKey(e)) { e.preventDefault(); return; }
    if (mod || e.altKey) return;

    if (KEYS[k]) { setTool(KEYS[k]); return; }
    if (k === 'g') { store.quiet((p) => { p.settings.gridOn = !p.settings.gridOn; }); return; }
    if (k === 'f') { fitAll(); return; }
    if (k === '=' || k === '+') { view.zoomBy(1.25); return; }
    if (k === '-') { view.zoomBy(0.8); return; }
    if (k === '?' || (e.shiftKey && k === '/')) { showHelp(); return; }
    if (k === 'escape') setTool('select');
  });
  window.addEventListener('keyup', (e) => { if (e.key === ' ') setSpace(false); });
  window.addEventListener('blur', () => setSpace(false));
}

function showHelp() {
  const row = (k, d) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`;
  infoDialog({
    title: 'How to use swampdruidtool',
    html: `<div class="help-grid">
      <div>
        <h4>Getting a background</h4>
        <ol>
          <li>In Google Maps, switch to satellite and zoom in on the property.</li>
          <li>Right-click a spot, choose <b>Measure distance</b>, and click across something like the driveway or a lot line. Note the length.</li>
          <li>Take a screenshot and drop it here, or paste it with <kbd>Ctrl V</kbd>.</li>
          <li>Click both ends of the line you measured and type its length. The image is now to scale.</li>
        </ol>
        <p>A survey PDF works the same way: use a lot line length printed on the survey.</p>
        <h4>Saving</h4>
        <p>Nothing is saved online. <b>Export</b> downloads a <code>.sdt</code> file; <b>Open</b> loads it back. This browser also keeps a recovery copy so a refresh won't lose your work.</p>
      </div>
      <div>
        <h4>Shortcuts</h4>
        <table class="keys">
          ${row('V', 'Select')}${row('H', 'Pan')}${row('P', 'Property line')}${row('B', 'House')}${row('O', 'Other building')}
          ${row('D', 'Driveway')}${row('S', 'Patio / walk')}${row('T', 'Existing tree')}${row('M', 'Measure')}${row('N', 'Dimension')}
          ${row('Space + drag', 'Pan with any tool')}${row('Scroll', 'Zoom')}${row('F', 'Fit plan to screen')}${row('G', 'Grid on / off')}
          ${row('Shift', 'Lock angle to 15° steps')}${row('Alt', 'Turn off snapping')}${row('25 Enter', 'Exact length while drawing')}
          ${row('Backspace', 'Undo last point while drawing')}${row('Delete', 'Delete selected')}${row('Alt + drag', 'Copy while moving')}
          ${row('Ctrl Z / Ctrl Shift Z', 'Undo / redo')}${row('Ctrl S', 'Export')}
        </table>
      </div>
    </div>`,
  });
}

// ---- start-up --------------------------------------------------------------
async function start() {
  buildTopbar();
  buildRail();
  view.init($('#canvas'));
  initInput();
  initSidebar();
  initKeys();
  initDrop();

  $('#empty-import').onclick = () => $('#file-bg').click();
  $('#empty-open').onclick = () => $('#file-open').click();
  $('#empty-blank').onclick = () => { $('#empty').hidden = true; setTool('property'); };

  onToolChange((id) => { syncRail(id); renderSidebar(); });

  store.on('change', ({ reason }) => {
    renderAll();
    redrawOverlay();
    drawNorth();
    syncTopbar();
    if (reason !== 'live') scheduleSave();
  });
  store.on('select', () => redrawOverlay());
  store.on('saved', () => { syncTopbar(); scheduleSave(); });
  view.onChange(() => { renderAll(); drawScaleBar(); });

  setTool('select');

  const rec = await loadRecovery();
  if (rec && (rec.project.objects.length || rec.project.backgrounds.length)) {
    store.load(rec.project, rec.images);
    store.dirty = !!rec.dirty;
    if (rec.project.view) view.setViewState(rec.project.view);
    toast('Picked up where you left off');
  } else {
    store.emit('change', { reason: 'load' });
  }
  syncTopbar();
  renderSidebar();
  drawScaleBar();

  window.addEventListener('beforeunload', (e) => {
    if (store.dirty && hasContent()) { e.preventDefault(); e.returnValue = ''; }
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

window.__sdt = { store, view, setTool, activeToolId };
start();
