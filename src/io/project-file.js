// Export / open .sdt project files. An .sdt file is a zip holding project.json
// and the background images, so a plan opens the same on any computer.
/* global JSZip */
import { store, SCHEMA_VERSION, blankProject, DEFAULT_LAYERS } from '../core/store.js';
import { view } from '../core/view.js';
import { blobToImage } from './images.js';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

export function safeName(name) {
  return (name || 'plan').replace(/[\\/:*?"<>|]+/g, '').trim() || 'plan';
}

export async function exportProject() {
  const zip = new JSZip();
  const project = structuredClone(store.project);
  project.view = view.getViewState();
  project.savedAt = new Date().toISOString();
  const files = {};
  for (const bg of project.backgrounds) {
    const im = store.images.get(bg.imageId);
    if (!im) continue;
    const path = `images/${bg.imageId}.${EXT[im.blob.type] || 'png'}`;
    files[bg.imageId] = path;
    zip.file(path, im.blob);
  }
  project.imageFiles = files;
  zip.file('project.json', JSON.stringify(project, null, 2));
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
  download(blob, `${safeName(project.name)}.sdt`);
  store.dirty = false;
  store.emit('saved');
}

export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function readProjectFile(file) {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 2));
  let project, images = new Map();
  if (head[0] === 0x50 && head[1] === 0x4b) { // "PK" = zip
    const zip = await JSZip.loadAsync(buf);
    const pj = zip.file('project.json');
    if (!pj) throw new Error('This file has no project.json inside');
    project = JSON.parse(await pj.async('string'));
    const files = project.imageFiles || {};
    for (const [imageId, path] of Object.entries(files)) {
      const f = zip.file(path);
      if (!f) continue;
      const ext = path.split('.').pop();
      const type = Object.entries(EXT).find(([, e]) => e === ext)?.[0] || 'image/png';
      const blob = new Blob([await f.async('arraybuffer')], { type });
      const loaded = await blobToImage(blob);
      images.set(imageId, { blob, ...loaded, name: path });
    }
  } else {
    project = JSON.parse(new TextDecoder().decode(buf));
  }
  if (project.app !== 'swampdruidtool') throw new Error('This is not a swampdruidtool plan');
  return { project: migrate(project), images };
}

// Upgrade older files to the current schema. Add a step here each time the schema changes.
export function migrate(p) {
  const base = blankProject();
  if (!p.schemaVersion) p.schemaVersion = 1;
  if (p.schemaVersion > SCHEMA_VERSION) {
    throw new Error('This plan was made with a newer version of swampdruidtool. Refresh the page to update.');
  }
  // fill anything missing with defaults
  p.settings = { ...base.settings, ...(p.settings || {}) };
  p.layers = p.layers || [];
  for (const L of DEFAULT_LAYERS) if (!p.layers.find((x) => x.id === L.id)) p.layers.push(structuredClone(L));
  p.objects = p.objects || [];
  p.backgrounds = p.backgrounds || [];
  delete p.imageFiles;
  p.schemaVersion = SCHEMA_VERSION;
  return p;
}
