// Project state, undo/redo history and change events.
// The project is plain JSON in feet. Background image files live in `images`
// (outside history) so undo never has to copy large blobs.

export const SCHEMA_VERSION = 1;

export const DEFAULT_LAYERS = [
  { id: 'background', name: 'Background', visible: true, locked: false },
  { id: 'site', name: 'Site base', visible: true, locked: false },
  { id: 'notes', name: 'Dimensions', visible: true, locked: false },
];

export function blankProject() {
  return {
    schemaVersion: SCHEMA_VERSION,
    app: 'swampdruidtool',
    name: 'Untitled plan',
    units: 'imperial',
    northRotationDeg: 0,
    backgrounds: [],
    layers: structuredClone(DEFAULT_LAYERS),
    objects: [],
    settings: { gridOn: true, snapOn: true, gridSnap: false },
    view: null,
  };
}

const HISTORY_LIMIT = 200;

class Store {
  constructor() {
    this.project = blankProject();
    this.images = new Map(); // id -> { blob, url, img, width, height, name }
    this.undoStack = [];
    this.redoStack = [];
    this.selectedId = null;
    this.dirty = false; // changes since last export
    this.listeners = {};
    this._pending = null;
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); return () => this.off(evt, fn); }
  off(evt, fn) { this.listeners[evt] = (this.listeners[evt] || []).filter((f) => f !== fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach((f) => f(data)); }

  _snap() { return JSON.stringify(this.project); }

  // Make an undoable change. fn mutates this.project.
  commit(label, fn) {
    const before = this._snap();
    fn(this.project);
    this._push(before, label);
  }

  // For drags: call begin() once, mutate freely (calling changed() for redraws), then end().
  begin(label) { if (!this._pending) this._pending = { before: this._snap(), label }; }
  end() {
    if (!this._pending) return;
    const { before, label } = this._pending;
    this._pending = null;
    if (before !== this._snap()) this._push(before, label);
  }
  cancel() {
    if (!this._pending) return;
    this.project = JSON.parse(this._pending.before);
    this._pending = null;
    this.emit('change', { reason: 'cancel' });
  }

  _push(before, label) {
    this.undoStack.push({ state: before, label });
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.dirty = true;
    this.emit('change', { reason: 'commit', label });
  }

  // Changes that are saved but not worth an undo step (view position, panel toggles)
  quiet(fn) { fn(this.project); this.emit('change', { reason: 'quiet' }); }

  changed() { this.emit('change', { reason: 'live' }); }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  undo() {
    if (!this.undoStack.length) return;
    const { state, label } = this.undoStack.pop();
    this.redoStack.push({ state: this._snap(), label });
    this.project = JSON.parse(state);
    this._fixSelection();
    this.dirty = true;
    this.emit('change', { reason: 'undo', label });
  }

  redo() {
    if (!this.redoStack.length) return;
    const { state, label } = this.redoStack.pop();
    this.undoStack.push({ state: this._snap(), label });
    this.project = JSON.parse(state);
    this._fixSelection();
    this.dirty = true;
    this.emit('change', { reason: 'redo', label });
  }

  _fixSelection() {
    if (this.selectedId && !this.getObject(this.selectedId)) this.select(null);
  }

  load(project, images = new Map()) {
    for (const im of this.images.values()) if (im.url) URL.revokeObjectURL(im.url);
    this.project = project;
    this.images = images;
    this.undoStack = [];
    this.redoStack = [];
    this.selectedId = null;
    this.dirty = false;
    this.emit('load');
    this.emit('change', { reason: 'load' });
    this.emit('select', null);
  }

  select(id) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.emit('select', id);
  }

  getObject(id) { return this.project.objects.find((o) => o.id === id); }
  getLayer(id) { return this.project.layers.find((l) => l.id === id); }
  getBackground(id) { return this.project.backgrounds.find((b) => b.id === id); }
  layerUsable(id) { const l = this.getLayer(id); return !!l && l.visible && !l.locked; }
}

export const store = new Store();
