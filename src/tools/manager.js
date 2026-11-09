// Routes pointer and keyboard input to the active tool, handles panning,
// typed lengths ("type 25 then Enter"), and the overlay (previews, handles, snap marker).
/* global Konva */
import { store } from '../core/store.js';
import { view } from '../core/view.js';
import { snapPoint } from '../core/snap.js';
import { angleLock } from '../core/geom.js';

const tools = {};
let active = null;
let activeId = null;
const listeners = [];

export const input = {
  screen: { x: 0, y: 0 },
  raw: [0, 0],       // world point under the cursor
  pt: [0, 0],        // world point after snapping / angle lock
  snapKind: null,
  shift: false, alt: false,
  typed: '',
  spaceDown: false,
  inside: false,
};

let panning = null;

export function registerTool(id, tool) { tools[id] = tool; tool.id = id; }
export function getTool(id) { return tools[id]; }
export function activeTool() { return active; }
export function activeToolId() { return activeId; }
export function onToolChange(fn) { listeners.push(fn); }

export function setTool(id, opts = {}) {
  if (!tools[id]) return;
  if (active && active.deactivate) active.deactivate();
  input.typed = '';
  active = tools[id];
  activeId = id;
  if (active.activate) active.activate(opts);
  view.container.style.cursor = active.cursor || 'crosshair';
  listeners.forEach((f) => f(id));
  redrawOverlay();
  updateTip();
}

// Snap the raw cursor point for the active tool. Tools call this to get their working point.
export function resolvePoint({ from = null, exclude = null, extra = [] } = {}) {
  let p = input.raw;
  input.snapKind = null;
  if (from && input.shift) {
    p = angleLock(from, p, 15);
    input.snapKind = 'angle';
  } else {
    const s = snapPoint(p, { exclude, extra, disabled: input.alt });
    p = s.pt;
    input.snapKind = s.kind;
  }
  input.pt = p;
  return p;
}

function screenPos(e) {
  const r = view.container.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

export function initInput() {
  const el = view.container;
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  el.addEventListener('pointerdown', (e) => {
    el.focus({ preventScroll: true });
    const sp = screenPos(e);
    input.screen = sp; input.raw = view.toWorld(sp);
    input.shift = e.shiftKey; input.alt = e.altKey;
    if (e.button === 1 || (e.button === 0 && (input.spaceDown || activeId === 'pan'))) {
      panning = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
    if (e.button === 2) {
      if (active && active.onRightClick) active.onRightClick(e);
      redrawOverlay();
      return;
    }
    if (e.button !== 0 || !active) return;
    el.setPointerCapture(e.pointerId);
    if (active.onDown) active.onDown(e);
    redrawOverlay();
    updateTip();
  });

  el.addEventListener('pointermove', (e) => {
    const sp = screenPos(e);
    input.screen = sp; input.raw = view.toWorld(sp);
    input.shift = e.shiftKey; input.alt = e.altKey;
    input.inside = true;
    if (panning) {
      view.panBy(e.clientX - panning.x, e.clientY - panning.y);
      panning = { x: e.clientX, y: e.clientY };
      return;
    }
    if (active && active.onMove) active.onMove(e);
    redrawOverlay();
    updateTip();
    emitCursor();
  });

  el.addEventListener('pointerup', (e) => {
    if (panning) {
      panning = null;
      el.style.cursor = input.spaceDown ? 'grab' : (active && active.cursor) || 'crosshair';
      return;
    }
    if (e.button !== 0) return;
    if (active && active.onUp) active.onUp(e);
    redrawOverlay();
    updateTip();
  });

  el.addEventListener('pointerleave', () => { input.inside = false; updateTip(); redrawOverlay(); });

  el.addEventListener('dblclick', (e) => {
    if (active && active.onDblClick) active.onDblClick(e);
    redrawOverlay();
    updateTip();
  });

  view.onChange(() => redrawOverlay());
}

// Keyboard events reach the tool first. Returns true if the tool used it.
export function toolKey(e) {
  if (!active) return false;
  const k = e.key;
  // typed lengths
  if (active.acceptsTyping && active.acceptsTyping()) {
    if (/^[0-9.'"\-x×,]$/i.test(k) && !e.ctrlKey && !e.metaKey) {
      input.typed += k;
      updateTip();
      return true;
    }
    if (k === 'Backspace' && input.typed) {
      input.typed = input.typed.slice(0, -1);
      updateTip();
      return true;
    }
    if (k === ' ' && input.typed) {
      input.typed += ' ';
      updateTip();
      return true;
    }
    if (k === 'Enter' && input.typed) {
      const v = input.typed;
      input.typed = '';
      if (active.onTyped) active.onTyped(v);
      redrawOverlay();
      updateTip();
      return true;
    }
    if (k === 'Escape' && input.typed) {
      input.typed = '';
      updateTip();
      return true;
    }
  }
  if (active.onKey && active.onKey(e)) {
    redrawOverlay();
    updateTip();
    return true;
  }
  return false;
}

export function setSpace(down) {
  input.spaceDown = down;
  if (!panning) view.container.style.cursor = down ? 'grab' : (active && active.cursor) || 'crosshair';
}

// ---- overlay --------------------------------------------------------------
const ACCENT = '#1f8a70';

export const ov = {
  line(pts, { color = ACCENT, width = 1.5, dash = null, closed = false, fill = null } = {}) {
    view.toolLayer.add(new Konva.Line({
      points: pts.flat(), stroke: color, strokeWidth: width, strokeScaleEnabled: false,
      dash: dash || undefined, closed, fill: fill || undefined, listening: false,
    }));
  },
  handle(pt, { shape = 'square', size = 8, color = ACCENT, fill = '#ffffff' } = {}) {
    const s = view.px(size);
    if (shape === 'circle') {
      view.toolLayer.add(new Konva.Circle({ x: pt[0], y: pt[1], radius: s / 2, fill, stroke: color, strokeWidth: 1.5, strokeScaleEnabled: false, listening: false }));
    } else {
      view.toolLayer.add(new Konva.Rect({ x: pt[0] - s / 2, y: pt[1] - s / 2, width: s, height: s, fill, stroke: color, strokeWidth: 1.5, strokeScaleEnabled: false, listening: false }));
    }
  },
  circle(c, r, { color = ACCENT, width = 1.5, dash = null } = {}) {
    view.toolLayer.add(new Konva.Circle({ x: c[0], y: c[1], radius: r, stroke: color, strokeWidth: width, strokeScaleEnabled: false, dash: dash || undefined, listening: false }));
  },
};

function drawSnapMarker() {
  if (!input.inside || !input.snapKind || input.snapKind === 'angle') return;
  const p = input.pt, s = view.px(6);
  const color = '#d9822b';
  if (input.snapKind === 'corner' || input.snapKind === 'center') {
    view.toolLayer.add(new Konva.Rect({ x: p[0] - s, y: p[1] - s, width: s * 2, height: s * 2, stroke: color, strokeWidth: 2, strokeScaleEnabled: false, listening: false }));
  } else if (input.snapKind === 'midpoint') {
    view.toolLayer.add(new Konva.Line({ points: [p[0], p[1] - s * 1.2, p[0] + s * 1.1, p[1] + s * 0.8, p[0] - s * 1.1, p[1] + s * 0.8], closed: true, stroke: color, strokeWidth: 2, strokeScaleEnabled: false, listening: false }));
  } else {
    view.toolLayer.add(new Konva.Line({ points: [p[0] - s, p[1] - s, p[0] + s, p[1] + s, p[0] + s, p[1] - s, p[0] - s, p[1] + s], stroke: color, strokeWidth: 2, strokeScaleEnabled: false, listening: false }));
  }
}

export function redrawOverlay() {
  if (!view.toolLayer) return;
  view.toolLayer.destroyChildren();
  if (active && active.drawOverlay) active.drawOverlay(ov);
  drawSnapMarker();
  view.toolLayer.batchDraw();
}

// ---- cursor tip -----------------------------------------------------------
let tipEl = null;
let cursorFns = [];
export function onCursor(fn) { cursorFns.push(fn); }
function emitCursor() { cursorFns.forEach((f) => f(input)); }

export function updateTip() {
  if (!tipEl) tipEl = document.getElementById('cursor-tip');
  if (!tipEl) return;
  let text = active && active.tip ? active.tip() : '';
  if (input.typed) text = `<b>${escapeHtml(input.typed)}</b> <span class="muted">Enter</span>`;
  if (!text || !input.inside) { tipEl.hidden = true; return; }
  tipEl.innerHTML = text;
  tipEl.hidden = false;
  tipEl.style.transform = `translate(${input.screen.x + 18}px, ${input.screen.y + 18}px)`;
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
