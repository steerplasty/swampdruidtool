// Tree, measure, dimension, background calibration and background move tools.
import { store } from '../core/store.js';
import { view } from '../core/view.js';
import { dist, along, uid, polyArea, pathLength } from '../core/geom.js';
import { TYPES } from '../core/types.js';
import { fmtFt, fmtArea, parseLength } from '../core/units.js';
import { input, resolvePoint, setTool } from './manager.js';
import { toast } from '../ui/toast.js';
import { promptDialog } from '../ui/dialog.js';
import { TREE_FORMS } from '../render/symbols.js';

// ---- Existing tree --------------------------------------------------------
let lastDiameter = 20;
export const treeTool = {
  cursor: 'crosshair',
  center: null,
  form: 'canopy',
  activate() { this.center = null; },
  acceptsTyping() { return !!this.center; },
  onDown() {
    const p = resolvePoint();
    if (!this.center) { this.center = p; return; }
    const r = dist(this.center, p);
    this.place(r > view.px(4) ? r : lastDiameter / 2);
  },
  onMove() { resolvePoint(); },
  onTyped(v) {
    const d = parseLength(v);
    if (d == null || d <= 0) { toast(`Could not read "${v}" as a diameter`); return; }
    this.place(d / 2);
  },
  place(r) {
    const def = TYPES['site.tree'];
    if (!store.layerUsable(def.layer)) { toast('The Site base layer is hidden or locked. Turn it on in Layers first.'); this.center = null; return; }
    const form = TREE_FORMS.find((f) => f.id === this.form) || TREE_FORMS[0];
    const obj = {
      id: uid(), type: 'site.tree', layer: def.layer,
      geometry: { kind: 'circle', center: this.center, r },
      props: { ...structuredClone(def.defaults), form: form.id, color: form.color },
      status: 'existing',
    };
    lastDiameter = r * 2;
    store.commit('Add tree', (p) => p.objects.push(obj));
    this.center = null;
  },
  onKey(e) {
    if (e.key === 'Escape') { if (this.center) { this.center = null; return true; } setTool('select'); return true; }
    return false;
  },
  drawOverlay(ov) {
    if (!this.center) return;
    ov.circle(this.center, Math.max(dist(this.center, input.pt), view.px(2)), { dash: [6, 4] });
    ov.line([this.center, input.pt], { width: 1 });
  },
  tip() {
    if (!this.center) return 'Click the trunk';
    return `Canopy ${fmtFt(dist(this.center, input.pt) * 2)} <span class="muted">· or type a diameter</span>`;
  },
  status() { return 'Click the trunk, then click the canopy edge (or type a diameter + Enter). Tool stays on so you can place several trees. Esc to stop.'; },
};

// ---- Measure (temporary) --------------------------------------------------
export const measureTool = {
  cursor: 'crosshair',
  pts: [],
  done: false,
  activate() { this.pts = []; this.done = false; },
  acceptsTyping: () => false,
  onDown() {
    const p = resolvePoint({ from: this.pts[this.pts.length - 1] || null, extra: this.pts.slice(0, 1) });
    if (this.done) { this.pts = []; this.done = false; }
    this.pts.push(p);
  },
  onMove() { resolvePoint({ from: this.done ? null : this.pts[this.pts.length - 1] || null, extra: this.pts.slice(0, 1) }); },
  onDblClick() { this.done = true; },
  onKey(e) {
    if (e.key === 'Enter') { this.done = true; return true; }
    if (e.key === 'Escape') { if (this.pts.length) { this.pts = []; this.done = false; return true; } setTool('select'); return true; }
    if (e.key === 'Backspace' && this.pts.length) { this.pts.pop(); return true; }
    return false;
  },
  drawOverlay(ov) {
    const color = '#c2561f';
    const pts = this.done ? this.pts : [...this.pts, input.pt];
    if (pts.length >= 2) ov.line(pts, { color, width: 2, dash: [8, 4] });
    this.pts.forEach((p) => ov.handle(p, { shape: 'circle', size: 7, color }));
  },
  tip() {
    if (!this.pts.length) return 'Click to start measuring';
    const pts = this.done ? this.pts : [...this.pts, input.pt];
    const total = pathLength(pts);
    const seg = dist(pts[pts.length - 2], pts[pts.length - 1]);
    let s = pts.length > 2 ? `${fmtFt(seg)} · total <b>${fmtFt(total)}</b>` : `<b>${fmtFt(total)}</b>`;
    if (pts.length >= 3) s += ` · area if closed ${fmtArea(polyArea(pts))}`;
    return s;
  },
  status() { return 'Click points to measure a distance; keep clicking for a running total. Double-click or Enter to stop. Nothing is added to the plan.'; },
};

// ---- Dimension (saved on the plan) ----------------------------------------
export const dimensionTool = {
  cursor: 'crosshair',
  a: null, b: null,
  activate() { this.a = this.b = null; },
  acceptsTyping() { return !!this.a && !this.b; },
  onDown() {
    if (!this.a) { this.a = resolvePoint(); return; }
    if (!this.b) { this.b = resolvePoint({ from: this.a }); if (dist(this.a, this.b) < view.px(3)) this.b = null; return; }
    this.place();
  },
  onMove() {
    if (!this.a) resolvePoint();
    else if (!this.b) resolvePoint({ from: this.a });
    else input.pt = input.raw;
  },
  onTyped(v) {
    const L = parseLength(v);
    if (L == null || L <= 0) return;
    this.b = along(this.a, input.pt, L);
  },
  offset() {
    const { a, b } = this;
    const L = dist(a, b) || 1;
    const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    return (input.raw[0] - a[0]) * nx + (input.raw[1] - a[1]) * ny;
  },
  place() {
    if (!store.layerUsable('notes')) { toast('The Dimensions layer is hidden or locked. Turn it on in Layers first.'); this.a = this.b = null; return; }
    const obj = {
      id: uid(), type: 'notes.dimension', layer: TYPES['notes.dimension'].layer,
      geometry: { kind: 'dimension', a: this.a, b: this.b, offset: this.offset() },
      props: {}, status: 'existing',
    };
    store.commit('Add dimension', (p) => p.objects.push(obj));
    this.a = this.b = null;
  },
  onKey(e) {
    if (e.key === 'Escape') { if (this.a) { this.a = this.b = null; return true; } setTool('select'); return true; }
    return false;
  },
  drawOverlay(ov) {
    if (!this.a) return;
    if (!this.b) { ov.line([this.a, input.pt], { width: 1.5 }); return; }
    const { a, b } = this;
    const L = dist(a, b) || 1;
    const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    const off = this.offset();
    ov.line([a, [a[0] + nx * off, a[1] + ny * off], [b[0] + nx * off, b[1] + ny * off], b], { width: 1.5 });
  },
  tip() {
    if (!this.a) return 'Click the first point';
    if (!this.b) return `${fmtFt(dist(this.a, input.pt))} <span class="muted">· click second point</span>`;
    return `${fmtFt(dist(this.a, this.b))} <span class="muted">· click to place the line</span>`;
  },
  status() { return 'Click two points, then move out and click to place the dimension line. It stays on the plan and on printouts.'; },
};

// ---- Calibrate background scale -------------------------------------------
export const calibrateTool = {
  cursor: 'crosshair',
  bgId: null, p1: null, p2: null,
  activate(opts) { this.bgId = opts.bgId || (store.project.backgrounds[0] && store.project.backgrounds[0].id); this.p1 = this.p2 = null; },
  async onDown() {
    const p = input.raw;
    if (!this.p1) { this.p1 = p; return; }
    if (this.p2) return;
    this.p2 = p;
    const measured = dist(this.p1, this.p2);
    if (measured < 1e-6) { this.p2 = null; return; }
    const val = await promptDialog({
      title: 'Set the scale',
      message: 'How long is that line in real life? Use a measurement you know, like a property line from the survey, a driveway width or a house wall.',
      placeholder: "e.g. 85' or 85'6\"",
      okLabel: 'Set scale',
      validate: (v) => { const L = parseLength(v); return L && L > 0 ? null : "Enter a length like 85 or 85'6\""; },
    });
    if (val == null) { this.p1 = this.p2 = null; return; }
    const real = parseLength(val);
    const k = real / measured;
    const bg = store.getBackground(this.bgId);
    if (!bg) return;
    const p1 = this.p1;
    store.commit('Set background scale', () => {
      bg.pxPerFt = bg.pxPerFt / k;
      bg.x = p1[0] + (bg.x - p1[0]) * k;
      bg.y = p1[1] + (bg.y - p1[1]) * k;
      bg.calibrated = true;
    });
    // keep the same spot on screen
    const sp = view.toScreen(p1);
    view.zoomAt(sp, view.scale / k);
    this.p1 = this.p2 = null;
    toast(`Scale set: ${fmtFt(real)} line locked in`);
    setTool('select');
  },
  onMove() { input.pt = input.raw; input.snapKind = null; },
  onKey(e) { if (e.key === 'Escape') { this.p1 = this.p2 = null; setTool('select'); return true; } return false; },
  drawOverlay(ov) {
    const color = '#c2561f';
    if (this.p1) {
      ov.line([this.p1, this.p2 || input.raw], { color, width: 2.5 });
      ov.handle(this.p1, { color, shape: 'circle', size: 9 });
      if (this.p2) ov.handle(this.p2, { color, shape: 'circle', size: 9 });
    }
  },
  tip() { return this.p1 ? 'Click the other end' : 'Click one end of a known distance'; },
  status() { return 'Zoom in close. Click both ends of something you know the length of, then type its real length. The more accurate the clicks, the more accurate the plan.'; },
};

// ---- Move background ------------------------------------------------------
export const moveBgTool = {
  cursor: 'move',
  bgId: null, last: null,
  activate(opts) { this.bgId = opts.bgId; this.last = null; },
  deactivate() { if (this.last) store.end(); this.last = null; },
  onDown() { store.begin('Move background'); this.last = input.raw; },
  onMove() {
    input.snapKind = null;
    if (!this.last) return;
    const bg = store.getBackground(this.bgId);
    if (!bg) return;
    bg.x += input.raw[0] - this.last[0];
    bg.y += input.raw[1] - this.last[1];
    this.last = input.raw;
    store.changed();
  },
  onUp() { store.end(); this.last = null; },
  onKey(e) { if (e.key === 'Escape' || e.key === 'Enter') { setTool('select'); return true; } return false; },
  tip() { return 'Drag to line up the image'; },
  status() { return 'Drag the image to line it up with your drawing. Press Esc or Enter when done.'; },
};

export const panTool = {
  cursor: 'grab',
  status() { return 'Drag to pan. Scroll to zoom. You can also hold Space or the middle mouse button with any tool.'; },
};
