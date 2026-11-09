// Select, move and reshape objects. Drag corners to reshape, drag the small
// midpoint dots to add a corner, right-click a corner to remove it.
import { store } from '../core/store.js';
import { view } from '../core/view.js';
import { dist, uid } from '../core/geom.js';
import { translateObject } from '../core/types.js';
import { input, resolvePoint } from './manager.js';
import { hitTest } from './hit.js';
import { fmtFt } from '../core/units.js';

let drag = null; // { mode, start, ... }

function handlesFor(o) {
  const g = o.geometry, out = [];
  if (g.kind === 'polygon') {
    g.points.forEach((p, i) => out.push({ kind: 'vertex', i, pt: p }));
    g.points.forEach((p, i) => {
      const q = g.points[(i + 1) % g.points.length];
      out.push({ kind: 'mid', i, pt: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] });
    });
  } else if (g.kind === 'circle') {
    out.push({ kind: 'radius', pt: [g.center[0] + g.r, g.center[1]] });
  } else if (g.kind === 'dimension') {
    out.push({ kind: 'dimA', pt: g.a }, { kind: 'dimB', pt: g.b });
    const L = dist(g.a, g.b) || 1;
    const nx = -(g.b[1] - g.a[1]) / L, ny = (g.b[0] - g.a[0]) / L;
    const off = g.offset || 0;
    out.push({ kind: 'dimOff', pt: [(g.a[0] + g.b[0]) / 2 + nx * off, (g.a[1] + g.b[1]) / 2 + ny * off], nx, ny });
  }
  return out;
}

function handleAt(o, p) {
  const hs = handlesFor(o);
  const tol = view.px(7);
  // vertices before midpoints
  hs.sort((a, b) => (a.kind === 'mid') - (b.kind === 'mid'));
  return hs.find((h) => dist(h.pt, p) <= tol) || null;
}

export const selectTool = {
  cursor: 'default',

  activate() {},
  deactivate() { if (drag) { store.end(); drag = null; } },

  onDown(e) {
    const p = input.raw;
    const sel = store.selectedId && store.getObject(store.selectedId);
    if (sel && store.layerUsable(sel.layer)) {
      const h = handleAt(sel, p);
      if (h) {
        store.begin('Reshape');
        if (h.kind === 'mid') {
          sel.geometry.points.splice(h.i + 1, 0, h.pt.slice());
          drag = { mode: 'vertex', id: sel.id, i: h.i + 1 };
        } else if (h.kind === 'vertex') {
          drag = { mode: 'vertex', id: sel.id, i: h.i };
        } else {
          drag = { mode: h.kind, id: sel.id, h };
        }
        store.changed();
        return;
      }
    }
    const hit = hitTest(p);
    if (hit) {
      store.select(hit.id);
      drag = { mode: 'pending-move', id: hit.id, start: p, startScreen: { ...input.screen }, alt: e.altKey };
    } else {
      store.select(null);
      drag = null;
    }
  },

  onMove() {
    const p = input.raw;
    if (!drag) {
      // hover cursor
      const sel = store.selectedId && store.getObject(store.selectedId);
      let cur = 'default';
      if (sel && store.layerUsable(sel.layer) && handleAt(sel, p)) cur = 'pointer';
      else if (hitTest(p)) cur = 'move';
      view.container.style.cursor = cur;
      input.snapKind = null;
      return;
    }
    const o = store.getObject(drag.id);
    if (!o) return;
    if (drag.mode === 'pending-move') {
      const moved = Math.hypot(input.screen.x - drag.startScreen.x, input.screen.y - drag.startScreen.y);
      if (moved < 3) return;
      store.begin('Move');
      if (drag.alt) {
        // alt-drag duplicates
        const copy = structuredClone(o);
        copy.id = uid();
        store.project.objects.push(copy);
        store.select(copy.id);
        drag.id = copy.id;
      }
      drag.mode = 'move';
      drag.last = drag.start;
    }
    const obj = store.getObject(drag.id);
    if (drag.mode === 'move') {
      let target = p;
      if (input.shift) {
        // lock to horizontal or vertical
        const dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
        target = Math.abs(dx) > Math.abs(dy) ? [p[0], drag.start[1]] : [drag.start[0], p[1]];
      }
      translateObject(obj, target[0] - drag.last[0], target[1] - drag.last[1]);
      drag.last = target;
      input.snapKind = null;
    } else if (drag.mode === 'vertex') {
      const pts = obj.geometry.points;
      const prev = pts[(drag.i - 1 + pts.length) % pts.length];
      pts[drag.i] = resolvePoint({ from: prev, exclude: obj.id });
    } else if (drag.mode === 'radius') {
      obj.geometry.r = Math.max(0.5, dist(obj.geometry.center, resolvePoint({ exclude: obj.id })));
    } else if (drag.mode === 'dimA') {
      obj.geometry.a = resolvePoint({ from: obj.geometry.b, exclude: obj.id });
    } else if (drag.mode === 'dimB') {
      obj.geometry.b = resolvePoint({ from: obj.geometry.a, exclude: obj.id });
    } else if (drag.mode === 'dimOff') {
      const g = obj.geometry;
      const L = dist(g.a, g.b) || 1;
      const nx = -(g.b[1] - g.a[1]) / L, ny = (g.b[0] - g.a[0]) / L;
      g.offset = (p[0] - g.a[0]) * nx + (p[1] - g.a[1]) * ny;
      input.snapKind = null;
    }
    store.changed();
  },

  onUp() {
    if (drag && drag.mode !== 'pending-move') store.end();
    drag = null;
  },

  onRightClick() {
    // remove a polygon corner
    const sel = store.selectedId && store.getObject(store.selectedId);
    if (!sel || sel.geometry.kind !== 'polygon' || !store.layerUsable(sel.layer)) return;
    const h = handleAt(sel, input.raw);
    if (h && h.kind === 'vertex' && sel.geometry.points.length > 3) {
      store.commit('Remove corner', () => { sel.geometry.points.splice(h.i, 1); });
    }
  },

  onKey(e) {
    const sel = store.selectedId && store.getObject(store.selectedId);
    if (e.key === 'Escape') { store.select(null); return true; }
    if (!sel || !store.layerUsable(sel.layer)) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      store.commit('Delete', (p) => { p.objects = p.objects.filter((o) => o.id !== sel.id); });
      store.select(null);
      return true;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key]) {
      const step = e.shiftKey ? 5 : 0.5;
      const [dx, dy] = arrows[e.key];
      store.commit('Nudge', () => translateObject(sel, dx * step, dy * step));
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const copy = structuredClone(sel);
      copy.id = uid();
      translateObject(copy, 2, 2);
      store.commit('Duplicate', (p) => p.objects.push(copy));
      store.select(copy.id);
      return true;
    }
    return false;
  },

  drawOverlay(ov) {
    const o = store.selectedId && store.getObject(store.selectedId);
    if (!o) return;
    const g = o.geometry;
    const editable = store.layerUsable(o.layer);
    if (g.kind === 'polygon') {
      ov.line(g.points, { closed: true, width: 2 });
      if (editable) handlesFor(o).forEach((h) => ov.handle(h.pt, h.kind === 'mid' ? { shape: 'circle', size: 7, fill: '#e6f3ee' } : {}));
    } else if (g.kind === 'circle') {
      ov.circle(g.center, g.r, { width: 2 });
      if (editable) { ov.handle(g.center, { shape: 'circle', size: 6 }); handlesFor(o).forEach((h) => ov.handle(h.pt)); }
    } else if (g.kind === 'dimension') {
      if (editable) handlesFor(o).forEach((h) => ov.handle(h.pt, h.kind === 'dimOff' ? { shape: 'circle' } : {}));
    }
  },

  tip() {
    if (drag && drag.mode === 'radius') {
      const o = store.getObject(drag.id);
      return o ? `Canopy ${fmtFt(o.geometry.r * 2)}` : '';
    }
    if (drag && drag.mode === 'vertex') {
      const o = store.getObject(drag.id);
      if (!o) return '';
      const pts = o.geometry.points, i = drag.i;
      const prev = pts[(i - 1 + pts.length) % pts.length], next = pts[(i + 1) % pts.length];
      return `${fmtFt(dist(prev, pts[i]))} · ${fmtFt(dist(pts[i], next))}`;
    }
    return '';
  },
};
