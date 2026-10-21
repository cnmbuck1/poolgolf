// Pharaoh's Tomb, in the same cartoon toon-and-ink style: sandstone temple floors in a desert valley at
// dusk, golden scarab portals, quicksand, sliding stone doors, shuffling mummies, lotus columns and
// obelisks, with pyramids, a sphinx, palms and torches around. Purely visual; positions come from physics.ts.
import * as THREE from 'three';
import { Animated } from './art';
import { Astronaut, Door, LevelDef, Portal, Pt, Rock, Zone } from './levels';
import { astronautAt, doorLift, heightAt, PORTAL_R, World, WALL_R } from './physics';
import { blob, cached, canvasTex, eye, organic, palm, part, place, rng, shared, toon, toonRamp, V } from './jurassic';
import { outlineDistance, resample } from './landscape';

type ToScene = (x: number, y: number) => THREE.Vector3;

/** A row of simple hieroglyphs (eye, ankh, bird, wavy water, reeds) drawn on a canvas. */
function glyphs(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, seed: number) {
  const r = rng(seed);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = Math.max(1.5, h * 0.06); g.lineCap = 'round';
  const n = Math.max(1, Math.floor(w / (h * 0.8)));
  for (let i = 0; i < n; i++) {
    const cx = x + (i + 0.5) * (w / n), cy = y + h / 2, s = h * 0.32;
    g.beginPath();
    switch (Math.floor(r() * 5)) {
      case 0: g.ellipse(cx, cy, s, s * 0.5, 0, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(cx, cy, s * 0.25, 0, Math.PI * 2); g.fill(); break; // eye
      case 1: g.ellipse(cx, cy - s * 0.55, s * 0.35, s * 0.45, 0, 0, Math.PI * 2); g.moveTo(cx, cy - s * 0.1); g.lineTo(cx, cy + s); g.moveTo(cx - s * 0.6, cy + s * 0.1); g.lineTo(cx + s * 0.6, cy + s * 0.1); g.stroke(); break; // ankh
      case 2: g.ellipse(cx, cy, s * 0.6, s * 0.4, 0, 0, Math.PI * 2); g.fill(); g.moveTo(cx + s * 0.5, cy - s * 0.2); g.lineTo(cx + s, cy - s * 0.6); g.stroke(); break; // bird
      case 3: for (let k = -1; k <= 1; k++) { g.moveTo(cx - s, cy + k * s * 0.5); for (let j = 0; j <= 6; j++) g.lineTo(cx - s + (j * s) / 3, cy + k * s * 0.5 + (j % 2 ? -s * 0.2 : s * 0.2)); } g.stroke(); break; // water
      default: for (let k = -1; k <= 1; k++) { g.moveTo(cx + k * s * 0.5, cy + s); g.lineTo(cx + k * s * 0.5, cy - s * 0.6); } g.stroke(); // reeds
    }
  }
}

// ---------- materials ----------

/** Sandstone temple floor: big worn slabs, a few cracks and carved glyphs. */
export function sandstoneMaterial() {
  return cached('m:sandstone', () => {
    const r = rng(23);
    const map = canvasTex(512, 512, (g) => {
      g.fillStyle = '#e2b878';
      g.fillRect(0, 0, 512, 512);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const v = 0.92 + r() * 0.16;
        g.fillStyle = `rgba(${Math.round(226 * v)},${Math.round(184 * v)},${Math.round(120 * v)},1)`;
        g.fillRect(x * 128 + 2, y * 128 + 2, 124, 124);
        if (r() > 0.6) glyphs(g, x * 128 + 20, y * 128 + 44, 88, 40, 'rgba(150,100,50,0.35)', x * 7 + y);
      }
      g.strokeStyle = 'rgba(140,96,50,0.5)'; g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke(); }
      g.strokeStyle = 'rgba(120,80,40,0.35)'; g.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) { let x = r() * 512, y = r() * 512; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    });
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp(), vertexColors: true }));
  });
}

/** Desert sand around the course, rippled by the wind. */
export function desertMaterial() {
  return cached('m:desert', () => {
    const r = rng(17);
    const c = canvasTex(512, 512, (g) => {
      g.fillStyle = '#e0a868';
      g.fillRect(0, 0, 512, 512);
      g.strokeStyle = 'rgba(190,130,70,0.45)'; g.lineWidth = 3;
      for (let i = 0; i < 26; i++) {
        const y0 = r() * 512;
        g.beginPath(); g.moveTo(0, y0);
        for (let x = 0; x <= 512; x += 32) g.lineTo(x, y0 + Math.sin(x * 0.03 + i) * 10);
        g.stroke();
      }
    }, true, 30);
    return shared(new THREE.MeshToonMaterial({ map: c, gradientMap: toonRamp() }));
  });
}

/** Kerb: sandstone in deep blue and gold bands, like painted temple trim. */
export function templeKerb() {
  return cached('m:templekerb', () => {
    const t = canvasTex(128, 32, (g) => {
      g.fillStyle = '#2a4aa8'; g.fillRect(0, 0, 128, 32);
      g.fillStyle = '#ffc83a'; g.fillRect(0, 0, 20, 32); g.fillRect(64, 0, 20, 32);
      g.fillStyle = '#d84a2a'; g.fillRect(24, 0, 8, 32); g.fillRect(88, 0, 8, 32);
    });
    return shared(new THREE.MeshToonMaterial({ map: t, gradientMap: toonRamp() }));
  });
}

/** Quicksand: a sandy whirl that slowly turns. */
export function quicksandMaterial() {
  return cached('m:quicksand', () => {
    const t = canvasTex(512, 512, (g) => {
      const gr = g.createRadialGradient(256, 256, 10, 256, 256, 256);
      gr.addColorStop(0, '#8a5a2a'); gr.addColorStop(1, '#c89050');
      g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
      g.strokeStyle = 'rgba(90,56,24,0.55)'; g.lineWidth = 6;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        for (let a = 0; a < Math.PI * 8; a += 0.1) { const rr = a * 9; g.lineTo(256 + Math.cos(a + k * 2.1) * rr, 256 + Math.sin(a + k * 2.1) * rr); }
        g.stroke();
      }
    }, true, 1);
    return shared(new THREE.MeshToonMaterial({ map: t, gradientMap: toonRamp() }));
  });
}

// ---------- portals ----------

/** A pair of scarab portals: a golden ring with a swirling teal heart (in) and a violet one (out). */
export function portal(p: Portal, L: LevelDef, toScene: ToScene): Animated {
  const g = new THREE.Group();
  const swirls: THREE.Mesh[] = [];
  const ring = (x: number, y: number, inner: number, exit: boolean) => {
    const root = new THREE.Group();
    root.position.copy(toScene(x, y)).setY(heightAt(L, x, y));
    place(root, part(new THREE.TorusGeometry(PORTAL_R + 4, 4, 10, 32).rotateX(Math.PI / 2), toon(0xffc83a), 1.1), 0, 3, 0);
    const swirlTex = cached(`t:swirl:${inner}`, () => canvasTex(256, 256, (c) => {
      const gr = c.createRadialGradient(128, 128, 4, 128, 128, 128);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, `#${inner.toString(16).padStart(6, '0')}`); gr.addColorStop(1, '#101030');
      c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 6;
      for (let k = 0; k < 4; k++) { c.beginPath(); for (let a = 0; a < 6; a += 0.1) c.lineTo(128 + Math.cos(a + k * 1.57) * a * 18, 128 + Math.sin(a + k * 1.57) * a * 18); c.stroke(); }
    }));
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(PORTAL_R + 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: swirlTex }));
    swirl.position.y = 1.2;
    root.add(swirl);
    swirls.push(swirl);
    // A scarab on the ring: body, head and six little legs
    const sc = new THREE.Group(); sc.position.set(0, 6, -(PORTAL_R + 4)); root.add(sc);
    sc.add(part(blob(7, 4, 9, 0.2, 14), toon(exit ? 0x9a4ae8 : 0x2ab8a8, { vertexColors: true }), 0.8));
    place(sc, part(blob(4, 3, 4, 0.2, 10), toon(0x1a3a3a), 0.6), 0, 0, -9);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) place(sc, part(new THREE.CylinderGeometry(0.8, 0.8, 8, 5).rotateZ(Math.PI / 2), toon(0x1a3a3a), 0, false), s * 7, -2, -4 + k * 5);
    if (exit) {
      // An arrow showing which way the ball comes out
      const a = p.exit != null ? (p.exit * Math.PI) / 180 : 0;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(5, 12, 3).rotateZ(-Math.PI / 2), toon(0xffc83a));
      arrow.position.set(Math.cos(a) * (PORTAL_R + 14), 3, Math.sin(a) * (PORTAL_R + 14));
      arrow.rotation.y = -a;
      if (p.exit != null) root.add(arrow);
    }
    g.add(root);
  };
  ring(p.a[0], p.a[1], 0x2ad8c8, false);
  ring(p.b[0], p.b[1], 0xa86aff, true);
  return { group: g, update: (_a, t) => { swirls[0].rotation.y = t * 2.2; swirls[1].rotation.y = -t * 2.2; } };
}

// ---------- doors ----------

/** A sandstone door carved with glyphs that slides down into the floor and back up on its timer. */
export function stoneDoor(d: Door, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  root.position.copy(toScene(d.x, d.y)).setY(heightAt(L, d.x, d.y));
  root.rotation.y = -(d.angle * Math.PI) / 180;
  const H = 46;
  const tex = canvasTex(256, 64, (g) => {
    g.fillStyle = '#d8a868'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#ffc83a'; g.fillRect(0, 0, 256, 6); g.fillRect(0, 58, 256, 6);
    glyphs(g, 8, 12, 240, 40, '#5a3a1a', Math.round(d.x + d.y));
  });
  const slab = part(new THREE.BoxGeometry(d.len + WALL_R, H, WALL_R * 2), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonRamp() }), 1.2);
  root.add(slab);
  // Slots in the floor it slides into, and gold posts at each end
  place(root, new THREE.Mesh(new THREE.BoxGeometry(d.len + WALL_R + 6, 1, WALL_R * 2 + 6), toon(0x3a2a1a)), 0, 0.4, 0);
  for (const s of [-1, 1]) place(root, part(new THREE.CylinderGeometry(6, 7, 54, 10), toon(0xffc83a), 1), s * (d.len / 2 + WALL_R + 6), 27, 0);
  return {
    group: root,
    update() { slab.position.y = -H / 2 + 2 + doorLift(d, world.time) * H; },
  };
}

// ---------- quicksand ----------

export function quicksandPatch(z: Zone, surface: THREE.BufferGeometry): Animated {
  const m = new THREE.Mesh(surface, quicksandMaterial());
  m.receiveShadow = true;
  return { group: m, update: (_a, t) => { const map = (quicksandMaterial() as THREE.MeshToonMaterial).map!; map.rotation = t * 0.15; map.center.set(0.5, 0.5); } };
}

// ---------- mummies ----------

/** A shuffling mummy: bandaged from head to toe, arms out in front, glowing green eyes. */
export function mummy(s: Astronaut, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const wrap = cached('m:wrap', () => {
    const t = canvasTex(128, 128, (g) => {
      g.fillStyle = '#efe4c8'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(150,130,90,0.7)'; g.lineWidth = 3;
      for (let i = -8; i < 16; i++) { g.beginPath(); g.moveTo(0, i * 12); g.lineTo(128, i * 12 + 30); g.stroke(); }
    });
    return shared(new THREE.MeshToonMaterial({ map: t, gradientMap: toonRamp() }));
  });
  const legs: THREE.Mesh[] = [];
  for (const z of [-5, 5]) {
    const leg = part(organic([V(0, 26), V(0, 13), V(1, 2)], [5, 4.6, 5], 10, 8), wrap, 0.9);
    place(body, leg, 0, 0, z);
    legs.push(leg);
  }
  place(body, part(blob(11, 16, 10, 0.1), wrap, 1.2), 0, 40, 0);
  const head = new THREE.Group(); head.position.set(1, 62, 0); body.add(head);
  head.add(part(blob(9, 10, 9, 0.1), wrap, 1));
  const glow = cached('m:mummyeye', () => shared(new THREE.MeshBasicMaterial({ color: 0x8aff6a })));
  for (const z of [-3.4, 3.4]) place(head, new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), glow), 8.4, 2, z);
  // A loose bandage end trailing behind
  place(body, part(organic([V(-8, 50), V(-16, 44, 3), V(-22, 36, -2)], [1.6, 1.4, 1.2], 6, 8), wrap, 0.4), 0, 0, 0);
  const arms: THREE.Mesh[] = [];
  for (const z of [-1, 1]) {
    const arm = part(organic([V(0, 0), V(9, 0, z * 1), V(18, 0, z * 1.5)], [3.6, 3.2, 3], 8, 8), wrap, 0.7);
    place(body, arm, 2, 48, z * 10);
    arms.push(arm);
  }
  const seed = Math.round(s.a[0] + s.a[1]);
  return {
    group: root,
    update(_a, t) {
      const p = astronautAt(s, world.time);
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y));
      const moving = Math.hypot(p.vx, p.vy) > 2;
      if (moving) body.rotation.y = -Math.atan2(p.vy, p.vx);
      const step = moving ? Math.sin(world.time * 4 + seed) : 0;
      legs.forEach((l, i) => { l.rotation.z = (i ? 1 : -1) * 0.3 * step; });
      body.rotation.z = 0.06 * step; // lurching side to side
      arms.forEach((a, i) => { a.rotation.y = 0.08 * Math.sin(t * 2 + i); });
      head.rotation.y = 0.25 * Math.sin(t * 0.8 + seed);
    },
  };
}

// ---------- columns and obelisks ----------

/** A lotus column (or, for every other one, a gold-capped obelisk) on the course. */
export function pillar(pl: Rock, L: LevelDef, toScene: ToScene, i: number) {
  const g = new THREE.Group();
  g.position.copy(toScene(pl.x, pl.y)).setY(heightAt(L, pl.x, pl.y));
  const stone = toon(0xe8c088);
  if (i % 2 === 0) {
    place(g, part(new THREE.CylinderGeometry(pl.r * 1.25, pl.r * 1.3, 8, 20), stone, 1), 0, 4, 0);
    const shaftTex = canvasTex(128, 256, (c) => {
      c.fillStyle = '#e8c088'; c.fillRect(0, 0, 128, 256);
      for (let k = 0; k < 4; k++) glyphs(c, 4, 20 + k * 56, 120, 36, 'rgba(90,60,30,0.6)', k + Math.round(pl.x));
      c.fillStyle = '#2a4aa8'; c.fillRect(0, 0, 128, 10); c.fillStyle = '#ffc83a'; c.fillRect(0, 10, 128, 6);
    });
    place(g, part(new THREE.CylinderGeometry(pl.r * 0.95, pl.r, 90, 20), new THREE.MeshToonMaterial({ map: shaftTex, gradientMap: toonRamp() }), 1.2), 0, 53, 0);
    // Lotus capital: a flared bowl of petals
    const prof = [new THREE.Vector2(pl.r * 0.95, 0), new THREE.Vector2(pl.r * 1.5, 14), new THREE.Vector2(pl.r * 1.7, 22), new THREE.Vector2(pl.r * 1.4, 24)];
    place(g, part(new THREE.LatheGeometry(prof, 20), toon(0x2ab8a8), 1), 0, 98, 0);
    place(g, part(new THREE.BoxGeometry(pl.r * 3.2, 6, pl.r * 3.2), stone, 1), 0, 125, 0);
  } else {
    place(g, part(new THREE.BoxGeometry(pl.r * 2.4, 10, pl.r * 2.4), stone, 1), 0, 5, 0);
    const ob = new THREE.CylinderGeometry(pl.r * 0.55, pl.r * 0.95, 110, 4, 1).rotateY(Math.PI / 4);
    place(g, part(ob, stone, 1.2), 0, 65, 0);
    place(g, part(new THREE.ConeGeometry(pl.r * 0.78, 18, 4).rotateY(Math.PI / 4), toon(0xffc83a), 1), 0, 129, 0);
  }
  return g;
}

// ---------- scenery ----------

/** A stepped cartoon pyramid with a gold cap. */
function pyramid(size: number) {
  const g = new THREE.Group();
  g.add(part(new THREE.ConeGeometry(size, size * 0.95, 4, 1).rotateY(Math.PI / 4).translate(0, size * 0.475, 0), toon(0xe8b070), size * 0.012, false));
  const cap = part(new THREE.ConeGeometry(size * 0.12, size * 0.115, 4, 1).rotateY(Math.PI / 4), toon(0xffd84a), size * 0.006, false);
  cap.position.y = size * 0.9;
  g.add(cap);
  return g;
}

/** A blocky cartoon sphinx lying in the sand. */
function sphinx() {
  const g = new THREE.Group();
  const stone = toon(0xe0b070, { vertexColors: true });
  place(g, part(blob(120, 40, 50), stone, 3), 0, 40, 0);
  for (const z of [-30, 30]) place(g, part(blob(70, 14, 16, 0.2), stone, 2), 120, 14, z);
  const head = new THREE.Group(); head.position.set(110, 110, 0); g.add(head);
  head.add(part(blob(34, 40, 34), stone, 2.5));
  // Striped headdress
  const nemes = toon(0x2a4aa8);
  for (const z of [-1, 1]) place(head, part(blob(14, 44, 10, 0), nemes, 1.5), -6, -18, z * 34);
  place(head, part(blob(36, 16, 38, 0), nemes, 1.5), -4, 32, 0);
  eye(head, 30, 10, 13, 7, 1);
  eye(head, 30, 10, -13, 7, -1);
  return g;
}

/** A standing torch with a flickering flame. */
function torch(seed: number): Animated {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(3, 4, 70, 8).translate(0, 35, 0), toon(0x6a4a2a), 1));
  place(g, part(new THREE.CylinderGeometry(9, 5, 10, 10), toon(0xffc83a), 1), 0, 72, 0);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(7, 22, 10), cached('m:torchflame', () => shared(new THREE.MeshBasicMaterial({ color: 0xffb030 }))));
  flame.position.y = 86;
  g.add(flame);
  return { group: g, update: (_a, t) => { flame.scale.set(1 + 0.15 * Math.sin(t * 13 + seed), 0.85 + 0.25 * Math.abs(Math.sin(t * 9 + seed * 2)), 1); } };
}

/**
 * The valley around a tomb hole: dunes and palms, torches along the kerb, obelisks, a sphinx and three
 * pyramids against the dusk sky.
 */
export function tombLandscape(L: LevelDef, outline: Pt[], toScene: ToScene, lawnH: (x: number, y: number) => number, anims: Animated[]) {
  const group = new THREE.Group();
  const r = rng(Math.round(L.tee[0] * 7 + L.cup[1] * 3));
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const b = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const [tx, ty] = L.tee;
  const clearOf = (x: number, y: number, gap: number) => { const o = outlineDistance(outline, x, y); return !o.inside && o.d > gap; };
  const at = (x: number, y: number, lift = 0) => toScene(x, y).setY(lawnH(x, y) + lift);

  // Torches along the kerb
  resample(outline, 230).forEach((p, i) => {
    const x = p.x + p.nx * 45, y = p.y + p.ny * 45;
    if (!clearOf(x, y, 30) || Math.hypot(x - tx, y - ty) < 120) return;
    const t = torch(i);
    t.group.position.copy(at(x, y, -2));
    group.add(t.group);
    anims.push(t);
  });
  // Palms and dunes further out
  for (let i = 0, tries = 0; i < 8 && tries < 200; tries++) {
    const a = r() * Math.PI * 2;
    const x = cx + Math.cos(a) * ((b.maxX - b.minX) / 2 + 160 + r() * 300), y = cy + Math.sin(a) * ((b.maxY - b.minY) / 2 + 140 + r() * 260);
    if (!clearOf(x, y, 110) || Math.hypot(x - tx, y - ty) < 200) continue;
    const p = palm(i * 11 + 3, 120 + r() * 80);
    p.position.copy(at(x, y, -2));
    group.add(p);
    i++;
  }
  for (let i = 0; i < 10; i++) {
    const a = r() * Math.PI * 2, d = 900 + r() * 1400;
    const dune = part(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xe8a868), 0, false);
    dune.scale.set(300 + r() * 400, 60 + r() * 80, 200 + r() * 260);
    dune.position.copy(toScene(cx + Math.cos(a) * d, cy + Math.sin(a) * d)).setY(-10);
    dune.rotation.y = r() * 6;
    group.add(dune);
  }
  // Pyramids, an obelisk pair and the sphinx on the horizon behind the hole
  ([[cx - 900, cy - 2600, 900], [cx + 600, cy - 3000, 1200], [cx + 2200, cy - 2200, 700]] as const).forEach(([x, y, s]) => {
    const p = pyramid(s);
    p.position.copy(toScene(x, y)).setY(-20);
    p.traverse((o) => { o.castShadow = false; });
    group.add(p);
  });
  const sp = sphinx();
  sp.position.copy(toScene(cx - 1500, cy - 1100)).setY(-10);
  sp.rotation.y = -0.6;
  sp.scale.setScalar(1.6);
  group.add(sp);
  return group;
}
