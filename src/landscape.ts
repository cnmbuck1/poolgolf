// Flowing garden landscape around each hole: a swept timber kerb that follows the curved
// fairway, rolling lawn, raised flower beds, ornamental grasses, river stones and topiary.
// All purely visual; nothing here touches the ball.
import * as THREE from 'three';
import { lanternGlow, plainMaterials, Animated } from './art';
import { LevelDef, Pt, Zone } from './levels';
import { Models, PieceBatch } from './models';
import { heightAt, onBridge, zoneDepth } from './physics';

type ToScene = (x: number, y: number) => THREE.Vector3;
export const LAWN_BASE = -4.5;

// ---------- small helpers ----------

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Distance from a point to a closed polyline, plus whether it's inside. */
export function outlineDistance(outline: Pt[], x: number, y: number) {
  let best = Infinity, inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [ax, ay] = outline[j], [bx, by] = outline[i];
    const vx = bx - ax, vy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, y - ay - vy * t));
    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return { d: best, inside };
}

/** Evenly spaced points along a closed polyline, with outward normals. */
export function resample(outline: Pt[], step: number) {
  const ccw = outline.reduce((a, [x1, y1], i) => { const [x2, y2] = outline[(i + 1) % outline.length]; return a + x1 * y2 - x2 * y1; }, 0) > 0;
  const out: { x: number; y: number; nx: number; ny: number; tx: number; ty: number }[] = [];
  let carry = 0;
  outline.forEach(([ax, ay], i) => {
    const [bx, by] = outline[(i + 1) % outline.length];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-6) return;
    const tx = (bx - ax) / len, ty = (by - ay) / len;
    const nx = ccw ? ty : -ty, ny = ccw ? -tx : tx;
    for (let d = carry; d < len; d += step) out.push({ x: ax + tx * d, y: ay + ty * d, nx, ny, tx, ty });
    carry = (carry - len) % step;
    if (carry < 0) carry += step;
  });
  return out;
}

/** Rolling lawn height: flat near the course, swelling into soft mounds further out. */
export function makeLawnHeight(outline: Pt[], seed: number) {
  const ph = [seed * 1.3, seed * 2.7, seed * 0.9, seed * 3.3];
  return (x: number, y: number) => {
    const { d, inside } = outlineDistance(outline, x, y);
    if (inside) return LAWN_BASE;
    const k = smooth((d - 110) / 260);
    const n = Math.sin(x * 0.006 + ph[0]) * Math.cos(y * 0.007 + ph[1]) * 0.6
      + Math.sin(x * 0.013 - y * 0.009 + ph[2]) * 0.3 + Math.cos(x * 0.004 + y * 0.011 + ph[3]) * 0.4;
    return LAWN_BASE + k * (22 + n * 26);
  };
}

/** Split triangles until no edge exceeds `max` (so a flat shape can follow the ground). */
function subdivide(src: Float32Array, max: (x: number, z: number) => number) {
  const out: number[] = [];
  const stack: number[][] = [];
  for (let i = 0; i < src.length; i += 9) stack.push(Array.from(src.slice(i, i + 9)));
  while (stack.length) {
    const t = stack.pop()!;
    const d = (i: number, j: number) => Math.hypot(t[i * 3] - t[j * 3], t[i * 3 + 2] - t[j * 3 + 2]);
    const e = [d(0, 1), d(1, 2), d(2, 0)];
    const k = e.indexOf(Math.max(...e));
    const cx = (t[0] + t[3] + t[6]) / 3, cz = (t[2] + t[5] + t[8]) / 3;
    if (e[k] <= max(cx, cz)) { out.push(...t); continue; }
    const a = k, b = (k + 1) % 3, c = (k + 2) % 3;
    const m = [0, 1, 2].map((q) => (t[a * 3 + q] + t[b * 3 + q]) / 2);
    const P = (i: number) => t.slice(i * 3, i * 3 + 3);
    stack.push([...P(a), ...m, ...P(c)], [...m, ...P(b), ...P(c)]);
  }
  return new Float32Array(out);
}

// ---------- lawn ----------

export function lawnMesh(outline: Pt[], toScene: ToScene, lawnH: (x: number, y: number) => number, material: THREE.Material, centre: THREE.Vector3) {
  const shape = new THREE.Shape();
  shape.absarc(centre.x, -centre.z, 3600, 0, Math.PI * 2, false);
  shape.holes.push(new THREE.Path(outline.map(([x, y]) => { const p = toScene(x, y); return new THREE.Vector2(p.x, -p.z); })));
  const flat = new THREE.ShapeGeometry(shape, 64).rotateX(-Math.PI / 2).toNonIndexed();
  // Fine near the course, coarse far away
  const pos = subdivide(flat.attributes.position.array as Float32Array, (x, z) => 40 + Math.hypot(x - centre.x, z - centre.z) * 0.12);
  flat.dispose();
  const origin = toScene(0, 0);
  for (let i = 0; i < pos.length / 3; i++) {
    const x = pos[i * 3] - origin.x, y = pos[i * 3 + 2] - origin.z;
    pos[i * 3 + 1] = lawnH(x, y);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = pos[i * 3] / 170; uv[i * 2 + 1] = pos[i * 3 + 2] / 170; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  return m;
}

// ---------- swept kerb ----------

/**
 * Rounded timber kerb swept along the closed outline. Its centre line is the physics edge;
 * it stands proud of the turf and drops below it so no gap shows on slopes.
 */
/** `material` overrides the timber (basalt in the canyon, where it also drops the brass studs). */
export function kerbMesh(L: LevelDef, outline: Pt[], toScene: ToScene, material?: THREE.Material) {
  const lib = plainMaterials();
  const pts = resample(outline, 8);
  // Profile (across, up): a softly rounded cap on a straight-sided board
  const W = 10, top = 15, bottom = -9;
  const prof: [number, number][] = [[-W, bottom], [-W, top - 5]];
  for (let k = 0; k <= 6; k++) { const a = Math.PI - (k / 6) * Math.PI; prof.push([Math.cos(a) * W, top - 5 + Math.sin(a) * 5]); }
  prof.push([W, bottom]);
  const n = pts.length, m = prof.length;
  const pos = new Float32Array(n * m * 3), uv = new Float32Array(n * m * 2);
  let along = 0;
  pts.forEach((p, i) => {
    if (i) along += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    // Average the normals of neighbouring samples so corners sweep smoothly
    const q = pts[(i + n - 1) % n];
    let nx = p.nx + q.nx, ny = p.ny + q.ny;
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const base = heightAt(L, p.x, p.y);
    prof.forEach(([u, v], j) => {
      const s = toScene(p.x + nx * u, p.y + ny * u);
      const k = (i * m + j) * 3;
      pos[k] = s.x; pos[k + 1] = base + v; pos[k + 2] = s.z;
      uv[(i * m + j) * 2] = along / 70;
      uv[(i * m + j) * 2 + 1] = j / (m - 1);
    });
  });
  const idx: number[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) {
    const a = i * m + j, b = ((i + 1) % n) * m + j;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material ?? lib.Timber);
  mesh.castShadow = mesh.receiveShadow = true;
  // Brass rivets along the top every so often
  const studs = resample(outline, 64);
  const studMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), lib.Brass, studs.length);
  const m4 = new THREE.Matrix4();
  studs.forEach((p, i) => { const s = toScene(p.x, p.y); studMesh.setMatrixAt(i, m4.makeTranslation(s.x, heightAt(L, p.x, p.y) + top - 0.4, s.z)); });
  const group = new THREE.Group();
  group.add(mesh);
  if (!material) group.add(studMesh);
  return group;
}

// ---------- river stones ----------

/** Rounded stones lining water banks (inside the water zone, so they never sit in the ball's path). */
export function riverStones(L: LevelDef, models: Models, toScene: ToScene, dipAt: (x: number, y: number) => number, swap?: Record<string, THREE.Material>) {
  const batch = new PieceBatch(models);
  const r = rng(91);
  for (const z of L.water ?? []) {
    const ring = z.kind === 'poly' ? z.pts : z.kind === 'circle'
      ? Array.from({ length: 48 }, (_, i) => [z.x + Math.cos((i / 48) * Math.PI * 2) * z.r, z.y + Math.sin((i / 48) * Math.PI * 2) * z.r] as Pt)
      : [[z.x, z.y], [z.x + z.w, z.y], [z.x + z.w, z.y + z.h], [z.x, z.y + z.h]] as Pt[];
    for (const p of resample(ring, 13)) {
      // step just inside the water edge
      let x = p.x - p.nx * 4, y = p.y - p.ny * 4;
      if (zoneDepth(z, x, y) <= 0) { x = p.x + p.nx * 4; y = p.y + p.ny * 4; }
      if (zoneDepth(z, x, y) <= 0) continue;
      if ((L.bridges ?? []).some((br) => onBridge({ ...br, len: br.len + 20, width: br.width + 30 }, x, y))) continue;
      const s = 4 + r() * 4;
      const sp = toScene(x, y);
      batch.add(`Boulder${1 + Math.floor(r() * 3)}`, new THREE.Matrix4().makeTranslation(sp.x, heightAt(L, x, y) - dipAt(x, y) - s * 0.25, sp.z)
        .multiply(new THREE.Matrix4().makeRotationY(r() * 6.3))
        .multiply(new THREE.Matrix4().makeScale(s * (1 + r() * 0.5), s * 0.7, s)));
    }
  }
  const g = batch.build(swap);
  g.traverse((o) => { o.castShadow = false; });
  return g;
}

// ---------- garden beds and planting ----------

/** An organic outline for a bed. */
function bedOutline(cx: number, cy: number, rx: number, ry: number, rot: number, seed: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 28; i++) {
    const t = (i / 28) * Math.PI * 2;
    const k = 1 + 0.18 * Math.sin(2 * t + seed) + 0.1 * Math.sin(3 * t + seed * 1.7);
    const x = Math.cos(t) * rx * k, y = Math.sin(t) * ry * k;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return pts;
}

/** Raised, mounded flower bed: dark soil dome with a stone rim, dense flowers and grasses. */
function flowerBed(outline: Pt[], toScene: ToScene, lawnH: (x: number, y: number) => number, models: Models, seed: number) {
  const g = new THREE.Group();
  const r = rng(seed);
  const cx = outline.reduce((a, p) => a + p[0], 0) / outline.length, cy = outline.reduce((a, p) => a + p[1], 0) / outline.length;
  const zone: Zone = { kind: 'poly', pts: outline };
  const H = 9;
  const domeAt = (x: number, y: number) => lawnH(x, y) + H * smooth(zoneDepth(zone, x, y) / 26);
  // Soil dome
  const shape = new THREE.Shape(outline.map(([x, y]) => { const p = toScene(x, y); return new THREE.Vector2(p.x, -p.z); }));
  const flat = new THREE.ShapeGeometry(shape, 12).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = subdivide(flat.attributes.position.array as Float32Array, () => 9);
  flat.dispose();
  const o = toScene(0, 0);
  for (let i = 0; i < pos.length / 3; i++) pos[i * 3 + 1] = domeAt(pos[i * 3] - o.x, pos[i * 3 + 2] - o.z) + 0.2;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const soil = new THREE.Mesh(geo, soilMaterial());
  soil.receiveShadow = true;
  g.add(soil);
  // Stone rim
  const batch = new PieceBatch(models);
  for (const p of resample(outline, 11)) {
    const s = 3.5 + r() * 2.5, sp = toScene(p.x, p.y);
    batch.add(`Boulder${1 + Math.floor(r() * 3)}`, new THREE.Matrix4().makeTranslation(sp.x, lawnH(p.x, p.y) + s * 0.2, sp.z)
      .multiply(new THREE.Matrix4().makeRotationY(r() * 6.3)).multiply(new THREE.Matrix4().makeScale(s * 1.3, s * 0.75, s)));
  }
  // Flowers in drifts of colour, and tufts of ornamental grass toward the middle
  const flowers = new PieceBatch(models);
  const colours: number[] = [];
  const drifts = [0xf2c230, 0xf07a8a, 0xffffff, 0xb78be0, 0xff9a3c, 0xe8405a];
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const grass: [number, number, number][] = [];
  for (let i = 0; i < 150; i++) {
    const x = Math.min(...xs) + r() * (Math.max(...xs) - Math.min(...xs)), y = Math.min(...ys) + r() * (Math.max(...ys) - Math.min(...ys));
    const d = zoneDepth(zone, x, y);
    if (d < 4) continue;
    if (d > 22 && r() < 0.18) { grass.push([x, y, 0.8 + r() * 0.6]); continue; }
    const sp = toScene(x, y), s = 0.9 + r() * 0.7;
    flowers.add('Flower', new THREE.Matrix4().makeTranslation(sp.x, domeAt(x, y), sp.z).multiply(new THREE.Matrix4().makeRotationY(r() * 6.3)).multiply(new THREE.Matrix4().makeScale(s, s, s)));
    // colour drifts: hue follows position so beds read as swathes, not confetti
    colours.push(drifts[Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (Math.PI * 2)) * 3 + seed) % drifts.length]);
  }
  const fl = flowers.build();
  fl.traverse((ob) => {
    if (ob instanceof THREE.InstancedMesh && (ob.material as THREE.Material).name === 'Petal') {
      const c = new THREE.Color();
      colours.forEach((hex, i) => ob.setColorAt(i, c.setHex(hex)));
    }
    ob.castShadow = false;
  });
  g.add(batch.build(), fl, grassTufts(grass, toScene, domeAt, r));
  return g;
}

let soilMat: THREE.MeshStandardMaterial | null = null;
function soilMaterial() {
  if (!soilMat) { soilMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 }); soilMat.userData.shared = true; }
  return soilMat;
}

let bladeMat: THREE.MeshStandardMaterial | null = null;
/** Fountain-shaped clumps of arching grass blades. */
function grassTufts(spots: [number, number, number][], toScene: ToScene, groundAt: (x: number, y: number) => number, r: () => number) {
  if (!bladeMat) { bladeMat = new THREE.MeshStandardMaterial({ color: 0x8aa04a, roughness: 0.8, side: THREE.DoubleSide }); bladeMat.userData.shared = true; }
  // One arching blade: a bent, tapering strip
  const blade = new THREE.BufferGeometry();
  const seg = 6, verts: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, w = 1.6 * (1 - t);
    const x = t * t * 14, y = Math.sin(t * Math.PI * 0.55) * 30;
    verts.push(x, y, -w, x, y, w);
    if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  blade.setIndex(idx);
  blade.computeVertexNormals();
  const per = 14;
  const mesh = new THREE.InstancedMesh(blade, bladeMat, Math.max(1, spots.length * per));
  mesh.count = spots.length * per;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const col = new THREE.Color();
  spots.forEach(([x, y, s], i) => {
    const p = toScene(x, y).setY(groundAt(x, y));
    for (let k = 0; k < per; k++) {
      e.set(0, (k / per) * Math.PI * 2 + r() * 0.4, 0);
      q.setFromEuler(e);
      const sc = s * (0.7 + r() * 0.5);
      mesh.setMatrixAt(i * per + k, m4.compose(p, q, new THREE.Vector3(sc, sc, sc)));
      mesh.setColorAt(i * per + k, col.setHSL(0.2 + r() * 0.05, 0.45, 0.35 + r() * 0.15));
    }
  });
  mesh.castShadow = true;
  return mesh;
}

/** Clipped topiary balls (stacked for a few) and the rest of the planting around a hole. */
export function landscape(L: LevelDef, outline: Pt[], models: Models, toScene: ToScene, lawnH: (x: number, y: number) => number, anims: Animated[]) {
  const group = new THREE.Group();
  const lib = plainMaterials();
  const r = rng(Math.round(L.tee[0] * 7 + L.cup[1] * 3));
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const b = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const [tx, ty] = L.tee;
  const clearOf = (x: number, y: number, gap: number) => {
    const { d, inside } = outlineDistance(outline, x, y);
    return !inside && d > gap;
  };

  // A flowing hedge line just outside the kerb: varies in height, broken by topiary balls
  const hedge = new PieceBatch(models);
  const balls: [number, number, number][] = [];
  const rim = resample(outline, 40);
  rim.forEach((p, i) => {
    const off = 64 + Math.sin(i * 0.45) * 10;
    const x = p.x + p.nx * off, y = p.y + p.ny * off;
    if (!clearOf(x, y, 46) || Math.hypot(x - tx, y - ty) < 150) return;
    if (i % 7 === 3) { balls.push([x, y, 13 + r() * 5]); return; }
    const sp = toScene(x, y);
    const sy = 0.75 + 0.35 * (0.5 + 0.5 * Math.sin(i * 0.3));
    hedge.add('Hedge', new THREE.Matrix4().makeTranslation(sp.x, lawnH(x, y), sp.z)
      .multiply(new THREE.Matrix4().makeRotationY(-Math.atan2(p.ty, p.tx)))
      .multiply(new THREE.Matrix4().makeTranslation(-30, 0, 0))
      .multiply(new THREE.Matrix4().makeScale(0.78, sy, 0.95)));
  });
  const hedges = hedge.build();
  hedges.traverse((o) => { o.castShadow = false; });
  group.add(hedges);

  // Topiary: leafy spheres, some stacked in twos and threes
  const leafy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 3), lib.Leaf, 64);
  let nLeaf = 0;
  const m4 = new THREE.Matrix4();
  const addBall = (x: number, y: number, rad: number, lift = 0) => {
    if (nLeaf >= 64) return;
    const sp = toScene(x, y);
    leafy.setMatrixAt(nLeaf++, m4.compose(new THREE.Vector3(sp.x, lawnH(x, y) + rad * 0.9 + lift, sp.z), new THREE.Quaternion(), new THREE.Vector3(rad, rad * 0.95, rad)));
  };
  for (const [x, y, rad] of balls) addBall(x, y, rad);

  // Raised flower beds on the lawn, out where the ground starts to roll
  const beds: [number, number][] = [];
  for (let tries = 0; tries < 200 && beds.length < 6; tries++) {
    const a = r() * Math.PI * 2;
    const cx = (b.minX + b.maxX) / 2 + Math.cos(a) * ((b.maxX - b.minX) / 2 + 160 + r() * 140);
    const cy = (b.minY + b.maxY) / 2 + Math.sin(a) * ((b.maxY - b.minY) / 2 + 150 + r() * 120);
    if (!clearOf(cx, cy, 130) || Math.hypot(cx - tx, cy - ty) < 220) continue;
    if (beds.some(([x, y]) => Math.hypot(x - cx, y - cy) < 230)) continue;
    beds.push([cx, cy]);
    const rx = 70 + r() * 45, ry = 38 + r() * 20;
    group.add(flowerBed(bedOutline(cx, cy, rx, ry, r() * Math.PI, beds.length * 1.7), toScene, lawnH, models, beds.length + 3));
    // a stacked topiary at one end of each bed
    const ex = cx + Math.cos(a) * (rx + 30), ey = cy + Math.sin(a) * (ry + 30);
    if (clearOf(ex, ey, 110)) { addBall(ex, ey, 15); addBall(ex, ey, 10, 26); addBall(ex, ey, 6, 44); }
  }
  leafy.count = nLeaf;
  leafy.castShadow = true;
  group.add(leafy);

  // Grass tufts scattered along the hedge line and near lamps
  const tufts: [number, number, number][] = [];
  rim.forEach((p, i) => {
    if (i % 3) return;
    const off = 34 + r() * 10, x = p.x + p.nx * off, y = p.y + p.ny * off;
    if (clearOf(x, y, 24) && Math.hypot(x - tx, y - ty) > 120) tufts.push([x, y, 0.55 + r() * 0.3]);
  });
  group.add(grassTufts(tufts, toScene, lawnH, r));

  // Garden lamps at a few points around the hole
  const lampBatch = new PieceBatch(models);
  const lamps: [number, number][] = [];
  for (const p of resample(outline, 90)) {
    const x = p.x + p.nx * 44, y = p.y + p.ny * 44;
    if (!clearOf(x, y, 34) || lamps.some(([lx, ly]) => Math.hypot(lx - x, ly - y) < 360)) continue;
    lamps.push([x, y]);
  }
  for (const [x, y] of lamps) {
    const sp = toScene(x, y), h = lawnH(x, y);
    lampBatch.add('LampPost', new THREE.Matrix4().makeTranslation(sp.x, h, sp.z));
    const glow = lanternGlow();
    glow.group.position.copy(sp).setY(h + 117);
    group.add(glow.group);
    anims.push(glow);
  }
  group.add(lampBatch.build());

  // Trees on the rolling ground behind and beside the hole, and a curving stepping-stone path from the tee
  const trees = new PieceBatch(models);
  const treeSpots: [number, number, number][] = [
    [b.minX - 480, b.minY - 300, 1.1], [b.minX + 150, b.minY - 520, 1.25], [(b.minX + b.maxX) / 2 + 80, b.minY - 560, 1.0],
    [b.maxX - 120, b.minY - 500, 1.2], [b.maxX + 470, b.minY - 220, 1.05], [b.maxX + 560, (b.minY + b.maxY) / 2, 1.15],
    [b.minX - 560, (b.minY + b.maxY) / 2 - 60, 1.0],
  ];
  for (const [x, y, s] of treeSpots) {
    const sp = toScene(x, y);
    trees.add('Tree', new THREE.Matrix4().makeTranslation(sp.x, lawnH(x, y) - 2, sp.z).multiply(new THREE.Matrix4().makeRotationY(x * 0.01)).multiply(new THREE.Matrix4().makeScale(s, s, s)));
  }
  let dx = tx - (b.minX + b.maxX) / 2, dy = ty - (b.minY + b.maxY) / 2;
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  for (let k = 0, d = 30; k < 10 && d < 600; d += 32) {
    const bend = Math.sin(d * 0.012) * 40;
    const x = tx + dx * d - dy * bend, y = ty + dy * d + dx * bend;
    if (!clearOf(x, y, 26)) continue;
    const sp = toScene(x, y);
    trees.add(`Paver${(k % 3) + 1}`, new THREE.Matrix4().makeTranslation(sp.x, lawnH(x, y) + 0.6, sp.z).multiply(new THREE.Matrix4().makeRotationY(k * 0.7)).multiply(new THREE.Matrix4().makeScale(1.15, 1.15, 1.15)));
    k++;
  }
  group.add(trees.build());
  return group;
}
