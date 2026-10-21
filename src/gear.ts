// Ball and cue designs for the Cues & Balls menu. Every pattern is painted in code onto a canvas:
// balls as an equirectangular map for a sphere, cues as wraps for the shaft and butt cylinders.
import * as THREE from 'three';

// ---------- painting helpers ----------

type Paint = (g: CanvasRenderingContext2D, w: number, h: number) => void;
type RGB = [number, number, number];

function canvas(w: number, h: number, paint: Paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d')!, w, h);
  return c;
}

function texture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Paint a sphere map pixel by pixel from the surface direction (matches THREE.SphereGeometry's UVs). */
function sphere(fn: (x: number, y: number, z: number) => RGB): Paint {
  return (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let py = 0; py < h; py++) {
      const th = ((py + 0.5) / h) * Math.PI;
      for (let px = 0; px < w; px++) {
        const ph = ((px + 0.5) / w) * Math.PI * 2;
        const [r, gg, b] = fn(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
        const k = (py * w + px) * 4;
        img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  };
}

const hex = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** Soft-edged line: 1 on the line, fading to 0 at `w` away. */
const line = (d: number, w: number) => clamp01(1 - Math.abs(d) / w);
function hsl(h: number, s: number, l: number): RGB {
  const f = (n: number) => { const k = (n + h * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
/** Cheap smooth value noise on the sphere (sum of a few sines). */
const wob = (x: number, y: number, z: number, f: number) => Math.sin(x * f + 1.3) * Math.sin(y * f * 1.1 + 2.1) + Math.sin(z * f * 0.9 + y * 2 + 0.7) * 0.6;

// Soccer ball: 12 pentagons centred on an icosahedron's vertices and 20 hexagons on its faces
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO: number[][] = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]].map((v) => { const l = Math.hypot(v[0], v[1], v[2]); return v.map((c) => c / l); });
const DODECA: number[][] = (() => {
  const out: number[][] = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
    const [a, b, c] = [ICO[i], ICO[j], ICO[k]];
    const d = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    if (d(a, b) > 0.4 && d(b, c) > 0.4 && d(a, c) > 0.4) {
      const s = [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]];
      const l = Math.hypot(s[0], s[1], s[2]);
      out.push(s.map((q) => q / l));
    }
  }
  return out;
})();

// ---------- balls ----------

export interface BallDesign {
  id: string;
  name: string;
  paint: Paint;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  sheen?: number;
  emissive?: number;
  /** Dimples (golf) or pebbling (basketball) in the surface. */
  bump?: 'dimples' | 'pebble';
  /** Coins to unlock (free when missing; some are earned through achievements instead, see wallet.ts). */
  price?: number;
}

const S = sphere;
export const BALLS: BallDesign[] = [
  {
    id: 'cue', name: 'Classic', clearcoat: 1, roughness: 0.18,
    paint: (g, w, h) => {
      g.fillStyle = '#f2f6f6'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c8473b';
      for (const [x, y] of [[0.25, 0.5], [0.75, 0.5], [0.5, 0.08], [0.5, 0.92]]) { g.beginPath(); g.arc(x * w, y * h, h * 0.05, 0, Math.PI * 2); g.fill(); }
    },
  },
  {
    id: 'eight', name: 'Eight Ball', price: 100, clearcoat: 1, roughness: 0.15,
    paint: (g, w, h) => {
      g.fillStyle = '#141414'; g.fillRect(0, 0, w, h);
      for (const cx of [0.25, 0.75]) {
        g.save(); g.translate(cx * w, h / 2); g.scale(0.5, 1);
        g.fillStyle = '#f4f4f0'; g.beginPath(); g.arc(0, 0, h * 0.2, 0, Math.PI * 2); g.fill();
        g.restore();
        g.fillStyle = '#141414'; g.font = `bold ${h * 0.26}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.save(); g.translate(cx * w, h / 2 + 2); g.scale(0.55, 1); g.fillText('8', 0, 0); g.restore();
      }
    },
  },
  {
    id: 'tennis', name: 'Tennis', price: 300, roughness: 1, sheen: 0.35,
    paint: S((x, y, z) => {
      // The classic seam: a curve that weaves round the ball like a baseball's
      const a = Math.atan2(z, x);
      const seam = y - 0.62 * Math.sin(2 * a) * Math.sqrt(1 - y * y) ** 0.2;
      const fuzz = 0.92 + 0.08 * Math.sin(x * 90) * Math.sin(y * 83) * Math.sin(z * 77);
      const c = mix(hex(0xc4e81a), hex(0xffffff), line(seam, 0.07));
      return [c[0] * fuzz, c[1] * fuzz, c[2] * fuzz];
    }),
  },
  {
    id: 'soccer', name: 'Soccer', price: 400, roughness: 0.4, clearcoat: 0.4,
    paint: S((x, y, z) => {
      let best = -2, second = -2, pent = false;
      for (const [list, isPent] of [[ICO, true], [DODECA, false]] as const) {
        for (const v of list) {
          const d = v[0] * x + v[1] * y + v[2] * z;
          if (d > best) { second = best; best = d; pent = isPent; } else if (d > second) second = d;
        }
      }
      const seam = line(best - second, 0.012);
      return mix(pent ? hex(0x1a1a1e) : hex(0xf6f6f2), hex(0x5a5a60), seam);
    }),
  },
  {
    id: 'basketball', name: 'Basketball', price: 400, roughness: 0.75, bump: 'pebble',
    paint: S((x, y, z) => {
      // Two great circles and two curved "C" lines round the sides
      const ln = Math.max(line(z, 0.035), line(y, 0.035), line(Math.abs(x) - 0.72, 0.035));
      return mix(hex(0xe8742a), hex(0x2a1810), ln);
    }),
  },
  {
    id: 'baseball', name: 'Baseball', price: 300, roughness: 0.6,
    paint: S((x, y, z) => {
      const a = Math.atan2(z, x);
      const seam = y - 0.62 * Math.sin(2 * a) * Math.sqrt(1 - y * y) ** 0.2;
      // Two rows of red V stitches either side of the seam
      const along = a * 18;
      const stitch = Math.max(line(Math.abs(seam) - 0.07 - 0.02 * Math.abs(((along % 2) + 2) % 2 - 1), 0.012), 0);
      const c = mix(hex(0xf6f2e8), hex(0xc8a890), line(seam, 0.03) * 0.5);
      return mix(c, hex(0xd8282a), stitch);
    }),
  },
  {
    id: 'beach', name: 'Beach Ball', price: 150, roughness: 0.25, clearcoat: 1,
    paint: S((x, y, z) => {
      if (Math.abs(y) > 0.93) return hex(0xffffff);
      const a = (Math.atan2(z, x) / (Math.PI * 2) + 1) % 1;
      return hex([0xff4a4a, 0xffd23a, 0x3a8aff, 0xffffff, 0x3ad06a, 0xff8a2a][Math.floor(a * 6)]);
    }),
  },
  {
    id: 'golf', name: 'Golf Ball', price: 200, roughness: 0.3, clearcoat: 0.6, bump: 'dimples',
    paint: (g, w, h) => {
      g.fillStyle = '#fafafa'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d82a2a'; g.font = `bold ${h * 0.12}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.save(); g.translate(w * 0.25, h * 0.5); g.scale(0.55, 1); g.fillText('RACK & ROLL', 0, 0); g.restore();
    },
  },
  {
    id: 'tiedye', name: 'Tie-Dye', price: 500, roughness: 0.5, clearcoat: 0.5,
    paint: S((x, y, z) => {
      // A rainbow spiral twisting out from one pole, with soft dye bleeds
      const r = Math.acos(z) / Math.PI;
      const ang = Math.atan2(y, x) / (Math.PI * 2);
      const hue = (((ang + r * 2.6 + 0.08 * wob(x, y, z, 7)) % 1) + 1) % 1;
      const bleed = 0.5 + 0.12 * Math.sin(r * 60 + ang * 20);
      return hsl(hue, 0.85, bleed);
    }),
  },
  {
    id: 'galaxy', name: 'Galaxy', roughness: 0.2, clearcoat: 1,
    paint: S((x, y, z) => {
      const n = wob(x, y, z, 4) * 0.5 + wob(x, y, z, 9) * 0.25;
      let c = mix(hex(0x0c0a2a), hex(0x6a2ac8), clamp01(n));
      c = mix(c, hex(0x2aa8e8), clamp01(-n - 0.2));
      const star = Math.sin(x * 211) * Math.sin(y * 197) * Math.sin(z * 223);
      return star > 0.93 ? [255, 255, 255] : c;
    }),
  },
  {
    id: 'watermelon', name: 'Watermelon', price: 150, roughness: 0.35, clearcoat: 0.8,
    paint: S((x, y, z) => {
      const a = Math.atan2(z, x);
      const stripe = Math.sin(a * 8 + 0.6 * Math.sin(y * 9)) > 0.25;
      return stripe ? hex(0x1e7a2e) : hex(0x6ac84a);
    }),
  },
  {
    id: 'smiley', name: 'Smiley', price: 150, roughness: 0.3, clearcoat: 1,
    paint: S((x, y, z) => {
      // Face looks along -x (the side the camera mostly sees as it rolls away)
      const fx = -x, eye = Math.min(Math.hypot(z - 0.28, y - 0.3), Math.hypot(z + 0.28, y - 0.3));
      if (fx > 0 && eye < 0.11) return hex(0x2a1a0a);
      const mouth = Math.hypot(z, y + 0.05);
      if (fx > 0 && y < -0.05 && Math.abs(mouth - 0.48) < 0.05) return hex(0x2a1a0a);
      return hex(0xffd23a);
    }),
  },
  { id: 'gold', name: 'Gold', metalness: 1, roughness: 0.22, paint: (g, w, h) => { g.fillStyle = '#e8b84a'; g.fillRect(0, 0, w, h); } },
  { id: 'chrome', name: 'Chrome', price: 800, metalness: 1, roughness: 0.08, paint: (g, w, h) => { g.fillStyle = '#e8eef4'; g.fillRect(0, 0, w, h); } },
  {
    id: 'neon', name: 'Neon Glow', price: 1000, roughness: 0.3, emissive: 0.9,
    paint: S((x, y, z) => mix(hex(0x2aff8a), hex(0x2ad8ff), clamp01(0.5 + 0.5 * Math.sin(y * 6 + Math.atan2(z, x) * 2)))),
  },
];

const ballCache = new Map<string, THREE.MeshPhysicalMaterial>();
/** A ready-to-use material for a ball design (built once). */
export function ballMaterial(id: string) {
  const d = BALLS.find((b) => b.id === id) ?? BALLS[0];
  const hit = ballCache.get(d.id);
  if (hit) return hit;
  const map = texture(canvas(512, 256, d.paint));
  const m = new THREE.MeshPhysicalMaterial({
    map, roughness: d.roughness ?? 0.3, metalness: d.metalness ?? 0, clearcoat: d.clearcoat ?? 0, clearcoatRoughness: 0.08,
    sheen: d.sheen ?? 0, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xf0ffb0),
  });
  if (d.emissive) { m.emissiveMap = map; m.emissive.setHex(0xffffff); m.emissiveIntensity = d.emissive; }
  if (d.bump) {
    m.bumpMap = texture(canvas(512, 256, d.bump === 'dimples' ? dimples : pebble));
    m.bumpScale = d.bump === 'dimples' ? 1.4 : 0.6;
  }
  ballCache.set(d.id, m);
  return m;
}

const dimples: Paint = (g, w, h) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  for (let row = 0; row < 18; row++) {
    const y = ((row + 0.5) / 18) * h, n = Math.max(3, Math.round(36 * Math.sin(((row + 0.5) / 18) * Math.PI)));
    for (let i = 0; i < n; i++) {
      const x = ((i + (row % 2) * 0.5) / n) * w;
      const gr = g.createRadialGradient(x, y, 0, x, y, 6);
      gr.addColorStop(0, '#888'); gr.addColorStop(1, '#fff');
      g.fillStyle = gr;
      g.save(); g.translate(x, y); g.scale(Math.min(3, 1 / Math.max(0.15, Math.sin(((row + 0.5) / 18) * Math.PI))), 1);
      g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }
};
const pebble: Paint = (g, w, h) => {
  g.fillStyle = '#888'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) { g.fillStyle = Math.random() > 0.5 ? '#bbb' : '#666'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
};

/** A small round preview of a ball for the menu (the front of the sphere map, shaded). */
export function ballPreview(id: string) {
  const d = BALLS.find((b) => b.id === id) ?? BALLS[0];
  const src = canvas(256, 128, d.paint);
  return canvas(72, 72, (g) => {
    g.save();
    g.beginPath(); g.arc(36, 36, 33, 0, Math.PI * 2); g.clip();
    g.drawImage(src, 32, 0, 128, 128, 3, 3, 66, 66);
    const sh = g.createRadialGradient(26, 24, 4, 36, 36, 36);
    const metal = (d.metalness ?? 0) > 0.5;
    sh.addColorStop(0, metal ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.35)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = sh; g.fillRect(0, 0, 72, 72);
    g.restore();
  }).toDataURL();
}

// ---------- cues ----------

/**
 * A cue design. Each wrap is painted on a canvas: across = round the cue, down = along it. For the
 * shaft the top row is at the tip end; for the butt the top row is at the joint.
 */
export interface CueDesign {
  id: string;
  name: string;
  shaft: Paint;
  butt: Paint;
  joint?: number;
  tip?: number;
  ferrule?: number;
  /** Coins to unlock (free when missing; some are earned through achievements instead, see wallet.ts). */
  price?: number;
  /** Shaft glows (lightsaber). */
  glow?: number;
  metalButt?: boolean;
}

const wood = (base: string, grain: string): Paint => (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = grain; g.globalAlpha = 0.15 + Math.random() * 0.3; g.lineWidth = 1 + Math.random() * 2;
    const x = Math.random() * w;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, h * 0.3, x - 6, h * 0.7, x + 2, h); g.stroke();
  }
  g.globalAlpha = 1;
};
const stars = (g: CanvasRenderingContext2D, w: number, y0: number, y1: number, color: string, n: number, size: number) => {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = ((i % 4) + (Math.floor(i / 4) % 2) * 0.5) / 4 * w + 8, y = y0 + (Math.floor(i / 4) + 0.5) / Math.ceil(n / 4) * (y1 - y0);
    g.save(); g.translate(x, y); g.scale(0.5, 1); // the wrap is stretched round the cue
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? size * 0.42 : size; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fill(); g.restore();
  }
};
const spiral = (a: string, b: string, turns: number, width = 0.5): Paint => (g, w, h) => {
  g.fillStyle = a; g.fillRect(0, 0, w, h);
  g.fillStyle = b;
  const step = h / turns;
  for (let k = -1; k <= turns + 1; k++) {
    g.beginPath();
    g.moveTo(0, k * step); g.lineTo(w, k * step + step); g.lineTo(w, k * step + step + step * width); g.lineTo(0, k * step + step * width);
    g.fill();
  }
};
const rings = (base: string, ringsAt: [number, string, number][]): Paint => (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (const [at, c, th] of ringsAt) { g.fillStyle = c; g.fillRect(0, at * h, w, th * h); }
};
const flames = (base: string, cols: string[]): Paint => (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  cols.forEach((c, j) => {
    g.fillStyle = c;
    for (let i = 0; i < 5; i++) {
      const x = (i / 5) * w + j * 6;
      g.beginPath(); g.moveTo(x - 10, h);
      g.bezierCurveTo(x - 14, h * 0.6, x + 18, h * (0.45 - j * 0.08), x + 4, h * (0.15 + j * 0.12));
      g.bezierCurveTo(x + 22, h * 0.5, x + 18, h * 0.7, x + 26, h);
      g.fill();
    }
  });
};

export const CUES: CueDesign[] = [
  { id: 'classic', name: 'Classic Maple', shaft: wood('#e6b47a', '#8a5a2a'), butt: wood('#3a2416', '#120a04'), joint: 0xd8c08a },
  {
    id: 'glory', name: 'Old Glory', price: 500, joint: 0xe8e8f0, tip: 0x2a4aa8,
    // Red and white stripes down the shaft; white stars on navy for the butt
    shaft: (g, w, h) => { g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8202a'; for (let i = 0; i < 7; i++) g.fillRect((i / 7) * w, 0, w / 14, h); },
    butt: (g, w, h) => { g.fillStyle = '#1e2e6a'; g.fillRect(0, 0, w, h); stars(g, w, 10, h - 10, '#ffffff', 24, 11); },
  },
  {
    id: 'unclesam', name: 'Uncle Sam', price: 400, joint: 0xc8202a, tip: 0x1e2e6a,
    shaft: spiral('#f4f4f4', '#c8202a', 10, 0.45),
    butt: (g, w, h) => { rings('#1e2e6a', [[0.02, '#f4f4f4', 0.03], [0.92, '#f4f4f4', 0.03]])(g, w, h); stars(g, w, 30, h - 30, '#f4f4f4', 16, 13); },
  },
  {
    id: 'fireworks', name: 'Fourth of July', price: 600, joint: 0xffd23a,
    shaft: rings('#f4f0e8', [[0.86, '#c8202a', 0.03], [0.92, '#1e2e6a', 0.03]]),
    butt: (g, w, h) => {
      g.fillStyle = '#0c1440'; g.fillRect(0, 0, w, h);
      const cols = ['#ff4a4a', '#ffffff', '#4a8aff', '#ffd23a'];
      for (let i = 0; i < 9; i++) {
        const x = Math.random() * w, y = 20 + Math.random() * (h - 40), c = cols[i % 4];
        g.strokeStyle = c; g.lineWidth = 2;
        for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 18); g.stroke(); }
      }
    },
  },
  { id: 'eagle', name: 'Bald Eagle', joint: 0xffc83a, tip: 0x3a2416,
    shaft: wood('#f0e6d0', '#a89070'),
    butt: (g, w, h) => {
      // Feathers: white at the joint fading into brown, with a gold band
      g.fillStyle = '#5a3a1e'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        const y = (i / 60) * h, white = y < h * 0.35;
        g.fillStyle = white ? '#f4f0e8' : i % 2 ? '#6a4628' : '#4a2e16';
        for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse((k / 6) * w + (i % 2) * 20, y, 12, 14, 0, 0, Math.PI); g.fill(); }
      }
      g.fillStyle = '#ffc83a'; g.fillRect(0, h * 0.36, w, h * 0.04);
    },
  },
  { id: 'candy', name: 'Candy Cane', price: 150, joint: 0xffffff, tip: 0xc8202a, shaft: spiral('#ffffff', '#e0202a', 14, 0.35), butt: spiral('#ffffff', '#e0202a', 6, 0.35) },
  {
    id: 'saber', name: 'Light Saber', price: 1000, joint: 0x9aa0a8, tip: 0x9af8ff, ferrule: 0xd8f8ff, glow: 1.6, metalButt: true,
    shaft: (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#7af0ff'); gr.addColorStop(0.5, '#e8ffff'); gr.addColorStop(1, '#7af0ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); },
    butt: rings('#b8bec8', [[0.1, '#3a3e46', 0.06], [0.3, '#3a3e46', 0.04], [0.34, '#3a3e46', 0.04], [0.38, '#3a3e46', 0.04], [0.6, '#c8202a', 0.03], [0.85, '#3a3e46', 0.08]]),
  },
  { id: 'flame', name: 'Hot Rod', price: 600, joint: 0xb8bec8, tip: 0x141414, shaft: wood('#2a2a2e', '#000000'), butt: flames('#141414', ['#ff4a1a', '#ff9a1a', '#ffe04a']) },
  { id: 'royal', name: 'Royal Gold', price: 800, joint: 0x141414, tip: 0x5a2a8a, metalButt: true, shaft: wood('#2a1a14', '#000000'), butt: rings('#e8b84a', [[0.15, '#5a2a8a', 0.05], [0.8, '#5a2a8a', 0.05]]) },
  {
    id: 'camo', name: 'Camo', price: 300, joint: 0x3a3a2a,
    shaft: wood('#c8b48a', '#7a6a4a'),
    butt: (g, w, h) => { g.fillStyle = '#6a7a4a'; g.fillRect(0, 0, w, h); for (const c of ['#3a4a2a', '#8a7a4a', '#2a2a1e']) { g.fillStyle = c; for (let i = 0; i < 18; i++) { g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 14, 18 + Math.random() * 26, Math.random() * 3, 0, Math.PI * 2); g.fill(); } } },
  },
  {
    id: 'rainbow', name: 'Tie-Dye', price: 500, joint: 0xffffff,
    shaft: (g, w, h) => { for (let y = 0; y < h; y++) { const c = hsl((y / h) * 2 % 1, 0.8, 0.6); g.fillStyle = `rgb(${c.join(',')})`; g.fillRect(0, y, w, 1); } },
    butt: (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = hsl(((x / w + y / h * 3 + 0.1 * Math.sin(y * 0.1 + x * 0.05)) % 1 + 1) % 1, 0.85, 0.55);
        const k = (y * w + x) * 4; img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    },
  },
  {
    id: 'slugger', name: 'Slugger', price: 300, joint: 0x141414, tip: 0x141414,
    // Ash bat wood, with black grip tape wound round the butt
    shaft: wood('#e8d0a0', '#a8885a'),
    butt: (g, w, h) => { wood('#e0c494', '#a8885a')(g, w, h); g.save(); g.beginPath(); g.rect(0, h * 0.45, w, h * 0.55); g.clip(); spiral('#1a1a1a', '#3a3a3a', 22, 0.2)(g, w, h); g.restore(); },
  },
  {
    id: 'galaxy', name: 'Galaxy', price: 700, joint: 0xb8a8ff, tip: 0x6a2ac8,
    shaft: wood('#1a1640', '#3a2a8a'),
    butt: (g, w, h) => {
      g.fillStyle = '#0c0a2a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) { const x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 40; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, i % 2 ? 'rgba(140,70,220,0.6)' : 'rgba(50,160,230,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
      g.fillStyle = '#fff'; for (let i = 0; i < 160; i++) g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    },
  },
];

/** Materials for a cue design: shaft, butt, joint, ferrule, tip (built fresh; the renderer fades them). */
export function cueMaterials(id: string) {
  const d = CUES.find((c) => c.id === id) ?? CUES[0];
  const shaftMap = texture(canvas(128, 512, d.shaft));
  const buttMap = texture(canvas(128, 512, d.butt));
  const shaft = new THREE.MeshStandardMaterial({ map: shaftMap, roughness: 0.35, transparent: true });
  if (d.glow) { shaft.emissiveMap = shaftMap; shaft.emissive.setHex(0xffffff); shaft.emissiveIntensity = d.glow; }
  return {
    shaft,
    butt: new THREE.MeshStandardMaterial({ map: buttMap, roughness: d.metalButt ? 0.25 : 0.3, metalness: d.metalButt ? 0.8 : 0.05, transparent: true }),
    joint: new THREE.MeshStandardMaterial({ color: d.joint ?? 0xd8c08a, metalness: 0.8, roughness: 0.25, transparent: true }),
    ferrule: new THREE.MeshStandardMaterial({ color: d.ferrule ?? 0xf3efe2, roughness: 0.35, transparent: true, emissive: d.glow ? (d.ferrule ?? 0) : 0 }),
    tip: new THREE.MeshStandardMaterial({ color: d.tip ?? 0x3f74a8, roughness: 0.9, transparent: true }),
  };
}

/** A side-on preview of a cue for the menu: butt on the left, shaft tapering to the tip. */
export function cuePreview(id: string) {
  const d = CUES.find((c) => c.id === id) ?? CUES[0];
  const shaft = canvas(128, 512, d.shaft), butt = canvas(128, 512, d.butt);
  const W = 240, H = 26;
  return canvas(W, H, (g) => {
    const cy = H / 2;
    // Turn each wrap so "along" runs left to right: butt end on the left, tip on the right
    const drawWrap = (src: HTMLCanvasElement, x0: number, x1: number, r0: number, r1: number) => {
      const rot = canvas(512, 128, (r) => { r.translate(512, 0); r.scale(-1, 1); r.translate(0, 128); r.rotate(-Math.PI / 2); r.drawImage(src, 0, 0); });
      g.save();
      g.beginPath(); g.moveTo(x0, cy - r0); g.lineTo(x1, cy - r1); g.lineTo(x1, cy + r1); g.lineTo(x0, cy + r0); g.closePath(); g.clip();
      g.drawImage(rot, 0, 32, 512, 64, x0, cy - r0, x1 - x0, 2 * r0);
      g.restore();
    };
    drawWrap(butt, 6, 92, 9, 7);
    g.fillStyle = `#${(d.joint ?? 0xd8c08a).toString(16).padStart(6, '0')}`; g.fillRect(92, cy - 7, 5, 14);
    drawWrap(shaft, 97, 226, 6.5, 3.4);
    g.fillStyle = `#${(d.ferrule ?? 0xf3efe2).toString(16).padStart(6, '0')}`; g.fillRect(226, cy - 3.4, 6, 6.8);
    g.fillStyle = `#${(d.tip ?? 0x3f74a8).toString(16).padStart(6, '0')}`; g.fillRect(232, cy - 3.3, 3, 6.6);
    const sh = g.createLinearGradient(0, 0, 0, H);
    sh.addColorStop(0, 'rgba(255,255,255,0.25)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = sh; g.fillRect(0, 0, W, H);
  }).toDataURL();
}
