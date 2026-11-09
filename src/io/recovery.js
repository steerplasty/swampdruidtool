// A recovery copy of the current plan, kept in this browser only (IndexedDB),
// so a refresh or crash never loses work. Nothing is sent anywhere.
import { store } from '../core/store.js';
import { view } from '../core/view.js';
import { blobToImage } from './images.js';
import { migrate } from './project-file.js';

const DB = 'swampdruidtool';
const STORE = 'recovery';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => { db.close(); resolve(result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

let timer = null;
export function scheduleSave() {
  clearTimeout(timer);
  timer = setTimeout(saveNow, 700);
}

export async function saveNow() {
  try {
    const project = structuredClone(store.project);
    project.view = view.getViewState();
    const images = [];
    for (const bg of project.backgrounds) {
      const im = store.images.get(bg.imageId);
      if (im) images.push({ id: bg.imageId, blob: im.blob });
    }
    await tx('readwrite', (s) => { s.put({ project, images, dirty: store.dirty, at: Date.now() }, 'current'); });
  } catch (err) {
    console.warn('Recovery copy not saved', err);
  }
}

export async function loadRecovery() {
  try {
    const rec = await tx('readonly', (s) => new Promise((res) => {
      const r = s.get('current');
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    }));
    if (!rec || !rec.project) return null;
    const images = new Map();
    for (const { id, blob } of rec.images || []) {
      try { images.set(id, { blob, ...(await blobToImage(blob)) }); } catch { /* skip broken image */ }
    }
    return { project: migrate(rec.project), images, dirty: rec.dirty };
  } catch (err) {
    console.warn('Recovery copy not loaded', err);
    return null;
  }
}

export async function clearRecovery() {
  try { await tx('readwrite', (s) => { s.delete('current'); }); } catch { /* ignore */ }
}
