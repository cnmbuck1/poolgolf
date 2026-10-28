// Jolly Roger, the expert course, in the same cartoon toon-and-ink style as the others: tropical turf on
// sandy islands in a turquoise sea, treasure-chest bumpers, barrels, pirates, parrots, cannonball volleys,
// ship's cannons, a kraken's tentacle, sea caves and galleons whose decks rock on the swell. Purely visual;
// positions come from physics.ts.
import * as THREE from 'three';
import { Animated } from './art';
import { Alien, Astronaut, Bumper, Cannon, LevelDef, Meteor, Portal, Pt, Rock, Tumbleweed } from './levels';
import { alienAt, astronautAt, CANNON_CATCH, cannonAngle, heightAt, meteorAt, PORTAL_R, tumbleweedAt, World } from './physics';
import { cached, canvasTex, eye, organic, palm, part, place, rng, shared, toon, toonRamp, V } from './jurassic';
import { outlineDistance, resample } from './landscape';

type ToScene = (x: number, y: number) => THREE.Vector3;

const glow = (color: number) => cached(`m:pglow:${color}`, () => shared(new THREE.MeshBasicMaterial({ color, toneMapped: false })));

// ---------- materials ----------

/** Bright tropical turf with a scatter of sand and the odd shell. */
export function islandTurfMaterial() {
  return cached('m:islandturf', () => {
    const r = rng(31);
    const map = canvasTex(512, 512, (g) => {
      g.fillStyle = '#5fbf4a';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(140,220,100,0.25)' : 'rgba(30,110,40,0.22)';
        g.fillRect(r() * 512, r() * 512, 2, 3);
      }
      for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(240,220,160,0.5)'; g.fillRect(r() * 512, r() * 512, 2, 2); }
    });
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp(), vertexColors: true }));
  });
}

/** Pale beach sand round the course, with ripples and shells. */
export function beachMaterial() {
  return cached('m:beach', () => {
    const r = rng(43);
    const map = canvasTex(512, 512, (g) => {
      g.fillStyle = '#f0d9a0'; g.fillRect(0, 0, 512, 512);
      g.strokeStyle = 'rgba(200,170,110,0.35)'; g.lineWidth = 2;
      for (let y = 0; y < 512; y += 18) { g.beginPath(); for (let x = 0; x <= 512; x += 16) { const yy = y + Math.sin(x * 0.05 + y) * 4; if (x) g.lineTo(x, yy); else g.moveTo(x, yy); } g.stroke(); }
      for (let i = 0; i < 40; i++) { g.fillStyle = ['#ffffff', '#ffc0b0', '#f8e8d0'][i % 3]; g.beginPath(); g.ellipse(r() * 512, r() * 512, 4, 3, r() * 3, 0, Math.PI * 2); g.fill(); }
    }, true, 30);
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp() }));
  });
}

/** The curb: a timber rail wrapped in rope. */
export function ropeKerb() {
  return cached('m:ropekerb', () => {
    const t = canvasTex(128, 32, (g) => {
      g.fillStyle = '#8a5a30'; g.fillRect(0, 0, 128, 32);
      g.strokeStyle = '#d8b878'; g.lineWidth = 6;
      for (let x = -32; x < 160; x += 16) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 24, 0); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, 26, 128, 6);
    });
    return shared(new THREE.MeshToonMaterial({ map: t, gradientMap: toonRamp() }));
  });
}

/** Weathered deck planks (the tops of ship decks). */
export function deckMaterial() {
  return cached('m:deck', () => {
    const r = rng(7);
    const map = canvasTex(256, 256, (g) => {
      for (let y = 0; y < 256; y += 32) {
        g.fillStyle = ['#b07a44', '#a06c3a', '#bc864e'][(y / 32) % 3];
        g.fillRect(0, y, 256, 32);
        g.fillStyle = 'rgba(40,20,5,0.55)'; g.fillRect(0, y, 256, 2);
        for (let x = (y / 32) % 2 ? 60 : 140; x < 256; x += 200) g.fillRect(x, y, 2, 32);
        for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(60,30,10,0.25)'; g.fillRect(r() * 256, y + 6 + r() * 20, 30 + r() * 40, 1.5); }
      }
    }, true, 3);
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp() }));
  });
}

/** The ship's rail (the curb on a ship hole): dark timber with a gold stripe. */
export function shipRail() {
  return cached('m:shiprail', () => {
    const t = canvasTex(128, 32, (g) => {
      g.fillStyle = '#4a2a12'; g.fillRect(0, 0, 128, 32);
      g.fillStyle = '#c8a040'; g.fillRect(0, 8, 128, 4);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 26, 128, 6);
      for (let x = 0; x < 128; x += 32) { g.fillStyle = '#c8a040'; g.beginPath(); g.arc(x + 16, 20, 2.5, 0, Math.PI * 2); g.fill(); }
    });
    return shared(new THREE.MeshToonMaterial({ map: t, gradientMap: toonRamp() }));
  });
}

/** A ship's hull below the rail: dark planks, a gold stripe and a row of gun ports. */
function hullMaterial() {
  return cached('m:hull', () => {
    const map = canvasTex(256, 128, (g) => {
      for (let y = 0; y < 128; y += 14) { g.fillStyle = (y / 14) % 2 ? '#5a3418' : '#4a2a12'; g.fillRect(0, y, 256, 14); g.fillStyle = 'rgba(20,10,0,0.5)'; g.fillRect(0, y, 256, 1.5); }
      g.fillStyle = '#c8a040'; g.fillRect(0, 6, 256, 6);
      for (let x = 20; x < 256; x += 64) { g.fillStyle = '#2a1408'; g.fillRect(x, 26, 24, 18); g.strokeStyle = '#c8a040'; g.lineWidth = 2; g.strokeRect(x, 26, 24, 18); }
      g.fillStyle = 'rgba(30,80,40,0.55)'; g.fillRect(0, 104, 256, 24); // weed at the waterline
    });
    map.wrapT = THREE.ClampToEdgeWrapping;
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp(), side: THREE.DoubleSide }));
  });
}

/** Sea level on Jolly Roger (the open ocean round every hole). */
export const SEA_Y = -26;

/**
 * Below the curb: a sandy beach shelving down into the sea round an island hole, or the ship's hull dropping
 * into the water on a ship hole. Swept along the outline like the curb.
 */
export function skirtMesh(outline: Pt[], toScene: ToScene, ship: boolean) {
  const pts = resample(outline, 10);
  // (offset outward, height) at the top and bottom of the skirt
  const top: [number, number] = ship ? [10, 2] : [10, -4.5], bot: [number, number] = ship ? [-4, SEA_Y - 30] : [95, SEA_Y - 6];
  const n = pts.length, pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2);
  let along = 0;
  pts.forEach((p, i) => {
    if (i) along += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    const q = pts[(i + n - 1) % n];
    let nx = p.nx + q.nx, ny = p.ny + q.ny;
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    [top, bot].forEach(([o, h], j) => {
      const s = toScene(p.x + nx * o, p.y + ny * o);
      pos.set([s.x, h, s.z], (i * 2 + j) * 3);
      uv.set(ship ? [along / 130, j] : [s.x / 170, s.z / 170], (i * 2 + j) * 2);
    });
  });
  const idx: number[] = [];
  for (let i = 0; i < n; i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, ship ? hullMaterial() : new THREE.MeshToonMaterial({ map: beachMaterial().map, gradientMap: toonRamp(), side: THREE.DoubleSide }));
  m.receiveShadow = true;
  return m;
}

/** Ground height round a Jolly Roger hole: the beach sloping into the sea, or the sea itself beside a ship. */
export function coveHeight(outline: Pt[], ship: boolean) {
  return (x: number, y: number) => {
    const { d, inside } = outlineDistance(outline, x, y);
    if (inside) return -4.5;
    if (ship) return SEA_Y;
    const k = Math.min(1, Math.max(0, (d - 10) / 85));
    return -4.5 + (SEA_Y - 6 + 4.5) * k;
  };
}

// ---------- treasure chests (bumpers) ----------

export function treasureChest(bp: Bumper, L: LevelDef, toScene: ToScene) {
  const g = new THREE.Group();
  const w = bp.r * 1.7, d = bp.r * 1.25, h = bp.r * 0.9;
  const wood = toon(0x8a4a22), iron = toon(0x3a3440), gold = toon(0xffc83a);
  g.add(part(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), wood, 1.1));
  // A domed lid, propped open, with gold spilling over the front
  const lid = new THREE.Group(); lid.position.set(0, h, -d / 2); g.add(lid);
  lid.add(part(new THREE.CylinderGeometry(d / 2, d / 2, w, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0, d / 2), wood, 1));
  lid.rotation.x = -0.9;
  for (const x of [-w * 0.32, w * 0.32]) place(g, part(new THREE.BoxGeometry(w * 0.08, h * 1.02, d * 1.04).translate(0, h / 2, 0), iron, 0.3), x, 0, 0);
  place(g, part(new THREE.BoxGeometry(w * 0.16, h * 0.3, 1.5), gold, 0.2), 0, h * 0.7, d / 2 + 0.6);
  const coins = new THREE.Group(); g.add(coins);
  const r = rng(Math.round(bp.x + bp.y));
  for (let k = 0; k < 9; k++) place(coins, new THREE.Mesh(new THREE.SphereGeometry(bp.r * (0.14 + r() * 0.06), 8, 6).scale(1, 0.5, 1), gold), (r() - 0.5) * w * 0.8, h + 1 + r() * bp.r * 0.25, (r() - 0.5) * d * 0.6);
  for (let k = 0; k < 4; k++) place(g, new THREE.Mesh(new THREE.CylinderGeometry(bp.r * 0.14, bp.r * 0.14, 0.8, 10), gold), (r() - 0.5) * w * 1.2, 0.6, d / 2 + 2 + r() * 6);
  place(g, new THREE.Mesh(new THREE.OctahedronGeometry(bp.r * 0.16), glow(0xff3a6a)), w * 0.2, h + bp.r * 0.3, 0);
  g.position.copy(toScene(bp.x, bp.y)).setY(heightAt(L, bp.x, bp.y));
  g.rotation.y = Math.atan2(L.tee[0] - bp.x, L.tee[1] - bp.y); // open toward the tee
  return g;
}

// ---------- barrels (rocks and rolling barrels) ----------

function barrelBody(R: number, H: number) {
  const g = new THREE.Group();
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(R * (0.86 + 0.14 * Math.sin(t * Math.PI)), t * H)); }
  const staves = cached('t:staves', () => canvasTex(128, 64, (c) => {
    for (let x = 0; x < 128; x += 16) { c.fillStyle = (x / 16) % 2 ? '#a0642e' : '#8e5626'; c.fillRect(x, 0, 16, 64); c.fillStyle = 'rgba(30,15,5,0.5)'; c.fillRect(x, 0, 1.5, 64); }
  }));
  g.add(part(new THREE.LatheGeometry(prof, 18).translate(0, -H / 2, 0), new THREE.MeshToonMaterial({ map: staves, gradientMap: toonRamp() }), 1));
  for (const y of [-H * 0.36, H * 0.36]) place(g, part(new THREE.TorusGeometry(R * 0.95, R * 0.07, 6, 20).rotateX(Math.PI / 2), toon(0x3a3440), 0.2, false), 0, y, 0);
  for (const y of [-H / 2, H / 2]) place(g, new THREE.Mesh(new THREE.CircleGeometry(R * 0.86, 18).rotateX(y > 0 ? -Math.PI / 2 : Math.PI / 2), toon(0x7a4820)), 0, y, 0);
  return g;
}

export function barrel(rk: Rock, L: LevelDef, toScene: ToScene, i: number) {
  const g = new THREE.Group();
  const b = barrelBody(rk.r, rk.r * 2.2);
  b.position.y = rk.r * 1.1;
  g.add(b);
  if (i % 3 === 1) { const top = barrelBody(rk.r * 0.8, rk.r * 1.7); top.position.set(rk.r * 0.2, rk.r * 3, 0); top.rotation.z = 0.15; g.add(top); }
  g.position.copy(toScene(rk.x, rk.y)).setY(heightAt(L, rk.x, rk.y));
  g.rotation.y = i * 1.3;
  return g;
}

/** A barrel rolling back and forth on its side, axis across its path. */
export function rollingBarrel(w: Tumbleweed, world: World, L: LevelDef, toScene: ToScene): Animated {
  const R = w.r ?? 15;
  const root = new THREE.Group();
  const spin = new THREE.Group(); root.add(spin);
  const b = barrelBody(R, R * 2.2);
  b.rotation.x = Math.PI / 2; // lying on its side, axis along z
  spin.add(b);
  root.rotation.y = -Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]); // rolls along local x
  let last = world.time, angle = 0;
  return {
    group: root,
    update() {
      const p = tumbleweedAt(w, world.time);
      const dt = Math.max(0, world.time - last); last = world.time;
      const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
      const along = (p.vx * (w.b[0] - w.a[0]) + p.vy * (w.b[1] - w.a[1])) / len;
      angle -= (along * dt) / R;
      spin.rotation.z = angle;
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y) + R * 0.95);
    },
  };
}

/** A weathered piling (pillars): a post with rope round the top. */
export function piling(pl: Rock, L: LevelDef, toScene: ToScene) {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(pl.r * 0.95, pl.r, 60, 10).translate(0, 30, 0), toon(0x7a5232), 1.1));
  place(g, part(new THREE.TorusGeometry(pl.r * 1.02, 1.8, 6, 14).rotateX(Math.PI / 2), toon(0xd8b878), 0.3), 0, 44, 0);
  place(g, part(new THREE.TorusGeometry(pl.r * 1.02, 1.8, 6, 14).rotateX(Math.PI / 2), toon(0xd8b878), 0.3), 0, 40, 0);
  place(g, part(new THREE.SphereGeometry(pl.r * 0.95, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x6a4428), 0.4), 0, 60, 0);
  g.position.copy(toScene(pl.x, pl.y)).setY(heightAt(L, pl.x, pl.y));
  return g;
}

/** A ship's mast (pillars on a ship hole): a tall pole with furled sails on its yards, a crow's nest and the Jolly Roger. */
export function mast(pl: Rock, L: LevelDef, toScene: ToScene): Animated {
  const g = new THREE.Group();
  const wood = toon(0x6a4428), canvas = toon(0xf4ecd8), rope = toon(0xd8b878);
  const H = 230;
  g.add(part(new THREE.CylinderGeometry(pl.r * 0.55, pl.r, H, 10).translate(0, H / 2, 0), wood, 1.1));
  place(g, part(new THREE.CylinderGeometry(pl.r * 1.3, pl.r * 1.3, 10, 12), wood, 0.6), 0, 5, 0);
  // Yards across the ship, each with its sail rolled up along it
  for (const [y, w] of [[95, 130], [160, 100]] as const) {
    place(g, part(new THREE.CylinderGeometry(2.4, 2.4, w, 8).rotateX(Math.PI / 2), wood, 0.5), 0, y, 0);
    place(g, part(new THREE.CapsuleGeometry(5, w * 0.8, 4, 10).rotateX(Math.PI / 2), canvas, 0.6), 0, y - 5, 0);
    for (const z of [-w * 0.3, 0, w * 0.3]) place(g, part(new THREE.TorusGeometry(5.5, 0.9, 4, 10).rotateY(Math.PI / 2), rope, 0), 0, y - 5, z);
  }
  // The crow's nest
  place(g, part(new THREE.CylinderGeometry(13, 10, 10, 12, 1, true), toon(0x7a4a24, { side: THREE.DoubleSide }), 0.8), 0, 196, 0);
  // Rigging down to the rails
  for (const z of [-1, 1]) {
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 4), rope);
    const a = V(0, 190, 0), b = V(0, 6, z * 110);
    line.position.copy(a).add(b).multiplyScalar(0.5);
    line.scale.y = a.distanceTo(b);
    line.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    g.add(line);
  }
  // The Jolly Roger, flapping at the top
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(34, 22, 8, 1).translate(17, 0, 0), new THREE.MeshToonMaterial({ map: jollyRoger(), gradientMap: toonRamp(), side: THREE.DoubleSide }));
  flag.position.set(0, H - 10, 0);
  g.add(flag);
  const pos = flag.geometry.attributes.position as THREE.BufferAttribute, base = Float32Array.from(pos.array as Float32Array);
  g.position.copy(toScene(pl.x, pl.y)).setY(heightAt(L, pl.x, pl.y));
  const seed = pl.x * 0.03;
  return {
    group: g,
    update(_a, t) {
      for (let i = 0; i < pos.count; i++) { const x = base[i * 3]; pos.setZ(i, Math.sin(x * 0.25 - t * 6 + seed) * x * 0.12); }
      pos.needsUpdate = true;
    },
  };
}

const jollyRoger = () => cached('t:jolly', () => canvasTex(128, 84, (g) => {
  g.fillStyle = '#111'; g.fillRect(0, 0, 128, 84);
  g.fillStyle = '#f4f0e6';
  g.beginPath(); g.arc(64, 34, 16, 0, Math.PI * 2); g.fill();
  g.fillRect(54, 44, 20, 10);
  g.fillStyle = '#111'; g.beginPath(); g.arc(58, 33, 4.5, 0, Math.PI * 2); g.arc(70, 33, 4.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f4f0e6'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(36, 56); g.lineTo(92, 76); g.moveTo(92, 56); g.lineTo(36, 76); g.stroke();
}));

// ---------- pirates ----------

export function pirate(s: Astronaut, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const seed = Math.round(s.a[0] * 3 + s.a[1]);
  const shirt = toon([0xe8e2d0, 0xd8202e, 0x2a5ad8][seed % 3]), pants = toon(0x3a3a5a), skin = toon(0xe8b088), black = toon(0x1a1a20), red = toon(0xc81e2a);
  const legs: THREE.Group[] = [];
  for (const z of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0, 15, z * 4); body.add(leg);
    // One of them stumps along on a peg leg
    leg.add(part(new THREE.CylinderGeometry(2.8, 2.4, 10, 8).translate(0, -5, 0), pants, 0.6));
    leg.add(part(z < 0 && seed % 2 ? new THREE.CylinderGeometry(1.2, 1, 6, 6).translate(0, -13, 0) : new THREE.CylinderGeometry(3, 3.2, 5, 8).translate(0, -12.5, 0), z < 0 && seed % 2 ? toon(0x8a5a30) : black, 0.5));
    legs.push(leg);
  }
  body.add(part(new THREE.CylinderGeometry(7.5, 7, 14, 12).translate(0, 22, 0), shirt, 1));
  for (let k = 0; k < 3; k++) place(body, part(new THREE.TorusGeometry(7.4, 1.1, 6, 16).rotateX(Math.PI / 2), red, 0, false), 0, 17 + k * 4.5, 0);
  place(body, part(new THREE.CylinderGeometry(7.8, 7.8, 2.4, 12), black, 0.3), 0, 16, 0);
  place(body, part(new THREE.BoxGeometry(3, 2.6, 3), toon(0xffc83a), 0), 7.5, 16, 0);
  const arms: THREE.Group[] = [];
  for (const z of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(0, 28, z * 8.5); body.add(arm);
    arm.add(part(new THREE.CylinderGeometry(2, 1.8, 11, 8).translate(0, -5.5, 0), shirt, 0.5));
    if (z > 0) {
      // A cutlass in his right hand
      place(arm, part(new THREE.BoxGeometry(1.2, 16, 3).translate(0, 8, 0), toon(0xdfe6ee), 0.2), 3, -11, 0).rotation.z = -1.2;
      place(arm, new THREE.Mesh(new THREE.SphereGeometry(2, 8, 6), toon(0xffc83a)), 0, -11.5, 0);
    } else place(arm, new THREE.Mesh(new THREE.SphereGeometry(2, 8, 6), skin), 0, -11.5, 0);
    arms.push(arm);
  }
  const head = new THREE.Group(); head.position.set(0, 35, 0); body.add(head);
  head.add(part(new THREE.SphereGeometry(5.5, 14, 10), skin, 0.8));
  place(head, part(new THREE.SphereGeometry(5.4, 12, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), toon(0x3a2418), 0.3), 0.6, -0.5, 0);
  eye(head, 4.6, 1.4, -1.9, 1.1, -1);
  place(head, new THREE.Mesh(new THREE.CircleGeometry(1.8, 10).rotateY(Math.PI / 2), black), 5.4, 1.4, 1.9);
  place(head, part(new THREE.TorusGeometry(5.6, 0.4, 4, 18, Math.PI).rotateY(Math.PI / 2).rotateX(0.6), black, 0), 0, 1.8, 0);
  // A black tricorn hat with a skull
  place(head, part(new THREE.CylinderGeometry(8, 8, 1.6, 3).rotateY(Math.PI / 6), black, 0.6), 0, 5, 0);
  place(head, part(new THREE.SphereGeometry(5.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), black, 0.5), 0, 5, 0);
  place(head, new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 6), toon(0xffffff)), 4.6, 6.6, 0);
  root.scale.setScalar(1.2);
  return {
    group: root,
    update() {
      const p = astronautAt(s, world.time);
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y));
      const moving = Math.hypot(p.vx, p.vy) > 2;
      if (moving) body.rotation.y = -Math.atan2(p.vy, p.vx);
      // A rolling swagger
      const w = moving ? Math.sin(world.time * 6 + seed) : 0;
      legs.forEach((l, k) => (l.rotation.z = (k ? -1 : 1) * w * 0.45));
      arms.forEach((a, k) => (a.rotation.z = (k ? 1 : -1) * w * 0.35 + (k ? -0.4 : 0)));
      body.rotation.x = moving ? w * 0.08 : 0;
      body.position.y = moving ? Math.abs(w) * 1.2 : 0;
    },
  };
}

// ---------- parrots ----------

export function parrot(a: Alien, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const fly = new THREE.Group(); root.add(fly);
  const seed = Math.round(a.x + a.y);
  const [main, wingC] = [[0xe8202e, 0x2a6ad8], [0x2ac84a, 0xffc83a], [0x2a8ad8, 0xffd83a]][seed % 3];
  fly.add(part(new THREE.SphereGeometry(5, 12, 10).scale(1.5, 1, 1), toon(main), 0.6));
  place(fly, part(new THREE.SphereGeometry(3.6, 10, 8), toon(main), 0.5), 6.5, 2.5, 0);
  place(fly, part(new THREE.ConeGeometry(1.6, 3.5, 8).rotateZ(-Math.PI / 2 - 0.6), toon(0xffe8a0), 0.3), 10, 1.6, 0);
  for (const z of [-1, 1]) eye(fly, 8.6, 3.6, z * 2.2, 0.9, z);
  place(fly, part(new THREE.ConeGeometry(2.2, 12, 6).rotateZ(Math.PI / 2), toon(wingC), 0.4), -11, 0, 0);
  const wings: THREE.Object3D[] = [];
  const wingGeo = new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(-5, 0); s.lineTo(5, 0); s.quadraticCurveTo(2, 9, -6, 13); s.closePath(); return s; })()).rotateX(Math.PI / 2);
  for (const z of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, new THREE.MeshToonMaterial({ color: wingC, gradientMap: toonRamp(), side: THREE.DoubleSide }));
    w.scale.z = z; w.position.set(0, 2, z * 3); fly.add(w); wings.push(w);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(7, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
  root.add(shadow);
  return {
    group: root,
    update(_x, t) {
      const p = alienAt(a, world.time);
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y));
      fly.position.y = 13 + Math.sin(t * 5 + seed) * 2.5;
      fly.rotation.y = -Math.atan2(p.vy, p.vx);
      const f = Math.sin(t * 18 + seed);
      wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * f * 0.8; });
    },
  };
}

// ---------- cannonball volleys (meteors) ----------

/** A cannonball fired from offshore: a splash-ring warning, a whistling arc in, a thud, then it rolls off and sinks. */
export function cannonVolley(m: Meteor, world: World, L: LevelDef, toScene: ToScene): Animated {
  const R = m.r ?? 20;
  const root = new THREE.Group();
  root.position.copy(toScene(m.x, m.y)).setY(heightAt(L, m.x, m.y));
  const ring = new THREE.Mesh(new THREE.RingGeometry(R * 1.05, R * 1.35, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
  ring.position.y = 0.8;
  root.add(ring);
  const ball = part(new THREE.SphereGeometry(R * 0.82, 20, 14), toon(0x2a2a32), 1);
  const fall = new THREE.Group(); fall.add(ball); root.add(fall);
  place(ball, new THREE.Mesh(new THREE.SphereGeometry(R * 0.2, 8, 6), toon(0x6a6a7a)), -R * 0.3, R * 0.45, R * 0.3);
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(R * 0.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xdedad0, transparent: true, opacity: 0.5, depthWrite: false }));
  fall.add(smoke);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(R, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.position.y = 0.6; root.add(shadow);
  const dust = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf0e0b8, transparent: true, depthWrite: false }));
  dust.position.y = 2; root.add(dust);
  const dir = new THREE.Vector3(-0.6, 1, -0.4).normalize();
  return {
    group: root,
    update(_a, t) {
      const p = meteorAt(m, world.time);
      ring.visible = p.warning;
      if (p.warning) { (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.4 * Math.abs(Math.sin(t * 7)); ring.scale.setScalar(1 + 0.08 * Math.sin(t * 7)); }
      const falling = p.warning && p.h < 1;
      fall.visible = falling || p.size > 0;
      smoke.visible = falling;
      smoke.position.copy(dir).multiplyScalar(R * 1.3);
      fall.position.copy(dir).multiplyScalar(p.h * 900).setY(R * 0.82 + p.h * 900 * dir.y);
      ball.scale.setScalar(falling ? 1 : Math.max(0.01, p.size));
      shadow.visible = fall.visible;
      shadow.scale.setScalar(falling ? 0.4 + 0.6 * (1 - p.h) : Math.max(0.01, p.size));
      const puff = p.u < 0.6 && !p.warning;
      dust.visible = puff;
      if (puff) { const k = p.u / 0.6; dust.scale.setScalar(R * (1.2 + k * 2)); (dust.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k); }
    },
  };
}

// ---------- ship's cannons ----------

export function shipCannon(c: Cannon, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  root.position.copy(toScene(c.x, c.y)).setY(heightAt(L, c.x, c.y));
  // A rope ring round the spot the ball rolls into
  place(root, new THREE.Mesh(new THREE.CircleGeometry(CANNON_CATCH - 3, 24).rotateX(-Math.PI / 2), toon(0x1a1410)), 0, 0.6, 0);
  const ring = part(new THREE.TorusGeometry(CANNON_CATCH, 2.2, 8, 30).rotateX(Math.PI / 2), toon(0xd8b878), 0.3);
  ring.position.y = 1.5; root.add(ring);
  const swing = new THREE.Group(); root.add(swing);
  const barrelG = new THREE.Group(); barrelG.position.set(8, 13, 0); barrelG.rotation.z = 0.28; swing.add(barrelG);
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(12 - 3.5 * t + (t > 0.9 ? 2.5 : 0), t * 54)); }
  barrelG.add(part(new THREE.LatheGeometry(prof, 22).rotateZ(-Math.PI / 2), toon(0x2a2a32), 1.4));
  for (const x of [8, 34]) place(barrelG, part(new THREE.TorusGeometry(11.2, 1.5, 6, 20).rotateY(Math.PI / 2), toon(0xb08a3a), 0.4, false), x, 0, 0);
  place(swing, part(new THREE.BoxGeometry(32, 9, 24), toon(0x7a4a24), 1), 6, 6, 0);
  for (const x of [-4, 16]) for (const z of [-13, 13]) {
    const wheel = part(new THREE.CylinderGeometry(6, 6, 4, 14).rotateX(Math.PI / 2), toon(0x5a3418), 0.5);
    wheel.position.set(x, 6, z); swing.add(wheel);
  }
  return { group: root, update() { swing.rotation.y = -cannonAngle(c, world.time); } };
}

// ---------- the kraken (spinners) ----------

/** A kraken's tentacle rising out of the water and sweeping round like a windmill arm. */
export function krakenTentacle(len: number, arms: number): Animated {
  const g = new THREE.Group();
  const purple = toon(0x8a3ab8), sucker = toon(0xf0b8e0);
  // The bulging head just breaking the surface, with one big eye
  g.add(part(new THREE.SphereGeometry(16, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 1.1, 1), purple, 1.2));
  for (const z of [-1, 1]) eye(g, 12, 8, z * 6, 3, z);
  const sweep = new THREE.Group(); g.add(sweep);
  for (let i = 0; i < arms * 2; i++) {
    const a = (i * Math.PI) / arms;
    const arm = new THREE.Group(); arm.rotation.y = -a; sweep.add(arm);
    const pts = [V(8, 6), V(len * 0.4, 9), V(len * 0.75, 7), V(len, 10)];
    arm.add(part(organic(pts, [7, 6, 4.5, 2.2], 10, 18), purple, 0.9));
    for (let k = 1; k <= 5; k++) place(arm, new THREE.Mesh(new THREE.SphereGeometry(1.6 - k * 0.15, 8, 6), sucker), (len * k) / 6.2, 4, 4.5 - k * 0.4);
  }
  return { group: g, update(angle, t) { sweep.rotation.y = -angle; g.position.y = Math.sin((t ?? 0) * 2) * 1.5; } };
}

// ---------- sea caves (portals) ----------

/** Aboard ship, a portal is a cargo hatch: a raised timber frame round a dark square opening. */
function hatch(x: number, y: number, L: LevelDef, toScene: ToScene, exit: boolean, yaw: number) {
  const root = new THREE.Group();
  root.position.copy(toScene(x, y)).setY(heightAt(L, x, y));
  root.rotation.y = yaw;
  const out = PORTAL_R * 1.25, inn = PORTAL_R;
  const sh = new THREE.Shape(); sh.moveTo(-out, -out); sh.lineTo(out, -out); sh.lineTo(out, out); sh.lineTo(-out, out); sh.closePath();
  const ho = new THREE.Path(); ho.moveTo(-inn, -inn); ho.lineTo(-inn, inn); ho.lineTo(inn, inn); ho.lineTo(inn, -inn); ho.closePath();
  sh.holes.push(ho);
  root.add(part(new THREE.ExtrudeGeometry(sh, { depth: 5, bevelEnabled: false }).rotateX(-Math.PI / 2), toon(0x5a3418), 1));
  for (const c of [-1, 1]) for (const d of [-1, 1]) place(root, new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 5), toon(0xc8a040)), c * out * 0.85, 5.2, d * out * 0.85);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(inn * 2, inn * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: exit ? 0x3a2a14 : 0x0a0604, toneMapped: false }));
  hole.position.y = 0.6; root.add(hole);
  if (exit) {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(5, 12, 3).rotateZ(-Math.PI / 2), glow(0xffd84a));
    arrow.position.set(out + 12, 3, 0); root.add(arrow);
  }
  return { root, hole };
}

function caveMouth(x: number, y: number, L: LevelDef, toScene: ToScene, exit: boolean, yaw: number) {
  if (L.ship) return hatch(x, y, L, toScene, exit, yaw);
  const root = new THREE.Group();
  root.position.copy(toScene(x, y)).setY(heightAt(L, x, y));
  root.rotation.y = yaw;
  const rock = toon(0x8a8478, { vertexColors: false });
  // A rocky arch over a dark opening in the ground
  const arch = part(new THREE.TorusGeometry(PORTAL_R + 8, 9, 10, 20, Math.PI), rock, 1.2);
  arch.rotation.y = Math.PI / 2; root.add(arch);
  for (const z of [-1, 1]) place(root, part(new THREE.DodecahedronGeometry(11, 1), rock, 1), 0, 4, z * (PORTAL_R + 8));
  const hole = new THREE.Mesh(new THREE.CircleGeometry(PORTAL_R, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: exit ? 0x1aa8c8 : 0x0a1418, toneMapped: false }));
  hole.position.y = 0.6; root.add(hole);
  if (exit) {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(5, 12, 3).rotateZ(-Math.PI / 2), glow(0xffd84a));
    arrow.position.set(PORTAL_R + 14, 3, 0); root.add(arrow);
  }
  return { root, hole };
}

export function seaCave(p: Portal, L: LevelDef, toScene: ToScene): Animated {
  const g = new THREE.Group();
  const exitYaw = p.exit != null ? (-p.exit * Math.PI) / 180 : -Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]);
  const a = caveMouth(p.a[0], p.a[1], L, toScene, false, -Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]));
  const b = caveMouth(p.b[0], p.b[1], L, toScene, true, exitYaw);
  g.add(a.root, b.root);
  return { group: g, update(_x, t) { if (!L.ship) (b.hole.material as THREE.MeshBasicMaterial).color.setHSL(0.53, 0.8, 0.4 + 0.08 * Math.sin(t * 3)); } };
}

// ---------- the island around the course ----------

function galleon(seed: number) {
  const g = new THREE.Group();
  const hull = toon(0x5a3418), trim = toon(0xc8a040), sail = toon(0xf4ecd8);
  const s = new THREE.Shape(); s.moveTo(-200, 60); s.lineTo(220, 60); s.lineTo(160, 0); s.lineTo(-170, 0); s.closePath();
  g.add(part(new THREE.ExtrudeGeometry(s, { depth: 90, bevelEnabled: false }).translate(0, 0, -45), hull, 3, false));
  place(g, part(new THREE.BoxGeometry(80, 50, 92), hull, 2, false), -150, 85, 0);
  place(g, part(new THREE.BoxGeometry(440, 6, 94), trim, 0, false), 0, 58, 0);
  for (const [x, h] of [[-60, 260], [70, 300], [170, 200]]) {
    place(g, part(new THREE.CylinderGeometry(5, 6, h, 8).translate(0, h / 2, 0), hull, 1, false), x, 60, 0);
    for (const k of [0.45, 0.75]) place(g, part(new THREE.BoxGeometry(6, h * 0.24, 110), sail, 1, false), x, 60 + h * k, 0);
  }
  place(g, part(new THREE.PlaneGeometry(50, 30), toon(0x1a1a1a, { side: THREE.DoubleSide }), 0, false), 70, 380, 0);
  g.rotation.y = seed;
  return g;
}

function skullRock() {
  const g = new THREE.Group();
  const stone = toon(0xb8b0a0);
  g.add(part(new THREE.SphereGeometry(160, 20, 14).scale(1, 0.9, 0.9), stone, 3, false));
  for (const z of [-55, 55]) place(g, new THREE.Mesh(new THREE.SphereGeometry(38, 12, 10), toon(0x1a1410)), 120, 30, z);
  place(g, new THREE.Mesh(new THREE.ConeGeometry(22, 40, 3).rotateZ(Math.PI / 2), toon(0x1a1410)), 140, -30, 0);
  for (let k = -2; k <= 2; k++) place(g, part(new THREE.BoxGeometry(20, 30, 22), stone, 1, false), 118, -95, k * 26);
  return g;
}

/** Turquoise sea all the way to the horizon, with gentle swell. */
function ocean(centre: THREE.Vector3): Animated {
  const map = cached('t:ocean', () => canvasTex(256, 256, (g) => {
    const r = rng(9);
    g.fillStyle = '#1aa0c8'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) { g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(10,90,140,0.35)'; g.lineWidth = 2; const x = r() * 256, y = r() * 256; g.beginPath(); g.arc(x, y, 6 + r() * 10, 3.6, 5.8); g.stroke(); }
  }, true, 40));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map, gradientMap: toonRamp() }));
  m.position.copy(centre).setY(SEA_Y);
  m.receiveShadow = true;
  return { group: m, update: (_a, t) => { map.offset.set(t * 0.004, t * 0.002); m.position.y = SEA_Y + Math.sin(t * 0.8) * 1.5; } };
}

/**
 * The cove around an expert hole: the course sits on a sandy island in a turquoise sea, with palms along the
 * beach, crates and barrels, galleons at anchor, Skull Rock on the horizon and gulls wheeling overhead.
 */
export function coveLandscape(L: LevelDef, outline: Pt[], toScene: ToScene, lawnH: (x: number, y: number) => number, anims: Animated[]) {
  const group = new THREE.Group();
  const r = rng(Math.round(L.tee[0] * 7 + L.cup[1] * 5));
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const b = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const [tx, ty] = L.tee;
  const clearOf = (x: number, y: number, gap: number) => { const o = outlineDistance(outline, x, y); return !o.inside && o.d > gap; };
  const at = (x: number, y: number, lift = 0) => toScene(x, y).setY(lawnH(x, y) + lift);
  const centre = toScene(cx, cy);
  const sea = ocean(centre); group.add(sea.group); anims.push(sea);

  // Palms, barrels and crates along the beach (round an island; beside a ship there's only sea)
  if (!L.ship) resample(outline, 90).forEach((p, i) => {
    const x = p.x + p.nx * 42, y = p.y + p.ny * 42;
    if (!clearOf(x, y, 30) || Math.hypot(x - tx, y - ty) < 120) return;
    if (i % 4 === 0) { const t = palm(i * 7 + 3, 110 + r() * 60); t.position.copy(at(x, y, -2)); group.add(t); }
    else if (i % 4 === 2) { const bb = barrelBody(11, 24); bb.position.copy(at(x, y, 12)); group.add(bb); }
  });
  // Galleons at anchor and Skull Rock out to sea
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI * 0.85 + i * 0.6 + (r() - 0.5) * 0.2;
    const sh = galleon(r() * 6);
    sh.position.copy(toScene(cx + Math.cos(a) * 1500, cy + Math.sin(a) * 1100)).setY(-30);
    sh.scale.setScalar(0.9 + r() * 0.3);
    group.add(sh);
    const base = sh.position.y, ph = i * 1.7;
    anims.push({ group: sh, update: (_x, t) => { sh.position.y = base + Math.sin(t * 0.9 + ph) * 4; sh.rotation.z = Math.sin(t * 0.7 + ph) * 0.03; } });
  }
  const skull = skullRock();
  skull.position.copy(toScene(cx + 700, cy - 2300)).setY(-40);
  skull.rotation.y = -Math.PI / 2;
  group.add(skull);
  // Gulls wheeling overhead
  const gullMat = toon(0xffffff, { side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const gull = new THREE.Group();
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(14, 4).translate(7, 0, 0), gullMat); w.scale.x = s; w.rotation.z = s * 0.3; gull.add(w); }
    group.add(gull);
    const ph = i * 1.3, rad = 500 + i * 120;
    anims.push({ group: gull, update: (_a, t) => {
      gull.position.copy(centre).add(V(Math.cos(t * 0.15 + ph) * rad, 220 + i * 30 + Math.sin(t + ph) * 10, Math.sin(t * 0.15 + ph) * rad * 0.6));
      gull.rotation.y = -(t * 0.15 + ph);
      gull.children.forEach((w, k) => (w.rotation.z = (k ? -1 : 1) * (0.3 + Math.sin(t * 6 + ph) * 0.4)));
    } });
  }
  return group;
}
