// Find which object is under a world point, topmost first.
import { store } from '../core/store.js';
import { view } from '../core/view.js';
import { dist, pointInPolygon, distToPath } from '../core/geom.js';

// Higher = drawn on top = picked first
const PICK = { 'notes.dimension': 9, 'site.property': 8, 'site.tree': 7, 'site.house': 5, 'site.structure': 5, 'site.patio': 3, 'site.driveway': 2 };

export function hitTest(p) {
  const tol = view.px(6);
  const objs = store.project.objects
    .filter((o) => store.layerUsable(o.layer))
    .sort((a, b) => (PICK[b.type] || 0) - (PICK[a.type] || 0));
  for (const o of objs) if (hitObject(o, p, tol)) return o;
  return null;
}

export function hitObject(o, p, tol) {
  const g = o.geometry;
  if (g.kind === 'circle') return dist(p, g.center) <= g.r + tol;
  if (g.kind === 'dimension') {
    const L = dist(g.a, g.b) || 1;
    const nx = -(g.b[1] - g.a[1]) / L, ny = (g.b[0] - g.a[0]) / L;
    const off = g.offset || 0;
    const a2 = [g.a[0] + nx * off, g.a[1] + ny * off], b2 = [g.b[0] + nx * off, g.b[1] + ny * off];
    return distToPath(p, [a2, b2], false) <= tol * 1.5;
  }
  if (g.kind === 'polygon') {
    // property lines are picked by their edge only, so things inside stay clickable
    if (o.type === 'site.property') return distToPath(p, g.points, true) <= tol;
    return pointInPolygon(p, g.points) || distToPath(p, g.points, true) <= tol;
  }
  return false;
}
