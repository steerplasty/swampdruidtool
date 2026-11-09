// The Konva stage, world <-> screen transform, zoom/pan and the grid.
// World units are feet. The stage is scaled so 1 unit = `scale` screen pixels.
/* global Konva */
import { store } from './store.js';

const MIN_SCALE = 0.3;   // px per ft
const MAX_SCALE = 400;

class View {
  init(container) {
    this.container = container;
    this.stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight });
    this.bgLayer = new Konva.Layer({ listening: false });
    this.gridLayer = new Konva.Layer({ listening: false });
    this.objLayer = new Konva.Layer({ listening: false });
    this.toolLayer = new Konva.Layer({ listening: false });
    // grid sits under the background image so it never streaks across the photo
    this.stage.add(this.gridLayer, this.bgLayer, this.objLayer, this.toolLayer);
    this.scale = 4;
    this.stage.scale({ x: this.scale, y: this.scale });
    this.stage.position({ x: container.clientWidth / 2, y: container.clientHeight / 2 });
    this.listeners = [];

    new ResizeObserver(() => {
      this.stage.size({ width: container.clientWidth, height: container.clientHeight });
      this.changed();
    }).observe(container);

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const sp = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // trackpad pinch sends ctrlKey; plain two-finger scroll pans
      if (!e.ctrlKey && e.deltaX !== 0 && Math.abs(e.deltaX) >= Math.abs(e.deltaY) * 0.5) {
        this.panBy(-e.deltaX, -e.deltaY);
        return;
      }
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      this.zoomAt(sp, this.scale * factor);
    }, { passive: false });
  }

  onChange(fn) { this.listeners.push(fn); }
  changed() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this.drawGrid();
      this.listeners.forEach((f) => f());
    });
  }

  zoomAt(sp, newScale) {
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    const pos = this.stage.position();
    const world = { x: (sp.x - pos.x) / this.scale, y: (sp.y - pos.y) / this.scale };
    this.scale = newScale;
    this.stage.scale({ x: newScale, y: newScale });
    this.stage.position({ x: sp.x - world.x * newScale, y: sp.y - world.y * newScale });
    this.changed();
  }

  zoomBy(f) {
    this.zoomAt({ x: this.stage.width() / 2, y: this.stage.height() / 2 }, this.scale * f);
  }

  panBy(dx, dy) {
    const p = this.stage.position();
    this.stage.position({ x: p.x + dx, y: p.y + dy });
    this.changed();
  }

  // screen (container) px -> world ft
  toWorld(sp) {
    const p = this.stage.position();
    return [(sp.x - p.x) / this.scale, (sp.y - p.y) / this.scale];
  }
  toScreen(w) {
    const p = this.stage.position();
    return { x: w[0] * this.scale + p.x, y: w[1] * this.scale + p.y };
  }
  // a length of n screen pixels, in feet
  px(n) { return n / this.scale; }

  fitBounds(b, pad = 60) {
    const w = Math.max(b.maxX - b.minX, 1), h = Math.max(b.maxY - b.minY, 1);
    const sw = this.stage.width() - pad * 2, sh = this.stage.height() - pad * 2;
    const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(sw / w, sh / h)));
    this.scale = s;
    this.stage.scale({ x: s, y: s });
    this.stage.position({
      x: this.stage.width() / 2 - ((b.minX + b.maxX) / 2) * s,
      y: this.stage.height() / 2 - ((b.minY + b.maxY) / 2) * s,
    });
    this.changed();
  }

  getViewState() { const p = this.stage.position(); return { x: p.x, y: p.y, scale: this.scale }; }
  setViewState(v) {
    if (!v) return;
    this.scale = v.scale;
    this.stage.scale({ x: v.scale, y: v.scale });
    this.stage.position({ x: v.x, y: v.y });
    this.changed();
  }

  visibleWorld() {
    const [x0, y0] = this.toWorld({ x: 0, y: 0 });
    const [x1, y1] = this.toWorld({ x: this.stage.width(), y: this.stage.height() });
    return { minX: x0, minY: y0, maxX: x1, maxY: y1 };
  }

  // Grid step in feet chosen so lines are at least ~14px apart
  gridStep() {
    const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    return steps.find((s) => s * this.scale >= 14) || 1000;
  }

  drawGrid() {
    const L = this.gridLayer;
    L.destroyChildren();
    if (!store.project.settings.gridOn) { L.batchDraw(); return; }
    const step = this.gridStep();
    const major = step * (step < 1 ? 2 : step === 2 || step === 20 || step === 200 ? 5 : step === 5 || step === 50 || step === 500 ? 2 : 5);
    const v = this.visibleWorld();
    const minor = [], majorLines = [];
    const x0 = Math.floor(v.minX / step) * step, y0 = Math.floor(v.minY / step) * step;
    const isMajor = (n) => Math.abs(n / major - Math.round(n / major)) < 1e-6;
    for (let x = x0; x <= v.maxX; x += step) (isMajor(x) ? majorLines : minor).push([x, v.minY, x, v.maxY]);
    for (let y = y0; y <= v.maxY; y += step) (isMajor(y) ? majorLines : minor).push([v.minX, y, v.maxX, y]);
    const shape = (lines, color, w) => new Konva.Shape({
      listening: false,
      sceneFunc: (ctx) => {
        ctx.beginPath();
        for (const [a, b, c, d] of lines) { ctx.moveTo(a, b); ctx.lineTo(c, d); }
        ctx.strokeStyle = color;
        ctx.lineWidth = w / this.scale;
        ctx.stroke();
      },
    });
    L.add(shape(minor, 'rgba(90, 84, 60, 0.07)', 1));
    L.add(shape(majorLines, 'rgba(90, 84, 60, 0.14)', 1));
    L.batchDraw();
    this.lastGrid = { step, major };
  }
}

export const view = new View();
