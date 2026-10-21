// The Candy Land course, in the same cartoon toon-and-ink style: mint-frosted fairways, cake layers stacked
// into levels (icing rims, open edges dripping with frosting), rainbow chutes that slide the ball down a
// level, candy-cane ladders that carry it up, gumdrop bumpers, lollipop trees and strolling gingerbread
// men, with cupcakes, giant lollipops, ice-cream mountains, cotton-candy clouds and a rainbow around.
// Purely visual; positions come from physics.ts.
import * as THREE from 'three';
import { Animated } from './art';
import { Astronaut, Bumper, Chute, LevelDef, Palm, Pt } from './levels';
import { astronautAt, BALL_R, CHUTE_CATCH, chuteTrack, groundAt, heightAt, LADDER_RUNG, palmR, Track, trackAt, World } from './physics';
import { basaltPlain, blob, cached, canvasTex, dirtMaterial, eye, part, place, rng, shared, toon, toonRamp, V } from './jurassic';
import { moonDustMaterial, moonKerb } from './space';
import { feltMaterial } from './circus';
import { sandstoneMaterial, templeKerb } from './tomb';
import { snowMaterial } from './arctic';
import { TURF_TILE } from './art';
import { outlineDistance, resample } from './landscape';

type ToScene = (x: number, y: number) => THREE.Vector3;

/** Pastel candy colours, used round the course. */
export const CANDY = [0xff7eb6, 0xffb35c, 0xfff07a, 0x7ee8a8, 0x7ec8ff, 0xc29bff];

// ---------- materials ----------

const sprinkle = (g: CanvasRenderingContext2D, r: () => number, n: number, size: number) => {
  const cols = ['#ff5a9a', '#ffd23a', '#5ac8ff', '#7a5aff', '#ffffff', '#ff8a3a', '#5ae08a'];
  for (let i = 0; i < n; i++) {
    g.save(); g.translate(r() * 512, r() * 512); g.rotate(r() * Math.PI);
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.beginPath(); g.roundRect(-size, -size * 0.32, size * 2, size * 0.64, size * 0.32); g.fill();
    g.restore();
  }
};

/** Mint frosting for the fairways, swirled and scattered with sprinkles. */
export function frostingMaterial() {
  return cached('m:frosting', () => {
    const r = rng(17);
    const map = canvasTex(512, 512, (g) => {
      g.fillStyle = '#9ce8c0'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 50; i++) {
        g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(60,170,120,0.18)'; g.lineWidth = 6 + r() * 8;
        const x = r() * 512, y = r() * 512, rad = 20 + r() * 50;
        g.beginPath(); g.arc(x, y, rad, r() * 6, r() * 6 + 2.5); g.stroke();
      }
      sprinkle(g, r, 70, 5);
    });
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp(), vertexColors: true }));
  });
}

/** Pink sugar ground around the course, dotted with crystals. */
export function sugarGroundMaterial() {
  return cached('m:sugarground', () => {
    const r = rng(23);
    const map = canvasTex(512, 512, (g) => {
      g.fillStyle = '#ddd2ff'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 40; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(170,140,255,0.25)'; g.beginPath(); g.ellipse(r() * 512, r() * 512, 30 + r() * 60, 20 + r() * 30, r() * 3, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 500; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(r() * 512, r() * 512, 2, 2); }
    });
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp() }));
  });
}

/** A candy-cane striped kerb. */
export function candyKerb() {
  return cached('m:candykerb', () => {
    const t = canvasTex(128, 32, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 32);
      g.fillStyle = '#ff5a9a'; g.fillRect(0, 0, 64, 32);
    });
    return shared(new THREE.MeshToonMaterial({ map: t, gradientMap: toonRamp() }));
  });
}

/** Diagonal yellow-and-black hazard stripes round the edge of a moving platform. */
function hazardMaterial() {
  return cached('m:hazard', () => {
    const t = canvasTex(64, 16, (g) => {
      g.fillStyle = '#ffc83a'; g.fillRect(0, 0, 64, 16);
      g.fillStyle = '#1a1a1a';
      for (let k = -1; k < 3; k++) { g.beginPath(); g.moveTo(k * 32, 16); g.lineTo(k * 32 + 16, 16); g.lineTo(k * 32 + 32, 0); g.lineTo(k * 32 + 16, 0); g.fill(); }
    });
    return shared(new THREE.MeshToonMaterial({ map: t, gradientMap: toonRamp() }));
  });
}

/** Diagonal red-and-white candy-cane stripes (for rails, sticks and posts). */
function caneMaterial(color = '#e8203a') {
  return cached(`m:cane:${color}`, () => {
    const t = canvasTex(64, 64, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = color;
      for (let k = -1; k < 3; k++) { g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32 + 16, 0); g.lineTo(k * 32 + 16 + 64, 64); g.lineTo(k * 32 + 64, 64); g.fill(); }
    });
    return shared(new THREE.MeshToonMaterial({ map: t, gradientMap: toonRamp() }));
  });
}

/** The frosting on top of each cake layer: strawberry, lemon, then lavender, with sprinkles. */
const TIER_FROSTING = ['#ffa8d0', '#fff2a8', '#dcc4ff'];
function tierTopMaterial(level: number) {
  const col = TIER_FROSTING[level % TIER_FROSTING.length];
  return cached(`m:tiertop:${col}`, () => {
    const r = rng(41 + level);
    const map = canvasTex(512, 512, (g) => {
      g.fillStyle = col; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 5 + r() * 6; g.beginPath(); g.arc(r() * 512, r() * 512, 15 + r() * 45, r() * 6, r() * 6 + 2.2); g.stroke(); }
      sprinkle(g, r, 80, 5);
    });
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp(), vertexColors: true }));
  });
}

/** The side of a cake layer: sponge, a stripe of jam and cream, and frosting along the top. */
function cakeSideMaterial(level: number) {
  const col = TIER_FROSTING[level % TIER_FROSTING.length];
  return cached(`m:cakeside:${col}`, () => {
    const r = rng(7 + level);
    const map = canvasTex(256, 128, (g) => {
      g.fillStyle = '#f0c27e'; g.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 260; i++) { g.fillStyle = r() > 0.5 ? 'rgba(200,140,60,0.5)' : 'rgba(255,230,170,0.6)'; g.beginPath(); g.arc(r() * 256, r() * 128, 1 + r() * 2.2, 0, Math.PI * 2); g.fill(); }
      // jam and cream filling
      g.fillStyle = '#ffffff'; g.fillRect(0, 58, 256, 10);
      g.fillStyle = '#e83a6a'; g.fillRect(0, 66, 256, 6);
      // frosting coat at the top, with a scalloped lower edge
      g.fillStyle = col; g.fillRect(0, 0, 256, 20);
      for (let x = 0; x < 256; x += 16) { g.beginPath(); g.arc(x + 8, 20, 8, 0, Math.PI); g.fill(); }
    });
    map.wrapT = THREE.ClampToEdgeWrapping;
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp(), side: THREE.DoubleSide }));
  });
}

/** Sugar crystals sparkling on gumdrops. */
const sugarTex = () => cached('t:sugar', () => {
  const r = rng(5);
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 160; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,0.12)'; g.fillRect(r() * 128, r() * 128, 2, 2); }
  });
});
function gumdropMaterial(color: number) {
  return cached(`m:gumdrop:${color}`, () => shared(new THREE.MeshToonMaterial({ color, map: sugarTex(), gradientMap: toonRamp() })));
}

// ---------- geometry helpers ----------

/** Split triangles until no edge is longer than `max` (so a flat shape can follow the terrain). */
function subdivide(src: ArrayLike<number>, max: number) {
  const out: number[] = [];
  const stack: number[][] = [];
  for (let i = 0; i < src.length; i += 9) stack.push(Array.from({ length: 9 }, (_, k) => src[i + k]));
  while (stack.length) {
    const t = stack.pop()!;
    const d = (i: number, j: number) => Math.hypot(t[i * 3] - t[j * 3], t[i * 3 + 2] - t[j * 3 + 2]);
    const e = [d(0, 1), d(1, 2), d(2, 0)];
    const k = e.indexOf(Math.max(...e));
    if (e[k] <= max) { out.push(...t); continue; }
    const a = k, b = (k + 1) % 3, c = (k + 2) % 3;
    const m = [0, 1, 2].map((q) => (t[a * 3 + q] + t[b * 3 + q]) / 2);
    const P = (i: number) => t.slice(i * 3, i * 3 + 3);
    stack.push([...P(a), ...m, ...P(c)], [...m, ...P(b), ...P(c)]);
  }
  return new Float32Array(out);
}

function inPoly(pts: Pt[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- levels on every course ----------

/**
 * How one course draws its raised levels, chutes and ladders. Candy Land has cake layers with icing rims
 * and frosting drips; the other courses use their own fairway on top and their own cliff faces, rims,
 * slides and ways up.
 */
export interface LevelLook {
  /** Material for a tier's top at stacking level `n` (0 = the lowest), and world units per texture tile. */
  top: (n: number) => THREE.Material;
  tile: number;
  side: (n: number) => THREE.Material;
  /** Solid edges: piped beads (icing, snow) or a low rail. */
  rim: { kind: 'beads' | 'tube'; mat: THREE.Material; r: number };
  /** Over open edges: frosting drips or icicles. */
  drip?: { mat: (n: number) => THREE.Material; icicle?: boolean };
  chute: { colors: number[]; lip: number; post: () => THREE.Material; mouth: [string, string]; ring: number[] };
  ladder: { kind: 'cane' | 'rails' | 'stairs' | 'lift'; rail?: () => THREE.Material; rung?: number; ring: number };
}

/** Cliff and wall faces: a 256x128 texture whose top rows sit at the top edge (drawn by `draw`). */
const sideTex = (key: string, draw: (g: CanvasRenderingContext2D, r: () => number) => void) => cached(`m:side:${key}`, () => {
  const map = canvasTex(256, 128, (g) => draw(g, rng(key.length * 13 + 5)));
  map.wrapT = THREE.ClampToEdgeWrapping;
  return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp(), side: THREE.DoubleSide }));
});
const bands = (g: CanvasRenderingContext2D, r: () => number, cols: string[], from: number) => {
  for (let y = from; y < 128; ) { const h = 8 + r() * 16; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(0, y, 256, h + 1); y += h; }
};
const speckle = (g: CanvasRenderingContext2D, r: () => number, n: number, cols: string[]) => {
  for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.beginPath(); g.arc(r() * 256, r() * 128, 0.8 + r() * 2, 0, Math.PI * 2); g.fill(); }
};

export function levelLook(theme: string): LevelLook {
  const ring = (cols: number[]) => cols;
  switch (theme) {
    case 'jurassic': return {
      top: () => dirtMaterial(), tile: TURF_TILE,
      side: () => sideTex('jurassic', (g, r) => { bands(g, r, ['#c0643a', '#d88850', '#a85030', '#e0a060', '#b45a34'], 0); speckle(g, r, 200, ['rgba(80,30,10,0.35)', 'rgba(255,220,170,0.3)']); g.fillStyle = '#6e4a38'; g.fillRect(0, 0, 256, 8); }),
      rim: { kind: 'tube', mat: basaltPlain(), r: 3.6 },
      chute: { colors: [0xa86a3a, 0x8a5428], lip: 0x5a3418, post: () => toon(0x6a4020), mouth: ['#2a1408', '#ff8a30'], ring: ring([0xff8a30, 0xffc060]) },
      ladder: { kind: 'rails', rail: () => toon(0x7a4a24), rung: 0xd8b878, ring: 0xffb050 },
    };
    case 'space': return {
      top: () => moonDustMaterial(), tile: TURF_TILE,
      side: () => sideTex('space', (g, r) => { bands(g, r, ['#8a8898', '#7a7888', '#9c9aac', '#6e6c7e'], 0); speckle(g, r, 260, ['rgba(30,30,50,0.4)', 'rgba(230,230,255,0.35)']); g.fillStyle = '#c8c6d8'; g.fillRect(0, 0, 256, 6); }),
      rim: { kind: 'tube', mat: moonKerb(), r: 3 },
      chute: { colors: [0xb8bcc8, 0x6ad8ff], lip: 0x3e4270, post: () => toon(0x8a8ea0), mouth: ['#0a0a20', '#6ad8ff'], ring: ring([0x6ad8ff, 0xc8a8ff]) },
      ladder: { kind: 'rails', rail: () => toon(0x9aa0b0), rung: 0x6ad8ff, ring: 0x6ad8ff },
    };
    case 'circus': return {
      top: () => feltMaterial(), tile: TURF_TILE,
      side: () => sideTex('circus', (g) => { for (let x = 0; x < 256; x += 32) { g.fillStyle = '#d8202e'; g.fillRect(x, 0, 16, 128); g.fillStyle = '#f8f0e0'; g.fillRect(x + 16, 0, 16, 128); } g.fillStyle = '#ffc83a'; g.fillRect(0, 0, 256, 12); g.fillStyle = '#b8862a'; g.fillRect(0, 12, 256, 3); for (let x = 8; x < 256; x += 32) { g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(x, 6, 3, 0, Math.PI * 2); g.fill(); } }),
      rim: { kind: 'tube', mat: toon(0xffc83a), r: 3 },
      chute: { colors: [0xd8202e, 0xf8f0e0, 0x2a6ad8, 0xf8f0e0], lip: 0xffc83a, post: () => toon(0xffc83a), mouth: ['#1a0a10', '#ffc83a'], ring: ring([0xd8202e, 0xffc83a]) },
      ladder: { kind: 'rails', rail: () => caneMaterial('#d8202e'), rung: 0xffc83a, ring: 0xffc83a },
    };
    case 'tomb': return {
      top: () => sandstoneMaterial(), tile: TURF_TILE,
      side: () => sideTex('tomb', (g, r) => {
        g.fillStyle = '#e0b070'; g.fillRect(0, 0, 256, 128);
        g.strokeStyle = 'rgba(140,90,40,0.6)'; g.lineWidth = 2;
        for (let y = 0; y < 128; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); for (let x = (y / 24) % 2 ? 20 : 0; x < 256; x += 40) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 24); g.stroke(); } }
        g.fillStyle = '#2a6a8a'; g.fillRect(0, 50, 256, 18);
        for (let x = 6; x < 256; x += 18) { g.fillStyle = r() > 0.5 ? '#ffc83a' : '#f4e8c8'; g.fillRect(x, 54, 3 + r() * 6, 10); g.beginPath(); g.arc(x + 10, 59, 3, 0, Math.PI * 2); g.fill(); }
      }),
      rim: { kind: 'tube', mat: templeKerb(), r: 3.6 },
      chute: { colors: [0xe0b070, 0xc89050], lip: 0x2a6a8a, post: () => toon(0xc89050), mouth: ['#1a2a3a', '#ffc83a'], ring: ring([0x2ad8c8, 0xffc83a]) },
      ladder: { kind: 'stairs', ring: 0x2ad8c8 },
    };
    case 'arctic': return {
      top: () => snowMaterial(), tile: 260,
      side: () => sideTex('arctic', (g, r) => {
        const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#d8f0ff'); gr.addColorStop(1, '#6aa8d8');
        g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
        g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2;
        for (let i = 0; i < 18; i++) { let x = r() * 256, y = 20 + r() * 100; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 40; y += r() * 20; g.lineTo(x, y); } g.stroke(); }
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 14);
        for (let x = 0; x < 256; x += 20) { g.beginPath(); g.arc(x + 10, 14, 10, 0, Math.PI); g.fill(); }
      }),
      rim: { kind: 'beads', mat: toon(0xffffff), r: 5 },
      drip: { mat: () => toon(0xd8f0ff), icicle: true },
      chute: { colors: [0xeaf8ff, 0xbfe6fa], lip: 0x2a6ad8, post: () => toon(0x8a6a4a), mouth: ['#14304e', '#bfe6fa'], ring: ring([0x6ad8ff, 0xffffff]) },
      ladder: { kind: 'lift', ring: 0x6ad8ff },
    };
    default: return {
      top: (n) => tierTopMaterial(n), tile: 260,
      side: (n) => cakeSideMaterial(n),
      rim: { kind: 'beads', mat: toon(0xffffff), r: 4.4 },
      drip: { mat: (n) => toon(new THREE.Color(TIER_FROSTING[n % TIER_FROSTING.length]).getHex()) },
      chute: { colors: CANDY, lip: 0xffffff, post: () => caneMaterial(), mouth: ['#2a1a4a', '#7a4aff'], ring: CANDY.filter((_, k) => k % 2 === 0) },
      ladder: { kind: 'cane', ring: 0xfff07a },
    };
  }
}

/**
 * One raised level: its top (the course's surface, following the gentle slopes, with the cup cut out if
 * it's up here), the faces down to whatever it stands on, a rim along its solid edges and, on some courses,
 * drips or icicles over its open ones.
 */
export function tierMesh(L: LevelDef, i: number, toScene: ToScene, HW: number, HH: number, look: LevelLook) {
  const tiers = L.tiers!, t = tiers[i];
  const g = new THREE.Group();
  const cxy = t.pts.reduce((a, [x, y]) => [a[0] + x / t.pts.length, a[1] + y / t.pts.length], [0, 0]);
  // Stacking level (how many layers down to the ground) and the height of this top above the ground slopes
  const below = tiers.filter((u, k) => k < i && inPoly(u.pts, cxy[0], cxy[1]));
  const level = below.length;
  const lift = t.h + below.reduce((a, u) => a + u.h, 0);
  const topAt = (x: number, y: number) => groundAt(L, x, y) + lift;

  // Top
  const shape = new THREE.Shape(t.pts.map(([x, y]) => new THREE.Vector2(x - HW, -(y - HH))));
  const [cx, cy] = L.cup;
  if (inPoly(t.pts, cx, cy) && !tiers.some((u, k) => k > i && inPoly(u.pts, cx, cy))) {
    const hole = new THREE.Path();
    hole.absarc(cx - HW, -(cy - HH), 21, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const flat = new THREE.ShapeGeometry(shape, 24).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = subdivide(flat.attributes.position.array, 16);
  flat.dispose();
  const uv = new Float32Array((pos.length / 3) * 2), col = new Float32Array(pos.length);
  for (let k = 0; k < pos.length / 3; k++) {
    const x = pos[k * 3] + HW, y = pos[k * 3 + 2] + HH;
    pos[k * 3 + 1] = topAt(x, y) + 0.05;
    uv[k * 2] = x / look.tile; uv[k * 2 + 1] = y / look.tile;
    const shade = Math.max(0.85, Math.min(1.12, 1 + (groundAt(L, x, y)) * 0.035));
    col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = shade;
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  top.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  top.setAttribute('color', new THREE.BufferAttribute(col, 3));
  top.computeVertexNormals();
  const topMesh = new THREE.Mesh(top, look.top(level));
  topMesh.receiveShadow = true;
  g.add(topMesh);

  // Sides, rim and drips
  const area = t.pts.reduce((a, [x1, y1], k) => { const [x2, y2] = t.pts[(k + 1) % t.pts.length]; return a + x1 * y2 - x2 * y1; }, 0);
  const side: number[] = [], sideUv: number[] = [];
  const beads: THREE.Vector3[] = [], rims: THREE.Vector3[][] = [], drips: { p: THREE.Vector3; len: number }[] = [], trim: THREE.Vector3[] = [];
  const r = rng(i * 31 + 7);
  let along = 0;
  t.pts.forEach(([ax, ay], k) => {
    const [bx, by] = t.pts[(k + 1) % t.pts.length];
    const len = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / len, dy = (by - ay) / len;
    const [nx, ny] = area > 0 ? [dy, -dx] : [-dy, dx]; // outward
    const open = t.open?.includes(k);
    const n = Math.max(1, Math.ceil(len / 10));
    for (let s = 0; s < n; s++) {
      const u0 = s / n, u1 = (s + 1) / n;
      const p = (u: number) => [ax + (bx - ax) * u, ay + (by - ay) * u] as const;
      const [x0, y0] = p(u0), [x1, y1] = p(u1);
      const t0 = topAt(x0, y0), t1 = topAt(x1, y1);
      const deep = t.move ? t.h : 0; // a moving platform's sides reach far enough down to stay hidden when it's lowered
      const b0 = heightAt(L, x0 + nx * 3, y0 + ny * 3) - 10 - deep, b1 = heightAt(L, x1 + nx * 3, y1 + ny * 3) - 10 - deep;
      const A = toScene(x0, y0), B = toScene(x1, y1);
      const ua = (along + len * u0) / 70, ub = (along + len * u1) / 70;
      const va = (y: number, tt: number) => 1 - (tt - y) / 46; // texture rows keep a fixed size from the top
      side.push(A.x, b0, A.z, B.x, b1, B.z, B.x, t1, B.z, A.x, b0, A.z, B.x, t1, B.z, A.x, t0, A.z);
      sideUv.push(ua, va(b0, t0), ub, va(b1, t1), ub, 1, ua, va(b0, t0), ub, 1, ua, 1);
    }
    if (t.move) { trim.push(toScene(ax, ay).setY(topAt(ax, ay) + 0.6)); along += len; return; }
    if (!open && look.rim.kind === 'tube') rims.push([toScene(ax, ay).setY(topAt(ax, ay) + look.rim.r * 0.6), toScene(bx, by).setY(topAt(bx, by) + look.rim.r * 0.6)]);
    for (let s = 0; s * 8 < len; s++) {
      const x = ax + dx * s * 8, y = ay + dy * s * 8;
      if (!open && look.rim.kind === 'beads') beads.push(toScene(x, y).setY(topAt(x, y) + look.rim.r * 0.5));
      else if (open && look.drip && s % 2 === 0) drips.push({ p: toScene(x + nx * 1.2, y + ny * 1.2).setY(topAt(x, y)), len: 3 + r() * 12 });
    }
    along += len;
  });
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(sideUv, 2));
  sg.computeVertexNormals();
  const sides = new THREE.Mesh(sg, look.side(level));
  sides.castShadow = sides.receiveShadow = true;
  g.add(sides);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  if (trim.length) {
    // Yellow-and-black hazard stripes round a moving platform's top edge
    const loop = new THREE.CatmullRomCurve3(trim, true, 'catmullrom', 0);
    const mat = hazardMaterial();
    (mat.map as THREE.Texture).repeat.set(Math.round(along / 16), 1);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(loop, trim.length * 16, 2.2, 6, true), mat));
  }
  if (beads.length) {
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(look.rim.r, 10, 6), look.rim.mat, beads.length);
    beads.forEach((p, k) => im.setMatrixAt(k, m4.makeTranslation(p.x, p.y, p.z)));
    im.castShadow = true;
    g.add(im);
  }
  for (const [a, b] of rims) {
    const rail = new THREE.Mesh(new THREE.CapsuleGeometry(look.rim.r, a.distanceTo(b), 4, 8).rotateZ(Math.PI / 2), look.rim.mat);
    rail.position.copy(a).add(b).multiplyScalar(0.5);
    rail.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    rail.castShadow = true;
    g.add(rail);
  }
  if (drips.length && look.drip) {
    // Frosting drips are rounded drops stretched to length; icicles are cones pointing down
    const geo = look.drip.icicle ? new THREE.ConeGeometry(2.6, 7, 6).rotateX(Math.PI) : new THREE.CapsuleGeometry(3, 1, 4, 8);
    const im = new THREE.InstancedMesh(geo, look.drip.mat(level), drips.length);
    drips.forEach(({ p, len }, k) => im.setMatrixAt(k, m4.compose(new THREE.Vector3(p.x, p.y + 1 - len / 2, p.z), q, new THREE.Vector3(1, len / 7, 1))));
    g.add(im);
  }
  return g;
}

// ---------- chutes ----------

/** Samples of a track every few units: centre line, heading and the sideways vector (scene space). */
function trackFrames(tr: Track, step: number, toScene: ToScene) {
  const out: { c: THREE.Vector3; side: THREE.Vector3; s: number; x: number; y: number }[] = [];
  const n = Math.max(2, Math.ceil(tr.len / step));
  for (let k = 0; k <= n; k++) {
    const s = (k / n) * tr.len, p = trackAt(tr, s);
    out.push({ c: toScene(p.x, p.y).setY(p.z), side: new THREE.Vector3(-p.dy, 0, p.dx), s, x: p.x, y: p.y });
  }
  return out;
}

/**
 * A slide (a rainbow chute in Candy Land, an ice toboggan run in the Arctic, a striped circus slide...):
 * a half-pipe trough the ball rides in, held up on posts, with a swirled mouth where it starts.
 */
export function chuteMesh(L: LevelDef, c: Chute, toScene: ToScene, look: LevelLook) {
  const g = new THREE.Group();
  const tr = chuteTrack(L, c, false);
  const fr = trackFrames(tr, 6, toScene);
  const R = BALL_R + 5, A = 1.95; // trough radius and half-angle of its cross-section
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const M = 12;
  const tmp = new THREE.Color();
  const cols = look.chute.colors;
  fr.forEach((f, i) => {
    tmp.setHex(cols[Math.floor(f.s / 22) % cols.length]);
    for (let j = 0; j <= M; j++) {
      const a = -A + (2 * A * j) / M;
      const p = f.c.clone().addScaledVector(f.side, Math.sin(a) * R).setY(f.c.y + R - Math.cos(a) * R);
      pos.push(p.x, p.y, p.z);
      col.push(tmp.r, tmp.g, tmp.b);
      if (i && j < M) { const q = i * (M + 1) + j, o = q - (M + 1); idx.push(o, q, o + 1, o + 1, q, q + 1); }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const trough = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  trough.castShadow = trough.receiveShadow = true;
  g.add(trough);
  for (const sgn of [-1, 1]) {
    const pts = fr.map((f) => f.c.clone().addScaledVector(f.side, sgn * Math.sin(A) * R).setY(f.c.y + R - Math.cos(A) * R));
    g.add(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 1.8, 6), toon(look.chute.lip), 0.4, false));
  }
  // Posts wherever the slide is up off the ground
  let last = -Infinity;
  for (const f of fr) {
    const ground = heightAt(L, f.x, f.y), gap = f.c.y - ground;
    if (gap < 8 || f.s - last < 60) continue;
    last = f.s;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, gap + 4, 10).translate(0, (gap + 4) / 2 - 4, 0), look.chute.post());
    post.position.copy(f.c).setY(ground);
    post.castShadow = true;
    g.add(post);
  }
  // The mouth: a swirled disc ringed in the course's colours, where the ball drops in
  const [mx, my] = c.path[0];
  const mouth = new THREE.Group();
  mouth.position.copy(toScene(mx, my)).setY(heightAt(L, mx, my) + 0.4);
  mouth.add(new THREE.Mesh(new THREE.CircleGeometry(CHUTE_CATCH, 32).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: swirlTex(...look.chute.mouth), gradientMap: toonRamp() })));
  look.chute.ring.forEach((cc, k) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(CHUTE_CATCH + 2 + k * 2, 1.6, 6, 40).rotateX(Math.PI / 2), toon(cc));
    ring.position.y = 1;
    mouth.add(ring);
  });
  g.add(mouth);
  return g;
}

/** A spiral swirl (lollipops, chute mouths). */
function swirlTex(a: string, b: string) {
  return cached(`t:swirl:${a}:${b}`, () => canvasTex(256, 256, (g) => {
    g.fillStyle = a; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = b; g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath();
    for (let k = 0; k < 400; k++) { const t = k / 400, ang = t * Math.PI * 7, rad = t * 120; g.lineTo(128 + Math.cos(ang) * rad, 128 + Math.sin(ang) * rad); }
    g.stroke();
  }));
}

// ---------- ladders, stairs and ski lifts ----------

/**
 * The way up a level: a ladder (candy canes, timber, striped poles or a metal gantry), a flight of stone
 * stairs in the tomb, or a chairlift in the Arctic whose chair carries the ball up. A glowing ring marks
 * where to roll the ball on.
 */
export function ladderMesh(L: LevelDef, c: Chute, toScene: ToScene, world: World, look: LevelLook): Animated {
  const g = new THREE.Group();
  const tr = chuteTrack(L, c, true);
  // The ladder itself runs up to the lip; past it the track is just the top of the level
  const zTop = tr.pts[tr.pts.length - 1].z;
  const lip = tr.pts.find((p) => p.z >= zTop - 0.01)?.s ?? tr.len;
  const fr = trackFrames({ ...tr, len: lip }, 4, toScene);
  const W = BALL_R - 1;
  const kind = look.ladder.kind;
  let chair: THREE.Group | null = null;
  if (kind === 'cane' || kind === 'rails') {
    for (const sgn of [-1, 1]) {
      const pts = fr.map((f) => f.c.clone().addScaledVector(f.side, sgn * W).setY(f.c.y + 4));
      if (kind === 'cane') {
        // The hook at the top, curling over forward
        const end = pts[pts.length - 1], dir = end.clone().sub(pts[pts.length - 2]).setY(0).normalize();
        for (let k = 1; k <= 6; k++) { const a = (k / 6) * Math.PI; pts.push(end.clone().addScaledVector(dir, Math.sin(a) * 6).setY(end.y + (1 - Math.cos(a)) * 6)); }
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, 2.4, 8);
      const mat = kind === 'cane' ? caneMaterial() : look.ladder.rail!();
      if (mat instanceof THREE.MeshToonMaterial && mat.map) mat.map.repeat.set(Math.max(1, Math.round(tr.len / 10)), 1);
      g.add(part(tube, mat, 0.5));
    }
    for (let s = LADDER_RUNG / 2; s < lip; s += LADDER_RUNG) {
      const p = trackAt(tr, s);
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, W * 2, 8).rotateX(Math.PI / 2), toon(kind === 'cane' ? 0xffffff : look.ladder.rung ?? 0xffffff));
      rung.position.copy(toScene(p.x, p.y).setY(p.z + 2.5));
      rung.rotation.y = -Math.atan2(p.dy, p.dx);
      rung.castShadow = true;
      g.add(rung);
    }
  } else if (kind === 'stairs') {
    // Sandstone steps, each a block from the ground up to the track
    const stone = toon(0xe0b070), edge = toon(0xc89050);
    for (let s = 0; s < lip; s += LADDER_RUNG) {
      const p = trackAt(tr, Math.min(lip, s + LADDER_RUNG)), base = heightAt(L, p.x, p.y) - 4, h = p.z - base;
      if (h <= 0.5) continue;
      const step = part(new THREE.BoxGeometry(LADDER_RUNG, h, W * 2 + 10).translate(0, h / 2, 0), stone, 0.8);
      const m = trackAt(tr, s + LADDER_RUNG / 2);
      step.position.copy(toScene(m.x, m.y).setY(base));
      step.rotation.y = -Math.atan2(p.dy, p.dx);
      g.add(step);
      const nose = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, W * 2 + 10), edge);
      nose.position.copy(step.position).setY(base + h - 0.8).addScaledVector(new THREE.Vector3(p.dx, 0, p.dy), -LADDER_RUNG / 2);
      nose.rotation.y = step.rotation.y;
      g.add(nose);
    }
  } else {
    // A chairlift: a pylon at each end, the cable between them, and a chair that waits at the bottom and
    // rides up with the ball
    const a = fr[0], b = fr[fr.length - 1];
    const H = 46;
    for (const f of [a, b]) {
      const pylon = part(new THREE.CylinderGeometry(2.2, 3, H + (f === a ? 0 : 0), 8).translate(0, H / 2, 0), toon(0x5a6a7a), 0.8);
      pylon.position.copy(f.c).addScaledVector(f.side, W + 10).setY(heightAt(L, f.x, f.y));
      g.add(pylon);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(3, 3, W + 12), toon(0x5a6a7a));
      arm.position.copy(f.c).addScaledVector(f.side, (W + 10) / 2).setY(heightAt(L, f.x, f.y) + H);
      arm.rotation.y = -Math.atan2(f.side.z, f.side.x) + Math.PI / 2;
      g.add(arm);
    }
    const cableA = a.c.clone().setY(heightAt(L, a.x, a.y) + H), cableB = b.c.clone().setY(heightAt(L, b.x, b.y) + H);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, cableA.distanceTo(cableB), 6), toon(0x2a2a30));
    cable.position.copy(cableA).add(cableB).multiplyScalar(0.5);
    cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cableB.clone().sub(cableA).normalize());
    g.add(cable);
    chair = new THREE.Group();
    const seat = part(new THREE.BoxGeometry(22, 3, 26), toon(0xd8202e), 0.6);
    chair.add(seat);
    const back = part(new THREE.BoxGeometry(3, 16, 26).translate(-11, 8, 0), toon(0xd8202e), 0.6);
    chair.add(back);
    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1, 6).translate(0, 0.5, 0), toon(0x2a2a30));
    chair.add(hanger);
    chair.userData = { hanger, cableA, cableB };
    g.add(chair);
  }
  const [fx, fy] = c.path[0];
  const ring = new THREE.Mesh(new THREE.TorusGeometry(CHUTE_CATCH, 2.2, 6, 36).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: look.ladder.ring, transparent: true, opacity: 0.85 }));
  ring.position.copy(toScene(fx, fy)).setY(heightAt(L, fx, fy) + 1);
  g.add(ring);
  return {
    group: g,
    update: (_a, t) => {
      const s = 1 + 0.08 * Math.sin(t * 4); ring.scale.set(s, 1, s);
      if (!chair) return;
      // The chair sits under the ball while it rides, otherwise it waits at the bottom
      const r = world.ride?.track === tr ? world.ride : null;
      const p = trackAt(tr, r ? Math.min(r.s, lip) : 0);
      chair.position.copy(toScene(p.x, p.y)).setY(p.z - 2);
      chair.rotation.y = -Math.atan2(p.dy, p.dx);
      const { hanger, cableA, cableB } = chair.userData as { hanger: THREE.Mesh; cableA: THREE.Vector3; cableB: THREE.Vector3 };
      const u = Math.min(1, (r ? Math.min(r.s, lip) : 0) / (lip || 1));
      const cy = cableA.y + (cableB.y - cableA.y) * u;
      hanger.scale.y = Math.max(1, cy - chair.position.y);
    },
  };
}

// ---------- gumdrops, lollipops, gingerbread men ----------

/** A sugared gumdrop (the Candy course's bumpers). */
export function gumdrop(bp: Bumper, L: LevelDef, toScene: ToScene) {
  const r = bp.r;
  const prof = [V(0.01, 0), V(r * 1.08, 0), V(r * 1.1, r * 0.25), V(r * 0.98, r * 0.7), V(r * 0.7, r * 1.15), V(r * 0.3, r * 1.36), V(0.01, r * 1.4)].map((v) => new THREE.Vector2(v.x, v.y));
  const color = new THREE.Color(bp.color).lerp(new THREE.Color(0xffffff), 0.2).getHex();
  const m = part(new THREE.LatheGeometry(prof, 24), gumdropMaterial(color), 1);
  m.position.copy(toScene(bp.x, bp.y)).setY(heightAt(L, bp.x, bp.y));
  return m;
}

/** A lollipop tree: a swirled candy on a white stick, planted in a sugar mound (the mound is its trunk). */
export function lollipop(pm: Palm, L: LevelDef, toScene: ToScene, seed = 0) {
  const g = new THREE.Group();
  g.position.copy(toScene(pm.x, pm.y)).setY(heightAt(L, pm.x, pm.y));
  const R = palmR(pm), H = pm.height ?? 70;
  g.add(part(new THREE.SphereGeometry(R + 1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1), toon(0xffe0ee), 1));
  g.add(part(new THREE.CylinderGeometry(2.4, 2.4, H, 8).translate(0, H / 2, 0), toon(0xffffff), 0.8));
  const [a, b] = [['#ff4a8a', '#ffffff'], ['#ffb020', '#ff4a4a'], ['#7a4aff', '#5ad0ff'], ['#3ac87a', '#fff07a']][(seed + Math.round(pm.x)) % 4];
  const swirl = new THREE.MeshToonMaterial({ map: swirlTex(a, b), gradientMap: toonRamp() });
  const candy = part(new THREE.CylinderGeometry(22, 22, 7, 32).rotateX(Math.PI / 2), [toon(new THREE.Color(a).getHex()), swirl, swirl] as unknown as THREE.Material, 1.2);
  candy.position.y = H + 18;
  candy.rotation.y = (seed * 1.7 + pm.y) % 6;
  g.add(candy);
  return g;
}

/** A gingerbread man strolling between two points, with icing trim and gumdrop buttons. */
export function gingerbreadMan(s: Astronaut, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const dough = toon(0xc07838, { vertexColors: true });
  body.add(part(blob(6, 11, 10, 0.2), dough, 1).translateY(21));
  const head = new THREE.Group(); head.position.set(0, 38, 0); body.add(head);
  head.add(part(blob(5.5, 8.5, 8.5, 0.15), dough, 1));
  eye(head, 4.5, 2, 3, 1.6, 1);
  eye(head, 4.5, 2, -3, 1.6, -1);
  place(head, new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.7, 6, 12, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI), toon(0xffffff)), 5.4, -2, 0);
  const limbs: THREE.Group[] = [];
  for (const z of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(0, 27, z * 9); body.add(arm);
    arm.add(part(new THREE.CapsuleGeometry(3, 8, 4, 8).rotateX(z * 1.1).translate(0, -2, z * 5), dough, 0.8));
    const leg = new THREE.Group(); leg.position.set(0, 13, z * 4.5); body.add(leg);
    leg.add(part(new THREE.CapsuleGeometry(3.4, 8, 4, 8).translate(0, -6, 0), dough, 0.8));
    limbs.push(arm, leg);
  }
  [0xff4a6a, 0x5ac8ff, 0x7ee8a8].forEach((c, k) => place(body, part(new THREE.SphereGeometry(1.7, 8, 6), toon(c), 0.3), 5.6, 28 - k * 6, 0));
  const seed = Math.round(s.a[0] + s.a[1]);
  root.scale.setScalar(1.3);
  return {
    group: root,
    update(_a, t) {
      const p = astronautAt(s, world.time);
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y));
      const moving = Math.hypot(p.vx, p.vy) > 2;
      if (moving) body.rotation.y = -Math.atan2(p.vy, p.vx);
      const w = moving ? Math.sin(world.time * 7 + seed) : 0;
      limbs.forEach((l, k) => (l.rotation.z = (k % 2 ? 0.6 : 0.4) * w * (k < 2 ? 1 : -1) * (k % 2 ? 1 : -1)));
      body.position.y = moving ? Math.abs(w) * 1.5 : 0;
      head.rotation.x = 0.12 * Math.sin(t * 1.3 + seed);
    },
  };
}

// ---------- scenery ----------

function cupcake(seed: number, size: number) {
  const g = new THREE.Group();
  const r = rng(seed);
  const liner = canvasTex(128, 32, (c) => { for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#ff7eb6' : '#ffc0dc'; c.fillRect(i * 8, 0, 8, 32); } });
  g.add(part(new THREE.CylinderGeometry(size * 0.55, size * 0.42, size * 0.5, 16).translate(0, size * 0.25, 0), new THREE.MeshToonMaterial({ map: liner, gradientMap: toonRamp() }), 1.5));
  const icing = toon([0xfff2f8, 0xffd0e8, 0xd8f4ff, 0xfff4b0][seed % 4]);
  for (let k = 0; k < 3; k++) place(g, part(new THREE.TorusGeometry(size * (0.42 - k * 0.12), size * 0.13, 10, 24).rotateX(Math.PI / 2), icing, 1), 0, size * (0.56 + k * 0.17), 0);
  place(g, part(new THREE.SphereGeometry(size * 0.1, 12, 8), toon(0xe8203a), 1), 0, size * 1.05, 0);
  g.rotation.y = r() * 6;
  return g;
}

function candyCane(h: number) {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 6; k++) pts.push(V(0, (k / 6) * h, 0));
  for (let k = 1; k <= 8; k++) { const a = (k / 8) * Math.PI; pts.push(V(h * 0.14 * (1 - Math.cos(a)), h + Math.sin(a) * h * 0.14, 0)); }
  const mat = caneMaterial();
  return part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, h * 0.045, 8), mat, 1.2);
}

function iceCreamMountain(seed: number, h: number) {
  const g = new THREE.Group();
  const waffle = canvasTex(128, 128, (c) => {
    c.fillStyle = '#e0a860'; c.fillRect(0, 0, 128, 128);
    c.strokeStyle = '#b07838'; c.lineWidth = 5;
    for (let k = -128; k < 256; k += 24) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + 128, 128); c.stroke(); c.beginPath(); c.moveTo(k + 128, 0); c.lineTo(k, 128); c.stroke(); }
  });
  g.add(part(new THREE.ConeGeometry(h * 0.3, h * 0.7, 18, 1, true).rotateX(Math.PI).translate(0, h * 0.35, 0), new THREE.MeshToonMaterial({ map: waffle, gradientMap: toonRamp(), side: THREE.DoubleSide }), 0, false));
  const scoop = [0xffc0dc, 0xfff4d8, 0xb8f0d8, 0x8a5030][seed % 4];
  place(g, part(new THREE.SphereGeometry(h * 0.32, 20, 14), toon(scoop), 0, false), 0, h * 0.78, 0);
  place(g, part(new THREE.SphereGeometry(h * 0.05, 10, 8), toon(0xe8203a), 0, false), 0, h * 1.12, 0);
  return g;
}

function cloud(seed: number) {
  const g = new THREE.Group();
  const r = rng(seed);
  const mat = toon([0xffe0f0, 0xe0f0ff, 0xf4e8ff][seed % 3]);
  for (let k = 0; k < 5; k++) place(g, new THREE.Mesh(new THREE.SphereGeometry(60 + r() * 50, 14, 10), mat), (k - 2) * 70, r() * 30, (r() - 0.5) * 60);
  return g;
}

/**
 * The candy land around a hole: gumdrops and candy canes along the kerb, cupcakes and giant lollipops
 * further out, ice-cream mountains on the horizon, cotton-candy clouds drifting by and a rainbow.
 */
export function candyLandscape(L: LevelDef, outline: Pt[], toScene: ToScene, lawnH: (x: number, y: number) => number, anims: Animated[]) {
  const group = new THREE.Group();
  const r = rng(Math.round(L.tee[0] * 7 + L.cup[1] * 3));
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const b = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const [tx, ty] = L.tee;
  const clearOf = (x: number, y: number, gap: number) => { const o = outlineDistance(outline, x, y); return !o.inside && o.d > gap; };
  const at = (x: number, y: number, lift = 0) => toScene(x, y).setY(lawnH(x, y) + lift);

  resample(outline, 110).forEach((p, i) => {
    const x = p.x + p.nx * 50, y = p.y + p.ny * 50;
    if (!clearOf(x, y, 30) || Math.hypot(x - tx, y - ty) < 120) return;
    if (i % 2 === 0) { const gd = gumdrop({ x, y, r: 10 + r() * 6, n: 1, color: '#' + new THREE.Color(CANDY[i % CANDY.length]).getHexString() }, L, toScene); gd.position.copy(at(x, y)); group.add(gd); }
    else { const c = candyCane(40 + r() * 20); c.position.copy(at(x, y)); c.rotation.y = r() * 6; group.add(c); }
  });
  for (let i = 0, tries = 0; i < 18 && tries < 300; tries++) {
    const a = r() * Math.PI * 2;
    const x = cx + Math.cos(a) * ((b.maxX - b.minX) / 2 + 150 + r() * 500), y = cy + Math.sin(a) * ((b.maxY - b.minY) / 2 + 130 + r() * 420);
    if (!clearOf(x, y, 100) || Math.hypot(x - tx, y - ty) < 180) continue;
    const kind = i % 3;
    const obj = kind === 0 ? cupcake(i, 60 + r() * 50) : kind === 1 ? lollipop({ x: 0, y: 0, r: 16, height: 120 + r() * 80 }, { ...L, tiers: [], slopes: [] }, () => V(0, 0, 0), i) : candyCane(110 + r() * 60);
    if (kind === 1) obj.scale.setScalar(2);
    obj.position.copy(at(x, y, -2));
    obj.rotation.y = r() * 6;
    group.add(obj);
    i++;
  }
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9 + (r() - 0.5) * 0.2;
    const d = 2700 + r() * 600, h = 500 + r() * 500;
    const m = i % 3 === 1 ? cupcake(i + 3, h * 0.8) : iceCreamMountain(i, h);
    m.position.copy(toScene(cx + Math.cos(a) * d, cy + Math.sin(a) * d)).setY(-30);
    m.rotation.y = r() * 6;
    group.add(m);
  }
  // A rainbow arching over the far side
  const centre = toScene(cx, cy);
  const rainbow = new THREE.Group();
  CANDY.forEach((c, k) => rainbow.add(new THREE.Mesh(new THREE.TorusGeometry(1900 - k * 60, 30, 8, 64, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, fog: false, depthWrite: false }))));
  rainbow.position.copy(centre).add(V(300, -200, -3200));
  group.add(rainbow);
  // Cotton-candy clouds drifting past
  const clouds = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const c = cloud(i);
    const a = r() * Math.PI * 2, d = 1600 + r() * 1400;
    c.position.copy(centre).add(V(Math.cos(a) * d, 700 + r() * 600, Math.sin(a) * d - 600));
    clouds.add(c);
  }
  group.add(clouds);
  anims.push({ group: clouds, update: (_a, t) => { clouds.rotation.y = t * 0.004; } });
  return group;
}
