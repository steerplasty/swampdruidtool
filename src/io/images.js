// Load background images: PNG/JPG/WebP screenshots, or a page of a survey PDF.
/* global pdfjsLib */
import { store } from '../core/store.js';
import { uid } from '../core/geom.js';
import { promptDialog } from '../ui/dialog.js';

export function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

async function pdfToBlob(file) {
  if (typeof pdfjsLib === 'undefined') throw new Error('PDF support did not load');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let pageNo = 1;
  if (doc.numPages > 1) {
    const v = await promptDialog({
      title: 'Which page?',
      message: `This PDF has ${doc.numPages} pages. Which page has the site plan or survey?`,
      value: '1', okLabel: 'Use page',
      validate: (s) => { const n = parseInt(s, 10); return n >= 1 && n <= doc.numPages ? null : `Enter 1 to ${doc.numPages}`; },
    });
    if (v == null) return null;
    pageNo = parseInt(v, 10);
  }
  const page = await doc.getPage(pageNo);
  // render large enough to trace accurately, capped to keep memory sane
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, 6000 / Math.max(base.width, base.height));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return new Promise((res) => canvas.toBlob(res, 'image/png'));
}

// Adds an image file as a new background. Returns the background record.
export async function importBackground(file, { center = [0, 0] } = {}) {
  let blob = file;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    blob = await pdfToBlob(file);
    if (!blob) return null;
  } else if (!file.type.startsWith('image/')) {
    throw new Error('Use a PNG, JPG or PDF file');
  }
  const loaded = await blobToImage(blob);
  const imageId = uid('img');
  store.images.set(imageId, { blob, ...loaded, name: file.name });
  // first guess: the image is about 200 ft across until the user sets the scale
  const pxPerFt = loaded.width / 200;
  const bg = {
    id: uid('bg'), imageId, name: file.name.replace(/\.[^.]+$/, ''),
    x: center[0], y: center[1], pxPerFt, rotationDeg: 0, opacity: 0.85,
    visible: true, locked: true, calibrated: false,
  };
  store.commit('Add background', (p) => p.backgrounds.push(bg));
  return bg;
}
