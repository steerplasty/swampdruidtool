// Layered plan symbols drawn in world units (feet) on a 2D canvas context.
// Each symbol: soft shadow, canopy with a light-to-dark gradient, texture, highlight, outline.
import { seeded } from '../core/geom.js';

function shade(hex, amt) {
  // amt -1..1, negative darkens
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const n = parseInt(c, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

function scallopPath(ctx, cx, cy, r, lobes, rand, depth = 0.12) {
  ctx.beginPath();
  const pts = [];
  const rot = rand() * Math.PI * 2;
  for (let i = 0; i < lobes; i++) {
    const a = rot + (i / lobes) * Math.PI * 2;
    const rr = r * (1 - depth) * (0.96 + rand() * 0.06);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, a]);
  }
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < lobes; i++) {
    const p = pts[i], q = pts[(i + 1) % lobes];
    let am = (p[2] + q[2]) / 2;
    if (i === lobes - 1) am += Math.PI;
    const cr = r * (1 + depth * 0.9) * (0.97 + rand() * 0.05);
    ctx.quadraticCurveTo(cx + Math.cos(am) * cr, cy + Math.sin(am) * cr, q[0], q[1]);
  }
  ctx.closePath();
}

// Broadleaf canopy tree (top view)
export function drawCanopyTree(ctx, { cx, cy, r, color = '#6f8f4e', seed = 'tree', px = 0.25, remove = false }) {
  const rand = seeded(seed);
  const lobes = 9 + Math.floor(rand() * 5);

  // shadow, cast down-right
  ctx.save();
  scallopPath(ctx, cx + r * 0.14, cy + r * 0.16, r, lobes, seeded(seed));
  ctx.fillStyle = 'rgba(38, 44, 28, 0.20)';
  ctx.fill();
  ctx.restore();

  // canopy body
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.05, cx, cy, r * 1.05);
  g.addColorStop(0, shade(color, 0.35));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -0.32));
  scallopPath(ctx, cx, cy, r, lobes, seeded(seed));
  ctx.fillStyle = g;
  ctx.globalAlpha = remove ? 0.45 : 0.96;
  ctx.fill();
  ctx.globalAlpha = 1;

  // inner leaf clusters
  ctx.save();
  scallopPath(ctx, cx, cy, r, lobes, seeded(seed));
  ctx.clip();
  const clusters = 6 + Math.floor(rand() * 4);
  for (let i = 0; i < clusters; i++) {
    const a = (i / clusters) * Math.PI * 2 + rand() * 0.4;
    const d = r * (0.42 + rand() * 0.18);
    const cr = r * (0.26 + rand() * 0.08);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    const lg = ctx.createRadialGradient(x - cr * 0.4, y - cr * 0.4, cr * 0.1, x, y, cr);
    lg.addColorStop(0, 'rgba(255,255,240,0.22)');
    lg.addColorStop(1, 'rgba(255,255,240,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = shade(color, -0.25);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = px * 0.9;
    ctx.beginPath(); ctx.arc(x, y, cr * 0.92, a + 1.9, a + 4.4); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // branch lines from trunk
  ctx.strokeStyle = shade(color, -0.4);
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = px;
  ctx.beginPath();
  const branches = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < branches; i++) {
    const a = (i / branches) * Math.PI * 2 + rand() * 0.5;
    ctx.moveTo(cx, cy);
    const mx = cx + Math.cos(a + 0.15) * r * 0.35, my = cy + Math.sin(a + 0.15) * r * 0.35;
    ctx.quadraticCurveTo(mx, my, cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // outline
  scallopPath(ctx, cx, cy, r, lobes, seeded(seed));
  ctx.strokeStyle = shade(color, -0.5);
  ctx.lineWidth = px * 1.2;
  ctx.stroke();

  // trunk
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(r * 0.05, px * 2.5), 0, Math.PI * 2);
  ctx.fillStyle = '#5a4a36';
  ctx.fill();

  if (remove) {
    ctx.strokeStyle = '#b3402e';
    ctx.lineWidth = px * 2.5;
    const k = r * 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - k, cy - k); ctx.lineTo(cx + k, cy + k);
    ctx.moveTo(cx + k, cy - k); ctx.lineTo(cx - k, cy + k);
    ctx.stroke();
  }
}

// Palm (top view): radiating fronds
export function drawPalm(ctx, { cx, cy, r, color = '#7c9a52', seed = 'palm', px = 0.25, remove = false }) {
  const rand = seeded(seed);
  const fronds = 9 + Math.floor(rand() * 4);
  ctx.save();
  if (remove) ctx.globalAlpha = 0.45;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2 + rand() * 0.25;
      const len = r * (0.85 + rand() * 0.15);
      const w = r * 0.18;
      const ox = pass === 0 ? r * 0.12 : 0, oy = pass === 0 ? r * 0.14 : 0;
      const tx = cx + ox + Math.cos(a) * len, ty = cy + oy + Math.sin(a) * len;
      const nx = -Math.sin(a), ny = Math.cos(a);
      ctx.beginPath();
      ctx.moveTo(cx + ox, cy + oy);
      ctx.quadraticCurveTo(cx + ox + Math.cos(a) * len * 0.5 + nx * w, cy + oy + Math.sin(a) * len * 0.5 + ny * w, tx, ty);
      ctx.quadraticCurveTo(cx + ox + Math.cos(a) * len * 0.5 - nx * w, cy + oy + Math.sin(a) * len * 0.5 - ny * w, cx + ox, cy + oy);
      if (pass === 0) { ctx.fillStyle = 'rgba(38,44,28,0.18)'; ctx.fill(); continue; }
      const g = ctx.createLinearGradient(cx, cy, tx, ty);
      g.addColorStop(0, shade(color, -0.25));
      g.addColorStop(1, shade(color, 0.25));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(color, -0.45);
      ctx.lineWidth = px;
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();
    }
  }
  ctx.beginPath(); ctx.arc(cx, cy, Math.max(r * 0.07, px * 3), 0, Math.PI * 2);
  ctx.fillStyle = '#6b5a40'; ctx.fill();
  ctx.restore();
  if (remove) {
    ctx.strokeStyle = '#b3402e'; ctx.lineWidth = px * 2.5;
    const k = r * 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - k, cy - k); ctx.lineTo(cx + k, cy + k);
    ctx.moveTo(cx + k, cy - k); ctx.lineTo(cx - k, cy + k);
    ctx.stroke();
  }
}

// Conifer / pine (top view): star of needle tufts
export function drawConifer(ctx, { cx, cy, r, color = '#4f6e4a', seed = 'pine', px = 0.25, remove = false }) {
  const rand = seeded(seed);
  const spikes = 14 + Math.floor(rand() * 6);
  const star = (ox, oy) => {
    ctx.beginPath();
    for (let i = 0; i <= spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? r * (0.92 + rand() * 0.08) : r * 0.62;
      const x = cx + ox + Math.cos(a) * rr, y = cy + oy + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  star(r * 0.12, r * 0.14);
  ctx.fillStyle = 'rgba(38,44,28,0.2)'; ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
  g.addColorStop(0, shade(color, 0.3)); g.addColorStop(1, shade(color, -0.3));
  star(0, 0);
  ctx.globalAlpha = remove ? 0.45 : 1;
  ctx.fillStyle = g; ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = shade(color, -0.5); ctx.lineWidth = px; ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85);
  }
  ctx.strokeStyle = shade(color, -0.35); ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
  if (remove) {
    ctx.strokeStyle = '#b3402e'; ctx.lineWidth = px * 2.5;
    const k = r * 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - k, cy - k); ctx.lineTo(cx + k, cy + k);
    ctx.moveTo(cx + k, cy - k); ctx.lineTo(cx - k, cy + k);
    ctx.stroke();
  }
}

export const TREE_FORMS = [
  { id: 'canopy', label: 'Broadleaf', draw: drawCanopyTree, color: '#6f8f4e' },
  { id: 'palm', label: 'Palm', draw: drawPalm, color: '#7c9a52' },
  { id: 'conifer', label: 'Pine / conifer', draw: drawConifer, color: '#4f6e4a' },
];

export const TREE_COLORS = ['#6f8f4e', '#557a3f', '#8aa05a', '#4f6e4a', '#7c9a52', '#9b7e4d', '#8c4f5f'];
