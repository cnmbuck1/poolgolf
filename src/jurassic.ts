// Jurassic Canyon in a cartoon style: flat "toon" shading in bold colours, dark ink outlines,
// chunky big-eyed dinosaurs, rounded volcanoes with puffy smoke, and chunky palms and bushes.
// Purely visual; positions of moving things come from physics.ts so what you see is what you hit.
import * as THREE from 'three';
import { Animated } from './art';
import { Dino, LevelDef, Pt, Tumbleweed, Volcano } from './levels';
import { Models, PieceBatch } from './models';
import { DINO_LEGS, dinoPose, heightAt, tumbleweedAt, VOLCANO_SLOPE, volcanoCore, World } from './physics';
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

const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

// ---------- toon shading and ink outlines ----------

/** Three-band light ramp: shadow, mid, lit. Gives the flat cartoon look. */
const toonRamp = () => cached('t:ramp', () => {
  const data = new Uint8Array([135, 135, 135, 255, 190, 190, 190, 255, 238, 238, 238, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
});

/** Flat-shaded cartoon material (vertex colours add a lighter belly / underside where present). */
export function toon(color: number, opts: Partial<THREE.MeshToonMaterialParameters> = {}) {
  return cached(`m:toon:${color}:${JSON.stringify(Object.keys(opts))}:${opts.vertexColors ?? ''}`, () =>
    shared(new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...opts })));
}

/** Ink outline: the back faces pushed out along the normals and drawn in a dark colour. */
const inkMat = (w: number) => cached(`m:ink:${w}`, () => shared(new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { w: { value: w }, color: { value: new THREE.Color(0x2a1408) } },
  vertexShader: 'uniform float w; void main() { vec3 p = position + normal * w; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
  fragmentShader: 'uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); \n#include <colorspace_fragment>\n }',
})));

/** A cartoon part: toon-shaded mesh with an ink outline `ink` units thick (0 for none). */
function part(geo: THREE.BufferGeometry, mat: THREE.Material, ink = 1.3, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  if (ink > 0) {
    const o = new THREE.Mesh(geo, inkMat(ink));
    o.raycast = () => {};
    m.add(o);
  }
  return m;
}

function place(parent: THREE.Object3D, m: THREE.Object3D, x: number, y: number, z: number) {
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/**
 * A smooth tube that tapers along a curve: necks, tails, legs, trunks.
 * Closed with rounded ends so outlines stay clean.
 */
export function organic(points: THREE.Vector3[], radii: number[], radial = 14, steps = 24) {
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
    // round off the two ends
    const end = Math.min(t, 1 - t) * steps;
    const r = rAt(t) * (end < 1 ? Math.sqrt(Math.max(0.05, end)) : 1);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const n = new THREE.Vector3().addScaledVector(N, Math.cos(a)).addScaledVector(B, Math.sin(a)).normalize();
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      const c = 1 + 0.35 * Math.max(0, -n.y); // lighter underside
      col.push(c, c, c);
    }
  }
  // Wind the faces outward whatever the curve's frame handedness turned out to be
  const P = (k: number) => V(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const m = Math.floor(steps / 2) * (radial + 1) + 1;
  const face = P(m + radial + 1).sub(P(m)).cross(P(m + 1).sub(P(m)));
  const flip = face.dot(V(nor[m * 3], nor[m * 3 + 1], nor[m * 3 + 2])) < 0;
  for (let i = 0; i < steps; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b);
    else idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** A soft ellipsoid, lighter underneath (cartoon countershading). */
function blob(rx: number, ry: number, rz: number, belly = 0.4, segs = 24) {
  const g = new THREE.SphereGeometry(1, segs, Math.round(segs * 0.7));
  g.scale(rx, ry, rz);
  g.computeVertexNormals();
  const n = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) { const c = 1 + belly * Math.max(0, -n.getY(i)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function mergeGeos(geos: THREE.BufferGeometry[]) {
  const parts = geos.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (!n.attributes.normal) n.computeVertexNormals(); return n; });
  const total = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3]] as const) {
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of parts) { arr.set(g.attributes[name].array as Float32Array, o); o += g.attributes.position.count * size; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.color as THREE.BufferAttribute | undefined;
    if (c) col.set(c.array as Float32Array, o); else col.fill(1, o, o + g.attributes.position.count * 3);
    o += g.attributes.position.count * 3;
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// ---------- ground materials ----------

/** Packed dirt in warm cartoon orange: soft blotches, a few clean cracks and pebbles. */
export function dirtMaterial() {
  return cached('m:dirt', () => {
    const r = rng(13);
    const map = canvasTex(512, 512, (g) => {
      g.fillStyle = '#d98f55';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 70; i++) {
        const x = r() * 512, y = r() * 512, rad = 30 + r() * 60;
        g.fillStyle = r() > 0.5 ? 'rgba(232,160,100,0.45)' : 'rgba(190,118,70,0.4)';
        g.beginPath(); g.ellipse(x, y, rad, rad * (0.5 + r() * 0.4), r() * 3, 0, Math.PI * 2); g.fill();
      }
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(140,80,45,0.55)';
      for (let i = 0; i < 12; i++) {
        let x = r() * 512, y = r() * 512, a = r() * 6.3;
        g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 7; k++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * 12; y += Math.sin(a) * 12; g.lineTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < 160; i++) {
        const x = r() * 512, y = r() * 512, s = 2 + r() * 4;
        g.fillStyle = '#b8744a'; g.beginPath(); g.ellipse(x, y + 1.5, s, s * 0.7, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f0b884'; g.beginPath(); g.ellipse(x, y, s, s * 0.7, 0, 0, Math.PI * 2); g.fill();
      }
    });
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp(), vertexColors: true }));
  });
}

/** Ground around the course: sandy ochre with tufty green patches. */
export function ashMaterial() {
  return cached('m:ash', () => {
    const r = rng(29);
    const c = canvasTex(512, 512, (g) => {
      g.fillStyle = '#b07a4a';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 90; i++) {
        const x = r() * 512, y = r() * 512, rad = 20 + r() * 55;
        g.fillStyle = r() > 0.55 ? 'rgba(130,160,70,0.55)' : 'rgba(150,100,62,0.5)';
        g.beginPath(); g.ellipse(x, y, rad, rad * 0.6, r() * 3, 0, Math.PI * 2); g.fill();
      }
    }, true, 30);
    return shared(new THREE.MeshToonMaterial({ map: c, gradientMap: toonRamp() }));
  });
}

/** Cartoon lava: rounded dark crust plates with ink edges floating on bright yellow-orange. */
export function lavaMaterial() {
  return cached('m:lava', () => {
    const r = rng(5);
    const tex = canvasTex(512, 512, (g) => {
      const gr = g.createLinearGradient(0, 0, 512, 512);
      gr.addColorStop(0, '#ffb020'); gr.addColorStop(0.5, '#ff7a10'); gr.addColorStop(1, '#ffc040');
      g.fillStyle = gr;
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 30; i++) {
        const x = r() * 512, y = r() * 512, rad = 12 + r() * 20;
        g.fillStyle = 'rgba(255,240,150,0.85)';
        g.beginPath(); g.ellipse(x, y, rad, rad * 0.6, r() * 3, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < 26; i++) {
        const x = r() * 512, y = r() * 512, rad = 22 + r() * 30;
        g.beginPath();
        for (let k = 0; k <= 10; k++) {
          const a = (k / 10) * Math.PI * 2, rr = rad * (0.8 + 0.2 * Math.sin(a * 3 + i));
          if (k) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.fillStyle = '#6a2a14'; g.fill();
        g.lineWidth = 4; g.strokeStyle = '#3a1408'; g.stroke();
      }
    }, true, 1);
    return shared(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.7 }));
  });
}
export function lavaSurfaceMaterial() { return lavaMaterial(); }

/** Boulders and the kerb in warm cartoon rock (the boulders keep their baked shading). */
export function basaltSwap(): Record<string, THREE.Material> {
  return cached('m:basaltSwap', () => ({ Stone: toon(0x8a6650, { vertexColors: true }) }));
}
export function basaltPlain() { return toon(0x6e4a38); }

// ---------- dinosaurs ----------

/** Big cartoon eye: white, a large pupil looking forward, and a sparkle. */
function eye(parent: THREE.Object3D, x: number, y: number, z: number, r: number, side: number) {
  const g = new THREE.Group();
  g.add(part(new THREE.SphereGeometry(r, 18, 12), toon(0xffffff), r * 0.12, false));
  place(g, part(new THREE.SphereGeometry(r * 0.55, 14, 10), toon(0x1a0e08), 0, false), r * 0.55, r * 0.05, side * r * 0.35);
  place(g, part(new THREE.SphereGeometry(r * 0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, false), r * 0.8, r * 0.3, side * r * 0.45);
  return place(parent, g, x, y, z);
}

/** A dinosaur rig that follows its physics pose every frame. */
export function dinosaur(d: Dino, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const body = new THREE.Group(); // rotates to the heading
  root.add(body);
  const build = d.kind === 'bronto' ? bronto : d.kind === 'trex' ? trex : stego;
  const rig = build(body);
  return {
    group: root,
    update() {
      const p = dinoPose(d, world.time);
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y));
      body.rotation.y = -p.heading;
      rig(world.time, p);
    },
  };
}

type Pose = ReturnType<typeof dinoPose>;
type Rig = (t: number, p: Pose) => void;

/** A stumpy leg from `top` height down to the ground, with a rounded foot and three toenails. */
function leg(parent: THREE.Object3D, skin: THREE.Material, x: number, z: number, top: number, r: number) {
  const g = new THREE.Group();
  g.position.set(x, top, z);
  g.add(part(organic([V(0, 0), V(1, -top * 0.5), V(0, -top + 4)], [r * 1.25, r, r * 1.05], 14, 10), skin));
  place(g, part(blob(r * 1.3, r * 0.55, r * 1.25, 0.2, 16), skin), r * 0.3, -top + r * 0.45, 0);
  for (const k of [-1, 0, 1]) place(g, part(new THREE.SphereGeometry(r * 0.28, 8, 6), toon(0xfff2d8), 0.4, false), r * 1.3, -top + r * 0.35, k * r * 0.6);
  parent.add(g);
  return g;
}

/** Brontosaurus: round teal body high on four stumpy legs (roll right underneath), long neck, sweet face. */
function bronto(g: THREE.Group): Rig {
  const skin = toon(0x4fc28a, { vertexColors: true });
  const spot = toon(0x2f9a6a);
  place(g, part(blob(64, 36, 44), skin, 1.8), 0, 98, 0);
  for (const [x, z, s] of [[-10, 18, 12], [20, -16, 10], [-34, -12, 9], [34, 20, 8], [0, -30, 7]]) {
    const m = place(g, part(blob(s, 3, s, 0, 12), spot, 0, false), x, 98 + 36 * Math.sqrt(Math.max(0, 1 - (x / 64) ** 2 - (z / 44) ** 2)) - 1.5, z);
    m.lookAt(m.position.clone().multiplyScalar(2).setY(m.position.y * 2 - 98));
  }
  const neck = new THREE.Group(); neck.position.set(48, 108, 0); g.add(neck);
  neck.add(part(organic([V(0, 0), V(26, 30), V(42, 70), V(50, 104)], [24, 16, 12, 11]), skin, 1.6));
  const head = new THREE.Group(); head.position.set(54, 114, 0); neck.add(head);
  head.add(part(blob(22, 16, 17), skin, 1.5));
  eye(head, 8, 9, 11, 6.5, 1);
  eye(head, 8, 9, -11, 6.5, -1);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(7, 1, 6, 16, Math.PI * 0.8), toon(0x2a1408));
  smile.rotation.set(0, Math.PI / 2, Math.PI + 0.3);
  place(head, smile, 18, -3, 0);
  const tail = new THREE.Group(); tail.position.set(-58, 100, 0); g.add(tail);
  tail.add(part(organic([V(0, 0), V(-36, -14), V(-80, -42), V(-120, -56), V(-150, -60)], [26, 18, 10, 5, 2]), skin, 1.6));
  const legs = DINO_LEGS.bronto.map(([f, s]) => leg(g, skin, f, s, 72, 11));
  return (t, p) => {
    const walking = Math.hypot(p.vx, p.vy) > 2 ? 1 : 0;
    legs.forEach((l, i) => { l.rotation.z = walking * 0.2 * Math.sin(t * 3.2 + (i === 0 || i === 3 ? 0 : Math.PI)); });
    g.position.y = walking * 2 * Math.abs(Math.sin(t * 3.2));
    neck.rotation.z = 0.08 * Math.sin(t * 0.9);
    neck.rotation.y = 0.2 * Math.sin(t * 0.45);
    head.rotation.z = 0.15 * Math.sin(t * 1.3);
    tail.rotation.y = 0.25 * Math.sin(t * 1.1);
  };
}

/** T-rex: chunky orange body on two wide-set legs, giant grinning head, tiny arms, sweeping tail. */
function trex(g: THREE.Group): Rig {
  const skin = toon(0xf28a3c, { vertexColors: true });
  const stripe = toon(0xc25a1e);
  const torso = new THREE.Group(); torso.position.set(0, 0, 0); g.add(torso);
  place(torso, part(blob(42, 34, 32), skin, 1.8), 6, 86, 0);
  for (let i = 0; i < 4; i++) {
    const m = place(torso, part(blob(5, 22, 30, 0, 12), stripe, 0, false), -20 + i * 13, 96, 0);
    m.scale.set(1, 1, 1.04);
  }
  const head = new THREE.Group(); head.position.set(46, 122, 0); torso.add(head);
  head.add(part(blob(34, 24, 26), skin, 1.8));
  const jaw = new THREE.Group(); jaw.position.set(4, -14, 0); head.add(jaw);
  jaw.add(part(blob(28, 10, 22), skin, 1.5));
  const teeth: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + i * 0.36;
    teeth.push(new THREE.ConeGeometry(2.6, 7, 6).rotateX(Math.PI).translate(14 + Math.cos(a) * 14, -4, Math.sin(a) * 18));
  }
  head.add(part(mergeGeos(teeth), toon(0xffffff), 0.5, false));
  eye(head, 14, 18, 15, 9, 1);
  eye(head, 14, 18, -15, 9, -1);
  for (const z of [-22, 22]) {
    const arm = part(organic([V(0, 0), V(10, -8), V(15, -16)], [5, 4, 3], 10, 8), skin, 0.9);
    place(torso, arm, 38, 82, z);
  }
  DINO_LEGS.trex.forEach(([f, s]) => {
    place(g, part(blob(17, 24, 13), skin, 1.5), f - 4, 58, s);
    leg(g, skin, f, s, 44, 9);
  });
  const tail = new THREE.Group(); tail.position.set(-18, 0, 0); g.add(tail);
  tail.add(part(organic([V(0, 84), V(-40, 64), V(-80, 34), V(-112, 14), V(-128, 10)], [28, 20, 12, 7, 4]), skin, 1.6));
  return (t, p) => {
    tail.rotation.y = -p.tail;
    torso.rotation.y = 0.12 * p.tail;
    jaw.rotation.z = -0.3 * Math.max(0, Math.sin(t * 2.3)) ** 3;
    head.rotation.y = 0.25 * Math.sin(t * 0.7);
    head.position.y = 122 + 2 * Math.sin(t * 2);
  };
}

/** Stegosaurus: round purple body on four legs (room to roll beneath), orange back plates, spiky tail. */
function stego(g: THREE.Group): Rig {
  const skin = toon(0x9a7ee6, { vertexColors: true });
  const plateMat = toon(0xffa040);
  place(g, part(blob(62, 30, 36), skin, 1.8), 0, 68, 0);
  const neck = part(organic([V(52, 70), V(76, 58), V(92, 50)], [20, 13, 11]), skin, 1.4);
  g.add(neck);
  const head = new THREE.Group(); head.position.set(100, 50, 0); g.add(head);
  head.add(part(blob(17, 12, 12), skin, 1.4));
  eye(head, 6, 6, 9, 5, 1);
  eye(head, 6, 6, -9, 5, -1);
  // Plates: soft rounded leaves, alternating rows, tallest over the hips
  for (let i = 0; i < 8; i++) {
    const x = -48 + i * 14, h = 16 + 18 * Math.sin(((i + 0.5) / 8) * Math.PI);
    const shape = new THREE.Shape();
    shape.moveTo(-h * 0.45, 0);
    shape.bezierCurveTo(-h * 0.55, h * 0.7, -h * 0.15, h * 1.05, 0, h);
    shape.bezierCurveTo(h * 0.15, h * 1.05, h * 0.55, h * 0.7, h * 0.45, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 3, curveSegments: 10 });
    geo.translate(0, 0, -1.5);
    const y = 68 + 30 * Math.sqrt(Math.max(0, 1 - (x / 62) ** 2)) - 5;
    const plate = part(geo, plateMat, 1.1);
    plate.position.set(x, y, (i % 2 ? 1 : -1) * 5);
    plate.rotation.x = (i % 2 ? 1 : -1) * 0.2;
    g.add(plate);
  }
  const tail = new THREE.Group(); tail.position.set(-56, 66, 0); g.add(tail);
  tail.add(part(organic([V(0, 0), V(-30, -10), V(-60, -18), V(-82, -22)], [24, 15, 9, 5]), skin, 1.5));
  for (const [x, z, a] of [[-68, 6, 0.7], [-68, -6, -0.7], [-80, 5, 0.9], [-80, -5, -0.9]]) {
    const sp = part(new THREE.ConeGeometry(3.5, 22, 10).translate(0, 11, 0), toon(0xfff2d8), 0.8);
    sp.position.set(x, -18, z);
    sp.rotation.x = a;
    tail.add(sp);
  }
  DINO_LEGS.stego.forEach(([f, s]) => leg(g, skin, f, s, 50, 9.5));
  return (t) => {
    tail.rotation.y = 0.3 * Math.sin(t * 0.8);
    head.rotation.y = 0.3 * Math.sin(t * 0.5);
  };
}

// ---------- tumbleweeds ----------

/** A loose, bouncy ball of twigs rolling along its physics track. */
export function tumbleweed(w: Tumbleweed, world: World, L: LevelDef, toScene: ToScene): Animated {
  const r = rng(Math.round(w.a[0] * 3 + w.a[1]));
  const R = w.r ?? 15;
  const geo = cached('g:tumble', () => {
    const twigs: THREE.BufferGeometry[] = [];
    const rr = rng(4);
    for (let i = 0; i < 26; i++) {
      const axis = new THREE.Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5).normalize();
      const start = new THREE.Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5).cross(axis).normalize();
      const pts: THREE.Vector3[] = [];
      const span = 1.6 + rr() * 2.2;
      for (let k = 0; k <= 6; k++) pts.push(start.clone().applyAxisAngle(axis, (k / 6) * span).multiplyScalar(0.82 + rr() * 0.2));
      twigs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.065 + rr() * 0.03, 6));
    }
    return mergeGeos(twigs);
  });
  const ball = part(geo, toon(0xe8c07a), 0.035);
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
      const hop = Math.abs(Math.sin(world.time * 5 + w.a[0])) * 7 * Math.min(1, sp / 60);
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y) + R * 0.85 + hop);
      if (sp > 0.1) {
        q.setFromAxisAngle(new THREE.Vector3(p.vy / sp, 0, -p.vx / sp), (sp * dt) / R);
        ball.quaternion.premultiply(q);
      }
    },
  };
}

// ---------- volcanoes ----------

/**
 * A cartoon volcano: a smooth rounded cone with a few soft lobes, a glowing crater, fat lava
 * drips running down its sides, and a puffy smoke plume.
 */
function volcanoMesh(baseR: number, height: number, craterR: number, seed: number, puffs: number, ink: number): { group: THREE.Group; anim: (t: number) => void } {
  const r = rng(seed);
  const g = new THREE.Group();
  const prof: THREE.Vector2[] = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // a soft bell: wide base, gently concave flanks, rounded lip
    prof.push(new THREE.Vector2(craterR + (baseR - craterR) * (1 - t) ** 1.5, height * t));
  }
  prof.push(new THREE.Vector2(craterR * 1.08, height * 1.01), new THREE.Vector2(craterR * 0.8, height * 0.95));
  const geo = new THREE.LatheGeometry(prof, 48); // bottom-to-top keeps the faces pointing out
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const k = 1 + 0.06 * Math.sin(Math.atan2(z, x) * 3 + seed) * (1 - y / height);
    pos.setX(i, x * k); pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  g.add(part(geo, toon(0xc0704a), ink));
  // Crater pool
  const pool = part(new THREE.CircleGeometry(craterR * 0.82, 28).rotateX(-Math.PI / 2), lavaMaterial(), 0, false);
  pool.position.y = height * 0.96;
  g.add(pool);
  // Fat lava drips down the flanks
  const dripMat = cached('m:drip', () => shared(new THREE.MeshToonMaterial({ color: 0xff8a1a, emissive: 0xff6a00, emissiveIntensity: 0.9, gradientMap: toonRamp() })));
  const drips = 3 + Math.floor(r() * 3);
  for (let i = 0; i < drips; i++) {
    const a = (i / drips) * Math.PI * 2 + r() * 0.6;
    const len = 0.3 + r() * 0.35;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 5; k++) {
      const t = 1 - (k / 5) * len;
      const rad = (craterR + (baseR - craterR) * (1 - t) ** 1.5) * 1.01;
      const aa = a + Math.sin(k * 1.3 + i) * 0.05;
      pts.push(V(Math.cos(aa) * rad, height * t, Math.sin(aa) * rad));
    }
    const w = craterR * 0.22;
    g.add(part(organic(pts, [w, w * 0.9, w * 0.8, w * 1.1], 10, 14), dripMat, ink * 0.6, false));
  }
  // Puffy smoke: toon balls that rise, swell and fade
  const smokeMat = new THREE.MeshToonMaterial({ color: 0xd8ccc4, gradientMap: toonRamp(), transparent: true, opacity: 0.9 });
  const balls: { m: THREE.Mesh; off: number; drift: number }[] = [];
  for (let i = 0; i < puffs; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), smokeMat);
    balls.push({ m, off: i / puffs, drift: (r() - 0.5) * 0.8 });
    g.add(m);
  }
  return {
    group: g,
    anim(t) {
      for (const b of balls) {
        const u = (t * 0.07 + b.off) % 1;
        b.m.position.set(Math.sin(u * 4 + b.off * 9) * craterR * 0.5 + u * height * 0.6 * b.drift, height + u * height * 1.3, Math.cos(u * 3 + b.off * 7) * craterR * 0.4);
        const sc = craterR * (0.6 + u * 1.9) * Math.min(1, u * 6) * (1 - Math.max(0, u - 0.8) * 3);
        b.m.scale.setScalar(Math.max(0.01, sc));
      }
      (lavaMaterial() as THREE.MeshStandardMaterial).emissiveIntensity = 1.05 + 0.15 * Math.sin(t * 2.1);
    },
  };
}

/** On-course volcano: the cone's foot sits on the solid core; the flanks come from heightAt. */
export function courseVolcano(v: Volcano, L: LevelDef, toScene: ToScene): Animated {
  const core = volcanoCore(v.r);
  const footY = heightAt(L, v.x + core, v.y);
  const { group, anim } = volcanoMesh(core * 1.7, v.r * 1.05, core * 0.45, Math.round(v.x + v.y), 6, 1.6);
  const root = new THREE.Group();
  root.add(group);
  root.position.copy(toScene(v.x, v.y)).setY(footY - 6);
  return { group: root, update: (_a, t) => anim(t) };
}

// ---------- prehistoric landscape ----------

/** Chunky cartoon palm: a leaning ringed trunk and a crown of broad, drooping fronds. */
function palm(seed: number, height: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  const lean = (r() - 0.5) * 0.6;
  const segs = 6;
  const trunk = toon(0x9a6a3e), ring = toon(0x7a4e2a);
  let top = V(0, 0);
  for (let i = 0; i < segs; i++) {
    const t = (i + 0.5) / segs;
    const p = V(lean * height * t * t, height * t, 0);
    const rad = height * (0.075 - 0.025 * t);
    const seg = part(new THREE.CylinderGeometry(rad * 0.92, rad * 1.12, height / segs * 1.02, 12), i % 2 ? ring : trunk, 1.2);
    seg.position.copy(p);
    seg.rotation.z = -lean * t * 1.4;
    g.add(seg);
    top = V(lean * height, height, 0);
  }
  const frond = toon(0x5cc04a, { side: THREE.DoubleSide });
  const n = 7;
  for (let i = 0; i < n; i++) {
    const L = height * (0.45 + r() * 0.15), W = L * 0.22;
    const geo = new THREE.PlaneGeometry(L, W, 10, 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const u = (p.getX(k) + L / 2) / L; // 0 at trunk, 1 at tip
      const w = Math.sin(Math.PI * Math.min(1, u * 1.15)) * (p.getY(k) / (W / 2));
      p.setXYZ(k, u * L, Math.sin(u * Math.PI * 0.8) * L * 0.25 - u * u * L * 0.45, w * W * 0.5);
    }
    geo.computeVertexNormals();
    const f = part(geo, frond, 0, true);
    f.position.copy(top);
    f.rotation.y = (i / n) * Math.PI * 2 + r() * 0.3;
    g.add(f);
  }
  return g;
}

/** Round cartoon bush: a cluster of chunky leaf balls. */
function bush(seed: number, size: number) {
  const r = rng(seed);
  const geos: THREE.BufferGeometry[] = [];
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.3, d = i ? size * (0.4 + r() * 0.35) : 0;
    const s = size * (i ? 0.55 + r() * 0.25 : 0.8);
    geos.push(new THREE.IcosahedronGeometry(s, 2).translate(Math.cos(a) * d, s * 0.75 + r() * size * 0.2, Math.sin(a) * d));
  }
  const greens = [0x4fae46, 0x62c04e, 0x3f9a40];
  return part(mergeGeos(geos), toon(greens[seed % 3]), 1.1);
}

/** A cartoon ribcage arching out of the ground. */
function ribcage() {
  const geos: THREE.BufferGeometry[] = [organic([V(-60, 6), V(-20, 12), V(30, 12), V(70, 6)], [6, 7, 7, 4], 10, 20)];
  for (let i = 0; i < 6; i++) {
    const x = -42 + i * 17, h = 36 + 14 * Math.sin((i / 5) * Math.PI);
    for (const s of [-1, 1]) geos.push(organic([V(x, 12), V(x + 2, h * 0.7, s * 18), V(x + 4, h * 0.3, s * 30), V(x + 6, 2, s * 32)], [4.2, 3.6, 3, 2.6], 10, 12));
  }
  return part(mergeGeos(geos), toon(0xfff0d4), 1.1);
}

/** A twig nest with three big spotted eggs. */
function eggNest() {
  const g = new THREE.Group();
  place(g, part(new THREE.TorusGeometry(22, 8, 10, 28).rotateX(Math.PI / 2), toon(0xc08a50), 1.1), 0, 5, 0);
  const egg = toon(0xfff4e0);
  const dot = toon(0x6ab0e0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const e = part(new THREE.SphereGeometry(1, 18, 14).scale(9, 12, 9), egg, 1);
    e.position.set(Math.cos(a) * 9, 12, Math.sin(a) * 9);
    e.rotation.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
    for (let k = 0; k < 4; k++) {
      const s = part(new THREE.SphereGeometry(2, 8, 6).scale(1, 1, 0.3), dot, 0, false);
      const u = (k / 4) * Math.PI * 2;
      s.position.set(Math.cos(u) * 8.6, (k - 1.5) * 4, Math.sin(u) * 8.6);
      s.lookAt(s.position.clone().multiplyScalar(2));
      e.add(s);
    }
    g.add(e);
  }
  return g;
}

/**
 * Dressing around a Jurassic hole: bushes and boulders along the kerb, palms further out,
 * bones and a nest, and big smoking volcanoes on the horizon.
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

  // Bushes hugging the kerb, broken by boulders
  const rocks = new PieceBatch(models);
  resample(outline, 50).forEach((p, i) => {
    const off = 44 + Math.sin(i * 0.7) * 8, x = p.x + p.nx * off, y = p.y + p.ny * off;
    if (!clearOf(x, y, 26) || Math.hypot(x - tx, y - ty) < 120) return;
    if (i % 3 === 1) {
      const s = 11 + r() * 10, sp = at(x, y);
      rocks.add(`Boulder${1 + (i % 3)}`, new THREE.Matrix4().makeTranslation(sp.x, sp.y + s * 0.2, sp.z).multiply(new THREE.Matrix4().makeRotationY(r() * 6)).multiply(new THREE.Matrix4().makeScale(s * 1.3, s * 0.95, s)));
    } else {
      const bsh = bush(i + 3, 14 + r() * 8);
      bsh.position.copy(at(x, y, -2));
      group.add(bsh);
    }
  });

  // Palms and big bushes further out on the rolling ground
  for (let i = 0, tries = 0; i < 9 && tries < 200; tries++) {
    const a = r() * Math.PI * 2;
    const x = cx + Math.cos(a) * ((b.maxX - b.minX) / 2 + 140 + r() * 260), y = cy + Math.sin(a) * ((b.maxY - b.minY) / 2 + 120 + r() * 220);
    if (!clearOf(x, y, 110) || Math.hypot(x - tx, y - ty) < 200) continue;
    const p = palm(i * 7 + 1, 130 + r() * 100);
    p.position.copy(at(x, y, -2));
    p.rotation.y = r() * 6;
    group.add(p);
    const bsh = bush(i + 40, 24 + r() * 10);
    bsh.position.copy(at(x + 45, y + 25, -2));
    group.add(bsh);
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
  if (rib) { const m = ribcage(); m.position.copy(at(rib[0], rib[1], -4)); m.rotation.y = r() * 6; group.add(m); }
  const nest = spot(90);
  if (nest) { const n = eggNest(); n.position.copy(at(nest[0], nest[1], -2)); group.add(n); }

  // Boulders scattered on the ground
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
    const v = volcanoMesh(br, h, br * 0.16, 30 + i, 8, 14);
    v.group.position.copy(toScene(x, y)).setY(-20);
    group.add(v.group);
    v.group.traverse((o) => { o.castShadow = false; });
    anims.push({ group: v.group, update: (_a, t) => v.anim(t + i * 3) });
  });
  return group;
}

export { volcanoMesh, VOLCANO_SLOPE };
