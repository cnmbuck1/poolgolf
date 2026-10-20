// Visual design system for the premium course look: shared materials, procedural
// textures and detailed props. Everything here is visual only; collision lives in
// physics.ts and every prop is sized to sit on (or inside) its existing collider.
import * as THREE from 'three';

// ---------- palette ----------

export const P = {
  turf: '#3f9a3c',
  turfDark: '#2c7a2e',
  turfLight: '#6cc25a',
  mahogany: '#6a2c17',
  mahoganyLight: '#9a4a26',
  oak: '#9a5a2c',
  oakDark: '#5a2f14',
  stone: '#8b8378',
  stoneDark: '#5c564f',
  mortar: '#4a453f',
  brass: 0xd2a650,
  flag: 0xd8322b,
  lanternGlow: 0xffb35a,
  leaf: '#3f8f3a',
};

// ---------- texture helpers ----------

const cache = new Map<string, unknown>();
function cached<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return c;
}

function tex(c: HTMLCanvasElement, color: boolean, repeat: [number, number] = [1, 1]) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  return t;
}

/** Small seeded RNG so textures look the same on every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---------- textures ----------

/** Fine turf: thousands of short slanted blades over a rich green base. Returns [color, bump]. */
function turfTextures() {
  return cached('turf', () => {
    const r = rng(7);
    const blades: [number, number, number, number, number][] = [];
    for (let i = 0; i < 16000; i++) blades.push([r() * 512, r() * 512, 3 + r() * 5, (r() - 0.5) * 2.2, r()]);
    const color = canvas(512, 512, (g) => {
      g.fillStyle = P.turf;
      g.fillRect(0, 0, 512, 512);
      g.lineWidth = 1.1;
      for (const [x, y, len, lean, shade] of blades) {
        g.strokeStyle = shade < 0.45 ? P.turfDark : shade < 0.9 ? '#4aa845' : P.turfLight;
        g.globalAlpha = 0.55;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + lean, y - len);
        g.stroke();
      }
      g.globalAlpha = 1;
    });
    const bump = canvas(512, 512, (g) => {
      g.fillStyle = '#606060';
      g.fillRect(0, 0, 512, 512);
      g.lineWidth = 1.1;
      for (const [x, y, len, lean, shade] of blades) {
        g.strokeStyle = shade > 0.5 ? '#b0b0b0' : '#2a2a2a';
        g.globalAlpha = 0.6;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + lean, y - len);
        g.stroke();
      }
    });
    return [tex(color, true), tex(bump, false)] as const;
  });
}

/** Polished wood grain. `light` tints toward oak; otherwise deep mahogany. */
function woodGrain(key: string, base: string, light: string, dark: string, w = 1024, h = 256) {
  return cached(`wood:${key}`, () => {
    const r = rng(key.length * 31 + 3);
    const c = canvas(w, h, (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      // Long flowing grain lines
      for (let i = 0; i < 140; i++) {
        const y = r() * h;
        g.strokeStyle = r() > 0.5 ? light : dark;
        g.globalAlpha = 0.08 + r() * 0.22;
        g.lineWidth = 0.6 + r() * 2.4;
        g.beginPath();
        g.moveTo(0, y);
        const a = (r() - 0.5) * 14;
        g.bezierCurveTo(w * 0.3, y + a, w * 0.65, y - a, w, y + (r() - 0.5) * 4);
        g.stroke();
      }
      // Pores
      g.globalAlpha = 0.25;
      g.fillStyle = dark;
      for (let i = 0; i < 2500; i++) g.fillRect(r() * w, r() * h, 2 + r() * 4, 0.8);
      g.globalAlpha = 1;
    });
    return tex(c, true);
  });
}

/** Planks for windmill sails: vertical boards with dark gaps. */
function plankTexture() {
  return cached('planks', () => {
    const r = rng(11);
    const c = canvas(256, 256, (g) => {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const x = (i * 256) / n;
        const shade = 0.85 + r() * 0.3;
        g.fillStyle = `rgb(${Math.round(196 * shade)},${Math.round(118 * shade)},${Math.round(58 * shade)})`;
        g.fillRect(x, 0, 256 / n, 256);
        g.strokeStyle = 'rgba(90,45,15,0.35)';
        for (let k = 0; k < 6; k++) {
          g.lineWidth = 0.6 + r();
          const gx = x + 4 + r() * (256 / n - 8);
          g.beginPath(); g.moveTo(gx, 0); g.bezierCurveTo(gx + 3, 90, gx - 3, 170, gx + 1, 256); g.stroke();
        }
        g.fillStyle = 'rgba(40,20,8,0.85)';
        g.fillRect(x, 0, 2, 256);
        // nail heads
        g.fillStyle = 'rgba(40,30,20,0.8)';
        for (const ny of [24, 128, 232]) { g.beginPath(); g.arc(x + 256 / n / 2, ny, 2.2, 0, Math.PI * 2); g.fill(); }
      }
    });
    return tex(c, true);
  });
}

/** Irregular coursed stone with mortar. Returns [color, bump], both tileable horizontally. */
function stoneTextures() {
  return cached('stone', () => {
    const r = rng(21);
    const W = 512, H = 256, rows = 5, rowH = H / rows;
    const stones: { x: number; y: number; w: number; h: number; tone: number }[] = [];
    for (let row = 0; row < rows; row++) {
      let x = -r() * 40;
      while (x < W) {
        const w = 48 + r() * 70;
        stones.push({ x, y: row * rowH, w, h: rowH, tone: r() });
        x += w;
      }
    }
    const draw = (g: CanvasRenderingContext2D, bump: boolean) => {
      g.fillStyle = bump ? '#000' : P.mortar;
      g.fillRect(0, 0, W, H);
      for (const s of stones) {
        for (const dx of [0, -W, W]) {
          const x = s.x + dx + 3, y = s.y + 3, w = s.w - 6, h = s.h - 6;
          if (x > W || x + w < 0) continue;
          const grad = g.createLinearGradient(0, y, 0, y + h);
          if (bump) {
            grad.addColorStop(0, '#d0d0d0'); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, '#a0a0a0');
          } else {
            const t = s.tone;
            const base = t < 0.33 ? [168, 164, 156] : t < 0.66 ? [146, 142, 136] : [176, 166, 148];
            const f = (k: number) => `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)})`;
            grad.addColorStop(0, f(1.15)); grad.addColorStop(0.45, f(1)); grad.addColorStop(1, f(0.72));
          }
          g.fillStyle = grad;
          g.beginPath();
          g.roundRect(x, y, w, h, 7);
          g.fill();
        }
      }
      // Weathering speckle
      for (let i = 0; i < 5000; i++) {
        g.fillStyle = bump ? `rgba(0,0,0,${r() * 0.3})` : `rgba(${r() > 0.5 ? '255,250,240' : '30,25,20'},${r() * 0.12})`;
        g.fillRect(r() * W, r() * H, 1.5, 1.5);
      }
    };
    return [tex(canvas(W, H, (g) => draw(g, false)), true), tex(canvas(W, H, (g) => draw(g, true)), false)] as const;
  });
}

function shingleTexture() {
  return cached('shingles', () => {
    const r = rng(5);
    const c = canvas(256, 256, (g) => {
      g.fillStyle = '#4a2a17';
      g.fillRect(0, 0, 256, 256);
      const rowH = 21;
      for (let row = 0; row < 13; row++) {
        const off = row % 2 ? 16 : 0;
        for (let x = -32 + off; x < 256; x += 32) {
          const k = 0.8 + r() * 0.35;
          const grad = g.createLinearGradient(0, row * rowH, 0, row * rowH + rowH);
          grad.addColorStop(0, `rgb(${Math.round(150 * k)},${Math.round(82 * k)},${Math.round(40 * k)})`);
          grad.addColorStop(1, `rgb(${Math.round(95 * k)},${Math.round(50 * k)},${Math.round(24 * k)})`);
          g.fillStyle = grad;
          g.beginPath();
          g.roundRect(x + 1, row * rowH, 30, rowH + 4, [0, 0, 8, 8]);
          g.fill();
        }
      }
    });
    return tex(c, true);
  });
}

/** One fern frond: a stem with paired leaflets, on transparent background. */
function frondTexture() {
  return cached('frond', () => {
    const c = canvas(128, 512, (g) => {
      g.strokeStyle = '#2f5f22';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(64, 512); g.lineTo(64, 0); g.stroke();
      for (let y = 500; y > 8; y -= 13) {
        const t = 1 - y / 512; // 0 at base, 1 at tip
        const len = 58 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) + 4;
        for (const side of [-1, 1]) {
          const grad = g.createLinearGradient(64, y, 64 + side * len, y - 18);
          grad.addColorStop(0, '#2f7a2c');
          grad.addColorStop(1, '#6fc04f');
          g.fillStyle = grad;
          g.beginPath();
          g.moveTo(64, y);
          g.quadraticCurveTo(64 + side * len * 0.5, y - 14, 64 + side * len, y - 20);
          g.quadraticCurveTo(64 + side * len * 0.55, y + 2, 64, y + 7);
          g.fill();
        }
      }
    });
    return tex(c, true);
  });
}

function glowTexture() {
  return cached('glow', () => {
    const c = canvas(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,220,160,1)');
      gr.addColorStop(0.25, 'rgba(255,170,80,0.55)');
      gr.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    return tex(c, true);
  });
}

/** Blurred rounded rectangle used as a soft contact shadow under obstacles. */
function softShadowTexture() {
  return cached('softShadow', () => {
    const c = canvas(256, 128, (g) => {
      g.shadowColor = 'rgba(0,0,0,1)';
      g.shadowBlur = 22;
      g.shadowOffsetX = 1000;
      g.fillStyle = '#000';
      g.beginPath();
      g.roundRect(34 - 1000, 34, 188, 60, 30);
      g.fill();
    });
    return tex(c, true);
  });
}

function softDiscTexture() {
  return cached('softDisc', () => {
    const c = canvas(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 20, 64, 64, 64);
      gr.addColorStop(0, 'rgba(0,0,0,0.9)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    return tex(c, true);
  });
}

/** Persian-style rug: borders, field pattern and a central medallion. */
export function rugTexture() {
  return cached('rug', () => {
    const r = rng(9);
    const c = canvas(1024, 660, (g) => {
      g.fillStyle = '#6e1f1a';
      g.fillRect(0, 0, 1024, 660);
      const band = (inset: number, w: number, color: string) => { g.strokeStyle = color; g.lineWidth = w; g.strokeRect(inset, inset, 1024 - inset * 2, 660 - inset * 2); };
      band(14, 18, '#1f2a44');
      band(36, 6, '#c99a4a');
      band(56, 22, '#2b3a5c');
      band(80, 4, '#c99a4a');
      // Repeating diamond field
      g.globalAlpha = 0.35;
      for (let y = 110; y < 560; y += 46) for (let x = 110; x < 920; x += 46) {
        g.fillStyle = (x + y) % 92 === 0 ? '#c99a4a' : '#2b3a5c';
        g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + 12, y); g.lineTo(x, y + 12); g.lineTo(x - 12, y); g.fill();
      }
      g.globalAlpha = 1;
      // Medallion
      g.translate(512, 330);
      for (const [rad, col] of [[150, '#1f2a44'], [128, '#c99a4a'], [110, '#8a2a20'], [70, '#2b3a5c'], [30, '#c99a4a']] as [number, string][]) {
        g.fillStyle = col;
        g.beginPath();
        for (let i = 0; i <= 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const rr = rad * (i % 2 ? 0.78 : 1);
          g.lineTo(Math.cos(a) * rr * 1.5, Math.sin(a) * rr);
        }
        g.fill();
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      // Wear
      for (let i = 0; i < 20000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.15})`; g.fillRect(r() * 1024, r() * 660, 1.5, 1.5); }
    });
    return tex(c, true);
  });
}

// ---------- shared materials ----------

function shared<T extends THREE.Material>(m: T): T {
  m.userData.shared = true; // survives per-hole disposal
  return m;
}

export const mats = {
  get turf() {
    return cached('m:turf', () => {
      const [map, bump] = turfTextures();
      return shared(new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.8, roughness: 0.95 }));
    });
  },
  get cushion() { return cached('m:cushion', () => shared(new THREE.MeshStandardMaterial({ color: 0x2c6e2c, roughness: 0.9, map: turfTextures()[0] }))); },
  get mahogany() {
    return cached('m:mahogany', () => shared(new THREE.MeshPhysicalMaterial({
      map: woodGrain('mahogany', P.mahogany, P.mahoganyLight, '#3a160a'), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12,
    })));
  },
  get oak() {
    return cached('m:oak', () => shared(new THREE.MeshPhysicalMaterial({
      map: woodGrain('oak', P.oak, '#c48048', P.oakDark, 512, 128), roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.2,
    })));
  },
  /** Oak for extruded wall caps, whose UVs are in world units. */
  get oakCap() {
    return cached('m:oakCap', () => {
      const map = woodGrain('oak', P.oak, '#c48048', P.oakDark, 512, 128).clone();
      map.repeat.set(1 / 160, 1 / 40);
      map.needsUpdate = true;
      return shared(new THREE.MeshPhysicalMaterial({ map, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.18 }));
    });
  },
  get darkWood() { return cached('m:darkWood', () => shared(new THREE.MeshStandardMaterial({ map: woodGrain('dark', '#4a2412', '#6d3a1d', '#26100a', 256, 64), roughness: 0.55 }))); },
  get stone() {
    return cached('m:stone', () => {
      const [map, bump] = stoneTextures();
      return shared(new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 2.2, roughness: 0.92 }));
    });
  },
  get cobble() { return cached('m:cobble', () => shared(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }))); },
  get brass() { return cached('m:brass', () => shared(new THREE.MeshStandardMaterial({ color: P.brass, metalness: 1, roughness: 0.28 }))); },
  get ironDark() { return cached('m:iron', () => shared(new THREE.MeshStandardMaterial({ color: 0x2a2724, metalness: 0.7, roughness: 0.45 }))); },
  get planks() { return cached('m:planks', () => shared(new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.6, side: THREE.DoubleSide }))); },
  get shingles() { return cached('m:shingles', () => shared(new THREE.MeshStandardMaterial({ map: shingleTexture(), roughness: 0.75 }))); },
  get glass() {
    return cached('m:glass', () => shared(new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: P.lanternGlow, emissiveIntensity: 1.6, roughness: 0.15, transparent: true, opacity: 0.88 })));
  },
  get leaf() { return cached('m:leaf', () => shared(new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7 }))); },
  get pot() { return cached('m:pot', () => shared(new THREE.MeshPhysicalMaterial({ color: 0x2f4140, roughness: 0.3, clearcoat: 0.8 }))); },
  get cupLiner() { return cached('m:liner', () => shared(new THREE.MeshBasicMaterial({ color: 0x0b0806, side: THREE.BackSide }))); },
  get flagCloth() { return cached('m:flag', () => shared(new THREE.MeshStandardMaterial({ color: P.flag, side: THREE.DoubleSide, roughness: 0.75 }))); },
  get pin() { return cached('m:pin', () => shared(new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.35 }))); },
  get shadowStrip() { return cached('m:shadowStrip', () => shared(new THREE.MeshBasicMaterial({ map: softShadowTexture(), transparent: true, depthWrite: false, opacity: 0.55 }))); },
  get shadowDisc() { return cached('m:shadowDisc', () => shared(new THREE.MeshBasicMaterial({ map: softDiscTexture(), transparent: true, depthWrite: false, opacity: 0.6 }))); },
};

/** The turf texture repeats every this many world units. */
export const TURF_TILE = 140;

// ---------- geometry helpers ----------

/** Concatenate geometries (already transformed) into one non-indexed geometry: one draw call. */
export function merge(geos: THREE.BufferGeometry[]) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const count = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]] as const) {
    const arr = new Float32Array(count * size);
    let off = 0;
    for (const g of parts) {
      const a = g.attributes[name] as THREE.BufferAttribute | undefined;
      if (a) arr.set(a.array as Float32Array, off);
      off += g.attributes.position.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  for (const g of geos) g.dispose();
  for (const g of parts) g.dispose();
  return out;
}

/** Capsule outline in plan: length `len` between the end-cap centres, radius `r`. */
function stadium(len: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-len / 2, -r);
  s.lineTo(len / 2, -r);
  s.absarc(len / 2, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-len / 2, r);
  s.absarc(-len / 2, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  return s;
}

/** Extrude a plan shape upward (shape y maps to world -z), bevelled on the top and bottom edges. */
function extrudeUp(shape: THREE.Shape, height: number, bevel: number, curveSegments = 10) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: height - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments });
  g.translate(0, 0, bevel);
  return g.rotateX(-Math.PI / 2);
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadows: 'both' | 'cast' | 'receive' | 'none' = 'both') {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows === 'both' || shadows === 'cast';
  m.receiveShadow = shadows === 'both' || shadows === 'receive';
  return m;
}

/** Soft dark patch on the turf under an object so it reads as touching the ground. */
function contactStrip(len: number, width: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, width).rotateX(-Math.PI / 2), mats.shadowStrip);
  m.position.y = 0.45;
  m.renderOrder = 1;
  return m;
}
function contactDisc(r: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), mats.shadowDisc);
  m.position.y = 0.45;
  m.renderOrder = 1;
  return m;
}

// ---------- props ----------

export const WALL_STONE_H = 34;
export const WALL_CAP_H = 6;

/**
 * Stone wall with a polished wooden cap, built along local +x and centred.
 * The footprint is the exact capsule the physics uses (length between cap centres, radius r).
 */
export function stoneWall(len: number, r: number) {
  const g = new THREE.Group();
  const stoneTex = (mats.stone.map as THREE.Texture);
  stoneTex.repeat.set(1 / 120, 1 / 56); // about 2.5 courses of stone up the wall
  (mats.stone.bumpMap as THREE.Texture).repeat.copy(stoneTex.repeat);
  const base = mesh(extrudeUp(stadium(len, r - 1.2), WALL_STONE_H, 1.2), mats.stone);
  g.add(base);
  const capShape = stadium(len, r - 0.5);
  const cap = mesh(extrudeUp(capShape, WALL_CAP_H, 2, 14), mats.oakCap);
  cap.position.y = WALL_STONE_H - 1;
  g.add(cap);
  g.add(contactStrip(len + r * 2 + 34, r * 2 + 30));
  return g;
}

/** Brass rivet positions along a wall cap, in the wall's local frame. */
export function wallRivets(len: number, r: number) {
  const pts: THREE.Vector3[] = [];
  const n = Math.max(2, Math.round(len / 34));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len * i) / n;
    for (const z of [-r + 3.5, r - 3.5]) pts.push(new THREE.Vector3(x, WALL_STONE_H + WALL_CAP_H - 1.2, z));
  }
  return pts;
}

export interface Animated { group: THREE.Group; update(angle: number, time: number): void }

/**
 * Brick windmill on a stone island in its pond. The low wooden sweepers at ball height
 * match the spinner collider exactly (two capsules of half-length `len`, radius `armR`,
 * crossing at the hub); the tall sails turn with them but are purely decorative.
 */
export function windmill(len: number, armR: number, pondR: number): Animated {
  const g = new THREE.Group();
  const [stoneMap] = stoneTextures();

  // Cobbled pond edge, flush with the turf so the ball can still roll in
  const n = 30;
  const cobbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mats.cobble, n);
  const r = rng(3);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a + r() * 0.3, 0));
    m4.compose(new THREE.Vector3(Math.cos(a) * (pondR + 4), 0.8, Math.sin(a) * (pondR + 4)), q, new THREE.Vector3(6 + r() * 2, 2.6, 7.5 + r() * 2));
    cobbles.setMatrixAt(i, m4);
    const k = 0.2 + r() * 0.08;
    cobbles.setColorAt(i, col.setRGB(k * 1.05, k, k * 0.92));
  }
  cobbles.receiveShadow = true;
  g.add(cobbles);

  // Island and tower
  const towerMat = new THREE.MeshStandardMaterial({ map: stoneMap.clone(), bumpMap: (mats.stone.bumpMap as THREE.Texture).clone(), bumpScale: 2, roughness: 0.9 });
  (towerMat.map as THREE.Texture).repeat.set(5, 4);
  (towerMat.bumpMap as THREE.Texture).repeat.set(5, 4);
  (towerMat.map as THREE.Texture).needsUpdate = true;
  (towerMat.bumpMap as THREE.Texture).needsUpdate = true;
  const island = mesh(new THREE.CylinderGeometry(40, 42, 7, 28), towerMat);
  island.position.y = 3.5;
  g.add(island);
  g.add(contactDisc(52));

  // Tower, cap and sails turn to face front-left; the sweepers stay unrotated so they
  // line up with the collider.
  const body = new THREE.Group();
  body.rotation.y = -0.45;
  body.scale.setScalar(1.25); // reads clearly at gameplay distance; stays inside the pond
  g.add(body);

  const TOWER_H = 104;
  const profile = [[30, 0], [30, 5], [28, 9], [25.5, 60], [23, TOWER_H - 6], [24.5, TOWER_H - 5], [24.5, TOWER_H], [0, TOWER_H]].map(([x, y]) => new THREE.Vector2(x, y));
  const tower = mesh(new THREE.LatheGeometry(profile, 28), towerMat);
  tower.position.y = 7;
  body.add(tower);

  // Stone bands, door and windows in dark wood with brass fittings
  const brassParts: THREE.BufferGeometry[] = [];
  const darkParts: THREE.BufferGeometry[] = [];
  const band = (y: number, rad: number) => brassParts.push(new THREE.TorusGeometry(rad, 1.4, 6, 32).rotateX(Math.PI / 2).translate(0, y, 0));
  band(7 + 9, 28.2);
  band(7 + TOWER_H - 5.5, 24.6);
  const arch = (w: number, h: number) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2);
    s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
    s.lineTo(-w / 2, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 3, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 1, curveSegments: 8 });
  };
  darkParts.push(arch(15, 26).translate(0, 7 + 6, 26.5));
  brassParts.push(new THREE.SphereGeometry(1.3, 8, 6).translate(4.5, 7 + 17, 30.4));
  for (const [ang, y] of [[0, 62], [Math.PI * 0.6, 48], [-Math.PI * 0.6, 48]] as [number, number][]) {
    darkParts.push(arch(8, 13).translate(0, 7 + y, 24.2).rotateY(ang));
  }
  body.add(mesh(merge(darkParts), mats.darkWood, 'cast'));

  // Shingle cap with a brass finial
  const roofProfile = [[28.5, 0], [28, 2.5], [21, 11], [12, 21], [4, 28], [0, 30]].map(([x, y]) => new THREE.Vector2(x, y));
  const shingle = (mats.shingles.map as THREE.Texture);
  shingle.repeat.set(4, 2);
  const roof = mesh(new THREE.LatheGeometry(roofProfile, 24), mats.shingles);
  roof.position.y = 7 + TOWER_H - 1;
  body.add(roof);
  brassParts.push(new THREE.SphereGeometry(3, 12, 8).translate(0, 7 + TOWER_H + 31, 0));
  brassParts.push(new THREE.CylinderGeometry(0.8, 0.8, 9, 6).translate(0, 7 + TOWER_H + 35, 0));

  // Hub on the front face
  const HUB_Y = 7 + TOWER_H - 16;
  brassParts.push(new THREE.CylinderGeometry(6, 7, 14, 16).rotateX(Math.PI / 2).translate(0, HUB_Y, 28));
  body.add(mesh(merge(brassParts), mats.brass, 'cast'));

  // Sails: four plank lattices on oak spars
  const sails = new THREE.Group();
  sails.position.set(0, HUB_Y, 36);
  const plankGeos: THREE.BufferGeometry[] = [];
  const frameGeos: THREE.BufferGeometry[] = [];
  const SAIL = 58;
  for (let i = 0; i < 4; i++) {
    const rot = new THREE.Matrix4().makeRotationZ((i * Math.PI) / 2);
    frameGeos.push(new THREE.BoxGeometry(3.6, SAIL, 3.6).translate(0, SAIL / 2, 0).applyMatrix4(rot));
    plankGeos.push(new THREE.PlaneGeometry(22, SAIL - 16).translate(13, SAIL / 2 + 8, -0.6).applyMatrix4(rot));
    frameGeos.push(new THREE.BoxGeometry(2.2, SAIL - 14, 2.4).translate(24, SAIL / 2 + 8, 0.4).applyMatrix4(rot));
    for (let k = 0; k <= 5; k++) {
      frameGeos.push(new THREE.BoxGeometry(23, 1.8, 2).translate(13, 16 + k * ((SAIL - 16) / 5), 0.6).applyMatrix4(rot));
    }
  }
  sails.add(mesh(merge(plankGeos), mats.planks, 'cast'));
  sails.add(mesh(merge(frameGeos), mats.oak, 'cast'));
  sails.add(mesh(new THREE.SphereGeometry(5.5, 14, 10).scale(1, 1, 0.8), mats.brass, 'cast'));
  body.add(sails);

  // Sweepers: the part the ball actually hits
  const sweep = new THREE.Group();
  const inner = 31;
  const paddleLen = len - inner; // between cap centres
  const paddleGeos: THREE.BufferGeometry[] = [];
  const boltGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const rot = new THREE.Matrix4().makeRotationY((i * Math.PI) / 2);
    paddleGeos.push(extrudeUp(stadium(paddleLen, armR - 1.5), 14, 1.5, 10).translate(inner + paddleLen / 2, 1.5, 0).applyMatrix4(rot));
    boltGeos.push(new THREE.SphereGeometry(1.6, 8, 6).translate(len - 2, 16, 0).applyMatrix4(rot));
    boltGeos.push(new THREE.SphereGeometry(1.6, 8, 6).translate(inner + 6, 16, 0).applyMatrix4(rot));
  }
  boltGeos.push(new THREE.TorusGeometry(31, 3, 8, 36).rotateX(Math.PI / 2).translate(0, 9, 0));
  sweep.add(mesh(merge(paddleGeos), mats.oak));
  sweep.add(mesh(merge(boltGeos), mats.brass, 'cast'));
  g.add(sweep);

  return {
    group: g,
    update(angle) {
      sweep.rotation.y = -angle;
      sails.rotation.z = angle * 1.5;
    },
  };
}

/** Brass-rimmed cup with a white pin and a waving red flag. */
export function brassCup(cupR: number): Animated {
  const g = new THREE.Group();
  const liner = mesh(new THREE.CylinderGeometry(cupR, cupR, 30, 36, 1, true), mats.cupLiner, 'none');
  liner.position.y = -15;
  g.add(liner);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(cupR, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x030405 }));
  bottom.position.y = -29;
  g.add(bottom);
  const rim = merge([
    new THREE.TorusGeometry(cupR + 1.8, 2.2, 10, 48).rotateX(Math.PI / 2),
    new THREE.RingGeometry(cupR + 1, cupR + 7, 48).rotateX(-Math.PI / 2).translate(0, 0.35, 0),
    new THREE.CylinderGeometry(cupR + 0.2, cupR + 0.2, 6, 36, 1, true).translate(0, -3, 0),
  ]);
  const rimMesh = mesh(rim, mats.brass, 'receive');
  rimMesh.material = mats.brass;
  g.add(rimMesh);

  const pinX = cupR * 0.32, pinZ = -cupR * 0.2, PIN_H = 104;
  const pin = mesh(new THREE.CylinderGeometry(1.3, 1.5, PIN_H, 8).translate(pinX, PIN_H / 2 - 18, pinZ), mats.pin, 'cast');
  g.add(pin);
  g.add(mesh(new THREE.SphereGeometry(2.2, 10, 8).translate(pinX, PIN_H - 17, pinZ), mats.brass, 'cast'));

  const W = 36, H = 22;
  const clothGeo = new THREE.PlaneGeometry(W, H, 12, 5).translate(W / 2, -H / 2, 0);
  const base = (clothGeo.attributes.position.array as Float32Array).slice();
  const cloth = mesh(clothGeo, mats.flagCloth, 'cast');
  cloth.position.set(pinX, PIN_H - 20, pinZ);
  g.add(cloth);

  return {
    group: g,
    update(_angle, time) {
      const pos = clothGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const k = x / W;
        pos.setZ(i, Math.sin(x * 0.22 - time * 5.5) * 3.4 * k);
        pos.setY(i, base[i * 3 + 1] - k * k * 2.5 + Math.sin(x * 0.15 - time * 4) * 0.8 * k);
      }
      pos.needsUpdate = true;
      clothGeo.computeVertexNormals();
    },
  };
}

/** Brass tee marker: a thin inlaid ring with four studs. */
export function teePlate(r: number) {
  const g = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(r, 1.1, 6, 40).rotateX(Math.PI / 2).translate(0, 0.3, 0)];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    parts.push(new THREE.SphereGeometry(1.7, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(Math.cos(a) * r, 0.2, Math.sin(a) * r));
  }
  g.add(mesh(merge(parts), mats.brass, 'receive'));
  return g;
}

/** Brass carriage lantern with a glowing pane and a soft halo (no real light: cheap on phones). */
export function lantern(): Animated {
  const g = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [new THREE.BoxGeometry(17, 2.4, 17).translate(0, 1.2, 0), new THREE.BoxGeometry(16, 2, 16).translate(0, 22, 0)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(new THREE.CylinderGeometry(0.9, 0.9, 20, 5).translate(sx * 7, 12, sz * 7));
  parts.push(new THREE.ConeGeometry(12.5, 9, 4).rotateY(Math.PI / 4).translate(0, 27.5, 0));
  parts.push(new THREE.TorusGeometry(3.4, 0.8, 6, 14).translate(0, 34.5, 0));
  g.add(mesh(merge(parts), mats.brass, 'cast'));
  const glass = mesh(new THREE.BoxGeometry(12.5, 18, 12.5).translate(0, 12, 0), mats.glass, 'none');
  g.add(glass);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
  halo.position.y = 12;
  halo.scale.set(70, 70, 1);
  g.add(halo);
  const seed = Math.random() * 10;
  return {
    group: g,
    update(_a, time) {
      const f = 0.9 + Math.sin(time * 7.3 + seed) * 0.05 + Math.sin(time * 13.1 + seed * 2) * 0.04;
      halo.scale.set(70 * f, 70 * f, 1);
      (halo.material as THREE.SpriteMaterial).opacity = 0.75 * f;
    },
  };
}

/** Potted fern: arching fronds merged into one mesh. `size` scales the whole plant. */
export function fern(size: number, seed: number, potStyle: 'tall' | 'bowl' = 'tall') {
  const g = new THREE.Group();
  const r = rng(seed);
  const potProfile = potStyle === 'tall'
    ? [[0, 0], [14, 0], [16, 4], [20, 30], [22, 46], [24, 48], [24, 52], [21, 52], [0, 50]]
    : [[0, 0], [12, 0], [20, 6], [26, 16], [28, 22], [25, 22], [0, 20]];
  const potH = potProfile[potProfile.length - 3][1];
  const pot = mesh(new THREE.LatheGeometry(potProfile.map(([x, y]) => new THREE.Vector2(x, y)), 20), mats.pot);
  g.add(pot);
  const fronds: THREE.BufferGeometry[] = [];
  const count = 11;
  for (let i = 0; i < count; i++) {
    const L = 60 + r() * 30;
    const geo = new THREE.PlaneGeometry(22, L, 1, 8);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const lift = 0.6 + r() * 0.5;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const v = pos.getY(k) / L + 0.5; // 0 base .. 1 tip
      const out = v * L * 0.85;
      const up = Math.sin(v * Math.PI * 0.75) * L * 0.5 * lift - v * v * L * 0.35;
      pos.setXYZ(k, x * (1 - v * 0.4), up, out);
    }
    geo.computeVertexNormals();
    geo.rotateY((i / count) * Math.PI * 2 + r() * 0.4).translate(0, potH - 2, 0);
    fronds.push(geo);
  }
  const leaves = mesh(merge(fronds), mats.leaf, 'cast');
  g.add(leaves);
  g.scale.setScalar(size);
  return g;
}
