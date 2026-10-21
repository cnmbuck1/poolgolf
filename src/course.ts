// Builds everything specific to one hole: the shaped, sloped fairway, its timber edging,
// obstacles, cup and the garden dressing around it. Purely visual; collision is physics.ts.
import * as THREE from 'three';
import { Animated, brassCup, contactDisc, contactStrip, fairwayMaterial, lilyPadTexture, mats, plainMaterials, rakedSandTextures, stoneWall, turnstile, TURF_TILE, wallRivets, windmill } from './art';
import { Bridge, Bumper, LevelDef, Theme, WORLD_H, WORLD_W, Zone } from './levels';
import { clonePiece, Models, PieceBatch, windmillRig } from './models';
import { lawnMaterial } from './art';
import { kerbMesh, landscape, lawnMesh, makeLawnHeight, outlineDistance, riverStones } from './landscape';
import { ashMaterial, basaltPlain, basaltSwap, coursePalm, courseVolcano, dinosaur, dirtMaterial, jurassicLandscape, lavaSurfaceMaterial, setInkColor, toon, tumbleweed } from './jurassic';
import { arcticLandscape, iceKerb, iceMaterial, igloo, penguin, polarBear, seal, skiRamp, snowfieldMaterial, snowMaterial } from './arctic';
import { desertMaterial, mummy, pillar, portal, quicksandPatch, sandstoneMaterial, stoneDoor, templeKerb, tombLandscape } from './tomb';
import { cannon, circusLandscape, clown, elephant, feltMaterial, sawdustMaterial, stripedKerb, trampoline } from './circus';
import { alien, asteroid, astronaut, fallingMeteor, landingRocket, moonDustMaterial, moonTree, moonKerb, moonRockSwap, regolithMaterial, SPACE_INK, spaceBridgeMaterials, spaceLandscape, voidMaterial } from './space';
import { BALL_R, bridgeEdge, closestOnSeg, CUP_R, fairwayOutline, heightAt, inZone, onBridge, palmR, zoneCentre, slopeAt, SPINNER_R, WALL_R, World, zoneDepth } from './physics';

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
  const jur = L.theme === 'jurassic', space = L.theme === 'space', circus = L.theme === 'circus', tomb = L.theme === 'tomb', arctic = L.theme === 'arctic';
  setInkColor(space ? SPACE_INK : 0x2a1408);
  const rockSwap = jur ? basaltSwap() : space ? moonRockSwap() : arctic ? { Stone: toon(0xb8e2f8, { vertexColors: true }) } : undefined; // ice boulders in the Arctic
  add(fairwayMesh(L, outline, L.theme));
  const lawnH = makeLawnHeight(outline, L.tee[0] * 0.01 + L.cup[1] * 0.003);
  const centre3 = to3((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
  add(lawnMesh(outline, to3, lawnH, jur ? ashMaterial() : space ? regolithMaterial() : circus ? sawdustMaterial() : tomb ? desertMaterial() : arctic ? snowfieldMaterial() : lawnMaterial(), centre3));
  const arrows = slopeArrows(world, outline);
  if (arrows) { add(arrows.group); anims.push(arrows); }

  // ---- Curved timber kerb swept along the outline (its centre line is the physics boundary) ----
  add(kerbMesh(L, outline, to3, jur ? basaltPlain() : space ? moonKerb() : circus ? stripedKerb() : tomb ? templeKerb() : arctic ? iceKerb() : undefined));

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

  // ---- Bunkers: dished sand with rake lines, sitting just above the dipped turf ----
  const [sandMap, sandBump] = rakedSandTextures();
  const sandMat = new THREE.MeshStandardMaterial({ map: sandMap, bumpMap: sandBump, bumpScale: 1.4, roughness: 1, color: jur ? 0x8c8078 : space ? 0xe6e6f4 : circus ? 0xe8b878 : arctic ? 0xffffff : 0xf2e2b6 }); // ash-grey gravel in the canyon, fine moon dust in space
  sandMat.userData.shared = true;
  (L.sand ?? []).forEach((z, i) => {
    const m = add(new THREE.Mesh(zoneSurface(z, (x, y) => heightAt(L, x, y) + 0.35, 1 / 120, i * 0.9), sandMat));
    m.receiveShadow = true;
  });

  // ---- Water: sunken below the turf, with muddy banks, depth tint, lily pads and reeds ----
  const waterMats: THREE.MeshPhysicalMaterial[] = [];
  for (const z of L.water ?? []) {
    // Water sits below the lowest point of its bank (bridges don't count)
    const rim = z.kind === 'poly' ? z.pts : [zoneCentre(z)];
    const y = Math.min(...rim.filter(([x, yy]) => !(L.bridges ?? []).some((br) => onBridge(br, x, yy))).map(([x, yy]) => heightAt(L, x, yy)), 0);
    if (jur) {
      // Lava sits higher in its channel and glows; its crust drifts slowly downstream
      const lava = add(new THREE.Mesh(zoneSurface(z, () => y - 3, 1 / 220, zoneCentre(z)[0] * 0.01), lavaSurfaceMaterial()));
      lava.receiveShadow = false;
      if (!anims.some((x) => x.group === lava)) {
        const map = (lavaSurfaceMaterial() as THREE.MeshStandardMaterial).map!;
        anims.push({ group: lava, update: (_a, t) => map.offset.set(t * 0.012, t * 0.007) });
      }
      continue;
    }
    if (space) {
      // A crack into open space: stars and nebula drifting slowly past far below
      const v = add(new THREE.Mesh(zoneSurface(z, () => y - 6, 1 / 260, zoneCentre(z)[0] * 0.01), voidMaterial()));
      v.receiveShadow = false;
      const map = (voidMaterial() as THREE.MeshBasicMaterial).map!;
      if (!anims.some((x) => (x.group as THREE.Mesh).material === v.material)) anims.push({ group: v, update: (_a, t) => map.offset.set(t * 0.006, -t * 0.004) });
      continue;
    }
    const mat = new THREE.MeshPhysicalMaterial({ color: circus || tomb ? 0x2a7ae0 : arctic ? 0x14405e : 0x2f6470, roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.78, normalMap: waterNormal(), normalScale: new THREE.Vector2(0.4, 0.4), clearcoat: 1 });
    waterMats.push(mat);
    const w = add(new THREE.Mesh(zoneSurface(z, () => y - WATER_LEVEL, 1 / 160), mat));
    w.receiveShadow = true;
    // (the circus dunk tank is just clear blue water)
    if (!circus && !tomb && !arctic && !world.spinners.some((s) => isMill(s) && inZone(z, s.x, s.y))) add(pondLife(L, z, y - WATER_LEVEL));
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
    // In the big top the walls are painted show barriers: blue panels, gold trim, red caps; in the tomb, sandstone
    add(batch.build(arctic ? { Brick: toon(0xbfe4f8), Stone: toon(0xbfe4f8), Mortar: toon(0xffffff), Oak: toon(0xffffff), Brass: toon(0xd8e4ee) } : tomb ? { Brick: toon(0xe0b070), Stone: toon(0xe0b070), Mortar: toon(0xb88850), Oak: toon(0xd8a060), Brass: toon(0xffc83a) } : circus ? { Brick: toon(0x2a6ad8), Stone: toon(0x2a6ad8), Mortar: toon(0xffc83a), Oak: toon(0xd8202e), Brass: toon(0xffe08a) } : undefined)); // walls stand on flat ground
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
      // Stone footing so the island meets the sunken water instead of floating above it
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(40.5, 44, 18, 32, 1, true).translate(0, -9, 0), plainMaterials().Stone);
      foot.receiveShadow = true;
      r.root.add(foot);
      rig = { group: r.root, update: (angle) => r.update(angle) };
    } else if (isMill(s)) {
      const pond = (L.water ?? []).find((z) => z.kind === 'circle' && inZone(z, s.x, s.y));
      rig = windmill(s.len, SPINNER_R, pond && pond.kind === 'circle' ? pond.r : 44);
    } else {
      rig = turnstile(s.len, SPINNER_R, s.arms ?? 2);
    }
    rig.group.position.copy(at(s.x, s.y));
    spinnerAnims[i] = rig;
    add(rig.group);
  });

  // ---- Bridges and boulders ----
  for (const br of L.bridges ?? []) add(bridgeMesh(L, br, L.theme));
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
    add(batch.build(rockSwap));
  } else {
    for (const rk of L.rocks ?? []) {
      const m = add(new THREE.Mesh(new THREE.DodecahedronGeometry(rk.r, 1), plainMaterials().Stone));
      m.position.copy(at(rk.x, rk.y, rk.r * 0.5));
      m.castShadow = m.receiveShadow = true;
    }
  }

  // ---- Garden dressing around the hole ----
  // ---- Tumbleweeds, dinosaurs and volcanoes (poses come from the physics clock) ----
  for (const w of L.tumbleweeds ?? []) { const a = tumbleweed(w, world, L, to3); add(a.group); anims.push(a); }
  for (const d of L.dinos ?? []) { const a = dinosaur(d, world, L, to3); add(a.group); anims.push(a); }
  for (const w of L.asteroids ?? []) { const a = asteroid(w, world, L, to3); add(a.group); anims.push(a); }
  for (const al of L.aliens ?? []) { const a = alien(al, world, L, to3); add(a.group); anims.push(a); }
  for (const s of L.astronauts ?? []) { const a = astronaut(s, world, L, to3); add(a.group); anims.push(a); }
  for (const o of L.rockets ?? []) { const a = landingRocket(o, world, L, to3); add(a.group); anims.push(a); }
  for (const m of L.meteors ?? []) { const a = fallingMeteor(m, world, L, to3); add(a.group); anims.push(a); }
  (L.ice ?? []).forEach((z) => {
    const m = add(new THREE.Mesh(zoneSurface(z, (x, y) => heightAt(L, x, y) + 0.3, 1 / 220, 0, {
      skip: (x, y) => (L.water ?? []).some((w) => inZone(w, x, y)),
      flatNormals: true,
    }), iceMaterial()));
    m.receiveShadow = true;
  });
  for (const sl of L.seals ?? []) { const a = seal(sl, world, L, to3); add(a.group); anims.push(a); }
  for (const rp of L.ramps ?? []) add(skiRamp(rp, L, to3));
  for (const ig of L.igloos ?? []) add(igloo(ig, L, to3));
  for (const pg of L.penguins ?? []) { const a = penguin(pg, world, L, to3); add(a.group); anims.push(a); }
  for (const p of L.portals ?? []) { const a = portal(p, L, to3); add(a.group); anims.push(a); }
  for (const d of L.doors ?? []) { const a = stoneDoor(d, world, L, to3); add(a.group); anims.push(a); }
  for (const m of L.mummies ?? []) { const a = mummy(m, world, L, to3); add(a.group); anims.push(a); }
  (L.pillars ?? []).forEach((pl, i) => {
    add(pillar(pl, L, to3, i));
    const shadow = contactDisc(pl.r + 14);
    shadow.position.copy(to3(pl.x, pl.y)).setY(heightAt(L, pl.x, pl.y) + 0.45);
    add(shadow);
  });
  (L.quicksand ?? []).forEach((z) => {
    // One whirl per patch, centred on it
    const geo = zoneSurface(z, (x, y) => heightAt(L, x, y) + 0.4, 1);
    const [qx, qy] = zoneCentre(z);
    const pos = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute;
    let R = 1;
    for (let k = 0; k < pos.count; k++) R = Math.max(R, Math.hypot(pos.getX(k) + HW - qx, pos.getZ(k) + HH - qy));
    for (let k = 0; k < pos.count; k++) uv.setXY(k, (pos.getX(k) + HW - qx) / (2 * R) + 0.5, (pos.getZ(k) + HH - qy) / (2 * R) + 0.5);
    const a = quicksandPatch(z, geo); add(a.group); anims.push(a);
  });
  for (const tp of L.trampolines ?? []) { const a = trampoline(tp, world, L, to3); add(a.group); anims.push(a); }
  for (const c of L.cannons ?? []) { const a = cannon(c, world, L, to3); add(a.group); anims.push(a); }
  for (const c of L.clowns ?? []) { const a = clown(c, world, L, to3); add(a.group); anims.push(a); }
  for (const el of L.elephants ?? []) {
    const a = arctic ? polarBear(el, L, to3) : elephant(el, L, to3); add(a.group); anims.push(a);
    const shadow = contactDisc((el.r ?? 38) + 14);
    shadow.position.copy(to3(el.x, el.y)).setY(heightAt(L, el.x, el.y) + 0.45);
    add(shadow);
  }
  for (const v of L.volcanoes ?? []) { const a = courseVolcano(v, L, to3); add(a.group); anims.push(a); }
  for (const pm of L.palms ?? []) {
    add(space ? moonTree(pm, L, to3) : coursePalm(pm, L, to3));
    const shadow = contactDisc(palmR(pm) + 16);
    shadow.position.copy(to3(pm.x, pm.y)).setY(heightAt(L, pm.x, pm.y) + 0.45);
    add(shadow);
  }

  if (models) {
    if (circus) group.add(circusLandscape(L, outline, to3, lawnH, anims));
    else if (tomb) group.add(tombLandscape(L, outline, to3, lawnH, anims));
    else if (arctic) group.add(arcticLandscape(L, outline, to3, lawnH, anims));
    else {
      const dress = jur ? jurassicLandscape : space ? spaceLandscape : landscape;
      group.add(dress(L, outline, models, to3, lawnH, anims));
    }
    if (!circus && !tomb && !arctic) group.add(riverStones(L, models, to3, (x, y) => waterDip(L, x, y), rockSwap));
  }

  return { group, spinnerAnims, legacySpinners, anims, waterMats, cupPos, cupPulse, bounds };
}

// ---------- fairway mesh ----------

/** Turf over the outline (with the cup cut out), subdivided so it can follow the slopes. */
function fairwayMesh(L: LevelDef, outline: [number, number][], theme: Theme = 'garden') {
  const jur = theme === 'jurassic', space = theme === 'space', circus = theme === 'circus', tomb = theme === 'tomb', arctic = theme === 'arctic';
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
    const dip = waterDip(L, x, y);
    pos[i * 3 + 1] = hgt - dip;
    uv[i * 2] = x / TURF_TILE;
    uv[i * 2 + 1] = y / TURF_TILE;
    // Mowing stripes (diagonal bands), plus a light lift on rises and shade in dips so slopes read
    // Mowing stripes follow the shape of the hole, rippling out from the edging
    const edge = outlineDistance(outline, x, y).d;
    const band = 0.93 + 0.07 * Math.sin((edge + Math.sin(x * 0.01) * 12) * 0.09);
    // (moon craters get stronger shading so their bowls and rims read on the pale dust)
    const shade = space ? Math.max(0.6, Math.min(1.3, 1 + hgt * 0.06)) : Math.max(0.75, Math.min(1.25, 1 + hgt * 0.035));
    // Banks fade from turf to mud and then to a dark bed as they drop into the water
    const wet = Math.min(1, dip / 5), deep = Math.min(1, dip / WATER_BED);
    let base = band * shade * (1 - 0.35 * deep);
    // Moon craters: a shadowed bowl inside a bright rim
    if (space) for (const c of L.craters ?? []) {
      const u = Math.hypot(x - c.x, y - c.y) / c.r;
      if (u < 1) base *= 0.8 + 0.2 * u * u;
      base *= 1 + 0.16 * Math.exp(-(((u - 1) / 0.12) ** 2));
    }
    if (jur || space) {
      // Scorched, blackened banks down into the lava (or shadowed edges of a crack into space)
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = base * (1 - wet * 0.7);
      continue;
    }
    col[i * 3] = base * (1 - wet * 0.15);
    col[i * 3 + 1] = base * (1 - wet * 0.45);
    col[i * 3 + 2] = base * (1 - wet * 0.55);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  flat.dispose();
  const m = new THREE.Mesh(g, jur ? dirtMaterial() : space ? moonDustMaterial() : circus ? feltMaterial() : tomb ? sandstoneMaterial() : arctic ? snowMaterial() : fairwayMaterial());
  m.receiveShadow = true;
  return m;
}

// ---------- water and sand surfaces ----------

/** Water surface sits this far below the surrounding turf; the bed is deeper still. */
const WATER_LEVEL = 5;
const WATER_BED = 14;
const BANK_EASE = 18;

/** Visual-only dip for the turf inside a water zone (the ball is out as soon as it crosses the edge). */
function waterDip(L: LevelDef, x: number, y: number) {
  let dip = 0;
  for (const z of L.water ?? []) {
    const d = zoneDepth(z, x, y);
    if (d > 0) dip = Math.max(dip, WATER_BED * smoothstep(d / BANK_EASE));
  }
  return dip;
}

const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Split triangles until no edge is longer than `max`, so a flat outline can follow terrain. */
function subdivide(src: Float32Array, max: number) {
  const out: number[] = [];
  const stack: number[][] = [];
  for (let i = 0; i < src.length; i += 9) stack.push(Array.from(src.slice(i, i + 9)));
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

/** A zone's outline as a surface whose height comes from `yAt`; UVs in world units × uvScale, turned by `rot`. */
function zoneSurface(z: Zone, yAt: (x: number, y: number) => number, uvScale: number, rot = 0, opts: { skip?: (x: number, y: number) => boolean; flatNormals?: boolean } = {}) {
  const flat = zoneGeometry(z, 0).toNonIndexed();
  let pos = subdivide(flat.attributes.position.array as Float32Array, 12);
  if (opts.skip) {
    // Cut out triangles whose centre falls where `skip` says (holes in the ice)
    const keep: number[] = [];
    for (let t = 0; t < pos.length; t += 9) {
      const cx = (pos[t] + pos[t + 3] + pos[t + 6]) / 3 + HW, cy = (pos[t + 2] + pos[t + 5] + pos[t + 8]) / 3 + HH;
      if (!opts.skip(cx, cy)) for (let k = 0; k < 9; k++) keep.push(pos[t + k]);
    }
    pos = new Float32Array(keep);
  }
  flat.dispose();
  const uv = new Float32Array((pos.length / 3) * 2);
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i < pos.length / 3; i++) {
    const x = pos[i * 3] + HW, y = pos[i * 3 + 2] + HH;
    pos[i * 3 + 1] = yAt(x, y);
    uv[i * 2] = (x * cr - y * sr) * uvScale;
    uv[i * 2 + 1] = (x * sr + y * cr) * uvScale;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (opts.flatNormals) g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  else g.computeVertexNormals();
  return g;
}

/** Lily pads (some flowering) and clumps of reeds, kept clear of bridges. */
function pondLife(L: LevelDef, z: Zone, waterY: number) {
  const g = new THREE.Group();
  let seed = 5 + Math.round(zoneCentre(z)[0]);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const nearBridge = (x: number, y: number) => (L.bridges ?? []).some((br) => onBridge({ ...br, len: br.len + 30, width: br.width + 40 }, x, y));
  // Sample the zone's bounding box
  const pts = z.kind === 'poly' ? z.pts : z.kind === 'circle' ? [[z.x - z.r, z.y - z.r], [z.x + z.r, z.y + z.r]] : [[z.x, z.y], [z.x + z.w, z.y + z.h]];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pads: [number, number, number][] = [];
  const reeds: [number, number][] = [];
  for (let i = 0; i < 400 && (pads.length < 14 || reeds.length < 40); i++) {
    const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
    const d = zoneDepth(z, x, y);
    if (d <= 0 || nearBridge(x, y)) continue;
    if (d > 22 && pads.length < 14 && pads.every(([px, py]) => Math.hypot(px - x, py - y) > 26)) pads.push([x, y, 7 + rnd() * 6]);
    else if (d > 4 && d < 13 && reeds.length < 40 && rnd() < 0.35) reeds.push([x, y]);
  }
  const padMat = new THREE.MeshStandardMaterial({ map: lilyPadTexture(), alphaTest: 0.5, roughness: 0.55, side: THREE.DoubleSide });
  const padMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), padMat, Math.max(1, pads.length));
  padMesh.count = pads.length;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  pads.forEach(([x, y, r], i) => {
    q.setFromAxisAngle(up, rnd() * 6.28);
    padMesh.setMatrixAt(i, m4.compose(to3(x, y).setY(waterY + 0.25), q, new THREE.Vector3(r, 1, r)));
  });
  padMesh.receiveShadow = true;
  g.add(padMesh);
  const flowers = pads.filter((_, i) => i % 3 === 0);
  if (flowers.length) {
    const fl = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 3.2, 6, 1, true).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0xf6b8c8, roughness: 0.6, side: THREE.DoubleSide }), flowers.length);
    flowers.forEach(([x, y], i) => fl.setMatrixAt(i, m4.makeTranslation(to3(x, y).x + 2, waterY + 2, to3(x, y).z - 1)));
    g.add(fl);
  }
  if (reeds.length) {
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.8, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x5f7f34, roughness: 0.8 }), reeds.length * 3);
    const heads = new THREE.InstancedMesh(new THREE.CapsuleGeometry(1.1, 4, 3, 6), new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.9 }), reeds.length);
    reeds.forEach(([x, y], i) => {
      for (let k = 0; k < 3; k++) {
        const h = 16 + rnd() * 18;
        const p = to3(x + (rnd() - 0.5) * 6, y + (rnd() - 0.5) * 6).setY(waterY - 1);
        q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.25));
        stems.setMatrixAt(i * 3 + k, m4.compose(p, q, new THREE.Vector3(1, h, 1)));
        if (k === 0) heads.setMatrixAt(i, m4.makeTranslation(p.x, p.y + h - 2, p.z));
      }
    });
    stems.castShadow = true;
    g.add(stems, heads);
  }
  return g;
}

// ---------- bridges ----------

/** Humped plank footbridge with posts and handrails, following the deck height used by the physics. */
function bridgeMesh(L: LevelDef, br: Bridge, theme: Theme = 'garden') {
  // In the canyon the bridge is basalt slabs on dark timber; on the moon, metal plates
  const lib = theme === 'jurassic' ? { ...plainMaterials(), Plank: basaltPlain(), Oak: plainMaterials().DarkWood, Timber: plainMaterials().DarkWood }
    : theme === 'space' ? { ...plainMaterials(), ...spaceBridgeMaterials() }
    : theme === 'tomb' ? { ...plainMaterials(), Plank: toon(0xe0b070), Oak: toon(0xb88850), Timber: toon(0xb88850) }
    : theme === 'arctic' ? { ...plainMaterials(), Plank: toon(0xd8f0ff), Oak: toon(0x8ab8d8), Timber: toon(0x8ab8d8) } : plainMaterials();
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


function pointInPolygon(x: number, y: number, p: [number, number][]) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- helpers (moved from the old table renderer) ----------


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
