// Draws the project from its data: backgrounds, then each layer's objects.
// Everything is redrawn from the model, so the model is the single source of truth.
/* global Konva */
import { store } from '../core/store.js';
import { view } from '../core/view.js';
import { centroid, polyArea, dist } from '../core/geom.js';
import { fmtFt, fmtArea } from '../core/units.js';
import { surfaceFill, patternFill } from './textures.js';
import { TREE_FORMS } from './symbols.js';

const INK = '#2f3a2c';
const FONT = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

export function renderAll() {
  renderBackgrounds();
  renderObjects();
}

export function renderBackgrounds() {
  const L = view.bgLayer;
  L.destroyChildren();
  const lay = store.getLayer('background');
  if (lay && lay.visible) {
    for (const bg of store.project.backgrounds) {
      if (!bg.visible) continue;
      const im = store.images.get(bg.imageId);
      if (!im || !im.img) continue;
      const w = im.width / bg.pxPerFt, h = im.height / bg.pxPerFt;
      L.add(new Konva.Image({
        image: im.img,
        x: bg.x, y: bg.y,
        width: w, height: h,
        offsetX: w / 2, offsetY: h / 2,
        rotation: bg.rotationDeg || 0,
        opacity: bg.opacity ?? 1,
        listening: false,
      }));
    }
  }
  L.batchDraw();
}

function label(text, x, y, { size = 12, rotation = 0, color = INK, weight = 'normal', halo = true, italic = false } = {}) {
  const fs = size / view.scale;
  const t = new Konva.Text({
    text, x, y, fontSize: fs, fontFamily: FONT, fill: color,
    fontStyle: `${italic ? 'italic ' : ''}${weight}`,
    rotation, listening: false, align: 'center',
  });
  t.offsetX(t.width() / 2);
  t.offsetY(t.height() / 2);
  if (halo) {
    t.stroke('rgba(250,248,242,0.9)');
    t.strokeWidth(3 / view.scale);
    t.fillAfterStrokeEnabled(true);
  }
  return t;
}

function uprightAngle(a, b) {
  let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  if (ang > 90) ang -= 180;
  if (ang < -90) ang += 180;
  return ang;
}

// Edge length labels placed just outside a polygon
function edgeLabels(group, pts, { outside = true, size = 11, color = INK } = {}) {
  const c = centroid(pts);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = dist(a, b);
    if (L * view.scale < 40) continue;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    let nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    // point the normal away from the centroid
    if ((mx - c[0]) * nx + (my - c[1]) * ny < 0) { nx = -nx; ny = -ny; }
    const off = view.px(12) * (outside ? 1 : -1);
    group.add(label(fmtFt(L), mx + nx * off, my + ny * off, { size, rotation: uprightAngle(a, b), color }));
  }
}

const flat = (pts) => pts.flat();

function removeStyle(node) {
  node.opacity(0.5);
}

const DRAW = {
  'site.property'(o, g) {
    const pts = o.geometry.points;
    g.add(new Konva.Line({
      points: flat(pts), closed: true,
      stroke: '#7a3b2e', strokeWidth: 2, strokeScaleEnabled: false,
      dash: [18, 5, 3, 5, 3, 5], // screen px, since stroke scaling is off
      listening: false,
    }));
    if (o.props.showLengths) edgeLabels(g, pts, { color: '#6b3427' });
  },

  'site.house'(o, g) { building(o, g, 'roof'); },
  'site.structure'(o, g) { building(o, g, 'roof'); },

  'site.driveway'(o, g) { surface(o, g); },
  'site.patio'(o, g) { surface(o, g); },

  'site.tree'(o, g) {
    const { center, r } = o.geometry;
    const form = TREE_FORMS.find((f) => f.id === o.props.form) || TREE_FORMS[0];
    g.add(new Konva.Shape({
      listening: false,
      sceneFunc: (ctx) => {
        form.draw(ctx._context, {
          cx: center[0], cy: center[1], r,
          color: o.props.color || form.color,
          seed: o.id, px: 1 / view.scale,
          remove: o.status === 'remove',
        });
      },
    }));
    if (o.props.label && r * view.scale > 18) {
      g.add(label(o.props.label, center[0], center[1] + r + view.px(10), { size: 11, italic: true }));
    }
  },

  'notes.dimension'(o, g) {
    const { a, b } = o.geometry;
    const off = o.geometry.offset || 0;
    const L = dist(a, b);
    if (L < 1e-6) return;
    const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    const a2 = [a[0] + nx * off, a[1] + ny * off], b2 = [b[0] + nx * off, b[1] + ny * off];
    const ext = view.px(6) * Math.sign(off || 1);
    const color = '#3d4a63';
    const line = (pts, w = 1) => new Konva.Line({ points: pts, stroke: color, strokeWidth: w, strokeScaleEnabled: false, listening: false });
    g.add(line([a[0] + nx * view.px(3) * Math.sign(off || 1), a[1] + ny * view.px(3) * Math.sign(off || 1), a2[0] + nx * ext, a2[1] + ny * ext], 0.8));
    g.add(line([b[0] + nx * view.px(3) * Math.sign(off || 1), b[1] + ny * view.px(3) * Math.sign(off || 1), b2[0] + nx * ext, b2[1] + ny * ext], 0.8));
    g.add(line([...a2, ...b2], 1));
    // architectural tick marks
    const t = view.px(5);
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    const tick = (p) => line([p[0] - (ux + nx) * t, p[1] - (uy + ny) * t, p[0] + (ux + nx) * t, p[1] + (uy + ny) * t], 1.6);
    g.add(tick(a2), tick(b2));
    const mid = [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2];
    const s = Math.sign(off || 1);
    g.add(label(fmtFt(L), mid[0] + nx * view.px(9) * s, mid[1] + ny * view.px(9) * s, { size: 11.5, rotation: uprightAngle(a, b), color, weight: '600' }));
  },
};

function building(o, g, tex) {
  const pts = o.geometry.points;
  // shadow
  const sh = 0.9; // shadow offset in feet, sun from the upper left
  g.add(new Konva.Line({
    points: flat(pts.map(([x, y]) => [x + sh, y + sh])), closed: true,
    fill: 'rgba(40,44,32,0.18)', listening: false,
  }));
  const body = new Konva.Line({
    points: flat(pts), closed: true,
    ...patternFill(tex),
    stroke: '#3f3d36', strokeWidth: 2.2, strokeScaleEnabled: false, lineJoin: 'miter',
    listening: false,
  });
  if (o.status === 'remove') removeStyle(body);
  g.add(body);
  const c = centroid(pts);
  const text = [o.props.label, o.props.showArea ? fmtArea(polyArea(pts)) : ''].filter(Boolean).join('\n');
  if (text) g.add(label(text, c[0], c[1], { size: 12.5, weight: '600', color: '#3a372f' }));
  if (o.props.showLengths) edgeLabels(g, pts, { size: 10.5 });
}

function surface(o, g) {
  const pts = o.geometry.points;
  const node = new Konva.Line({
    points: flat(pts), closed: true,
    ...surfaceFill(o.props.material),
    stroke: 'rgba(70,64,52,0.75)', strokeWidth: 1.2, strokeScaleEnabled: false,
    listening: false,
  });
  if (o.status === 'remove') removeStyle(node);
  g.add(node);
  const c = centroid(pts);
  const text = [o.props.label, o.props.showArea ? fmtArea(polyArea(pts)) : ''].filter(Boolean).join('\n');
  if (text) g.add(label(text, c[0], c[1], { size: 11.5, weight: '600' }));
}

// Draw order inside a layer: ground surfaces first, then buildings, trees, lines
const ORDER = { 'site.driveway': 1, 'site.patio': 2, 'site.house': 3, 'site.structure': 3, 'site.tree': 4, 'site.property': 5, 'notes.dimension': 6 };

export function renderObjects() {
  const L = view.objLayer;
  L.destroyChildren();
  for (const layer of store.project.layers) {
    if (layer.id === 'background' || !layer.visible) continue;
    const lg = new Konva.Group({ listening: false, opacity: layer.locked ? 0.85 : 1 });
    const objs = store.project.objects
      .filter((o) => o.layer === layer.id)
      .sort((a, b) => (ORDER[a.type] || 9) - (ORDER[b.type] || 9));
    for (const o of objs) {
      const fn = DRAW[o.type];
      if (!fn) continue;
      const g = new Konva.Group({ listening: false });
      try { fn(o, g); } catch (err) { console.error('render', o, err); }
      if (o.status === 'remove' && o.type !== 'site.tree') {
        // a red dashed outline marks things to remove
        const pts = o.geometry.points;
        if (pts) g.add(new Konva.Line({ points: flat(pts), closed: true, stroke: '#b3402e', strokeWidth: 1.5, strokeScaleEnabled: false, dash: [6, 4], listening: false }));
      }
      lg.add(g);
    }
    L.add(lg);
  }
  L.batchDraw();
}
