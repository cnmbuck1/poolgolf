// Big Top Circus, in the same cartoon toon-and-ink style as the other themed courses: red felt fairways
// (a nod to the pool table) inside a striped big-top tent, with trampolines, swinging cannons, clowns on
// unicycles and elephants on drums. Purely visual; positions come from physics.ts.
import * as THREE from 'three';
import { Animated } from './art';
import { Astronaut, Cannon, Elephant, LevelDef, Pt, Trampoline } from './levels';
import { astronautAt, CANNON_CATCH, cannonAngle, ELEPHANT_R, heightAt, TRAMPOLINE_R, World } from './physics';
import { blob, cached, canvasTex, eye, organic, part, place, rng, shared, toon, toonRamp, V } from './jurassic';
import { outlineDistance, resample } from './landscape';

type ToScene = (x: number, y: number) => THREE.Vector3;

// ---------- materials ----------

/** Red pool-table felt with a faint nap and a scattering of small gold stars. */
export function feltMaterial() {
  return cached('m:felt', () => {
    const r = rng(31);
    const map = canvasTex(512, 512, (g) => {
      g.fillStyle = '#b8222e';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(255,90,100,0.12)' : 'rgba(90,0,10,0.14)';
        g.fillRect(r() * 512, r() * 512, 2, 2);
      }
      g.fillStyle = 'rgba(255,214,90,0.55)';
      for (let i = 0; i < 14; i++) {
        const x = r() * 512, y = r() * 512, s = 4 + r() * 3;
        g.beginPath();
        for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? s * 0.42 : s; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        g.fill();
      }
    });
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp(), vertexColors: true }));
  });
}

/** Sawdust on the ring floor around the course. */
export function sawdustMaterial() {
  return cached('m:sawdust', () => {
    const r = rng(8);
    const c = canvasTex(512, 512, (g) => {
      g.fillStyle = '#c99a5a';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(235,190,120,0.6)' : 'rgba(150,100,50,0.45)';
        g.save(); g.translate(r() * 512, r() * 512); g.rotate(r() * 6);
        g.fillRect(-3, -1, 6 + r() * 5, 2);
        g.restore();
      }
    }, true, 30);
    return shared(new THREE.MeshToonMaterial({ map: c, gradientMap: toonRamp() }));
  });
}

/** Red-and-white striped ring curb (the kerb's UVs run along it, one unit per 70 world units). */
export function stripedKerb() {
  return cached('m:stripekerb', () => {
    const t = canvasTex(128, 32, (g) => {
      g.fillStyle = '#f4f0e8'; g.fillRect(0, 0, 128, 32);
      g.fillStyle = '#d8202e'; g.fillRect(0, 0, 64, 32);
    });
    t.repeat.set(1, 1);
    return shared(new THREE.MeshToonMaterial({ map: t, gradientMap: toonRamp() }));
  });
}

const stripes = (a: string, b: string, n: number) => canvasTex(256, 64, (g) => {
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect((i / n) * 256, 0, 256 / n + 1, 64); }
});

// ---------- trampolines ----------

/** A round trampoline: blue padded frame, black springy mat, stubby legs. The mat dips as the ball lands. */
export function trampoline(tp: Trampoline, world: World, L: LevelDef, toScene: ToScene): Animated {
  const R = tp.r ?? TRAMPOLINE_R;
  const g = new THREE.Group();
  g.position.copy(toScene(tp.x, tp.y)).setY(heightAt(L, tp.x, tp.y));
  place(g, part(new THREE.TorusGeometry(R, 5, 10, 32).rotateX(Math.PI / 2), toon(0x2a8aff), 1.2), 0, 7, 0);
  // Padding segments in alternating colours
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pad = part(new THREE.TorusGeometry(R, 5.6, 8, 6, Math.PI / 8).rotateX(Math.PI / 2), toon(i % 2 ? 0xffd23a : 0xff4a5a), 0, false);
    pad.rotation.y = a;
    pad.position.y = 7;
    g.add(pad);
  }
  const mat = new THREE.Mesh(new THREE.CircleGeometry(R - 3, 32).rotateX(-Math.PI / 2), toon(0x1a1a24));
  mat.position.y = 6;
  mat.receiveShadow = true;
  g.add(mat);
  // A target ring on the mat
  place(g, new THREE.Mesh(new THREE.RingGeometry(R * 0.35, R * 0.45, 28).rotateX(-Math.PI / 2), toon(0xffffff)), 0, 6.3, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    place(g, part(new THREE.CylinderGeometry(2.4, 2.4, 8, 8), toon(0x3a3a48), 0.6, false), Math.cos(a) * R * 0.85, 2, Math.sin(a) * R * 0.85);
  }
  return {
    group: g,
    update(_a, t) {
      // Dip under the ball while it's on the mat, then wobble back
      const b = world.ball;
      const near = Math.hypot(b.x - tp.x, b.y - tp.y) < R && (b.z ?? 0) < 6;
      mat.position.y = near ? 2 : 6 + Math.sin(t * 9) * 0.15;
    },
  };
}

// ---------- cannons ----------

/** A circus cannon on a wheeled carriage: the barrel swings with the physics angle; the ball enters at the breach funnel. */
export function cannon(c: Cannon, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  root.position.copy(toScene(c.x, c.y)).setY(heightAt(L, c.x, c.y));
  // Funnel the ball rolls into
  const funnel = part(new THREE.CylinderGeometry(CANNON_CATCH + 4, CANNON_CATCH - 4, 8, 24, 1, true), toon(0xffc83a, { side: THREE.DoubleSide }), 1);
  funnel.position.y = 4;
  root.add(funnel);
  place(root, new THREE.Mesh(new THREE.CircleGeometry(CANNON_CATCH - 4, 24).rotateX(-Math.PI / 2), toon(0x1a1a1a)), 0, 0.6, 0);
  const swing = new THREE.Group();
  root.add(swing);
  // Barrel: points along +x, tilted up, red with gold bands and a star
  const barrel = new THREE.Group();
  barrel.position.set(8, 14, 0);
  barrel.rotation.z = 0.32;
  swing.add(barrel);
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(13 - 4 * t + (t > 0.92 ? 3 : 0), t * 56)); }
  const body = part(new THREE.LatheGeometry(prof, 24).rotateZ(-Math.PI / 2), toon(0xd8202e), 1.4);
  barrel.add(body);
  for (const x of [6, 30, 50]) place(barrel, part(new THREE.TorusGeometry(x > 40 ? 11.5 : 12.5, 2, 8, 24).rotateY(Math.PI / 2), toon(0xffc83a), 0.6, false), x, 0, 0);
  place(barrel, part(new THREE.SphereGeometry(4, 12, 8), toon(0xffc83a), 0.6, false), 20, 12, 0);
  // Carriage and wheels
  place(swing, part(new THREE.BoxGeometry(34, 10, 26), toon(0x6a3a1e), 1), 6, 7, 0);
  for (const z of [-16, 16]) {
    const wheel = part(new THREE.TorusGeometry(11, 2.6, 8, 20), toon(0xffc83a), 0.8);
    wheel.position.set(6, 11, z);
    swing.add(wheel);
    for (let k = 0; k < 3; k++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 22, 6), toon(0x6a3a1e));
      spoke.position.set(6, 11, z);
      spoke.rotation.z = (k / 3) * Math.PI;
      swing.add(spoke);
    }
  }
  return {
    group: root,
    update() { swing.rotation.y = -cannonAngle(c, world.time); },
  };
}

// ---------- clowns ----------

/** A clown pedalling a unicycle back and forth: white face, red nose, rainbow hair, polka-dot suit. */
export function clown(s: Astronaut, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const seed = Math.round(s.a[0] + s.a[1]);
  const suitCol = [0x3a8aff, 0x8a4aff, 0x2ac87a][seed % 3];
  // Unicycle
  const wheel = new THREE.Group();
  wheel.position.set(0, 12, 0);
  body.add(wheel);
  wheel.add(part(new THREE.TorusGeometry(10, 2.4, 8, 20), toon(0x2a2a2a), 0.6));
  for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 19, 5), toon(0xd8d8e0)); sp.rotation.z = (k / 4) * Math.PI; wheel.add(sp); }
  place(body, part(new THREE.CylinderGeometry(1.4, 1.4, 22, 6), toon(0xd8d8e0), 0.5), 0, 24, 0);
  // Legs and big shoes
  for (const z of [-4, 4]) {
    place(body, part(organic([V(0, 40), V(1, 30), V(0, 18)], [3.5, 3.2, 3]), toon(suitCol, { vertexColors: true }), 0.8), 0, 0, z);
    place(body, part(blob(7, 3, 4, 0.2, 12), toon(0xff3a3a), 0.8), 3, 15, z * 1.4);
  }
  // Body: a round polka-dot suit with a ruff collar
  place(body, part(blob(12, 13, 11), toon(suitCol, { vertexColors: true }), 1.2), 0, 50, 0);
  for (const [x, y, z] of [[10, 54, 4], [8, 46, -6], [11, 44, 3], [6, 58, -5]]) place(body, part(new THREE.SphereGeometry(2.4, 8, 6), toon(0xffd23a), 0, false), x, y, z);
  place(body, part(new THREE.TorusGeometry(9, 3.2, 8, 16).rotateX(Math.PI / 2), toon(0xffffff), 0.8), 0, 62, 0);
  // Head
  const head = new THREE.Group(); head.position.set(0, 72, 0); body.add(head);
  head.add(part(blob(9.5, 10, 9.5, 0.15), toon(0xfff4ec, { vertexColors: true }), 1));
  place(head, part(new THREE.SphereGeometry(3.2, 12, 8), toon(0xff2a2a), 0.6), 9.5, -1, 0);
  eye(head, 7, 3, 3.6, 2.6, 1);
  eye(head, 7, 3, -3.6, 2.6, -1);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(4.5, 1, 6, 14, Math.PI * 0.9), toon(0xd8202e));
  smile.rotation.set(0, Math.PI / 2, Math.PI + 0.15);
  place(head, smile, 8.6, -4, 0);
  for (const [x, z, c] of [[-3, 8, 0xff4a4a], [-3, -8, 0xffd23a], [-7, 5, 0x3a8aff], [-7, -5, 0x2ac87a]] as const) place(head, part(new THREE.SphereGeometry(4.2, 10, 8), toon(c), 0.6), x, 4, z);
  place(head, part(new THREE.ConeGeometry(5, 12, 12), toon(0xffd23a), 0.6), -1, 13, 0);
  // Arms out for balance
  const arms: THREE.Mesh[] = [];
  for (const z of [-1, 1]) {
    const arm = part(organic([V(0, 0), V(2, 2, z * 8), V(3, 6, z * 15)], [3, 2.6, 2.4], 8, 8), toon(suitCol, { vertexColors: true }), 0.6);
    place(body, arm, 0, 56, z * 9);
    place(arm, part(new THREE.SphereGeometry(3.2, 10, 8), toon(0xffffff), 0.5), 3, 6, z * 15);
    arms.push(arm);
  }
  return {
    group: root,
    update(_a, t) {
      const p = astronautAt(s, world.time);
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y));
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 2) body.rotation.y = -Math.atan2(p.vy, p.vx);
      wheel.rotation.z -= (sp / 10) * 0.016;
      body.rotation.x = 0.06 * Math.sin(t * 3 + seed); // wobbling to stay upright
      arms.forEach((a, i) => { a.rotation.x = (i ? 1 : -1) * 0.2 * Math.sin(t * 3 + seed); });
      head.rotation.y = 0.3 * Math.sin(t * 1.3);
    },
  };
}

// ---------- elephants ----------

/** An elephant balanced on a striped drum, swinging its trunk. */
export function elephant(el: Elephant, L: LevelDef, toScene: ToScene): Animated {
  const R = el.r ?? ELEPHANT_R;
  const root = new THREE.Group();
  root.position.copy(toScene(el.x, el.y)).setY(heightAt(L, el.x, el.y));
  root.rotation.y = -((el.angle ?? 200) * Math.PI) / 180;
  // Drum
  const drumTex = stripes('#d8202e', '#f4f0e8', 16);
  place(root, part(new THREE.CylinderGeometry(R, R, 30, 32), new THREE.MeshToonMaterial({ map: drumTex, gradientMap: toonRamp() }), 1.4), 0, 15, 0);
  place(root, part(new THREE.CylinderGeometry(R + 1.5, R + 1.5, 4, 32), toon(0xffc83a), 0.8, false), 0, 30, 0);
  place(root, part(new THREE.CylinderGeometry(R + 1.5, R + 1.5, 4, 32), toon(0xffc83a), 0.8, false), 0, 1.5, 0);
  const e = new THREE.Group(); e.position.y = 32; root.add(e);
  const skin = toon(0x9aa8c8, { vertexColors: true });
  for (const [x, z] of [[14, 10], [14, -10], [-14, 10], [-14, -10]]) place(e, part(organic([V(0, 22), V(0, 10), V(0, 0)], [7, 6.5, 7.5]), skin, 1), x, 0, z);
  place(e, part(blob(30, 22, 22), skin, 1.6), 0, 40, 0);
  const head = new THREE.Group(); head.position.set(30, 54, 0); e.add(head);
  head.add(part(blob(16, 15, 15), skin, 1.4));
  for (const z of [-1, 1]) {
    const ear = part(blob(3, 15, 13, 0.1), toon(0xc8a0c0, { vertexColors: true }), 1.1);
    ear.position.set(-6, 2, z * 16);
    ear.rotation.y = z * 0.4;
    head.add(ear);
  }
  eye(head, 11, 5, 7, 3.6, 1);
  eye(head, 11, 5, -7, 3.6, -1);
  const trunk = new THREE.Group(); trunk.position.set(14, -4, 0); head.add(trunk);
  trunk.add(part(organic([V(0, 0), V(10, -10), V(16, 4), V(18, 18)], [5.5, 4.5, 3.6, 3]), skin, 1));
  // A little fez
  place(head, part(new THREE.CylinderGeometry(5, 6.5, 8, 14), toon(0xd8202e), 0.8), -2, 16, 0);
  return {
    group: root,
    update(_a, t) {
      trunk.rotation.z = 0.25 * Math.sin(t * 1.4);
      head.rotation.y = 0.15 * Math.sin(t * 0.6);
    },
  };
}

// ---------- scenery ----------

/** A crowd texture: rows of colourful heads in the stands. */
const crowdTex = () => cached('t:crowd', () => {
  const r = rng(51);
  const t = canvasTex(512, 128, (g) => {
    g.fillStyle = '#3a1a28'; g.fillRect(0, 0, 512, 128);
    for (let row = 0; row < 4; row++) for (let i = 0; i < 40; i++) {
      const x = i * 12.8 + (row % 2) * 6 + r() * 3, y = 18 + row * 30;
      g.fillStyle = ['#ffd8b8', '#e8b088', '#a8704a', '#6a4028'][Math.floor(r() * 4)];
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = ['#ff4a5a', '#3a8aff', '#ffd23a', '#2ac87a', '#ffffff', '#8a4aff'][Math.floor(r() * 6)];
      g.fillRect(x - 6, y + 5, 12, 10);
    }
  });
  t.repeat.set(10, 1);
  return t;
});

/** A string of triangular pennants hanging between two points. */
function bunting(a: THREE.Vector3, b: THREE.Vector3, sag: number) {
  const g = new THREE.Group();
  const n = Math.max(6, Math.round(a.distanceTo(b) / 45));
  const cols = [0xff4a5a, 0xffd23a, 0x3a8aff, 0x2ac87a, 0xffffff];
  const flag = new THREE.BufferGeometry().setFromPoints([V(-9, 0), V(9, 0), V(0, -20)]);
  flag.computeVertexNormals();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push(a.clone().lerp(b, t).add(V(0, -sag * 4 * t * (1 - t)))); }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3a2a1a })));
  for (let i = 1; i < n; i++) {
    const m = new THREE.Mesh(flag, toon(cols[i % cols.length], { side: THREE.DoubleSide }));
    m.position.copy(pts[i]);
    m.lookAt(m.position.clone().add(new THREE.Vector3().subVectors(b, a).cross(V(0, 1)).normalize()));
    g.add(m);
  }
  return g;
}

/** A striped pedestal with a big ball balanced on it, sometimes with a seal. */
function pedestal(seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  place(g, part(new THREE.CylinderGeometry(16, 18, 26, 20), new THREE.MeshToonMaterial({ map: stripes('#3a8aff', '#ffd23a', 10), gradientMap: toonRamp() }), 1.2), 0, 13, 0);
  if (r() > 0.5) {
    // A seal balancing a ball on its nose
    const seal = toon(0x5a6478, { vertexColors: true });
    place(g, part(organic([V(-10, 28), V(0, 36), V(4, 52), V(6, 62)], [9, 11, 8, 6]), seal, 1), 0, 0, 0);
    eye(g, 10, 62, 3, 2.2, 1);
    eye(g, 10, 62, -3, 2.2, -1);
    place(g, part(new THREE.SphereGeometry(9, 16, 12), toon([0xff4a5a, 0x3a8aff, 0xffd23a][seed % 3]), 0.8), 8, 76, 0);
  } else {
    place(g, part(new THREE.SphereGeometry(14, 18, 14), toon([0xff4a5a, 0x3a8aff, 0x2ac87a][seed % 3]), 1), 0, 40, 0);
    place(g, part(new THREE.TorusGeometry(14.2, 2.4, 6, 24).rotateX(Math.PI / 2), toon(0xffffff), 0, false), 0, 40, 0);
  }
  return g;
}

/**
 * The big top around a circus hole: sawdust ring, striped tent walls and roof, stands full of people,
 * spotlights, bunting, and pedestals with balls and seals along the curb.
 */
export function circusLandscape(L: LevelDef, outline: Pt[], toScene: ToScene, lawnH: (x: number, y: number) => number, anims: Animated[]) {
  const group = new THREE.Group();
  const r = rng(Math.round(L.tee[0] * 3 + L.cup[1] * 5));
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const centre = toScene(cx, cy);
  const clearOf = (x: number, y: number, gap: number) => { const o = outlineDistance(outline, x, y); return !o.inside && o.d > gap; };
  const at = (x: number, y: number, lift = 0) => toScene(x, y).setY(lawnH(x, y) + lift);

  // Pedestals along the curb
  resample(outline, 260).forEach((p, i) => {
    const x = p.x + p.nx * 60, y = p.y + p.ny * 60;
    if (!clearOf(x, y, 40) || Math.hypot(x - L.tee[0], y - L.tee[1]) < 150) return;
    const m = pedestal(i * 5 + 3);
    m.position.copy(at(x, y, -2));
    m.rotation.y = r() * 6;
    group.add(m);
  });

  // The ring: a low red wall around the sawdust floor
  const ringR = 1250;
  const ringWall = new THREE.Mesh(new THREE.CylinderGeometry(ringR, ringR, 40, 96, 1, true), new THREE.MeshToonMaterial({ map: stripes('#d8202e', '#ffc83a', 64), gradientMap: toonRamp(), side: THREE.DoubleSide }));
  ringWall.position.copy(centre).setY(10);
  group.add(ringWall);

  // Stands rising behind the ring, full of spectators
  const crowd = new THREE.MeshToonMaterial({ map: crowdTex(), gradientMap: toonRamp(), side: THREE.BackSide });
  for (let k = 0; k < 5; k++) {
    const rad = 1450 + k * 130, h = 60 + k * 70;
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 70, 96, 1, true), crowd);
    tier.position.copy(centre).setY(h);
    group.add(tier);
    const step = new THREE.Mesh(new THREE.RingGeometry(rad - 130, rad, 96, 1).rotateX(-Math.PI / 2), toon(0x5a2a1e));
    step.position.copy(centre).setY(h - 35);
    group.add(step);
  }

  // The tent: striped walls and a striped cone roof, seen from inside
  const tentR = 2400;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(tentR, tentR, 900, 64, 1, true), new THREE.MeshToonMaterial({ map: stripes('#c81a28', '#f4ece0', 48), gradientMap: toonRamp(), side: THREE.BackSide, fog: false }));
  wall.position.copy(centre).setY(450);
  group.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(tentR, 1300, 64, 1, true), new THREE.MeshToonMaterial({ map: stripes('#c81a28', '#f4ece0', 48), gradientMap: toonRamp(), side: THREE.BackSide, fog: false }));
  roof.position.copy(centre).setY(900 + 650);
  group.add(roof);
  // Poles holding it up, outside the ring
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const pole = part(new THREE.CylinderGeometry(14, 18, 1600, 12), toon(0xffc83a), 2, false);
    pole.position.copy(centre).add(V(Math.cos(a) * 1330, 800, Math.sin(a) * 1330));
    group.add(pole);
  }

  // Bunting strung from the poles over the course
  for (let i = 0; i < 4; i++) {
    const a1 = (i / 4) * Math.PI * 2 + 0.4, a2 = ((i + 1) / 4) * Math.PI * 2 + 0.4;
    group.add(bunting(centre.clone().add(V(Math.cos(a1) * 1330, 700, Math.sin(a1) * 1330)), centre.clone().add(V(Math.cos(a2) * 1330, 700, Math.sin(a2) * 1330)), 180));
    group.add(bunting(centre.clone().add(V(Math.cos(a1) * 1330, 760, Math.sin(a1) * 1330)), centre.clone().add(V(0, 1100, 0)), 120));
  }

  // Roving spotlights: soft pools of light that drift across the sawdust
  const spotMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 3; i++) {
    const spot = new THREE.Mesh(new THREE.CircleGeometry(150, 40).rotateX(-Math.PI / 2), spotMat);
    group.add(spot);
    const ph = i * 2.1;
    anims.push({ group: spot, update: (_a, t) => { spot.position.copy(centre).add(V(Math.cos(t * 0.17 + ph) * 700, 2, Math.sin(t * 0.23 + ph) * 420)); } });
  }
  return group;
}
