// Draw a closed shape (property line, house, driveway, patio...).
// Polygon mode: click corners; click the first corner, double-click or press Enter to finish.
// Rectangle mode: click two corners of one wall, then click to set the depth. Works at any angle.
// Type a length and press Enter to place the next point exactly.
import { store } from '../core/store.js';
import { view } from '../core/view.js';
import { dist, along, polyArea, pathLength, uid } from '../core/geom.js';
import { TYPES } from '../core/types.js';
import { fmtFt, fmtArea, parseLength, parsePair } from '../core/units.js';
import { input, resolvePoint, setTool } from './manager.js';
import { toast } from '../ui/toast.js';

export function makePolygonTool(type, { allowRect = false, defaultRect = false, hint = '' } = {}) {
  let pts = [];
  let mode = defaultRect ? 'rect' : 'poly';
  let down = null;
  const nearFirst = (p) => mode === 'poly' && pts.length >= 3 && dist(p, pts[0]) < view.px(12);

  const def = TYPES[type];

  function rectFrom(a, b, c) {
    // a-b is the first wall; depth is the perpendicular distance of c from line a-b
    const L = dist(a, b) || 1;
    const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    const d = (c[0] - a[0]) * nx + (c[1] - a[1]) * ny;
    return [a, b, [b[0] + nx * d, b[1] + ny * d], [a[0] + nx * d, a[1] + ny * d]];
  }

  function finish(points) {
    // drop near-duplicate points (double-clicks add extras)
    const clean = [];
    for (const p of points) if (!clean.length || dist(clean[clean.length - 1], p) > view.px(2)) clean.push(p);
    if (clean.length > 2 && dist(clean[0], clean[clean.length - 1]) < view.px(2)) clean.pop();
    if (clean.length < 3 || polyArea(clean) < 0.5) { toast('Shape too small, so it was not added'); pts = []; return; }
    if (!store.layerUsable(def.layer)) { toast(`The ${store.getLayer(def.layer).name} layer is hidden or locked. Turn it on in Layers first.`); pts = []; return; }
    const obj = {
      id: uid(), type, layer: def.layer,
      geometry: { kind: 'polygon', points: clean },
      props: structuredClone(def.defaults),
      status: 'existing',
    };
    if (tool.material) obj.props.material = tool.material;
    store.commit(`Add ${def.label.toLowerCase()}`, (p) => p.objects.push(obj));
    pts = [];
    setTool('select');
    store.select(obj.id);
  }

  const tool = {
    cursor: 'crosshair',
    allowRect,
    material: null,
    get mode() { return mode; },
    set mode(m) { mode = m; pts = []; },

    activate() { pts = []; },
    deactivate() { pts = []; },
    acceptsTyping: () => pts.length > 0,

    onDown() {
      const p = resolvePoint({ from: pts[pts.length - 1] || null, extra: pts.slice(0, 1) });
      down = { screen: { ...input.screen }, startCount: pts.length };
      if (mode === 'rect') {
        pts.push(p);
        if (pts.length === 3) { finish(rectFrom(pts[0], pts[1], pts[2])); down = null; }
        return;
      }
      if (nearFirst(p)) { finish(pts); down = null; return; }
      pts.push(p);
    },

    // Press, drag and release also works: in rectangle mode it draws a box corner to corner,
    // in shape mode it draws one side.
    onUp() {
      if (!down) return;
      const moved = Math.hypot(input.screen.x - down.screen.x, input.screen.y - down.screen.y);
      const started = down.startCount;
      down = null;
      if (moved < 8) return;
      const p = resolvePoint({ from: pts[pts.length - 1] || null, extra: pts.slice(0, 1) });
      if (mode === 'rect' && started === 0 && pts.length === 1) {
        const a = pts[0];
        if (Math.abs(p[0] - a[0]) < 0.5 || Math.abs(p[1] - a[1]) < 0.5) return;
        finish([a, [p[0], a[1]], p, [a[0], p[1]]]);
      } else if (mode === 'poly') {
        if (nearFirst(p)) finish(pts); else pts.push(p);
      }
    },

    onMove() {
      resolvePoint({ from: pts[pts.length - 1] || null, extra: pts.slice(0, 1) });
    },

    onDblClick() { if (mode === 'poly' && pts.length >= 3) finish(pts); },

    onTyped(v) {
      if (!pts.length) return;
      const last = pts[pts.length - 1];
      if (mode === 'rect' && pts.length === 1) {
        const pair = parsePair(v);
        if (pair) {
          // "40x30": wall of 40 toward the cursor, 30 deep
          const b = along(pts[0], input.pt, pair[0]);
          const L = pair[0];
          const nx = -(b[1] - pts[0][1]) / L, ny = (b[0] - pts[0][0]) / L;
          finish(rectFrom(pts[0], b, [pts[0][0] + nx * pair[1], pts[0][1] + ny * pair[1]]));
          return;
        }
      }
      const L = parseLength(v);
      if (L == null || L <= 0) { toast(`Could not read "${v}". Try 25, 25'6" or 40x30`); return; }
      if (mode === 'rect' && pts.length === 2) {
        // depth on the cursor's side of the wall
        const [a, b] = pts;
        const W = dist(a, b) || 1;
        const nx = -(b[1] - a[1]) / W, ny = (b[0] - a[0]) / W;
        const side = Math.sign((input.pt[0] - a[0]) * nx + (input.pt[1] - a[1]) * ny) || 1;
        finish(rectFrom(a, b, [a[0] + nx * L * side, a[1] + ny * L * side]));
        return;
      }
      pts.push(along(last, input.pt, L));
      if (mode === 'rect' && pts.length === 3) finish(rectFrom(...pts));
    },

    onKey(e) {
      if (e.key === 'Escape') {
        if (pts.length) { pts = []; return true; }
        setTool('select');
        return true;
      }
      if (e.key === 'Enter' && mode === 'poly' && pts.length >= 3) { finish(pts); return true; }
      if (e.key === 'Backspace' && pts.length) { pts.pop(); return true; }
      return false;
    },

    drawOverlay(ov) {
      const cur = input.pt;
      if (!pts.length) return;
      if (mode === 'rect') {
        if (pts.length === 1) ov.line([pts[0], cur], { width: 2 });
        else ov.line(rectFrom(pts[0], pts[1], cur), { closed: true, width: 2, fill: 'rgba(31,138,112,0.08)' });
      } else {
        ov.line([...pts, cur], { width: 2 });
        if (pts.length >= 2) ov.line([cur, pts[0]], { dash: [5, 5], width: 1 });
        if (pts.length >= 2) ov.line([...pts, cur], { closed: true, width: 0, fill: 'rgba(31,138,112,0.08)' });
      }
      const closing = nearFirst(cur);
      pts.forEach((p, i) => ov.handle(p, i === 0
        ? { size: closing ? 16 : 11, color: '#d9822b', fill: closing ? '#d9822b' : '#fff3e6' }
        : { size: 7 }));
    },

    tip() {
      const cur = input.pt;
      if (!pts.length) {
        if (mode === 'rect') return `Click a corner, or drag a box`;
        return hint || `Click the first corner`;
      }
      const last = pts[pts.length - 1];
      const seg = fmtFt(dist(last, cur));
      if (mode === 'rect') {
        if (pts.length === 1) return `${seg} <span class="muted">· click the other end of this wall, or type 40x30</span>`;
        const r = rectFrom(pts[0], pts[1], cur);
        return `${fmtFt(dist(pts[0], pts[1]))} × ${fmtFt(dist(r[1], r[2]))} <span class="muted">· click to set the depth</span>`;
      }
      if (nearFirst(cur)) return '<b>Click to finish the shape</b>';
      const area = pts.length >= 2 ? ` · ${fmtArea(polyArea([...pts, cur]))}` : '';
      const next = pts.length >= 3 ? ' <span class="muted">· click the orange corner or press Enter to finish</span>' : ' <span class="muted">· click the next corner</span>';
      return `${seg}${area}${next}`;
    },

    banner() {
      if (mode === 'rect') return 'Drag a box, or click two corners along one wall and then click once more to set the depth.';
      return 'Click each corner. To finish, click the first (orange) corner again, double-click, or press Enter.';
    },

    status() {
      if (mode === 'rect') return 'Drag a box corner to corner. For a rotated shape, click two corners along one wall, then click to set the depth. Or click once and type a size like 40x30. Esc cancels.';
      return 'Click each corner. To finish, click the first (orange) corner again, double-click, or press Enter. Type a length + Enter for an exact side. Shift locks angles, Alt turns off snapping.';
    },

    perimeterSoFar: () => pathLength(pts),
  };
  return tool;
}
