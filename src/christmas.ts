// North Pole Village, the Christmas course, in the same cartoon toon-and-ink style as the others: frosted
// green fairways in a snowy village at dusk, wrapped-present bumpers, snowmen, candy-cane posts, fir trees
// strung with lights, nutcracker soldiers, rolling snowballs, chimneys you drop down, a toy train and
// Santa's sleigh. Purely visual; positions come from physics.ts.
import * as THREE from 'three';
import { Animated } from './art';
import { Astronaut, Bumper, Chute, LevelDef, Lift, Palm, Portal, Pt, Rock, Tumbleweed } from './levels';
import { astronautAt, BALL_R, CHUTE_CATCH, chuteTrack, heightAt, LIFT_CATCH, palmR, PORTAL_R, trackAt, tumbleweedAt, World } from './physics';
import { cached, canvasTex, eye, organic, part, place, rng, shared, toon, toonRamp, V } from './jurassic';
import { outlineDistance, resample } from './landscape';
import { snowfall } from './arctic';

type ToScene = (x: number, y: number) => THREE.Vector3;

const glow = (color: number) => cached(`m:xglow:${color}`, () => shared(new THREE.MeshBasicMaterial({ color, toneMapped: false })));
const BULBS = [0xff3a3a, 0xffd24a, 0x3aa8ff, 0x4ae07a, 0xff7ad8];

// ---------- materials ----------

/** Frosted green turf with a dusting of snow and the odd sprig of holly. */
export function frostedTurfMaterial() {
  return cached('m:frostturf', () => {
    const r = rng(23);
    const map = canvasTex(512, 512, (g) => {
      g.fillStyle = '#4f8f5a';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(120,180,120,0.22)' : 'rgba(30,70,40,0.22)';
        g.fillRect(r() * 512, r() * 512, 2, 3);
      }
      for (let i = 0; i < 700; i++) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(r() * 512, r() * 512, 2, 2); }
      for (let i = 0; i < 14; i++) {
        const x = r() * 512, y = r() * 512, a = r() * 6;
        g.save(); g.translate(x, y); g.rotate(a);
        g.fillStyle = '#1f6a34';
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 7, 0, 8, 3.5, s * 0.4, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#e8202e';
        for (const [bx, by] of [[0, -2], [-2.5, 2], [2.5, 2]]) { g.beginPath(); g.arc(bx, by, 2.4, 0, Math.PI * 2); g.fill(); }
        g.restore();
      }
    });
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp(), vertexColors: true }));
  });
}

/** The curb: red, white and green stripes. */
export function christmasKerb() {
  return cached('m:xmaskerb', () => {
    const t = canvasTex(192, 32, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 192, 32);
      g.fillStyle = '#d8202e'; g.fillRect(0, 0, 48, 32);
      g.fillStyle = '#1f8a4a'; g.fillRect(96, 0, 48, 32);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 26, 192, 6);
    });
    return shared(new THREE.MeshToonMaterial({ map: t, gradientMap: toonRamp() }));
  });
}

/** Diagonal red-and-white candy-cane stripes. */
function caneStripes() {
  return cached('m:xcane', () => {
    const t = canvasTex(64, 64, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#e8203a';
      for (let k = -1; k < 3; k++) { g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32 + 14, 0); g.lineTo(k * 32 + 14 + 64, 64); g.lineTo(k * 32 + 64, 64); g.fill(); }
    });
    return shared(new THREE.MeshToonMaterial({ map: t, gradientMap: toonRamp() }));
  });
}

/** Red brick with white mortar (chimneys, houses). */
export function brickMaterial() {
  return cached('m:xbrick', () => {
    const r = rng(9);
    const map = canvasTex(128, 128, (g) => {
      g.fillStyle = '#f0e8e0'; g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < 128; x += 32) {
        g.fillStyle = ['#b8402e', '#a83426', '#c44a34'][Math.floor(r() * 3)];
        g.fillRect(x + 1.5, y + 1.5, 29, 13);
      }
    }, true, 1);
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp() }));
  });
}

/** Soft drifts of snow (the course's "sand"): bright white with blue hollows. */
export function snowdriftMaterial() {
  return cached('m:snowdrift', () => {
    const r = rng(37);
    const map = canvasTex(256, 256, (g) => {
      g.fillStyle = '#f4f8ff'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 40; i++) { g.fillStyle = r() > 0.5 ? 'rgba(180,205,240,0.35)' : 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(r() * 256, r() * 256, 12 + r() * 30, 6 + r() * 12, r() * 3, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 200; i++) { g.fillStyle = 'rgba(150,200,255,0.7)'; g.fillRect(r() * 256, r() * 256, 1.5, 1.5); }
    }, true, 2);
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp() }));
  });
}

// ---------- presents (bumpers) ----------

/** A wrapped present with a ribbon round it and a bow on top, in the bumper's colour. */
export function present(bp: Bumper, L: LevelDef, toScene: ToScene) {
  const g = new THREE.Group();
  const w = bp.r * 1.55, h = bp.r * 1.25;
  const paper = new THREE.Color(bp.color).lerp(new THREE.Color(0xffffff), 0.12).getHex();
  const ribbon = bp.n === 1 || bp.n === 5 ? 0xd8202e : 0xffd84a;
  g.add(part(new THREE.BoxGeometry(w, h, w).translate(0, h / 2, 0), toon(paper), 1.1));
  // A lid, a touch wider, then the ribbon both ways
  place(g, part(new THREE.BoxGeometry(w * 1.08, h * 0.2, w * 1.08), toon(paper), 0.8), 0, h - h * 0.08, 0);
  const rib = toon(ribbon);
  place(g, part(new THREE.BoxGeometry(w * 1.1, h * 1.04, w * 0.18).translate(0, h * 0.52, 0), rib, 0, false), 0, 0, 0);
  place(g, part(new THREE.BoxGeometry(w * 0.18, h * 1.04, w * 1.1).translate(0, h * 0.52, 0), rib, 0, false), 0, 0, 0);
  for (const s of [-1, 1]) {
    const loop = part(new THREE.TorusGeometry(w * 0.16, w * 0.06, 6, 14), rib, 0.4);
    loop.position.set(s * w * 0.15, h + w * 0.16, 0);
    loop.rotation.set(0, 0, s * 0.6);
    g.add(loop);
  }
  g.position.copy(toScene(bp.x, bp.y)).setY(heightAt(L, bp.x, bp.y));
  g.rotation.y = ((bp.x * 7 + bp.y * 3) % 90) * (Math.PI / 180);
  return g;
}

// ---------- snowmen (rocks) ----------

export function snowman(rk: Rock, L: LevelDef, toScene: ToScene, i: number) {
  const g = new THREE.Group();
  const R = rk.r, snow = toon(0xffffff);
  place(g, part(new THREE.SphereGeometry(R, 20, 14).scale(1, 0.9, 1), snow, 1.2), 0, R * 0.8, 0);
  place(g, part(new THREE.SphereGeometry(R * 0.72, 18, 12), snow, 1.1), 0, R * 2.05, 0);
  const head = new THREE.Group(); head.position.set(0, R * 2.95, 0); g.add(head);
  head.add(part(new THREE.SphereGeometry(R * 0.5, 16, 12), snow, 1));
  // Carrot nose and coal eyes on the +z side, then the whole snowman turns to face the tee
  place(head, part(new THREE.ConeGeometry(R * 0.1, R * 0.55, 8).rotateX(Math.PI / 2), toon(0xff8a2a), 0.4), 0, 0, R * 0.7);
  for (const s of [-1, 1]) place(head, new THREE.Mesh(new THREE.SphereGeometry(R * 0.07, 8, 6), toon(0x1a1a1a)), s * R * 0.18, R * 0.15, R * 0.44);
  for (let k = 0; k < 3; k++) place(g, new THREE.Mesh(new THREE.SphereGeometry(R * 0.08, 8, 6), toon(0x1a1a1a)), 0, R * (1.8 + k * 0.25), R * 0.68 - Math.abs(k - 1) * R * 0.03);
  const scarf = [0xd8202e, 0x1f8a4a, 0x2a6ad8][i % 3];
  place(g, part(new THREE.TorusGeometry(R * 0.5, R * 0.12, 8, 18).rotateX(Math.PI / 2), toon(scarf), 0.6), 0, R * 2.6, 0);
  place(g, part(new THREE.BoxGeometry(R * 0.22, R * 0.6, R * 0.08), toon(scarf), 0.4), R * 0.3, R * 2.3, R * 0.42);
  // A top hat
  place(head, part(new THREE.CylinderGeometry(R * 0.55, R * 0.55, R * 0.08, 16), toon(0x1a1a24), 0.6), 0, R * 0.42, 0);
  place(head, part(new THREE.CylinderGeometry(R * 0.34, R * 0.36, R * 0.5, 16).translate(0, R * 0.25, 0), toon(0x1a1a24), 0.8), 0, R * 0.42, 0);
  // Twig arms
  for (const s of [-1, 1]) place(g, part(organic([V(0, 0), V(s * R * 0.6, R * 0.3), V(s * R * 1.1, R * 0.55)], [R * 0.06, R * 0.05, R * 0.03], 5, 6), toon(0x5a3a22), 0.3), s * R * 0.6, R * 2.1, 0);
  g.position.copy(toScene(rk.x, rk.y)).setY(heightAt(L, rk.x, rk.y));
  g.rotation.y = Math.atan2(L.tee[0] - rk.x, L.tee[1] - rk.y);
  return g;
}

// ---------- rolling snowballs (tumbleweeds) ----------

export function snowball(w: Tumbleweed, world: World, L: LevelDef, toScene: ToScene): Animated {
  const R = w.r ?? 15;
  // Lumpy, packed and a little blue in the shade, so it never looks like the cue ball
  const map = cached('t:snowball', () => canvasTex(128, 64, (g) => {
    const r = rng(3);
    g.fillStyle = '#d4e4fa'; g.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 60; i++) { g.fillStyle = r() > 0.5 ? 'rgba(120,160,220,0.55)' : 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(r() * 128, r() * 64, 2 + r() * 6, 0, Math.PI * 2); g.fill(); }
  }));
  const geo = new THREE.IcosahedronGeometry(R, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute, rr = rng(Math.round(w.a[0] + w.a[1] * 3));
  const bump = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`;
    if (!bump.has(key)) bump.set(key, 0.9 + rr() * 0.16);
    const k = bump.get(key)!;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const ball = part(geo, new THREE.MeshToonMaterial({ map, gradientMap: toonRamp() }), 1.2);
  const root = new THREE.Group();
  root.add(ball);
  const q = new THREE.Quaternion();
  let last = world.time;
  return {
    group: root,
    update() {
      const p = tumbleweedAt(w, world.time);
      const dt = Math.max(0, world.time - last);
      last = world.time;
      const sp = Math.hypot(p.vx, p.vy);
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y) + R * 0.92);
      if (sp > 0.1) {
        q.setFromAxisAngle(new THREE.Vector3(p.vy / sp, 0, -p.vx / sp), (sp * dt) / R);
        ball.quaternion.premultiply(q);
      }
    },
  };
}

// ---------- candy-cane posts (pillars) ----------

export function candyCanePost(pl: Rock, L: LevelDef, toScene: ToScene) {
  const R = pl.r, h = 56;
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 6; k++) pts.push(V(0, (k / 6) * h, 0));
  for (let k = 1; k <= 8; k++) { const a = (k / 8) * Math.PI; pts.push(V(h * 0.16 * (1 - Math.cos(a)), h + Math.sin(a) * h * 0.16, 0)); }
  const m = part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, R, 10), caneStripes(), 1.2);
  const g = new THREE.Group();
  g.add(m);
  g.position.copy(toScene(pl.x, pl.y)).setY(heightAt(L, pl.x, pl.y));
  g.rotation.y = Math.atan2(L.tee[0] - pl.x, L.tee[1] - pl.y) - Math.PI / 2;
  return g;
}

// ---------- fir trees (palms) ----------

/** A snowy fir tree hung with coloured lights and a gold star on top. */
export function firTree(pm: Palm, L: LevelDef, toScene: ToScene, seed = 0) {
  const g = new THREE.Group();
  const r = rng(Math.round(pm.x * 3 + pm.y * 7 + seed));
  const h = pm.height ?? 100, base = palmR(pm);
  g.add(part(new THREE.CylinderGeometry(base * 0.45, base * 0.55, h * 0.22, 8).translate(0, h * 0.11, 0), toon(0x6a4a2a), 0.8));
  for (let i = 0; i < 3; i++) {
    const y = h * (0.18 + i * 0.22), w = h * (0.34 - i * 0.075);
    place(g, part(new THREE.ConeGeometry(w, h * 0.38, 10), toon(0x1f7a46), 1), 0, y + h * 0.19, 0);
    place(g, part(new THREE.ConeGeometry(w * 0.55, h * 0.14, 10), toon(0xffffff), 0, false), 0, y + h * 0.33, 0);
    // A ring of bulbs round the bottom of each layer
    const n = 7 - i;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.5;
      place(g, new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), glow(BULBS[(k + i) % BULBS.length])), Math.cos(a) * w * 0.82, y + h * 0.04, Math.sin(a) * w * 0.82);
    }
  }
  const star = new THREE.Shape();
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + Math.PI / 2, rr = k % 2 ? 3.6 : 8; if (k) star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  const st = new THREE.Mesh(new THREE.ExtrudeGeometry(star, { depth: 2, bevelEnabled: false }).translate(0, 0, -1), glow(0xffd84a));
  st.position.y = h * 0.86 + 8;
  g.add(st);
  g.position.copy(toScene(pm.x, pm.y)).setY(heightAt(L, pm.x, pm.y));
  g.rotation.y = r() * 6;
  return g;
}

// ---------- nutcracker soldiers ----------

/** A nutcracker soldier in a red coat and tall black hat, marching between two points. */
export function nutcracker(s: Astronaut, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const red = toon(0xd8202e), blue = toon(0x2a3a8a), black = toon(0x16161e), gold = toon(0xffc83a), skin = toon(0xf4c8a0), white = toon(0xffffff);
  // Legs (blue trousers, black boots), pivoting at the hip
  const legs: THREE.Group[] = [];
  for (const z of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0, 16, z * 3.6); body.add(leg);
    leg.add(part(new THREE.CylinderGeometry(2.6, 2.4, 11, 8).translate(0, -5.5, 0), blue, 0.6));
    leg.add(part(new THREE.CylinderGeometry(2.8, 3, 6, 8).translate(0, -13, 0), black, 0.6));
    legs.push(leg);
  }
  body.add(part(new THREE.CylinderGeometry(6.4, 6, 14, 12).translate(0, 23, 0), red, 1));
  place(body, part(new THREE.CylinderGeometry(6.6, 6.6, 2.2, 12), black, 0.4), 0, 17, 0);
  place(body, part(new THREE.BoxGeometry(2.6, 1.6, 2.6), gold, 0.2), 6.3, 17, 0);
  for (let k = 0; k < 3; k++) place(body, new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 5), gold), 6.2, 21 + k * 3.4, 0);
  for (const z of [-1, 1]) place(body, part(new THREE.CylinderGeometry(2.6, 2.6, 1.4, 10).rotateX(Math.PI / 2), gold, 0.3), 0, 29.5, z * 6.6);
  // Arms swinging at the shoulders
  const arms: THREE.Group[] = [];
  for (const z of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(0, 29, z * 7.4); body.add(arm);
    arm.add(part(new THREE.CylinderGeometry(1.8, 1.8, 11, 8).translate(0, -5.5, 0), red, 0.5));
    place(arm, new THREE.Mesh(new THREE.SphereGeometry(1.9, 8, 6), white), 0, -11.5, 0);
    arms.push(arm);
  }
  // Head: a big square jaw, white beard, painted eyes and a tall black busby with a gold plume
  const head = new THREE.Group(); head.position.set(0, 36, 0); body.add(head);
  head.add(part(new THREE.CylinderGeometry(4.8, 5, 8, 12), skin, 0.8));
  place(head, part(new THREE.BoxGeometry(3, 3.6, 8), white, 0.4), 4, -3, 0);
  place(head, part(new THREE.BoxGeometry(2.6, 1, 6), white, 0.2), 4.8, 0, 0);
  eye(head, 4.3, 1.8, 1.9, 1.1, 1);
  eye(head, 4.3, 1.8, -1.9, 1.1, -1);
  place(head, new THREE.Mesh(new THREE.SphereGeometry(1, 6, 5), toon(0xff6a6a)), 5, -0.2, 2.6);
  place(head, new THREE.Mesh(new THREE.SphereGeometry(1, 6, 5), toon(0xff6a6a)), 5, -0.2, -2.6);
  head.add(part(new THREE.CylinderGeometry(5, 5.2, 11, 12).translate(0, 9.5, 0), black, 0.8));
  place(head, part(new THREE.SphereGeometry(1.8, 8, 6).scale(1, 1.8, 1), gold, 0.3), 0, 16.5, 0);
  place(head, part(new THREE.TorusGeometry(5.1, 0.7, 6, 16).rotateX(Math.PI / 2), gold, 0.2), 0, 4.5, 0);
  const seed = Math.round(s.a[0] + s.a[1]);
  root.scale.setScalar(1.15);
  return {
    group: root,
    update() {
      const p = astronautAt(s, world.time);
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y));
      const moving = Math.hypot(p.vx, p.vy) > 2;
      if (moving) body.rotation.y = -Math.atan2(p.vy, p.vx);
      // A stiff wooden march: legs and arms swing in step, with a little bob
      const w = moving ? Math.sin(world.time * 8 + seed) : 0;
      legs.forEach((l, k) => (l.rotation.z = (k ? -1 : 1) * w * 0.5));
      arms.forEach((a, k) => (a.rotation.z = (k ? 1 : -1) * w * 0.45));
      body.position.y = moving ? Math.abs(w) * 1.2 : 0;
    },
  };
}

// ---------- chimneys (portals) ----------

/** A squat brick chimney with snow on its rim; roll in at one and out of the other. */
function chimneyAt(x: number, y: number, L: LevelDef, toScene: ToScene, exit: boolean, yaw: number) {
  const root = new THREE.Group();
  root.position.copy(toScene(x, y)).setY(heightAt(L, x, y));
  root.rotation.y = yaw;
  const out = PORTAL_R * 1.25, inn = PORTAL_R * 0.95, h = 8;
  const s = new THREE.Shape();
  s.moveTo(-out, -out); s.lineTo(out, -out); s.lineTo(out, out); s.lineTo(-out, out); s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-inn, -inn); hole.lineTo(-inn, inn); hole.lineTo(inn, inn); hole.lineTo(inn, -inn); hole.closePath();
  s.holes.push(hole);
  root.add(part(new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2), brickMaterial(), 1));
  // Snow piled on the rim
  const cap = part(new THREE.ExtrudeGeometry(s, { depth: 2.4, bevelEnabled: true, bevelSize: 1.2, bevelThickness: 1, bevelSegments: 2 }).rotateX(-Math.PI / 2), toon(0xffffff), 0.6, false);
  cap.position.y = h;
  root.add(cap);
  // The fire glowing down inside
  const pit = new THREE.Mesh(new THREE.PlaneGeometry(inn * 2, inn * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: exit ? 0xffb04a : 0xff6a1a, toneMapped: false }));
  pit.position.y = 0.6;
  root.add(pit);
  if (exit) {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(5, 12, 3).rotateZ(-Math.PI / 2), glow(0xffd84a));
    arrow.position.set(out + 12, 3, 0);
    root.add(arrow);
  }
  // A few puffs of smoke curling up
  const puffs: THREE.Mesh[] = [];
  const smoke = new THREE.MeshBasicMaterial({ color: 0xe8e8f0, transparent: true, opacity: 0.6, depthWrite: false });
  for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), smoke.clone()); root.add(m); puffs.push(m); }
  return { root, pit, puffs };
}

export function chimneys(p: Portal, L: LevelDef, toScene: ToScene): Animated {
  const g = new THREE.Group();
  const exitYaw = p.exit != null ? (-p.exit * Math.PI) / 180 : -Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]);
  const a = chimneyAt(p.a[0], p.a[1], L, toScene, false, -Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]));
  const b = chimneyAt(p.b[0], p.b[1], L, toScene, true, exitYaw);
  g.add(a.root, b.root);
  return {
    group: g,
    update(_x, t) {
      (a.pit.material as THREE.MeshBasicMaterial).color.setHSL(0.06, 1, 0.5 + 0.08 * Math.sin(t * 9) * Math.sin(t * 5.3));
      (b.pit.material as THREE.MeshBasicMaterial).color.setHSL(0.09, 1, 0.55 + 0.08 * Math.sin(t * 8 + 1));
      for (const c of [a, b]) c.puffs.forEach((m, k) => {
        const u = ((t * 0.35 + k / c.puffs.length) % 1);
        m.position.set(Math.sin(u * 5 + k) * 4, 12 + u * 50, Math.cos(u * 4 + k) * 3);
        m.scale.setScalar(0.6 + u * 1.4);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - u);
      });
    },
  };
}

// ---------- the toy train (chutes) ----------

function locomotive() {
  const g = new THREE.Group();
  const red = toon(0xd8202e), green = toon(0x1f7a46), black = toon(0x1a1a24), gold = toon(0xffc83a);
  // Boiler pointing along +x, the cab behind, a funnel and a cowcatcher
  g.add(part(new THREE.BoxGeometry(30, 4, 14).translate(0, 5, 0), black, 0.6));
  g.add(part(new THREE.CylinderGeometry(6, 6, 20, 14).rotateZ(Math.PI / 2).translate(5, 13, 0), red, 1));
  place(g, part(new THREE.TorusGeometry(6.1, 0.7, 6, 16).rotateY(Math.PI / 2), gold, 0.2), 10, 13, 0);
  place(g, part(new THREE.CylinderGeometry(6.2, 6.2, 1.2, 14).rotateZ(Math.PI / 2), gold, 0.2), 15.5, 13, 0);
  g.add(part(new THREE.BoxGeometry(11, 15, 14).translate(-10, 14.5, 0), green, 1));
  g.add(part(new THREE.BoxGeometry(13, 2, 16).translate(-10, 23, 0), red, 0.6));
  for (const z of [-7.05, 7.05]) place(g, new THREE.Mesh(new THREE.PlaneGeometry(5, 5), glow(0xffe08a)), -10, 16, z).rotation.y = z > 0 ? 0 : Math.PI;
  g.add(part(new THREE.CylinderGeometry(3.6, 2.4, 9, 10).translate(10, 23, 0), black, 0.6));
  g.add(part(new THREE.ConeGeometry(6, 5, 4).rotateZ(Math.PI / 2).rotateX(Math.PI / 4).translate(18, 5, 0), gold, 0.4));
  place(g, new THREE.Mesh(new THREE.SphereGeometry(2, 8, 6), glow(0xfff4c0)), 16, 17, 0);
  const wheels: THREE.Mesh[] = [];
  for (const x of [-10, 0, 10]) for (const z of [-7.5, 7.5]) {
    const w = part(new THREE.CylinderGeometry(4, 4, 2, 14).rotateX(Math.PI / 2), red, 0.4) as THREE.Mesh;
    w.position.set(x, 4, z); g.add(w); wheels.push(w);
  }
  return { g, wheels };
}

function wagon() {
  const g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(22, 3, 14).translate(0, 5, 0), toon(0x1f7a46), 0.6));
  // Low sides so the ball sits in it, and a little gift on board
  for (const z of [-6.5, 6.5]) g.add(part(new THREE.BoxGeometry(22, 4, 1.2).translate(0, 8, z), toon(0xffc83a), 0.3));
  const wheels: THREE.Mesh[] = [];
  for (const x of [-7, 7]) for (const z of [-7.5, 7.5]) {
    const w = part(new THREE.CylinderGeometry(3.4, 3.4, 2, 12).rotateX(Math.PI / 2), toon(0xd8202e), 0.3) as THREE.Mesh;
    w.position.set(x, 3.4, z); g.add(w); wheels.push(w);
  }
  return { g, wheels };
}

/**
 * A toy railway: rails and sleepers along the chute's path, a station at its start where the train
 * waits, and the train itself, which carries the ball to the end of the line and then backs home.
 */
export function toyTrain(L: LevelDef, c: Chute, world: World, toScene: ToScene): Animated {
  const g = new THREE.Group();
  const tr = chuteTrack(L, c, false);
  const at = (s: number) => { const p = trackAt(tr, Math.max(0, Math.min(tr.len, s))); return { v: toScene(p.x, p.y).setY(p.z), dx: p.dx, dy: p.dy }; };
  // Rails
  const railMat = toon(0x9aa0b0);
  for (const side of [-7, 7]) {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= tr.len; s += 8) { const p = at(s); pts.push(p.v.clone().add(V(-p.dy * side, 2.2, p.dx * side))); }
    g.add(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 1.1, 6), railMat, 0.2, false));
  }
  // Sleepers
  const sleeper = new THREE.BoxGeometry(5, 1.6, 20);
  const n = Math.floor(tr.len / 12);
  const sl = new THREE.InstancedMesh(sleeper, toon(0x6a4226), n + 1);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V(1, 1, 1);
  for (let k = 0; k <= n; k++) {
    const p = at(k * 12);
    q.setFromAxisAngle(V(0, 1, 0), -Math.atan2(p.dy, p.dx));
    sl.setMatrixAt(k, m4.compose(p.v.clone().setY(p.v.y + 0.8), q, one));
  }
  sl.receiveShadow = true;
  g.add(sl);
  // The station: a red ring where the ball boards, a platform and a sign post
  const [mx, my] = c.path[0];
  const stop = toScene(mx, my).setY(heightAt(L, mx, my));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(CHUTE_CATCH + 2, 1.6, 6, 36).rotateX(Math.PI / 2), glow(0xffd84a));
  ring.position.copy(stop).setY(stop.y + 1);
  g.add(ring);
  const end = at(tr.len);
  for (const p of [stop, end.v]) {
    const post = new THREE.Group();
    post.add(part(new THREE.CylinderGeometry(1.2, 1.2, 30, 6).translate(0, 15, 0), caneStripes(), 0.3));
    post.add(part(new THREE.SphereGeometry(3.4, 10, 8).translate(0, 32, 0), glow(0xffd84a), 0));
    post.position.copy(p).add(V(0, 0, -CHUTE_CATCH - 10));
    g.add(post);
  }
  const loco = locomotive(), car = wagon();
  g.add(loco.g, car.g);
  let trainS = 0, wait = 0, last = world.time;
  const pose = (obj: THREE.Object3D, s: number) => { const p = at(s); obj.position.copy(p.v); obj.rotation.y = -Math.atan2(p.dy, p.dx); };
  return {
    group: g,
    update(_a, t) {
      const dt = Math.max(0, world.time - last);
      last = world.time;
      const prev = trainS;
      const riding = world.ride && world.ride.track === tr;
      if (riding) { trainS = world.ride!.s; wait = 1.5; }
      else if (wait > 0) wait -= dt;
      else trainS = Math.max(0, trainS - 220 * dt); // back to the station
      pose(car.g, trainS);
      pose(loco.g, trainS + 26);
      const roll = (trainS - prev) / 4;
      for (const w of [...loco.wheels, ...car.wheels]) w.rotation.z -= roll;
      (ring.material as THREE.MeshBasicMaterial).color.setHSL(0.13, 1, 0.5 + 0.12 * Math.sin(t * 4));
    },
  };
}

// ---------- Santa's sleigh (lifts) ----------

function reindeer(nose: boolean) {
  const g = new THREE.Group();
  const fur = toon(0x8a5a32);
  g.add(part(new THREE.CapsuleGeometry(4, 10, 4, 10).rotateZ(Math.PI / 2), fur, 0.8));
  for (const x of [-5, 5]) for (const z of [-2.5, 2.5]) g.add(part(new THREE.CylinderGeometry(1, 0.9, 9, 6).translate(x, -6, z), fur, 0.3));
  const head = new THREE.Group(); head.position.set(9, 6, 0); g.add(head);
  head.add(part(new THREE.CylinderGeometry(1.8, 2.2, 7, 8).rotateZ(-0.6), fur, 0.4));
  place(head, part(new THREE.SphereGeometry(3, 10, 8).scale(1.4, 1, 1), fur, 0.6), 3, 4, 0);
  place(head, new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), nose ? glow(0xff2a2a) : toon(0x1a1a1a)), 7.4, 3.6, 0);
  for (const z of [-1, 1]) {
    eye(head, 4.6, 5.4, z * 1.8, 0.9, z);
    place(head, part(organic([V(0, 0, 0), V(-1, 5, z * 2), V(-3, 8, z * 4)], [0.7, 0.6, 0.4], 5, 6), toon(0xe8d0a0), 0.2), 1.5, 6.5, z * 1.2);
  }
  return g;
}

function sleigh() {
  const g = new THREE.Group();
  const red = toon(0xd8202e), gold = toon(0xffc83a);
  // The body, open-topped, on curled gold runners; the ball rides in the back
  g.add(part(new THREE.BoxGeometry(26, 10, 16).translate(-4, 9, 0), red, 1));
  g.add(part(new THREE.BoxGeometry(8, 8, 16).translate(-14, 17, 0), red, 0.8));
  for (const z of [-8.5, 8.5]) {
    const pts = [V(-20, 2, z), V(0, 2, z), V(12, 2, z), V(16, 6, z), V(13, 10, z)];
    g.add(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 1.2, 6), gold, 0.2));
    place(g, part(new THREE.BoxGeometry(24, 1.6, 1.2), gold, 0), -4, 13.5, z);
  }
  // Santa: red suit, white beard and trim, a hat with a pompom
  const santa = new THREE.Group(); santa.position.set(-6, 12, 0); g.add(santa);
  santa.add(part(new THREE.SphereGeometry(7, 14, 10).scale(1, 1.1, 1), red, 1).translateY(4));
  place(santa, part(new THREE.TorusGeometry(6.5, 1.3, 6, 16).rotateX(Math.PI / 2), toon(0x1a1a1a), 0.3), 0, 3, 0);
  const head = new THREE.Group(); head.position.set(1, 14, 0); santa.add(head);
  head.add(part(new THREE.SphereGeometry(4, 12, 10), toon(0xf4c8a0), 0.8));
  place(head, part(new THREE.SphereGeometry(4.4, 12, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55).rotateZ(-0.5), toon(0xffffff), 0.6), 1, -1, 0);
  for (const z of [-1, 1]) eye(head, 3.4, 1.2, z * 1.5, 0.8, z);
  place(head, part(new THREE.ConeGeometry(4.2, 8, 12).rotateZ(-0.5), red, 0.6), -1.2, 5.5, 0);
  place(head, part(new THREE.TorusGeometry(4.1, 1.1, 6, 14).rotateX(Math.PI / 2), toon(0xffffff), 0.3), 0, 2.6, 0);
  place(head, part(new THREE.SphereGeometry(1.6, 8, 6), toon(0xffffff), 0.2), -4.2, 8.4, 0);
  // A sack of toys behind him
  place(g, part(new THREE.SphereGeometry(6, 12, 10).scale(1, 1.1, 1), toon(0x8a6a3a), 0.8), -16, 22, 0);
  // Two reindeer in harness out front, Rudolph leading
  const team = new THREE.Group(); g.add(team);
  const r1 = reindeer(false), r2 = reindeer(true);
  r1.position.set(28, 12, 0); r2.position.set(48, 14, 0);
  team.add(r1, r2);
  for (const z of [-3, 3]) {
    const rein = part(new THREE.CylinderGeometry(0.4, 0.4, 44, 4).rotateZ(Math.PI / 2 - 0.08).translate(24, 16, z), toon(0x5a3a22), 0, false);
    g.add(rein);
  }
  return { g, team };
}

/** Santa circling over his landing pad; roll onto it and the sleigh flies the ball across the hole. */
export function santaSleigh(lf: Lift, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const base = toScene(lf.x, lf.y).setY(heightAt(L, lf.x, lf.y));
  root.position.copy(base);
  // The pad: a snowy circle ringed in red and gold, with lights round it
  const pad = new THREE.Group();
  pad.add(part(new THREE.CylinderGeometry(LIFT_CATCH + 8, LIFT_CATCH + 10, 1.6, 32), toon(0xf4f8ff), 0.6, false));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(LIFT_CATCH + 2, 1.6, 6, 40).rotateX(Math.PI / 2), glow(0xd8202e));
  ring.position.y = 1.2;
  pad.add(ring);
  const bulbs: THREE.Mesh[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), new THREE.MeshBasicMaterial({ color: BULBS[k % BULBS.length], toneMapped: false }));
    b.position.set(Math.cos(a) * (LIFT_CATCH - 6), 1.6, Math.sin(a) * (LIFT_CATCH - 6));
    pad.add(b); bulbs.push(b);
  }
  root.add(pad);
  const ride = sleigh();
  const rider = ride.g;
  rider.scale.setScalar(0.85);
  root.add(rider);
  let phase: 'idle' | 'flying' | 'away' = 'idle', awayT = 0;
  const last = new THREE.Vector3(), dir = new THREE.Vector3(1, 0, 0);
  const seed = lf.x * 0.01;
  return {
    group: root,
    update(_a, t) {
      bulbs.forEach((b, k) => { (b.material as THREE.MeshBasicMaterial).color.setHex(BULBS[(k + Math.floor(t * 3)) % BULBS.length]); });
      ride.team.position.y = Math.sin(t * 6) * 1.5;
      const flying = world.air?.src === lf;
      if (flying) {
        // The ball rides in the back of the sleigh
        const b = world.ball;
        const p = toScene(b.x, b.y).setY(heightAt(L, b.x, b.y) + BALL_R + (b.z ?? 0)).sub(base);
        if (phase !== 'flying') { phase = 'flying'; last.copy(p); }
        const d = p.clone().sub(last);
        if (d.lengthSq() > 0.01) dir.lerp(d.normalize(), 0.2).normalize();
        last.copy(p);
        rider.rotation.set(0, -Math.atan2(dir.z, dir.x), Math.asin(Math.max(-0.6, Math.min(0.6, dir.y))));
        rider.position.copy(p).addScaledVector(dir, 12).setY(p.y - 14);
      } else if (phase === 'flying') { phase = 'away'; awayT = 0; }
      if (phase === 'away') {
        // Up and away over the rooftops, then back round to the pad
        awayT += 1 / 60;
        rider.position.addScaledVector(dir, 6).y += 3;
        if (awayT > 2.5) phase = 'idle';
      }
      if (phase === 'idle') {
        const a = t * 0.8 + seed;
        rider.position.set(Math.cos(a) * 34, 40 + Math.sin(t * 2) * 4, Math.sin(a) * 34);
        rider.rotation.set(0, -a - Math.PI / 2, 0.08 * Math.sin(t * 2));
      }
    },
  };
}

// ---------- the village around the course ----------

function house(seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  const w = 140 + r() * 80, d = 110 + r() * 40, h = 90 + r() * 50;
  const wall = toon([0xd8b890, 0xc8584a, 0x8ab0c8, 0xe8d8b0, 0x6a9a6a][seed % 5]);
  g.add(part(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), wall, 2, false));
  // A steep roof thick with snow
  const roof = new THREE.Shape(); roof.moveTo(-w / 2 - 10, 0); roof.lineTo(0, w * 0.45); roof.lineTo(w / 2 + 10, 0); roof.closePath();
  g.add(part(new THREE.ExtrudeGeometry(roof, { depth: d + 16, bevelEnabled: false }).translate(0, h, -d / 2 - 8), toon(0xffffff), 2, false));
  place(g, part(new THREE.BoxGeometry(22, 60, 22).translate(0, 30, 0), brickMaterial(), 1, false), w * 0.22, h + 10, 0);
  // Warm lit windows and a door with a wreath
  const win = glow(0xffc86a);
  for (const x of [-w * 0.3, w * 0.3]) for (const y of [h * 0.3, h * 0.7]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(24, 28), win); m.position.set(x, y, d / 2 + 0.6); g.add(m); }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(26, 44), toon(0x6a2a1a)); door.position.set(0, 22, d / 2 + 0.6); g.add(door);
  place(g, part(new THREE.TorusGeometry(7, 2.6, 8, 16), toon(0x1f7a46), 0.4), 0, 34, d / 2 + 3);
  // A string of lights along the eaves
  for (let k = 0; k <= 10; k++) {
    const x = -w / 2 + (k / 10) * w;
    place(g, new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), glow(BULBS[k % BULBS.length])), x, h - 4 - Math.sin((k / 10) * Math.PI * 4) ** 2 * 4, d / 2 + 4);
  }
  return g;
}

/**
 * The village around a Christmas hole: candy-cane posts strung with lights along the curb, fir trees and
 * snowmen in the snow, little houses with lit windows, a great tree with a star, and snow falling.
 */
export function villageLandscape(L: LevelDef, outline: Pt[], toScene: ToScene, lawnH: (x: number, y: number) => number, anims: Animated[]) {
  const group = new THREE.Group();
  const r = rng(Math.round(L.tee[0] * 5 + L.cup[1] * 11));
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const b = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const [tx, ty] = L.tee;
  const clearOf = (x: number, y: number, gap: number) => { const o = outlineDistance(outline, x, y); return !o.inside && o.d > gap; };
  const at = (x: number, y: number, lift = 0) => toScene(x, y).setY(lawnH(x, y) + lift);

  // Candy-cane posts along the curb with strings of lights swagged between them
  const posts = resample(outline, 70).map((p) => ({ x: p.x + p.nx * 36, y: p.y + p.ny * 36 })).filter((p) => clearOf(p.x, p.y, 20));
  const lightGeo = new THREE.SphereGeometry(2.2, 6, 5);
  const lights: { m: THREE.Mesh; k: number }[] = [];
  posts.forEach((p, i) => {
    const post = part(new THREE.CylinderGeometry(2, 2, 34, 8).translate(0, 17, 0), caneStripes(), 0.4, false);
    post.position.copy(at(p.x, p.y));
    group.add(post);
    const q = posts[(i + 1) % posts.length];
    if (Math.hypot(q.x - p.x, q.y - p.y) > 110) return;
    const a = at(p.x, p.y, 32), c = at(q.x, q.y, 32);
    for (let k = 1; k < 6; k++) {
      const u = k / 6;
      const m = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: BULBS[(i + k) % BULBS.length], toneMapped: false }));
      m.position.copy(a).lerp(c, u).setY(a.y + (c.y - a.y) * u - Math.sin(u * Math.PI) * 9);
      group.add(m);
      lights.push({ m, k: i + k });
    }
  });
  anims.push({ group: new THREE.Group(), update: (_a, t) => { const s = Math.floor(t * 2); lights.forEach(({ m, k }) => (m.material as THREE.MeshBasicMaterial).color.setHex(BULBS[(k + s) % BULBS.length])); } });

  // Fir trees and snowmen in the snow
  for (let i = 0, tries = 0; i < 18 && tries < 300; tries++) {
    const a = r() * Math.PI * 2;
    const x = cx + Math.cos(a) * ((b.maxX - b.minX) / 2 + 110 + r() * 420), y = cy + Math.sin(a) * ((b.maxY - b.minY) / 2 + 100 + r() * 360);
    if (!clearOf(x, y, 80) || Math.hypot(x - tx, y - ty) < 160) continue;
    const obj = i % 5 === 2 ? snowman({ x, y, r: 16 + r() * 6 }, L, toScene, i) : firTree({ x, y, height: 110 + r() * 110, r: 10 }, L, toScene, i);
    obj.position.y = lawnH(x, y) - 1;
    group.add(obj);
    i++;
  }
  // The village: a row of houses behind the hole, and a great tree in the square
  const centre = toScene(cx, cy);
  for (let i = 0; i < 6; i++) {
    const hs = house(i * 7 + 3);
    const a = -Math.PI * 0.85 + (i / 5) * Math.PI * 0.7;
    hs.position.copy(centre).add(V(Math.cos(a) * 1150 + (r() - 0.5) * 120, -10, Math.sin(a) * 820 - 80));
    hs.lookAt(centre.clone().setY(hs.position.y));
    group.add(hs);
  }
  const big = firTree({ x: cx + 120, y: cy - 1350, height: 520, r: 40 }, L, toScene, 5);
  big.position.y = -20;
  group.add(big);
  // Snowy hills on the horizon and snow falling
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * 0.95 + (i / 7) * Math.PI * 0.9 + (r() - 0.5) * 0.2;
    const d = 2600 + r() * 600, rr = 500 + r() * 400;
    const hill = part(new THREE.SphereGeometry(rr, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), toon(0xe8f0fa), 0, false);
    hill.position.copy(toScene(cx + Math.cos(a) * d, cy + Math.sin(a) * d)).setY(-40);
    group.add(hill);
  }
  const sf = snowfall(centre); group.add(sf.group); anims.push(sf);
  return group;
}
