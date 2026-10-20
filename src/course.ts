// Builds everything specific to one hole: the shaped, sloped fairway, its timber edging,
// obstacles, cup and the garden dressing around it. Purely visual; collision is physics.ts.
import * as THREE from 'three';
import { Animated, brassCup, contactDisc, contactStrip, fairwayMaterial, lanternGlow, mats, modelMaterials, stoneWall, turnstile, TURF_TILE, wallRivets, windmill } from './art';
import { Bridge, Bumper, LevelDef, WORLD_H, WORLD_W, Zone } from './levels';
import { clonePiece, Models, PieceBatch, windmillRig } from './models';
import { BALL_R, bridgeEdge, closestOnSeg, CUP_R, EDGE_R, fairwayOutline, heightAt, inZone, slopeAt, SPINNER_R, WALL_R, World } from './physics';

// Table-plane (x, y) → scene (x, height, z), centred on the original table.
export const HW = WORLD_W / 2;
export const HH = WORLD_H / 2;
export const to3 = (x: number, y: number) => new THREE.Vector3(x - HW, 0, y - HH);

/** Height of the lawn around the course (the fairway sits a little proud of it). */
export const LAWN_Y = -4.5;

export interface Course {
  group: THREE.Group;
  /** Windmill rigs, indexed like world.spinners (undefined → use `legacySpinners`). */
  spinnerAnims: (Animated | undefined)[];
  legacySpinners: THREE.Group[];
  anims: Animated[];
  waterMats: THREE.MeshPhysicalMaterial[];
  cupPos: THREE.Vector3;
  cupPulse: THREE.Mesh;
  /** Table-plane bounds of the fairway (for camera and shadow fitting). */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

const C = {
  wood: 0xe8bd77,
  water: 0x2d5d66,
  waterDeep: 0x1d3c4a,
  sand: 0xe6d29c,
  spinner: 0xe8e1ca,
};

export function buildCourse(world: World, models: Models | null): Course {
  const L = world.level;
  const premium = true; // every hole now uses the detailed models
  const isMill = (s: { style?: string }) => s.style === 'windmill';
  const group = new THREE.Group();
  const add = <T extends THREE.Object3D>(o: T) => { group.add(o); return o; };
  const at = (x: number, y: number, lift = 0) => to3(x, y).setY(heightAt(L, x, y) + lift);
  const anims: Animated[] = [];
  const outline = fairwayOutline(L);
  const bounds = outline.reduce((b, [x, y]) => ({ minX: Math.min(b.minX, x), maxX: Math.max(b.maxX, x), minY: Math.min(b.minY, y), maxY: Math.max(b.maxY, y) }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

  // ---- Fairway turf, shaped to the slopes, with arrows showing which way it falls ----
  add(fairwayMesh(L, outline));
  const arrows = slopeArrows(world, outline);
  if (arrows) { add(arrows.group); anims.push(arrows); }

  // ---- Timber edging on the outline (its centre line is the physics boundary) ----
  if (models) {
    const batch = new PieceBatch(models);
    outline.forEach(([ax, ay], i) => {
      const [bx, by] = outline[(i + 1) % outline.length];
      const a = to3(ax, ay), b = to3(bx, by);
      const len = a.distanceTo(b);
      const n = Math.max(1, Math.round(len / 48));
      const stretch = len / (n * 48);
      const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const h = heightAt(L, ax + (bx - ax) * t, ay + (by - ay) * t);
        const m = new THREE.Matrix4().makeTranslation(a.x, h - 5, a.z)
          .multiply(new THREE.Matrix4().makeRotationY(yaw))
          .multiply(new THREE.Matrix4().makeTranslation(k * 48 * stretch, 0, 0))
          .multiply(new THREE.Matrix4().makeScale(stretch, 1.35, 1)); // a little taller than the ball
        batch.add('TimberSection', m);
      }
      batch.add('TimberPost', new THREE.Matrix4().makeTranslation(a.x, heightAt(L, ax, ay) - 5, a.z).multiply(new THREE.Matrix4().makeRotationY(yaw)));
    });
    add(batch.build());
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 0.8 });
    outline.forEach(([ax, ay], i) => {
      const [bx, by] = outline[(i + 1) % outline.length];
      const a = at(ax, ay), b = at(bx, by);
      const m = new THREE.Mesh(new THREE.BoxGeometry(a.distanceTo(b) + EDGE_R * 2, 16, EDGE_R * 2), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5).setY(3);
      m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      m.castShadow = m.receiveShadow = true;
      add(m);
    });
  }

  // ---- Cup, flag and tee ----
  const cupPos = at(L.cup[0], L.cup[1]);
  if (models) {
    const cupModel = clonePiece(models, 'Cup');
    cupModel.position.copy(cupPos);
    add(cupModel);
  }
  const flag = brassCup(CUP_R, !models);
  flag.group.position.copy(cupPos);
  add(flag.group);
  anims.push(flag);
  const tee = new THREE.Mesh(new THREE.TorusGeometry(BALL_R + 8, 1.1, 6, 40).rotateX(Math.PI / 2), mats.brass);
  tee.position.copy(at(L.tee[0], L.tee[1], 0.3));
  add(tee);
  const cupPulse = add(new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false })));
  cupPulse.position.copy(cupPos).setY(cupPos.y + 0.5);

  // ---- Sand and water (kept on flat ground) ----
  for (const z of L.sand ?? []) {
    const c = zoneCentre(z);
    const lip = add(new THREE.Mesh(zoneGeometry(z, 3), new THREE.MeshStandardMaterial({ color: 0xbfa970, roughness: 1 })));
    lip.position.y = heightAt(L, c[0], c[1]) + 0.2;
    const tex = sandTexture();
    const m = add(new THREE.Mesh(zoneGeometry(z, 0, 140), new THREE.MeshStandardMaterial({ color: C.sand, roughness: 1, map: tex, bumpMap: tex, bumpScale: 1.2 })));
    m.position.y = lip.position.y + 0.1;
    m.receiveShadow = true;
  }
  const waterMats: THREE.MeshPhysicalMaterial[] = [];
  for (const z of L.water ?? []) {
    const c = zoneCentre(z);
    const y = heightAt(L, c[0], c[1]);
    const hasMill = world.spinners.some((s) => isMill(s) && inZone(z, s.x, s.y));
    if (!hasMill) {
      const bank = add(new THREE.Mesh(zoneGeometry(z, 5), new THREE.MeshStandardMaterial({ color: 0x4d7a57, roughness: 1 })));
      bank.position.y = y + 0.25;
    }
    const deep = add(new THREE.Mesh(zoneGeometry(z, -10), new THREE.MeshBasicMaterial({ color: C.waterDeep })));
    deep.position.y = y + 0.35;
    const mat = new THREE.MeshPhysicalMaterial({ color: C.water, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.82, normalMap: waterNormal(), normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 1 });
    waterMats.push(mat);
    const w = add(new THREE.Mesh(zoneGeometry(z, 0, 160), mat));
    w.position.y = y + 0.5;
    w.receiveShadow = true;
  }

  // ---- Walls and bars (outline edging is drawn above, so skip the rail segments) ----
  const segs = world.segs.filter((s) => !s.kind || s.kind === 'wall'); // edging and bridge rails draw themselves
  const wallSegs = (L.walls ?? []).reduce((n, line) => n + line.length - 1, 0);
  if (premium && models) {
    const batch = new PieceBatch(models);
    segs.forEach((s, i) => {
      const a = to3(s.ax, s.ay), b = to3(s.bx, s.by);
      batch.wall(a, b, i < wallSegs ? 'Stone' : 'Brick', i * 0.06);
      const strip = contactStrip(a.distanceTo(b) + s.r * 2 + 34, s.r * 2 + 30);
      strip.position.copy(a).add(b).multiplyScalar(0.5).setY(heightAt(L, (s.ax + s.bx) / 2, (s.ay + s.by) / 2) + 0.45);
      strip.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      add(strip);
    });
    add(batch.build()); // walls stand on flat ground
  } else if (premium) {
    const rivets: THREE.Vector3[] = [];
    for (const s of segs) {
      const a = to3(s.ax, s.ay), b = to3(s.bx, s.by);
      const wall = stoneWall(a.distanceTo(b), s.r);
      wall.position.copy(a).add(b).multiplyScalar(0.5);
      wall.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      wall.updateMatrix();
      for (const p of wallRivets(a.distanceTo(b), s.r)) rivets.push(p.applyMatrix4(wall.matrix));
      add(wall);
    }
    if (rivets.length) {
      const rv = new THREE.InstancedMesh(new THREE.SphereGeometry(1.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mats.brass, rivets.length);
      const m4 = new THREE.Matrix4();
      rivets.forEach((p, i) => rv.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
      add(rv);
    }
  } else {
    const woodMat = new THREE.MeshPhysicalMaterial({ color: C.wood, roughness: 0.45, map: woodTexture(), clearcoat: 0.6, clearcoatRoughness: 0.25 });
    for (const s of segs) {
      const a = to3(s.ax, s.ay), b = to3(s.bx, s.by);
      const m = add(new THREE.Mesh(new THREE.CapsuleGeometry(s.r, a.distanceTo(b), 6, 18).rotateZ(Math.PI / 2), woodMat));
      m.position.copy(a).add(b).multiplyScalar(0.5).setY(heightAt(L, (s.ax + s.bx) / 2, (s.ay + s.by) / 2) + WALL_R);
      m.scale.y = 1.25;
      m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      m.castShadow = m.receiveShadow = true;
    }
  }

  for (const bp of L.bumpers ?? []) {
    const m = add(bumperMesh(bp));
    m.position.y += heightAt(L, bp.x, bp.y);
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(bp.r * 0.8, 2, 8, 28).rotateX(Math.PI / 2), mats.brass));
    ring.position.copy(at(bp.x, bp.y, 2));
    ring.castShadow = true;
  }

  // ---- Spinners: the Blender windmill where there's room, turnstiles elsewhere ----
  const spinnerAnims: (Animated | undefined)[] = [];
  const legacySpinners: THREE.Group[] = [];
  world.spinners.forEach((s, i) => {
    let rig: Animated;
    if (isMill(s) && models) {
      const r = windmillRig(models);
      r.root.add(contactDisc(56));
      rig = { group: r.root, update: (angle) => r.update(angle) };
    } else if (isMill(s)) {
      const pond = (L.water ?? []).find((z) => z.kind === 'circle' && inZone(z, s.x, s.y));
      rig = windmill(s.len, SPINNER_R, pond && pond.kind === 'circle' ? pond.r : 44);
    } else {
      rig = turnstile(s.len, SPINNER_R);
    }
    rig.group.position.copy(at(s.x, s.y));
    spinnerAnims[i] = rig;
    add(rig.group);
  });

  // ---- Bridges and boulders ----
  for (const br of L.bridges ?? []) add(bridgeMesh(L, br));
  if (models && L.rocks?.length) {
    const batch = new PieceBatch(models);
    L.rocks.forEach((rk, i) => {
      const p = at(rk.x, rk.y);
      batch.add(`Boulder${(i % 3) + 1}`, new THREE.Matrix4().makeTranslation(p.x, p.y - rk.r * 0.08, p.z)
        .multiply(new THREE.Matrix4().makeRotationY(i * 2.4))
        .multiply(new THREE.Matrix4().makeScale(rk.r * 1.04, rk.r * 1.1, rk.r * 1.04)));
      const shadow = contactDisc(rk.r + 14);
      shadow.position.copy(p).setY(p.y + 0.45);
      add(shadow);
    });
    add(batch.build());
  } else {
    for (const rk of L.rocks ?? []) {
      const m = add(new THREE.Mesh(new THREE.DodecahedronGeometry(rk.r, 1), modelMaterials().Stone));
      m.position.copy(at(rk.x, rk.y, rk.r * 0.5));
      m.castShadow = m.receiveShadow = true;
    }
  }

  // ---- Garden dressing around the hole ----
  if (models) dressGarden(L, outline, models, group, anims);

  return { group, spinnerAnims, legacySpinners, anims, waterMats, cupPos, cupPulse, bounds };
}

// ---------- fairway mesh ----------

/** Turf over the outline (with the cup cut out), subdivided so it can follow the slopes. */
function fairwayMesh(L: LevelDef, outline: [number, number][]) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x - HW, -(y - HH))));
  const hole = new THREE.Path();
  hole.absarc(L.cup[0] - HW, -(L.cup[1] - HH), CUP_R, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const flat = new THREE.ShapeGeometry(shape, 48).rotateX(-Math.PI / 2).toNonIndexed();
  const src = flat.attributes.position.array as Float32Array;
  // Split long edges so the surface can bend (T-junction cracks are far below a pixel on these gentle slopes)
  const out: number[] = [];
  const stack: number[][] = [];
  for (let i = 0; i < src.length; i += 9) stack.push(Array.from(src.slice(i, i + 9)));
  const MAX = 14;
  while (stack.length) {
    const t = stack.pop()!;
    const d = (i: number, j: number) => Math.hypot(t[i * 3] - t[j * 3], t[i * 3 + 2] - t[j * 3 + 2]);
    const e = [d(0, 1), d(1, 2), d(2, 0)];
    const k = e.indexOf(Math.max(...e));
    if (e[k] <= MAX) { out.push(...t); continue; }
    const a = k, b = (k + 1) % 3, c = (k + 2) % 3;
    const m = [0, 1, 2].map((q) => (t[a * 3 + q] + t[b * 3 + q]) / 2);
    const P = (i: number) => t.slice(i * 3, i * 3 + 3);
    stack.push([...P(a), ...m, ...P(c)], [...m, ...P(b), ...P(c)]);
  }
  const pos = new Float32Array(out);
  const uv = new Float32Array((pos.length / 3) * 2);
  const col = new Float32Array(pos.length);
  for (let i = 0; i < pos.length / 3; i++) {
    const x = pos[i * 3] + HW, y = pos[i * 3 + 2] + HH;
    const hgt = heightAt(L, x, y);
    pos[i * 3 + 1] = hgt;
    uv[i * 2] = x / TURF_TILE;
    uv[i * 2 + 1] = y / TURF_TILE;
    // Mowing stripes (diagonal bands), plus a light lift on rises and shade in dips so slopes read
    const band = Math.floor((x + y * 0.35) / 70) % 2 === 0 ? 1.0 : 0.86;
    const shade = Math.max(0.75, Math.min(1.25, 1 + hgt * 0.035));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = band * shade;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  flat.dispose();
  const m = new THREE.Mesh(g, fairwayMaterial());
  m.receiveShadow = true;
  return m;
}

// ---------- bridges ----------

/** Humped plank footbridge with posts and handrails, following the deck height used by the physics. */
function bridgeMesh(L: LevelDef, br: Bridge) {
  const lib = modelMaterials();
  const g = new THREE.Group();
  const a = (br.angle * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const pt = (u: number, v: number): [number, number] => [br.x + ux * u - uy * v, br.y + uy * u + ux * v];
  const yaw = -a;
  // Deck planks (one instanced draw call)
  const n = Math.round(br.len / 6.5);
  const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(5.6, 2.6, br.width + 10), lib.Plank, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < n; i++) {
    const u = -br.len / 2 + (i + 0.5) * (br.len / n);
    const [x, y] = pt(u, 0);
    const h0 = heightAt(L, ...pt(u - 3, 0)), h1 = heightAt(L, ...pt(u + 3, 0));
    q.setFromEuler(new THREE.Euler(0, yaw, Math.atan2(h1 - h0, 6) + (i % 3 - 1) * 0.01, 'YZX'));
    planks.setMatrixAt(i, m4.compose(to3(x, y).setY(heightAt(L, x, y) - 1.0), q, s3));
  }
  planks.castShadow = planks.receiveShadow = true;
  g.add(planks);
  // Stringers under the deck edges
  for (const side of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const u0 = -br.len / 2 + (k * br.len) / 6, u1 = u0 + br.len / 6;
      const [x0, y0] = pt(u0, side * (br.width / 2 + 3)), [x1, y1] = pt(u1, side * (br.width / 2 + 3));
      const p0 = to3(x0, y0).setY(heightAt(L, ...pt(u0, 0)) - 4), p1 = to3(x1, y1).setY(heightAt(L, ...pt(u1, 0)) - 4);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(p0.distanceTo(p1) + 1, 4, 3), lib.DarkWood);
      beam.position.copy(p0).add(p1).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), p1.clone().sub(p0).normalize());
      beam.castShadow = true;
      g.add(beam);
    }
  }
  // Posts and handrails on the collision rails
  for (const side of [-1, 1]) {
    const [ax, ay, bx, by] = bridgeEdge(br, side);
    const posts = Math.max(2, Math.round(br.len / 40) + 1);
    const tops: THREE.Vector3[] = [];
    for (let k = 0; k < posts; k++) {
      const t = k / (posts - 1);
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      const base = heightAt(L, ...pt(-br.len / 2 + br.len * t, 0));
      const post = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 22, 10), lib.Timber);
      post.position.copy(to3(x, y)).setY(base + 9);
      post.castShadow = true;
      g.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(2.8, 10, 6), mats.brass);
      cap.position.copy(post.position).setY(base + 21);
      g.add(cap);
      tops.push(to3(x, y).setY(base + 17));
    }
    for (let k = 0; k < tops.length - 1; k++) {
      const p0 = tops[k], p1 = tops[k + 1];
      const rail = new THREE.Mesh(new THREE.BoxGeometry(p0.distanceTo(p1), 3, 3.2), lib.Oak);
      rail.position.copy(p0).add(p1).multiplyScalar(0.5);
      rail.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), p1.clone().sub(p0).normalize());
      rail.castShadow = true;
      g.add(rail);
    }
  }
  // Stone footings at both ends
  for (const end of [-1, 1]) {
    const [x, y] = pt(end * (br.len / 2 + 4), 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(10, 8, br.width + 16), lib.Stone);
    foot.position.copy(to3(x, y)).setY(heightAt(L, x, y) - 2);
    foot.rotation.y = yaw;
    foot.receiveShadow = true;
    g.add(foot);
  }
  return g;
}

// ---------- slope arrows ----------

/**
 * Chevrons painted on the turf wherever it slopes, pointing downhill and drifting slowly that
 * way. Steeper ground gets bigger, brighter arrows; flat ground gets none. One instanced draw call.
 */
function slopeArrows(world: World, outline: [number, number][]): Animated | null {
  const L = world.level;
  if (!L.slopes?.length) return null;
  const walls = world.segs.filter((s) => s.kind !== 'rail');
  const spots: { x: number; y: number; ux: number; uy: number; k: number }[] = [];
  const STEP = 64;
  for (let y = STEP / 2; y < WORLD_H + 200; y += STEP) {
    for (let x = STEP / 2 + ((Math.round(y / STEP) % 2) * STEP) / 2; x < WORLD_W + 200; x += STEP) {
      const [gx, gy] = slopeAt(L, x, y);
      const g = Math.hypot(gx, gy);
      if (g < 0.008) continue;
      if (!pointInPolygon(x, y, outline)) continue;
      if (outline.some(([ax, ay], i) => { const [bx, by] = outline[(i + 1) % outline.length]; const p = closestOnSeg({ ax, ay, bx, by, r: 0 }, x, y); return Math.hypot(x - p.x, y - p.y) < 34; })) continue;
      if (walls.some((s) => { const p = closestOnSeg(s, x, y); return Math.hypot(x - p.x, y - p.y) < s.r + 26; })) continue;
      if ((L.water ?? []).some((z) => inZone(z, x, y) || (z.kind === 'circle' && Math.hypot(x - z.x, y - z.y) < z.r + 40))) continue;
      if (Math.hypot(x - L.cup[0], y - L.cup[1]) < CUP_R + 26 || Math.hypot(x - L.tee[0], y - L.tee[1]) < 30) continue;
      spots.push({ x, y, ux: -gx / g, uy: -gy / g, k: Math.min(1, g / 0.035) });
    }
  }
  if (!spots.length) return null;

  // A chevron pointing along +x, lying flat
  const shape = new THREE.Shape([
    new THREE.Vector2(9, 0), new THREE.Vector2(-3, 9), new THREE.Vector2(-7, 9),
    new THREE.Vector2(3, 0), new THREE.Vector2(-7, -9), new THREE.Vector2(-3, -9),
  ]);
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.name = 'slopeArrows';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const group = new THREE.Group();
  group.add(mesh);
  return {
    group,
    update(_a, time) {
      spots.forEach((s, i) => {
        // Drift 18 units downhill and fade in and out, staggered so the field reads as a flow
        const phase = (time * 0.45 + i * 0.37) % 1;
        const d = (phase - 0.5) * 18;
        const x = s.x + s.ux * d, y = s.y + s.uy * d;
        // Understated: a faint, warm chalk mark rather than a bright sign
        const a = Math.sin(phase * Math.PI) * (0.07 + 0.13 * s.k);
        q.setFromAxisAngle(up, -Math.atan2(s.uy, s.ux));
        const size = 0.62 + 0.3 * s.k;
        sc.set(size, 1, size);
        pos.copy(to3(x, y)).setY(heightAt(L, x, y) + 0.6);
        mesh.setMatrixAt(i, m.compose(pos, q, sc));
        mesh.setColorAt(i, col.setRGB(a, a * 0.97, a * 0.84));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}

// ---------- garden ----------

/** Hedges, flower borders, lamp posts, a stepping-stone path and trees placed around the outline. */
function dressGarden(L: LevelDef, outline: [number, number][], models: Models, group: THREE.Group, anims: Animated[]) {
  const ccw = signedArea(outline) > 0; // in table coordinates (y down)
  const inside = (x: number, y: number) => pointInPolygon(x, y, outline);
  const distToEdge = (x: number, y: number) => {
    let best = Infinity;
    outline.forEach(([ax, ay], i) => {
      const [bx, by] = outline[(i + 1) % outline.length];
      const vx = bx - ax, vy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
      best = Math.min(best, Math.hypot(x - ax - vx * t, y - ay - vy * t));
    });
    return best;
  };
  const outward = (ax: number, ay: number, bx: number, by: number) => {
    const l = Math.hypot(bx - ax, by - ay);
    const nx = (by - ay) / l, ny = -(bx - ax) / l; // right-hand normal
    return ccw ? [nx, ny] : [-nx, -ny];
  };
  const batch = new PieceBatch(models);
  const place = (name: string, x: number, y: number, yaw: number, scale = 1, lift = 0) => {
    const p = to3(x, y);
    batch.add(name, new THREE.Matrix4().makeTranslation(p.x, LAWN_Y + lift, p.z)
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale)));
  };

  // A low hedge follows the outline just outside the edging, leaving a gap at the tee for the path
  const [tx, ty] = L.tee;
  outline.forEach(([ax, ay], i) => {
    const [bx, by] = outline[(i + 1) % outline.length];
    const [nx, ny] = outward(ax, ay, bx, by);
    const len = Math.hypot(bx - ax, by - ay);
    const yaw = -Math.atan2(by - ay, bx - ax);
    for (let d = 30; d < len - 10; d += 58) {
      const x = ax + ((bx - ax) * d) / len + nx * 62, y = ay + ((by - ay) * d) / len + ny * 62;
      if (inside(x, y) || distToEdge(x, y) < 50) continue;
      if (Math.hypot(x - tx, y - ty) < 140) continue;
      place('Hedge', x - ((bx - ax) / len) * 30, y - ((by - ay) / len) * 30, yaw);
    }
  });

  // Flowers in the strip between edging and hedge
  const flowers = new PieceBatch(models);
  const colours: number[] = [];
  const palette = [0xf2c230, 0xf07a8a, 0xffffff, 0xb78be0, 0xff9a3c];
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  outline.forEach(([ax, ay], i) => {
    const [bx, by] = outline[(i + 1) % outline.length];
    const [nx, ny] = outward(ax, ay, bx, by);
    const len = Math.hypot(bx - ax, by - ay);
    for (let d = 8; d < len; d += 15) {
      const off = 24 + rnd() * 16;
      const x = ax + ((bx - ax) * d) / len + nx * off, y = ay + ((by - ay) * d) / len + ny * off;
      if (inside(x, y) || distToEdge(x, y) < 20) continue;
      if (Math.hypot(x - tx, y - ty) < 120) continue;
      const p = to3(x, y);
      const s = 0.8 + rnd() * 0.5;
      flowers.add('Flower', new THREE.Matrix4().makeTranslation(p.x, LAWN_Y, p.z).multiply(new THREE.Matrix4().makeRotationY(rnd() * 6.3)).multiply(new THREE.Matrix4().makeScale(s, s, s)));
      colours.push(palette[Math.floor(rnd() * palette.length)]);
    }
  });
  const fl = flowers.build();
  fl.traverse((o) => {
    if (o instanceof THREE.InstancedMesh && (o.material as THREE.Material).name === 'Petal') {
      const c = new THREE.Color();
      colours.forEach((hex, i) => o.setColorAt(i, c.setHex(hex)));
    }
    o.castShadow = false;
  });
  group.add(fl);

  // Stepping stones leading out from the tee
  const [cx0, cy0] = [(Math.min(...outline.map((p) => p[0])) + Math.max(...outline.map((p) => p[0]))) / 2, (Math.min(...outline.map((p) => p[1])) + Math.max(...outline.map((p) => p[1]))) / 2];
  let dx = tx - cx0, dy = ty - cy0;
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  for (let k = 0, d = 0; k < 9; d += 34) {
    const x = tx + dx * d + (k % 2 ? 6 : -6), y = ty + dy * d;
    if (inside(x, y) || distToEdge(x, y) < 26) continue;
    place(`Paver${(k % 3) + 1}`, x, y, k * 0.7, 1.15, 0.6);
    k++;
  }

  // Lamp posts at a few outward corners
  const lamps: [number, number][] = [];
  outline.forEach(([x, y], i) => {
    const [px, py] = outline[(i + outline.length - 1) % outline.length];
    const [qx, qy] = outline[(i + 1) % outline.length];
    const [n1x, n1y] = outward(px, py, x, y);
    const [n2x, n2y] = outward(x, y, qx, qy);
    let nx = n1x + n2x, ny = n1y + n2y;
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const lx = x + nx * 46, ly = y + ny * 46;
    if (inside(lx, ly) || distToEdge(lx, ly) < 34) return;
    if (lamps.some(([ax, ay]) => Math.hypot(ax - lx, ay - ly) < 300)) return;
    lamps.push([lx, ly]);
  });
  for (const [x, y] of lamps) {
    place('LampPost', x, y, 0);
    const glow = lanternGlow();
    glow.group.position.copy(to3(x, y)).setY(LAWN_Y + 117);
    group.add(glow.group);
    anims.push(glow);
  }

  // Trees well back from the course so the shot camera never ends up inside one
  const b = outline.reduce((acc, [x, y]) => ({ minX: Math.min(acc.minX, x), maxX: Math.max(acc.maxX, x), minY: Math.min(acc.minY, y), maxY: Math.max(acc.maxY, y) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  // Only behind and beside the hole: the menu and whole-hole cameras look from the front
  const treeSpots: [number, number, number][] = [
    [b.minX - 480, b.minY - 300, 1.1], [b.minX + 150, b.minY - 520, 1.25], [(b.minX + b.maxX) / 2 + 80, b.minY - 560, 1.0],
    [b.maxX - 120, b.minY - 500, 1.2], [b.maxX + 470, b.minY - 220, 1.05], [b.maxX + 560, (b.minY + b.maxY) / 2, 1.15],
    [b.minX - 560, (b.minY + b.maxY) / 2 - 60, 1.0],
  ];
  for (const [x, y, s] of treeSpots) place('Tree', x, y, x * 0.01, s);
  // A couple of planters and barrels by the tee path, and rocks under the trees
  place('Planter', tx + dx * 120 + dy * 90, ty + dy * 120 - dx * 90, 0.4, 1);
  place('Barrel', tx + dx * 150 - dy * 95, ty + dy * 150 + dx * 95, 1.1, 1);
  place('Rocks3', b.minX - 420, b.minY - 250, 0.5, 1.6);
  place('Rocks1', b.maxX + 420, b.maxY + 40, 1.7, 1.5);

  const built = batch.build();
  // Hedges sit outside the course; their shadows aren't worth a second pass
  built.traverse((o) => { if (o instanceof THREE.InstancedMesh && o.count > 12) o.castShadow = false; });
  group.add(built);
}

function signedArea(p: [number, number][]) {
  let a = 0;
  p.forEach(([x1, y1], i) => { const [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; });
  return a / 2;
}

function pointInPolygon(x: number, y: number, p: [number, number][]) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- helpers (moved from the old table renderer) ----------

function zoneCentre(z: Zone): [number, number] {
  if (z.kind === 'circle') return [z.x, z.y];
  if (z.kind === 'rect') return [z.x + z.w / 2, z.y + z.h / 2];
  const n = z.pts.length;
  return [z.pts.reduce((a, p) => a + p[0], 0) / n, z.pts.reduce((a, p) => a + p[1], 0) / n];
}

export function roundRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Flat geometry for a zone, grown (or shrunk, if negative) by `grow`. UVs tile every `uvSize` units. */
function zoneGeometry(z: Zone, grow: number, uvSize = 0) {
  let shape: THREE.Shape;
  const [cx0, cy0] = zoneCentre(z);
  if (z.kind === 'circle') {
    shape = new THREE.Shape();
    shape.absarc(0, 0, Math.max(2, z.r + grow), 0, Math.PI * 2, false);
  } else if (z.kind === 'rect') {
    shape = roundRectShape(z.w + grow * 2, z.h + grow * 2, Math.max(4, 26 + grow));
  } else {
    // Push each point out along its averaged edge normal (smooth outlines keep their shape)
    const p = z.pts, n = p.length;
    const ccw = p.reduce((a, [x1, y1], i) => { const [x2, y2] = p[(i + 1) % n]; return a + x1 * y2 - x2 * y1; }, 0) > 0;
    const pts = p.map(([x, y], i) => {
      const [ax, ay] = p[(i + n - 1) % n], [bx, by] = p[(i + 1) % n];
      let tx = bx - ax, ty = by - ay;
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const s = ccw ? 1 : -1;
      return new THREE.Vector2(x - cx0 + ty * grow * s, -(y - cy0 - tx * grow * s));
    });
    shape = new THREE.Shape(pts);
  }
  const g = new THREE.ShapeGeometry(shape, 32).rotateX(-Math.PI / 2);
  if (uvSize) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / uvSize, uv.getY(i) / uvSize);
  }
  const [cx, cy] = zoneCentre(z);
  const c = to3(cx, cy);
  return g.translate(c.x, 0, c.z);
}

function bumperMesh(bp: Bumper) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(bp.r, 36, 22),
    new THREE.MeshPhysicalMaterial({ map: poolBallTexture(bp.color, bp.n), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
  );
  m.position.copy(to3(bp.x, bp.y)).setY(bp.r);
  m.rotation.z = Math.PI / 2; // turn the number disc to face up
  m.rotation.x = 0.35;
  m.castShadow = true;
  return m;
}

export function disposeGroup(g: THREE.Group) {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of list) {
        if (mat.userData.shared) continue;
        const sm = mat as THREE.MeshStandardMaterial;
        sm.map?.dispose(); sm.normalMap?.dispose(); sm.bumpMap?.dispose();
        mat.dispose();
      }
    }
  });
  g.clear();
}

// ---------- procedural textures ----------

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, color = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, rgb: string, maxA: number, size = 1.5) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${rgb},${Math.random() * maxA})`;
    g.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

function poolBallTexture(color: string, n: number) {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#fbf6e8';
    g.beginPath(); g.arc(128, 64, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a1a1a';
    g.font = 'bold 34px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.translate(128, 64);
    g.rotate(Math.PI / 2); // the sphere is turned on its side so the disc faces up
    g.fillText(String(n), 0, 2);
  });
}

function sandTexture() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 128);
    speckle(g, 128, 128, 1400, '140,110,50', 0.45, 1.6);
    speckle(g, 128, 128, 600, '255,250,235', 0.6, 1.2);
  });
}

/** Soft overlapping ripples encoded as a tileable normal map. */
function waterNormal() {
  return canvasTex(128, 128, (g) => {
    const img = g.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const a = (x / 128) * Math.PI * 2, b = (y / 128) * Math.PI * 2;
      const nx = Math.cos(a * 3 + Math.sin(b * 2)) * 0.5 + Math.cos(a * 5 + b * 2) * 0.25;
      const ny = Math.cos(b * 3 + Math.sin(a * 2)) * 0.5 + Math.cos(b * 4 - a) * 0.25;
      const i = (y * 128 + x) * 4;
      img.data[i] = 128 + nx * 90;
      img.data[i + 1] = 128 + ny * 90;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
}

/** Neutral grain; tinted by each material's colour. */
export function woodTexture() {
  return canvasTex(256, 64, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 22; i++) {
      g.strokeStyle = `rgba(120,80,30,${0.06 + Math.random() * 0.14})`;
      g.lineWidth = 0.8 + Math.random() * 1.5;
      g.beginPath();
      const y = Math.random() * 64;
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + 4, 170, y - 4, 256, y + 1);
      g.stroke();
    }
  });
}
