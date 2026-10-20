// Jurassic Canyon: materials, dinosaurs, volcanoes, tumbleweeds, lava and prehistoric planting.
// Everything is built from smooth, tapering forms so it reads organic rather than geometric.
// Purely visual; positions of moving things come from physics.ts so what you see is what you hit.
import * as THREE from 'three';
import { Animated, fern, modelMaterials, plainMaterials } from './art';
import { Dino, LevelDef, Pt, Tumbleweed, Volcano } from './levels';
import { Models, PieceBatch } from './models';
import { dinoPose, heightAt, tumbleweedAt, VOLCANO_SLOPE, volcanoCore, World } from './physics';
import { outlineDistance, resample } from './landscape';

type ToScene = (x: number, y: number) => THREE.Vector3;

// ---------- helpers ----------

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const cache = new Map<string, unknown>();
function cached<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, color = true, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

function shared<T extends THREE.Material>(m: T): T { m.userData.shared = true; return m; }

/**
 * A smooth tube that tapers along a curve: the building block for necks, tails, legs and fronds.
 * `radii` are sampled along the curve; `flat` squashes the cross-section (1 = round).
 */
export function organic(points: THREE.Vector3[], radii: number[], radial = 12, steps = 24, flat = 1, colorAt?: (t: number, up: number) => number) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(steps, false);
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  const rAt = (t: number) => {
    const f = t * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(f));
    const u = f - i, s = u * u * (3 - 2 * u);
    return radii[i] + (radii[i + 1] - radii[i]) * s;
  };
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = curve.getPointAt(t);
    const N = frames.normals[i], B = frames.binormals[i];
    const r = rAt(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cx = Math.cos(a), sy = Math.sin(a) * flat;
      const n = new THREE.Vector3().addScaledVector(N, cx).addScaledVector(B, sy).normalize();
      pos.push(p.x + (N.x * cx + B.x * sy) * r, p.y + (N.y * cx + B.y * sy) * r, p.z + (N.z * cx + B.z * sy) * r);
      nor.push(n.x, n.y, n.z);
      const c = colorAt ? colorAt(t, n.y) : 1;
      col.push(c, c, c);
    }
  }
  for (let i = 0; i < steps; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // round caps
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** A soft ellipsoid with vertex shading (lighter underneath for skin, as countershading). */
function blob(rx: number, ry: number, rz: number, belly = 0.25, segs = 22) {
  const g = new THREE.SphereGeometry(1, segs, Math.round(segs * 0.7));
  g.scale(rx, ry, rz);
  const n = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) { const c = 1 + belly * Math.max(0, -n.getY(i)) - 0.15 * Math.max(0, n.getY(i)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Add a mesh to a parent at a local position (returns the mesh). */
function place(parent: THREE.Object3D, m: THREE.Mesh, x: number, y: number, z: number) {
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function part(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// ---------- materials ----------

/** Packed dirt: warm red-brown earth with cracks, pebbles and a few dry grass blades. */
export function dirtMaterial() {
  return cached('m:dirt', () => {
    const r = rng(13);
    const draw = (g: CanvasRenderingContext2D, bump: boolean) => {
      g.fillStyle = bump ? '#808080' : '#a06a44';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 220; i++) {
        const x = r() * 512, y = r() * 512, rad = 15 + r() * 50;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        const v = bump ? (r() > 0.5 ? '255,255,255' : '0,0,0') : (r() > 0.5 ? '190,130,86' : '120,72,44');
        gr.addColorStop(0, `rgba(${v},${bump ? 0.15 : 0.4})`);
        gr.addColorStop(1, `rgba(${v},0)`);
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // Drying cracks: wandering dark lines
      g.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        let x = r() * 512, y = r() * 512, a = r() * 6.3;
        g.strokeStyle = bump ? 'rgba(0,0,0,0.75)' : 'rgba(60,32,18,0.55)';
        g.lineWidth = 1 + r() * 1.6;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 14; k++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < 900; i++) {
        const x = r() * 512, y = r() * 512, s = 1 + r() * 3;
        g.fillStyle = bump ? 'rgba(255,255,255,0.6)' : `rgba(${r() > 0.5 ? '215,180,140' : '90,60,40'},0.7)`;
        g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
      }
      if (!bump) for (let i = 0; i < 900; i++) {
        const x = r() * 512, y = r() * 512;
        g.strokeStyle = 'rgba(170,150,80,0.45)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4); g.stroke();
      }
    };
    return shared(new THREE.MeshStandardMaterial({
      map: canvasTex(512, 512, (g) => draw(g, false)), bumpMap: canvasTex(512, 512, (g) => draw(g, true), false), bumpScale: 1.4,
      roughness: 0.95, vertexColors: true,
    }));
  });
}

/** Ash-dusted ground around the course: darker, with sparse scrubby grass. */
export function ashMaterial() {
  return cached('m:ash', () => {
    const r = rng(29);
    const c = canvasTex(512, 512, (g) => {
      g.fillStyle = '#5a4130';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 300; i++) {
        const x = r() * 512, y = r() * 512, rad = 20 + r() * 70;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        const v = r() > 0.6 ? '110,120,60' : r() > 0.5 ? '120,90,66' : '58,40,30';
        gr.addColorStop(0, `rgba(${v},0.4)`);
        gr.addColorStop(1, `rgba(${v},0)`);
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 8000; i++) {
        const x = r() * 512, y = r() * 512;
        g.strokeStyle = r() > 0.5 ? 'rgba(140,140,70,0.4)' : 'rgba(40,30,20,0.4)';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4); g.stroke();
      }
    }, true, 30);
    return shared(new THREE.MeshStandardMaterial({ map: c, roughness: 1 }));
  });
}

/** Molten lava: a crust of dark plates split by glowing seams, also used as its own emissive map. */
export function lavaMaterial() {
  return cached('m:lava', () => {
    const r = rng(5);
    const tex = canvasTex(512, 512, (g) => {
      g.fillStyle = '#ff7a1a';
      g.fillRect(0, 0, 512, 512);
      // Hot seams underneath
      for (let i = 0; i < 40; i++) {
        const x = r() * 512, y = r() * 512, rad = 30 + r() * 60;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(255,230,120,0.8)');
        gr.addColorStop(1, 'rgba(255,120,20,0)');
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // Cooling crust plates (Voronoi-ish blobs) leaving glowing gaps
      for (let i = 0; i < 70; i++) {
        const x = r() * 512, y = r() * 512, rad = 18 + r() * 34;
        g.fillStyle = `rgba(${40 + r() * 30},${18 + r() * 12},${12},${0.75 + r() * 0.2})`;
        g.beginPath();
        for (let k = 0; k <= 9; k++) {
          const a = (k / 9) * Math.PI * 2, rr = rad * (0.75 + r() * 0.35);
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
          if (k) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.fill();
      }
    }, true, 1);
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.6 });
    return shared(m);
  });
}

/** Dark basalt in place of grey garden stone (keeps the baked shading). */
export function basaltSwap(): Record<string, THREE.Material> {
  return cached('m:basaltSwap', () => {
    const stone = modelMaterials().Stone.clone() as THREE.MeshStandardMaterial;
    stone.color.setHex(0x5e4e48);
    stone.userData.shared = true;
    return { Stone: stone };
  });
}
export function basaltPlain() {
  return cached('m:basaltPlain', () => {
    const m = plainMaterials().Stone.clone() as THREE.MeshStandardMaterial;
    m.color.setHex(0x5a4a44);
    return shared(m);
  });
}

/** Dinosaur skin: mottled scales with darker bands; tinted per species. */
function skinMaterial(base: string, stripe: string, seed: number) {
  return cached(`m:skin:${base}`, () => {
    const r = rng(seed);
    const tex = canvasTex(256, 256, (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 32) {
        g.fillStyle = stripe;
        g.globalAlpha = 0.35;
        g.beginPath();
        for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 6);
        for (let x = 256; x >= 0; x -= 16) g.lineTo(x, y + 10 + Math.sin(x * 0.07 + y) * 5);
        g.fill();
      }
      g.globalAlpha = 1;
      for (let i = 0; i < 2600; i++) {
        const x = r() * 256, y = r() * 256, s = 1 + r() * 2.5;
        g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.16)';
        g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
      }
    }, true, 1);
    return shared(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, vertexColors: true }));
  });
}

const boneMat = () => cached('m:bone', () => shared(new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.65, vertexColors: true })));
const darkMat = () => cached('m:eye', () => shared(new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 0.3 })));

// ---------- dinosaurs ----------

/** A dinosaur rig that follows its physics pose every frame. */
export function dinosaur(d: Dino, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const body = new THREE.Group(); // rotates to the heading
  root.add(body);
  const build = d.kind === 'bronto' ? bronto : d.kind === 'trex' ? trex : stego;
  const rig = build(body);
  let last = world.time;
  return {
    group: root,
    update() {
      const p = dinoPose(d, world.time);
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y));
      body.rotation.y = -p.heading;
      rig(world.time, p, Math.max(0, world.time - last));
      last = world.time;
    },
  };
}

type Pose = ReturnType<typeof dinoPose>;
type Rig = (t: number, p: Pose, dt: number) => void;

const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
const shade = (t: number, up: number) => 1 + 0.25 * Math.max(0, -up) - 0.12 * Math.max(0, up);

/** Brontosaurus: high-bellied body on four pillar legs (the ball rolls between them), long neck and tail. */
function bronto(g: THREE.Group): Rig {
  const skin = skinMaterial('#7d8a62', '#4e5a3a', 3);
  place(g, part(blob(66, 32, 30), skin), 0, 82, 0);
  const neck = new THREE.Group(); neck.position.set(50, 92, 0); g.add(neck);
  neck.add(part(organic([V(0, 0), V(30, 30), V(55, 80), V(70, 125)], [17, 12, 8, 6.5], 12, 22, 1, shade), skin));
  const head = new THREE.Group(); head.position.set(72, 128, 0); neck.add(head);
  place(head, part(blob(15, 8, 8), skin), 8, 2, 0);
  for (const z of [-5, 5]) place(head, part(new THREE.SphereGeometry(1.8, 8, 6), darkMat()), 12, 6, z);
  const tail = new THREE.Group(); tail.position.set(-55, 85, 0); g.add(tail);
  tail.add(part(organic([V(0, 0), V(-40, -12), V(-90, -40), V(-140, -55), V(-175, -58)], [18, 13, 8, 4, 1.2], 12, 26, 1, shade), skin));
  // Legs: pivots at the hips/shoulders; physics legs are at (±38, ±24)
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[38, 24], [38, -24], [-38, 24], [-38, -24]]) {
    const leg = new THREE.Group(); leg.position.set(x, 72, z); g.add(leg);
    leg.add(part(organic([V(0, 0), V(2, -30), V(0, -58), V(1, -71)], [14, 11, 10, 11], 12, 12, 1, shade), skin));
    place(leg, part(blob(12, 4, 11, 0.1, 14), skin), 2, -70, 0);
    legs.push(leg);
  }
  return (t, p) => {
    const walking = Math.hypot(p.vx, p.vy) > 2;
    const k = walking ? 1 : 0;
    legs.forEach((leg, i) => { leg.rotation.z = k * 0.22 * Math.sin(t * 3.2 + (i === 0 || i === 3 ? 0 : Math.PI)); });
    neck.rotation.z = 0.06 * Math.sin(t * 0.9);
    neck.rotation.y = 0.18 * Math.sin(t * 0.45);
    head.rotation.z = 0.12 * Math.sin(t * 1.3);
    tail.rotation.y = 0.2 * Math.sin(t * 1.1);
  };
}

/** T-rex: two thick legs, big head with a snapping jaw, tiny arms, and the sweeping tail. */
function trex(g: THREE.Group): Rig {
  const skin = skinMaterial('#7a5a3e', '#3e2a1c', 7);
  const torso = new THREE.Group(); torso.position.set(0, 72, 0); g.add(torso);
  torso.add(part(organic([V(-30, 4), V(0, 10), V(30, 22), V(48, 38)], [22, 26, 20, 14], 14, 18, 0.9, shade), skin));
  const head = new THREE.Group(); head.position.set(52, 44, 0); torso.add(head);
  place(head, part(blob(26, 13, 12), skin), 16, 6, 0);
  const jaw = new THREE.Group(); jaw.position.set(0, -3, 0); head.add(jaw);
  place(jaw, part(blob(22, 5, 10), skin), 16, -2, 0);
  // teeth
  const teeth: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) for (const z of [-8.5, 8.5]) teeth.push(new THREE.ConeGeometry(1.2, 4, 5).rotateX(Math.PI).translate(6 + i * 4.3, -0.5, z));
  head.add(part(mergeGeos(teeth), boneMat(), false));
  for (const z of [-9, 9]) place(head, part(new THREE.SphereGeometry(2.2, 8, 6), darkMat()), 24, 14, z);
  for (const z of [-14, 14]) {
    const arm = part(organic([V(0, 0), V(8, -6), V(12, -13)], [3.5, 2.5, 1.5], 8, 8, 1, shade), skin);
    arm.position.set(30, 12, z); torso.add(arm);
  }
  // Legs at physics (4, ±16)
  for (const z of [16, -16]) {
    const leg = new THREE.Group(); leg.position.set(-2, 70, z); g.add(leg);
    leg.add(part(organic([V(0, 0), V(8, -26), V(-4, -50), V(6, -68)], [16, 12, 7, 6], 12, 14, 1, shade), skin));
    place(leg, part(blob(13, 4, 7, 0.1, 12), skin), 10, -68, 0);
  }
  // Tail pivots at the hips; it reaches down to the ground where the physics sweeps it
  const tail = new THREE.Group(); tail.position.set(-18, 0, 0); g.add(tail);
  tail.add(part(organic([V(0, 76), V(-35, 62), V(-75, 36), V(-110, 16), V(-136, 10)], [20, 15, 10, 7, 4], 12, 24, 1, shade), skin));
  return (t, p) => {
    tail.rotation.y = -p.tail;
    torso.rotation.y = 0.15 * p.tail;
    jaw.rotation.z = -0.25 * Math.max(0, Math.sin(t * 2.3)) ** 3;
    head.rotation.y = 0.25 * Math.sin(t * 0.7);
  };
}

/** Stegosaurus: low, broad body with two rows of back plates and a spiked tail. */
function stego(g: THREE.Group): Rig {
  const skin = skinMaterial('#8a7a4a', '#5a4a26', 11);
  const plateMat = cached('m:plate', () => shared(new THREE.MeshStandardMaterial({ color: 0xb4583a, roughness: 0.6, vertexColors: true })));
  place(g, part(blob(64, 30, 28), skin), 0, 46, 0);
  g.add(part(organic([V(55, 46), V(78, 38), V(96, 30)], [18, 11, 8], 12, 10, 1, shade), skin));
  place(g, part(blob(13, 8, 8), skin), 102, 28, 0);
  // Plates: soft leaf shapes, alternating rows, tallest over the hips
  const plates: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const x = -55 + i * 13, h = 14 + 16 * Math.sin((i / 8) * Math.PI);
    const shape = new THREE.Shape();
    shape.moveTo(-h * 0.45, 0); shape.quadraticCurveTo(-h * 0.4, h * 0.8, 0, h); shape.quadraticCurveTo(h * 0.4, h * 0.8, h * 0.45, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 2, curveSegments: 8 });
    const y = 46 + 30 * Math.sqrt(Math.max(0, 1 - (x / 64) ** 2)) - 4;
    geo.translate(0, 0, -1).rotateX((i % 2 ? 1 : -1) * 0.18).translate(x, y, (i % 2 ? 1 : -1) * 4);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    plates.push(geo);
  }
  g.add(part(mergeGeos(plates), plateMat));
  const tail = new THREE.Group(); tail.position.set(-58, 44, 0); g.add(tail);
  tail.add(part(organic([V(0, 0), V(-30, -8), V(-62, -14), V(-86, -18)], [18, 12, 7, 4], 12, 16, 1, shade), skin));
  const spikes: THREE.BufferGeometry[] = [];
  for (const [x, z, a] of [[-70, 6, 0.6], [-70, -6, -0.6], [-82, 5, 0.8], [-82, -5, -0.8]]) spikes.push(new THREE.ConeGeometry(2.6, 22, 8).translate(0, 11, 0).rotateX(a).translate(x, -14, z));
  tail.add(part(mergeGeos(spikes), boneMat()));
  for (const [x, z] of [[40, 22], [40, -22], [-38, 22], [-38, -22]]) {
    const leg = part(organic([V(0, 30), V(2, 12), V(0, 0)], [11, 9, 10], 10, 8, 1, shade), skin);
    leg.position.set(x, 0, z); g.add(leg);
  }
  return (t) => { tail.rotation.y = 0.25 * Math.sin(t * 0.8); };
}

function mergeGeos(geos: THREE.BufferGeometry[]) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3]] as const) {
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of parts) { if (!g.attributes.normal) g.computeVertexNormals(); arr.set(g.attributes[name].array as Float32Array, o); o += g.attributes.position.count * size; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.setAttribute('color', new THREE.BufferAttribute(new Float32Array(total * 3).fill(1), 3));
  return out;
}

// ---------- tumbleweeds ----------

/** A loose ball of dry twigs that rolls and bounces along its physics track. */
export function tumbleweed(w: Tumbleweed, world: World, L: LevelDef, toScene: ToScene): Animated {
  const r = rng(Math.round(w.a[0] * 3 + w.a[1]));
  const R = w.r ?? 15;
  const geo = cached('g:tumble', () => {
    const twigs: THREE.BufferGeometry[] = [];
    const rr = rng(4);
    for (let i = 0; i < 34; i++) {
      // random great-circle arcs with a little wobble
      const axis = new THREE.Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5).normalize();
      const start = new THREE.Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5).cross(axis).normalize();
      const pts: THREE.Vector3[] = [];
      const span = 1.4 + rr() * 2.2;
      for (let k = 0; k <= 6; k++) pts.push(start.clone().applyAxisAngle(axis, (k / 6) * span).multiplyScalar(0.8 + rr() * 0.25));
      twigs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.045 + rr() * 0.03, 5));
    }
    return mergeGeos(twigs);
  });
  const mat = cached('m:twig', () => shared(new THREE.MeshStandardMaterial({ color: 0xd8b07a, roughness: 0.85, vertexColors: true })));
  const ball = part(geo, mat);
  ball.scale.setScalar(R);
  const root = new THREE.Group();
  root.add(ball);
  const q = new THREE.Quaternion();
  let last = world.time;
  ball.rotation.set(r() * 6, r() * 6, r() * 6);
  return {
    group: root,
    update() {
      const p = tumbleweedAt(w, world.time);
      const dt = Math.max(0, world.time - last);
      last = world.time;
      const sp = Math.hypot(p.vx, p.vy);
      const hop = Math.abs(Math.sin(world.time * 5 + w.a[0])) * 5 * Math.min(1, sp / 60);
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y) + R * 0.85 + hop);
      if (sp > 0.1) {
        q.setFromAxisAngle(new THREE.Vector3(p.vy / sp, 0, -p.vx / sp), (sp * dt) / R);
        ball.quaternion.premultiply(q);
      }
    },
  };
}

// ---------- volcanoes ----------

const smokeTex = () => cached('t:smoke', () => canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,0.8)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
}));

/** Rock with glowing lava runnels down its sides. */
function volcanoRockMaterial() {
  return cached('m:volcRock', () => {
    const r = rng(17);
    const draw = (g: CanvasRenderingContext2D, glow: boolean) => {
      g.fillStyle = glow ? '#000' : '#3e302a';
      g.fillRect(0, 0, 512, 256);
      if (!glow) for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${r() > 0.5 ? '120,100,90' : '20,15,12'},${r() * 0.4})`; g.fillRect(r() * 512, r() * 256, 2, 2); }
      // Runnels: wavy lines from the top (v=1 is the crater) downward
      for (let i = 0; i < 9; i++) {
        let x = r() * 512;
        const len = 80 + r() * 150;
        g.lineCap = 'round';
        for (let w = 3; w >= 1; w--) {
          g.strokeStyle = glow ? `rgba(255,${120 + w * 30},40,${0.35 * w})` : `rgba(255,${110 + w * 25},40,${0.3 * w})`;
          g.lineWidth = w * 2.2;
          g.beginPath(); g.moveTo(x, 0);
          let xx = x;
          for (let y = 0; y < len; y += 8) { xx += (r() - 0.5) * 6; g.lineTo(xx, y); }
          g.stroke();
        }
        x += 40;
      }
    };
    const map = canvasTex(512, 256, (g) => draw(g, false));
    const glow = canvasTex(512, 256, (g) => draw(g, true));
    map.wrapT = glow.wrapT = THREE.ClampToEdgeWrapping;
    return shared(new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.92, flatShading: false }));
  });
}

/** A volcano cone: a craggy lathe profile with a lava-filled crater and a drifting smoke plume. */
function volcanoMesh(baseR: number, height: number, craterR: number, seed: number, smoke: number): { group: THREE.Group; anim: (t: number) => void } {
  const r = rng(seed);
  const g = new THREE.Group();
  const prof: THREE.Vector2[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // concave flanks steepening toward the rim
    prof.push(new THREE.Vector2(craterR + (baseR - craterR) * (1 - t) ** 1.7, height * t));
  }
  prof.push(new THREE.Vector2(craterR * 0.85, height * 0.94));
  const geo = new THREE.LatheGeometry(prof.reverse(), 40);
  // Craggy: push vertices in and out with layered noise
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.07 * Math.sin(a * 7 + seed) + 0.05 * Math.sin(a * 13 + y * 0.05 + seed * 2) + 0.03 * Math.sin(y * 0.2 + a * 3);
    pos.setX(i, x * k); pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  // UVs: lathe gives u around and v along the profile; keep v = height so runnels start at the rim
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - pos.getY(i) / height);
  g.add(part(geo, volcanoRockMaterial()));
  const lava = part(new THREE.CircleGeometry(craterR * 0.9, 24).rotateX(-Math.PI / 2), lavaMaterial(), false);
  lava.position.y = height * 0.9;
  g.add(lava);
  // Smoke plume
  const puffs: { s: THREE.Sprite; off: number; drift: number }[] = [];
  for (let i = 0; i < smoke; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex(), color: 0x6a5a55, transparent: true, depthWrite: false, opacity: 0.5 }));
    puffs.push({ s, off: i / smoke, drift: (r() - 0.5) * 0.6 });
    g.add(s);
  }
  return {
    group: g,
    anim(t) {
      for (const p of puffs) {
        const u = (t * 0.08 + p.off) % 1;
        const h = height + u * height * 1.6;
        p.s.position.set(Math.sin(u * 3 + p.off * 9) * craterR * 0.6 + u * height * 0.5 * p.drift, h, Math.cos(u * 2 + p.off * 7) * craterR * 0.4);
        const sc = craterR * (1.4 + u * 4);
        p.s.scale.set(sc, sc, 1);
        (p.s.material as THREE.SpriteMaterial).opacity = 0.55 * Math.sin(u * Math.PI);
      }
      (lavaMaterial() as THREE.MeshStandardMaterial).emissiveIntensity = 1.15 + 0.15 * Math.sin(t * 2.1);
    },
  };
}

/** On-course volcano: the cone's foot sits on the solid core; the turf flanks come from heightAt. */
export function courseVolcano(v: Volcano, L: LevelDef, toScene: ToScene): Animated {
  const core = volcanoCore(v.r);
  const footY = heightAt(L, v.x + core, v.y);
  const { group, anim } = volcanoMesh(core * 1.65, v.r * 1.05, core * 0.42, Math.round(v.x + v.y), 8);
  const root = new THREE.Group();
  root.add(group);
  root.position.copy(toScene(v.x, v.y)).setY(footY - 6);
  return { group: root, update: (_a, t) => anim(t) };
}

// ---------- prehistoric landscape ----------

/** Cycad palm: a scaly, slightly leaning trunk crowned with a fern rosette. */
function cycad(seed: number, height: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  const lean = (r() - 0.5) * 0.5;
  const trunkMat = cached('m:cycadTrunk', () => {
    const t = canvasTex(64, 256, (c) => {
      c.fillStyle = '#5a4630'; c.fillRect(0, 0, 64, 256);
      for (let y = 0; y < 256; y += 10) for (let x = (y / 10) % 2 ? 0 : 8; x < 64; x += 16) {
        c.fillStyle = 'rgba(120,96,64,0.8)'; c.beginPath(); c.ellipse(x, y, 7, 4, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(30,20,10,0.6)'; c.fillRect(x - 6, y + 3, 12, 1.5);
      }
    }, true);
    t.repeat.set(2, 4);
    return shared(new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
  });
  const trunk = organic([V(0, 0), V(lean * 20, height * 0.4), V(lean * 50, height * 0.8), V(lean * 60, height)], [height * 0.11, height * 0.085, height * 0.075, height * 0.065], 10, 12);
  // organic() writes UVs? no: give the trunk cylindrical-ish UVs
  const n = trunk.attributes.position.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { uv[i * 2] = (i % 11) / 10; uv[i * 2 + 1] = Math.floor(i / 11) / 12; }
  trunk.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  trunk.deleteAttribute('color');
  g.add(part(trunk, trunkMat));
  const crown = fern(height / 85, seed, 'none');
  crown.position.set(lean * 60, height - 4, 0);
  g.add(crown);
  return g;
}

/** Horsetails: clumps of jointed green stalks. */
function horsetails(spots: THREE.Vector3[], r: () => number) {
  const per = 9;
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1.1, 1, 6).translate(0, 0.5, 0), cached('m:horsetail', () => shared(new THREE.MeshStandardMaterial({ color: 0x6f8a3a, roughness: 0.8 }))), Math.max(1, spots.length * per));
  mesh.count = spots.length * per;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  spots.forEach((p, i) => {
    for (let k = 0; k < per; k++) {
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.35, 0, (r() - 0.5) * 0.35));
      mesh.setMatrixAt(i * per + k, m4.compose(p.clone().add(V((r() - 0.5) * 12, 0, (r() - 0.5) * 12)), q, V(1, 22 + r() * 26, 1)));
    }
  });
  mesh.castShadow = true;
  return mesh;
}

/** A dinosaur ribcage arching out of the ground, with a length of spine. */
function ribcage(seed: number) {
  const r = rng(seed);
  const geos: THREE.BufferGeometry[] = [];
  geos.push(organic([V(-70, 4), V(-30, 10), V(20, 12), V(70, 6)], [5, 6, 6, 4], 8, 20));
  for (let i = 0; i < 7; i++) {
    const x = -50 + i * 16, h = 34 + 16 * Math.sin((i / 6) * Math.PI) + r() * 4;
    for (const s of [-1, 1]) geos.push(organic([V(x, 10), V(x + 2, h * 0.6, s * 18), V(x + 4, h * 0.25, s * 30), V(x + 6, 0, s * 33)], [3.2, 2.8, 2.2, 1.6], 7, 12));
  }
  return part(mergeGeos(geos), boneMat());
}

/** A twig nest with speckled eggs. */
function eggNest(seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  const nest = new THREE.TorusGeometry(22, 7, 10, 28).rotateX(Math.PI / 2);
  const p = nest.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (0.8 + 0.4 * Math.sin(i * 1.7)));
  nest.computeVertexNormals();
  place(g, part(nest, cached('m:twig', () => shared(new THREE.MeshStandardMaterial({ color: 0xd8b07a, roughness: 0.85, vertexColors: true }))), false), 0, 4, 0);
  const eggMat = cached('m:egg', () => {
    const t = canvasTex(64, 64, (c) => { c.fillStyle = '#efe6cf'; c.fillRect(0, 0, 64, 64); for (let i = 0; i < 120; i++) { c.fillStyle = 'rgba(110,80,50,0.5)'; c.beginPath(); c.arc(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 2, 0, 6.3); c.fill(); } });
    return shared(new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
  });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    const e = part(new THREE.SphereGeometry(1, 16, 12).scale(7, 10, 7), eggMat);
    e.position.set(Math.cos(a) * 9, 10, Math.sin(a) * 9);
    e.rotation.set((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6);
    g.add(e);
  }
  return g;
}

/**
 * Dressing around a Jurassic hole: ferns and cycads, horsetails, basalt boulders, bones, a nest,
 * and big smoking volcanoes on the horizon.
 */
export function jurassicLandscape(L: LevelDef, outline: Pt[], models: Models, toScene: ToScene, lawnH: (x: number, y: number) => number, anims: Animated[]) {
  const group = new THREE.Group();
  const r = rng(Math.round(L.tee[1] * 11 + L.cup[0] * 5));
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const b = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const [tx, ty] = L.tee;
  const clearOf = (x: number, y: number, gap: number) => { const o = outlineDistance(outline, x, y); return !o.inside && o.d > gap; };
  const at = (x: number, y: number, lift = 0) => toScene(x, y).setY(lawnH(x, y) + lift);

  // Ferns hugging the kerb, broken by boulders
  const rocks = new PieceBatch(models);
  const tails: THREE.Vector3[] = [];
  resample(outline, 46).forEach((p, i) => {
    const off = 40 + Math.sin(i * 0.7) * 10, x = p.x + p.nx * off, y = p.y + p.ny * off;
    if (!clearOf(x, y, 26) || Math.hypot(x - tx, y - ty) < 120) return;
    if (i % 4 === 1) {
      const s = 10 + r() * 12, sp = at(x, y);
      rocks.add(`Boulder${1 + (i % 3)}`, new THREE.Matrix4().makeTranslation(sp.x, sp.y + s * 0.15, sp.z).multiply(new THREE.Matrix4().makeRotationY(r() * 6)).multiply(new THREE.Matrix4().makeScale(s * 1.3, s * 0.9, s)));
    } else if (i % 4 === 3) {
      tails.push(at(x, y));
    } else {
      const f = fern(0.55 + r() * 0.35, i + 3, 'none');
      f.position.copy(at(x, y, -2));
      f.rotation.y = r() * 6;
      group.add(f);
    }
  });
  group.add(horsetails(tails, r));

  // Cycads and big ferns further out on the rolling ground
  for (let i = 0, tries = 0; i < 9 && tries < 200; tries++) {
    const a = r() * Math.PI * 2;
    const x = cx + Math.cos(a) * ((b.maxX - b.minX) / 2 + 140 + r() * 260), y = cy + Math.sin(a) * ((b.maxY - b.minY) / 2 + 120 + r() * 220);
    if (!clearOf(x, y, 110) || Math.hypot(x - tx, y - ty) < 200) continue;
    const c = cycad(i * 7 + 1, 110 + r() * 90);
    c.position.copy(at(x, y, -2));
    c.rotation.y = r() * 6;
    group.add(c);
    const f = fern(1.2 + r() * 0.5, i + 40, 'none');
    f.position.copy(at(x + 40, y + 20, -2));
    group.add(f);
    i++;
  }

  // Bones and a nest on the ground beyond the kerb
  const spot = (minGap: number) => {
    for (let k = 0; k < 80; k++) {
      const a = r() * Math.PI * 2;
      const x = cx + Math.cos(a) * ((b.maxX - b.minX) / 2 + 100 + r() * 160), y = cy + Math.sin(a) * ((b.maxY - b.minY) / 2 + 90 + r() * 120);
      if (clearOf(x, y, minGap) && Math.hypot(x - tx, y - ty) > 180) return [x, y] as const;
    }
    return null;
  };
  const rib = spot(120);
  if (rib) { const m = ribcage(rib[0]); m.position.copy(at(rib[0], rib[1], -4)); m.rotation.y = r() * 6; group.add(m); }
  const nest = spot(90);
  if (nest) { const n = eggNest(nest[1]); n.position.copy(at(nest[0], nest[1], -2)); group.add(n); }

  // Boulders scattered on the ash
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const x = cx + Math.cos(a) * ((b.maxX - b.minX) / 2 + 120 + r() * 500), y = cy + Math.sin(a) * ((b.maxY - b.minY) / 2 + 110 + r() * 400);
    if (!clearOf(x, y, 90)) continue;
    const s = 16 + r() * 30, sp = at(x, y);
    rocks.add(`Boulder${1 + (i % 3)}`, new THREE.Matrix4().makeTranslation(sp.x, sp.y + s * 0.1, sp.z).multiply(new THREE.Matrix4().makeRotationY(r() * 6)).multiply(new THREE.Matrix4().makeScale(s * 1.4, s, s * 1.2)));
  }
  group.add(rocks.build(basaltSwap()));

  // Volcanoes on the horizon, behind the hole, smoking
  const horizon: [number, number, number, number][] = [
    [cx - 1700, cy - 2600, 900, 1100], [cx + 1400, cy - 2900, 1100, 1350], [cx + 3000, cy - 900, 700, 800],
  ];
  horizon.forEach(([x, y, br, h], i) => {
    const v = volcanoMesh(br, h, br * 0.16, 30 + i, 10);
    v.group.position.copy(toScene(x, y)).setY(-20);
    group.add(v.group);
    v.group.traverse((o) => { o.castShadow = false; });
    anims.push({ group: v.group, update: (_a, t) => v.anim(t + i * 3) });
  });
  return group;
}

/** Lava surface for a lava zone (same physics as water). */
export function lavaSurfaceMaterial() { return lavaMaterial(); }

export { volcanoMesh, VOLCANO_SLOPE };
