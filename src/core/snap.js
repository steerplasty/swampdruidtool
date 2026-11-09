// Snapping: corners first, then edge midpoints, then the nearest point on an edge, then grid.
import { store } from './store.js';
import { view } from './view.js';
import { dist, nearestOnSegment } from './geom.js';

const TOL_PX = 10;

export function snapPoint(p, { exclude = null, extra = [], disabled = false } = {}) {
  if (disabled || !store.project.settings.snapOn) return gridSnap(p) || { pt: p, kind: null };
  const tol = view.px(TOL_PX);
  let best = null;
  const consider = (pt, kind, rank) => {
    const d = dist(p, pt);
    if (d > tol) return;
    const score = d + rank * tol; // lower rank wins when both are in range
    if (!best || score < best.score) best = { pt, kind, score };
  };

  for (const pt of extra) consider(pt, 'corner', 0);

  for (const o of store.project.objects) {
    if (o.id === exclude || !store.layerUsable(o.layer)) continue;
    const g = o.geometry;
    if (g.kind === 'circle') { consider(g.center, 'center', 0); continue; }
    const pts = g.kind === 'dimension' ? [g.a, g.b] : g.points;
    const closed = g.kind === 'polygon';
    for (const pt of pts) consider(pt, 'corner', 0);
    const segs = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      consider([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 'midpoint', 0.5);
      consider(nearestOnSegment(p, a, b).pt, 'edge', 1);
    }
  }
  if (best) return best;
  return gridSnap(p) || { pt: p, kind: null };
}

function gridSnap(p) {
  const s = store.project.settings;
  if (!s.gridOn || !s.gridSnap) return null;
  const step = view.lastGrid ? view.lastGrid.step : 1;
  return { pt: [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step], kind: 'grid' };
}
