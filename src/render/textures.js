// Procedural material textures, drawn to real scale.
// Each texture is a tiling canvas plus how many feet one tile covers,
// so a pattern looks the right size at every zoom level.
import { seeded } from '../core/geom.js';

const cache = new Map();

function tile(px, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  draw(ctx, px);
  return c;
}

// Draw a mark at (x, y) and again across the tile edges so the tile repeats seamlessly
function wrap(px, x, y, r, fn) {
  for (const dx of [-px, 0, px]) for (const dy of [-px, 0, px]) {
    const xx = x + dx, yy = y + dy;
    if (xx + r < 0 || yy + r < 0 || xx - r > px || yy - r > px) continue;
    fn(xx, yy);
  }
}

function speckle(ctx, px, rand, count, colors, rMin, rMax) {
  for (let i = 0; i < count; i++) {
    const x = rand() * px, y = rand() * px, r = rMin + rand() * (rMax - rMin);
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    wrap(px, x, y, r, (xx, yy) => { ctx.beginPath(); ctx.arc(xx, yy, r, 0, Math.PI * 2); ctx.fill(); });
  }
}

const BUILDERS = {
  concrete: () => ({
    ft: 6,
    canvas: tile(256, (ctx, px) => {
      const rand = seeded('concrete');
      ctx.fillStyle = '#dedad1';
      ctx.fillRect(0, 0, px, px);
      speckle(ctx, px, rand, 900, ['rgba(120,112,98,0.18)', 'rgba(255,255,255,0.35)', 'rgba(90,84,72,0.12)'], 0.4, 1.3);
    }),
  }),
  asphalt: () => ({
    ft: 6,
    canvas: tile(256, (ctx, px) => {
      const rand = seeded('asphalt');
      ctx.fillStyle = '#5b5c5a';
      ctx.fillRect(0, 0, px, px);
      speckle(ctx, px, rand, 1600, ['rgba(255,255,255,0.10)', 'rgba(0,0,0,0.18)', 'rgba(150,150,140,0.2)'], 0.4, 1.1);
    }),
  }),
  gravel: () => ({
    ft: 3,
    canvas: tile(256, (ctx, px) => {
      const rand = seeded('gravel');
      ctx.fillStyle = '#cfc6b2';
      ctx.fillRect(0, 0, px, px);
      const tones = ['#b8ad96', '#e2dbcb', '#a39882', '#d6ccb6', '#efe9dc'];
      for (let i = 0; i < 420; i++) {
        const x = rand() * px, y = rand() * px, rx = 2 + rand() * 4, ry = 1.5 + rand() * 3, a = rand() * Math.PI;
        const fill = tones[Math.floor(rand() * tones.length)];
        wrap(px, x, y, rx, (xx, yy) => {
          ctx.beginPath(); ctx.ellipse(xx, yy, rx, ry, a, 0, Math.PI * 2);
          ctx.fillStyle = fill; ctx.fill();
          ctx.strokeStyle = 'rgba(90,80,60,0.25)'; ctx.lineWidth = 0.6; ctx.stroke();
        });
      }
    }),
  }),
  // 4x8 in pavers, running bond. Tile = 32 in wide x 32 in tall (8 x 4 bricks)
  pavers: (tone = 'tan') => {
    const tones = {
      tan: ['#d9c3a0', '#cfb690', '#e2cfaf', '#c9ae86'],
      gray: ['#b9b8b2', '#a9a8a1', '#c6c5bf', '#9f9e98'],
      terracotta: ['#c98a66', '#bd7b58', '#d39877', '#b5704f'],
      charcoal: ['#6d6c69', '#62615e', '#77766f', '#5a5956'],
    }[tone] || ['#d9c3a0'];
    return {
      ft: 32 / 12,
      canvas: tile(256, (ctx, px) => {
        const rand = seeded('pavers' + tone);
        const bw = px / 4, bh = px / 8; // 8in x 4in at 8px/in
        ctx.fillStyle = 'rgba(80,70,55,0.55)';
        ctx.fillRect(0, 0, px, px);
        for (let row = 0; row < 8; row++) {
          const shift = row % 2 ? bw / 2 : 0;
          for (let col = -1; col < 5; col++) {
            const x = col * bw + shift, y = row * bh;
            ctx.fillStyle = tones[Math.floor(rand() * tones.length)];
            ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
          }
        }
        speckle(ctx, px, rand, 300, ['rgba(255,255,255,0.12)', 'rgba(0,0,0,0.06)'], 0.4, 1);
      }),
    };
  },
  // Building roof: light fill with fine diagonal hatch
  roof: () => ({
    ft: 8,
    canvas: tile(128, (ctx, px) => {
      ctx.fillStyle = '#ebe6db';
      ctx.fillRect(0, 0, px, px);
      ctx.strokeStyle = 'rgba(110,100,82,0.22)';
      ctx.lineWidth = 1;
      const n = 8, s = px / n;
      ctx.beginPath();
      for (let k = -n; k <= n * 2; k++) { ctx.moveTo(k * s, 0); ctx.lineTo(k * s - px, px); }
      ctx.stroke();
    }),
  }),
};

export function texture(name, variant) {
  const key = variant ? `${name}:${variant}` : name;
  if (!cache.has(key)) {
    const b = BUILDERS[name];
    if (!b) return null;
    cache.set(key, b(variant));
  }
  return cache.get(key);
}

// Konva fill attributes for a texture, anchored at the world origin
export function patternFill(name, variant) {
  const t = texture(name, variant);
  if (!t) return {};
  const s = t.ft / t.canvas.width;
  return {
    fillPatternImage: t.canvas,
    fillPatternScale: { x: s, y: s },
    fillPatternRepeat: 'repeat',
  };
}

export const SURFACE_MATERIALS = [
  { id: 'concrete', label: 'Concrete' },
  { id: 'asphalt', label: 'Asphalt' },
  { id: 'pavers:tan', label: 'Pavers, tan' },
  { id: 'pavers:gray', label: 'Pavers, gray' },
  { id: 'pavers:terracotta', label: 'Pavers, terracotta' },
  { id: 'pavers:charcoal', label: 'Pavers, charcoal' },
  { id: 'gravel', label: 'Gravel' },
];

export function surfaceFill(materialId) {
  const [name, variant] = (materialId || 'concrete').split(':');
  return patternFill(name, variant);
}
