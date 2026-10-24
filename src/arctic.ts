// The Arctic course, in the same cartoon toon-and-ink style: packed-snow fairways and glassy ice under a
// polar twilight, seals that flip the ball with their tails, ski jumps, igloo tunnels, waddling penguins
// and polar bears, with snowy peaks, pines, snowmen, falling snow and the northern lights around.
// Purely visual; positions come from physics.ts.
import * as THREE from 'three';
import { Animated } from './art';
import { Astronaut, Elephant, Igloo, LevelDef, Pt, Ramp, Seal } from './levels';
import { astronautAt, heightAt, IGLOO_DOOR, iglooDome, RAMP_LEN, RAMP_W, SEAL_CATCH, World } from './physics';
import { blob, cached, canvasTex, eye, organic, part, place, rng, shared, toon, toonRamp, V } from './jurassic';
import { outlineDistance, resample } from './landscape';

type ToScene = (x: number, y: number) => THREE.Vector3;

// ---------- materials ----------

/** Packed snow for the fairways: soft blue-white drifts with a glitter of ice crystals. */
export function snowMaterial() {
  return cached('m:snow', () => {
    const r = rng(61);
    const map = canvasTex(512, 512, (g) => {
      g.fillStyle = '#d6e4f2';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 60; i++) {
        const x = r() * 512, y = r() * 512, rad = 30 + r() * 70;
        g.fillStyle = r() > 0.5 ? 'rgba(200,220,240,0.35)' : 'rgba(255,255,255,0.5)';
        g.beginPath(); g.ellipse(x, y, rad, rad * 0.6, r() * 3, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < 260; i++) { g.fillStyle = r() > 0.5 ? 'rgba(150,200,255,0.6)' : 'rgba(255,255,255,0.9)'; g.fillRect(r() * 512, r() * 512, 2, 2); }
    });
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp(), vertexColors: true }));
  });
}

/** The snowfield around the course, rippled by the wind. */
export function snowfieldMaterial() {
  return cached('m:snowfield', () => {
    const r = rng(9);
    const c = canvasTex(512, 512, (g) => {
      g.fillStyle = '#e2ecf6';
      g.fillRect(0, 0, 512, 512);
      g.strokeStyle = 'rgba(170,195,225,0.45)'; g.lineWidth = 3;
      for (let i = 0; i < 24; i++) {
        const y0 = r() * 512;
        g.beginPath(); g.moveTo(0, y0);
        for (let x = 0; x <= 512; x += 32) g.lineTo(x, y0 + Math.sin(x * 0.025 + i) * 12);
        g.stroke();
      }
    }, true, 30);
    return shared(new THREE.MeshToonMaterial({ map: c, gradientMap: toonRamp() }));
  });
}

/** Kerb of pale ice blocks, each capped with snow. */
export function iceKerb() {
  return cached('m:icekerb', () => {
    const t = canvasTex(128, 32, (g) => {
      g.fillStyle = '#9ad0f0'; g.fillRect(0, 0, 128, 32);
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 10);
      g.fillStyle = 'rgba(40,110,170,0.5)'; g.fillRect(62, 0, 4, 32); g.fillRect(126, 0, 2, 32);
    });
    return shared(new THREE.MeshToonMaterial({ map: t, gradientMap: toonRamp() }));
  });
}

/** Glassy ice: pale blue with white cracks and a sheen. */
export function iceMaterial() {
  return cached('m:ice', () => {
    const r = rng(4);
    const t = canvasTex(512, 512, (g) => {
      const gr = g.createLinearGradient(0, 0, 512, 512);
      gr.addColorStop(0, '#a8dcf8'); gr.addColorStop(0.5, '#cdeefe'); gr.addColorStop(1, '#9ad2f2');
      g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2;
      for (let i = 0; i < 14; i++) { let x = r() * 512, y = r() * 512; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 90; g.lineTo(x, y); } g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < 8; i++) { g.save(); g.translate(r() * 512, r() * 512); g.rotate(-0.6); g.fillRect(-60, -4, 120, 8); g.restore(); }
    }, true, 1);
    return shared(new THREE.MeshStandardMaterial({ map: t, roughness: 0.08, metalness: 0.1, envMapIntensity: 1.2 }));
  });
}

// ---------- seals ----------

/** A seal lying on an ice floe, facing where it will flip the ball; its tail flicks when the ball arrives. */
export function seal(sl: Seal, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  root.position.copy(toScene(sl.x, sl.y)).setY(heightAt(L, sl.x, sl.y));
  root.rotation.y = -(sl.angle * Math.PI) / 180;
  // Ice floe
  const floe = part(new THREE.CylinderGeometry(SEAL_CATCH + 18, SEAL_CATCH + 22, 6, 9), toon(0xe8f6ff), 1);
  floe.position.y = 3;
  floe.rotation.y = 0.3;
  root.add(floe);
  const skin = toon(0x7a8aa0, { vertexColors: true });
  const body = new THREE.Group(); body.position.y = 6; root.add(body);
  body.add(part(organic([V(-26, 8), V(-6, 12), V(12, 14), V(24, 20)], [8, 12, 11, 9]), skin, 1.2));
  const head = new THREE.Group(); head.position.set(28, 24, 0); body.add(head);
  head.add(part(blob(9, 8, 8, 0.2), skin, 1));
  place(head, part(blob(4, 3, 4.5, 0.1), toon(0xc8d0dc), 0.6), 7, -2, 0);
  place(head, part(new THREE.SphereGeometry(1.6, 8, 6), toon(0x1a1a1a), 0, false), 10.5, -1, 0);
  eye(head, 5, 4, 4, 2.4, 1);
  eye(head, 5, 4, -4, 2.4, -1);
  for (const z of [-1, 1]) {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 4).rotateZ(Math.PI / 2), toon(0xffffff));
    place(head, wh, 12, -2, z * 3).rotation.y = z * 0.4;
    place(body, part(blob(7, 2, 4, 0), skin, 0.6), 10, 6, z * 11);
  }
  // The tail that does the flipping
  const tail = new THREE.Group(); tail.position.set(-26, 8, 0); body.add(tail);
  tail.add(part(organic([V(0, 0), V(-10, -1), V(-16, 1)], [6, 4, 2.5], 8, 8), skin, 0.8));
  for (const z of [-1, 1]) place(tail, part(blob(6, 1.5, 4, 0), skin, 0.6), -18, 1, z * 4);
  let flick = 0;
  return {
    group: root,
    update(_a, t) {
      const b = world.ball;
      const near = Math.hypot(b.x - sl.x, b.y - sl.y) < SEAL_CATCH * 1.6 || ((b.z ?? 0) > 1 && Math.hypot(b.x - sl.x, b.y - sl.y) < 120);
      flick = near ? Math.min(1, flick + 0.25) : Math.max(0, flick - 0.06);
      tail.rotation.z = 0.15 * Math.sin(t * 2) + flick * 1.4;
      head.rotation.z = 0.12 * Math.sin(t * 1.3);
      body.rotation.z = -flick * 0.15;
    },
  };
}

// ---------- ski jumps ----------

/** A wooden ski-jump ramp capped with snow, rising toward its lip. */
export function skiRamp(rp: Ramp, L: LevelDef, toScene: ToScene) {
  const len = rp.len ?? RAMP_LEN, w = rp.width ?? RAMP_W, H = 20;
  const root = new THREE.Group();
  root.position.copy(toScene(rp.x, rp.y)).setY(heightAt(L, rp.x, rp.y));
  root.rotation.y = -(rp.angle * Math.PI) / 180;
  // A curved wedge: low at the back, kicking up at the lip
  const shape = new THREE.Shape();
  shape.moveTo(-len / 2, 0);
  for (let i = 0; i <= 12; i++) { const u = i / 12; shape.lineTo(-len / 2 + u * len, H * u * u); }
  shape.lineTo(len / 2, 0);
  shape.lineTo(-len / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false }).translate(0, 0, -w / 2);
  root.add(part(geo, toon(0xb8834a), 1.2));
  // Snow on the running surface and rails along the sides
  const top = new THREE.Shape();
  top.moveTo(-len / 2, 0.6);
  for (let i = 0; i <= 12; i++) { const u = i / 12; top.lineTo(-len / 2 + u * len, H * u * u + 1.4); }
  for (let i = 12; i >= 0; i--) { const u = i / 12; top.lineTo(-len / 2 + u * len, H * u * u + 0.4); }
  const snowTop = new THREE.Mesh(new THREE.ExtrudeGeometry(top, { depth: w - 6, bevelEnabled: false }).translate(0, 0, -(w - 6) / 2), toon(0xffffff));
  root.add(snowTop);
  for (const z of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push(V(-len / 2 + u * len, H * u * u + 6, z * (w / 2))); }
    root.add(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 1.6, 6), toon(0xd8202e), 0.5, false));
  }
  return root;
}

// ---------- igloos ----------

/** An igloo of ice blocks with a tunnel door at each end. */
export function igloo(ig: Igloo, L: LevelDef, toScene: ToScene) {
  const R = iglooDome(ig);
  const mx = (ig.a[0] + ig.b[0]) / 2, my = (ig.a[1] + ig.b[1]) / 2;
  const root = new THREE.Group();
  root.position.copy(toScene(mx, my)).setY(heightAt(L, mx, my));
  root.rotation.y = -Math.atan2(ig.b[1] - ig.a[1], ig.b[0] - ig.a[0]);
  const blocks = cached('t:iglooblocks', () => canvasTex(256, 128, (g) => {
    g.fillStyle = '#f4faff'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = 'rgba(120,170,210,0.7)'; g.lineWidth = 2;
    for (let row = 0; row < 8; row++) {
      const y = row * 16;
      g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
      for (let x = (row % 2) * 16; x < 256; x += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); }
    }
  }));
  const dome = part(new THREE.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ map: blocks, gradientMap: toonRamp() }), 1.6);
  dome.scale.y = 0.8;
  root.add(dome);
  // Tunnel porches at both doors, open toward the outside
  for (const s of [-1, 1]) {
    const porch = part(new THREE.CylinderGeometry(IGLOO_DOOR + 6, IGLOO_DOOR + 6, 26, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), toon(0xeef8ff, { side: THREE.DoubleSide }), 1);
    porch.position.set(s * (R - 2), 0, 0);
    porch.rotation.y = Math.PI / 2;
    root.add(porch);
    const dark = new THREE.Mesh(new THREE.CircleGeometry(IGLOO_DOOR + 2, 20, 0, Math.PI), toon(0x1a2a3a));
    dark.position.set(s * (R - 14), 0.5, 0);
    dark.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    root.add(dark);
  }
  return root;
}

// ---------- penguins ----------

/** A penguin waddling back and forth, flippers out. */
export function penguin(s: Astronaut, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(part(blob(11, 17, 11, 0.1), toon(0x1e2430, { vertexColors: true }), 1.1).translateY(18));
  place(body, part(blob(7, 13, 9, 0), toon(0xffffff), 0, false), 5, 16, 0);
  const head = new THREE.Group(); head.position.set(1, 36, 0); body.add(head);
  head.add(part(blob(8, 8, 8), toon(0x1e2430, { vertexColors: true }), 1));
  place(head, part(new THREE.ConeGeometry(2.4, 7, 8).rotateZ(-Math.PI / 2), toon(0xff9a2a), 0.6), 9, -1, 0);
  eye(head, 5, 2, 3.4, 2.2, 1);
  eye(head, 5, 2, -3.4, 2.2, -1);
  const flippers: THREE.Mesh[] = [];
  for (const z of [-1, 1]) {
    const f = part(blob(3, 9, 1.6, 0), toon(0x1e2430), 0.6);
    place(body, f, 0, 20, z * 11);
    flippers.push(f);
    place(body, part(blob(4, 1.4, 3, 0), toon(0xff9a2a), 0.5), 4, 1.4, z * 5);
  }
  const seed = Math.round(s.a[0] + s.a[1]);
  return {
    group: root,
    update(_a, t) {
      const p = astronautAt(s, world.time);
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y));
      const moving = Math.hypot(p.vx, p.vy) > 2;
      if (moving) body.rotation.y = -Math.atan2(p.vy, p.vx);
      body.rotation.x = moving ? 0.18 * Math.sin(world.time * 8 + seed) : 0; // the waddle
      flippers.forEach((f, i) => { f.rotation.x = (i ? 1 : -1) * (0.3 + 0.25 * Math.sin(t * 6 + seed)); });
      head.rotation.y = 0.3 * Math.sin(t * 1.1 + seed);
    },
  };
}

// ---------- polar bears ----------

/** A polar bear sitting on an ice floe (the Arctic course's big solid obstacle). */
export function polarBear(el: Elephant, L: LevelDef, toScene: ToScene): Animated {
  const R = el.r ?? 38;
  const root = new THREE.Group();
  root.position.copy(toScene(el.x, el.y)).setY(heightAt(L, el.x, el.y));
  root.rotation.y = -((el.angle ?? 200) * Math.PI) / 180;
  const floe = part(new THREE.CylinderGeometry(R + 4, R + 8, 8, 9), toon(0xe8f6ff), 1.2);
  floe.position.y = 4;
  root.add(floe);
  const fur = toon(0xfaf8f0, { vertexColors: true });
  const b = new THREE.Group(); b.position.y = 8; root.add(b);
  b.add(part(blob(R * 0.75, R * 0.62, R * 0.7, 0.25), fur, 1.6).translateY(R * 0.55));
  for (const [x, z] of [[R * 0.45, R * 0.35], [R * 0.45, -R * 0.35], [-R * 0.3, R * 0.45], [-R * 0.3, -R * 0.45]]) place(b, part(blob(R * 0.2, R * 0.16, R * 0.18, 0.2), fur, 1), x, R * 0.12, z);
  const head = new THREE.Group(); head.position.set(R * 0.6, R * 1.15, 0); b.add(head);
  head.add(part(blob(R * 0.34, R * 0.3, R * 0.32, 0.2), fur, 1.3));
  place(head, part(blob(R * 0.18, R * 0.14, R * 0.16, 0.1), fur, 1), R * 0.3, -R * 0.06, 0);
  place(head, part(new THREE.SphereGeometry(R * 0.07, 10, 8), toon(0x1a1a1a), 0, false), R * 0.47, -R * 0.02, 0);
  for (const z of [-1, 1]) place(head, part(new THREE.SphereGeometry(R * 0.09, 10, 8), fur, 0.8), -R * 0.05, R * 0.28, z * R * 0.22);
  eye(head, R * 0.24, R * 0.1, R * 0.14, R * 0.07, 1);
  eye(head, R * 0.24, R * 0.1, -R * 0.14, R * 0.07, -1);
  // A woolly red scarf
  place(b, part(new THREE.TorusGeometry(R * 0.32, R * 0.08, 8, 20).rotateY(Math.PI / 2).rotateZ(0.3), toon(0xd8202e), 0.8), R * 0.48, R * 0.95, 0);
  return { group: root, update: (_a, t) => { head.rotation.y = 0.3 * Math.sin(t * 0.5); head.rotation.z = 0.08 * Math.sin(t * 0.9); } };
}

// ---------- scenery ----------

/** A snow-laden pine: stacked cones of green with white caps. */
function pine(seed: number, h: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(h * 0.04, h * 0.05, h * 0.25, 8).translate(0, h * 0.12, 0), toon(0x6a4a2a), 0.8));
  for (let i = 0; i < 3; i++) {
    const y = h * (0.25 + i * 0.22), w = h * (0.32 - i * 0.07);
    place(g, part(new THREE.ConeGeometry(w, h * 0.36, 9), toon(0x2a7a5a), 1), 0, y + h * 0.18, 0);
    place(g, part(new THREE.ConeGeometry(w * 0.7, h * 0.16, 9), toon(0xffffff), 0, false), 0, y + h * 0.3 + r() * 2, 0);
  }
  return g;
}

/** A snowman with a carrot nose, coal eyes and a scarf. */
function snowman(seed: number) {
  const g = new THREE.Group();
  const snow = toon(0xffffff, { vertexColors: true });
  place(g, part(blob(20, 18, 20, 0.15), snow, 1.2), 0, 16, 0);
  place(g, part(blob(14, 13, 14, 0.15), snow, 1.1), 0, 44, 0);
  const head = new THREE.Group(); head.position.set(0, 64, 0); g.add(head);
  head.add(part(blob(10, 10, 10, 0.1), snow, 1));
  place(head, part(new THREE.ConeGeometry(2, 11, 8).rotateZ(-Math.PI / 2), toon(0xff8a2a), 0.5), 13, 0, 0);
  for (const z of [-3.5, 3.5]) place(head, new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), toon(0x1a1a1a)), 8.8, 3, z);
  place(g, part(new THREE.TorusGeometry(10.5, 2.4, 8, 18).rotateX(Math.PI / 2), toon([0xd8202e, 0x2a6ad8, 0x2ac87a][seed % 3]), 0.6), 0, 56, 0);
  place(head, part(new THREE.CylinderGeometry(7, 7, 12, 14), toon(0x1a1a24), 0.8), 0, 13, 0);
  return g;
}

/** The northern lights: soft green-violet curtains that ripple slowly across the sky. */
function aurora(centre: THREE.Vector3): Animated {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; uniform float t; void main() { vUv = uv; vec3 p = position; p.z += sin(p.x * 0.004 + t * 0.3) * 160.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float t;
      void main() {
        float band = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
        float rays = 0.55 + 0.45 * sin(vUv.x * 60.0 + t * 0.8) * sin(vUv.x * 23.0 - t * 0.5);
        vec3 c = mix(vec3(0.2, 1.0, 0.6), vec3(0.6, 0.3, 1.0), vUv.y);
        gl_FragColor = vec4(c * band * rays * 0.55, 1.0);
      }`,
  });
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5200, 900, 60, 1), mat);
    m.position.copy(centre).add(V(-400 + i * 900, 1500 + i * 250, -3000 + i * 500));
    m.rotation.x = 0.25;
    g.add(m);
  }
  return { group: g, update: (_a, t) => { mat.uniforms.t.value = t; } };
}

/** Snowflakes drifting down around the course. */
export function snowfall(centre: THREE.Vector3): Animated {
  const n = 900, pos = new Float32Array(n * 3), r = rng(77);
  for (let i = 0; i < n; i++) { pos[i * 3] = (r() - 0.5) * 2400; pos[i * 3 + 1] = r() * 700; pos[i * 3 + 2] = (r() - 0.5) * 1600; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 4, transparent: true, opacity: 0.85, depthWrite: false }));
  pts.position.copy(centre);
  pts.frustumCulled = false;
  const base = pos.slice();
  return {
    group: pts,
    update: (_a, t) => {
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) {
        const y = ((base[i * 3 + 1] - t * 40) % 700 + 700) % 700;
        p.setXYZ(i, base[i * 3] + Math.sin(t * 0.6 + i) * 12, y, base[i * 3 + 2] + Math.cos(t * 0.5 + i * 1.3) * 10);
      }
      p.needsUpdate = true;
    },
  };
}

/**
 * The frozen valley around an Arctic hole: pines, snowmen and ice crystals beyond the kerb, snowy peaks on
 * the horizon, the northern lights overhead and snow falling.
 */
export function arcticLandscape(L: LevelDef, outline: Pt[], toScene: ToScene, lawnH: (x: number, y: number) => number, anims: Animated[]) {
  const group = new THREE.Group();
  const r = rng(Math.round(L.tee[0] * 5 + L.cup[1] * 9));
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const b = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const [tx, ty] = L.tee;
  const clearOf = (x: number, y: number, gap: number) => { const o = outlineDistance(outline, x, y); return !o.inside && o.d > gap; };
  const at = (x: number, y: number, lift = 0) => toScene(x, y).setY(lawnH(x, y) + lift);

  // Little pines and snowballs along the kerb
  resample(outline, 120).forEach((p, i) => {
    const x = p.x + p.nx * 50, y = p.y + p.ny * 50;
    if (!clearOf(x, y, 30) || Math.hypot(x - tx, y - ty) < 120) return;
    if (i % 3 === 0) { const t = pine(i, 50 + r() * 30); t.position.copy(at(x, y, -2)); group.add(t); }
    else if (i % 3 === 1) { const s = part(blob(10 + r() * 6, 8, 10, 0.1), toon(0xffffff, { vertexColors: true }), 0.8); s.position.copy(at(x, y, 2)); group.add(s); }
  });
  // A forest of big pines and a couple of snowmen further out
  for (let i = 0, tries = 0; i < 16 && tries < 300; tries++) {
    const a = r() * Math.PI * 2;
    const x = cx + Math.cos(a) * ((b.maxX - b.minX) / 2 + 150 + r() * 500), y = cy + Math.sin(a) * ((b.maxY - b.minY) / 2 + 130 + r() * 420);
    if (!clearOf(x, y, 100) || Math.hypot(x - tx, y - ty) < 180) continue;
    const obj = i % 6 === 2 ? snowman(i) : pine(i * 3 + 1, 140 + r() * 120);
    obj.position.copy(at(x, y, -2));
    obj.rotation.y = r() * 6;
    group.add(obj);
    i++;
  }
  // Snowy peaks on the horizon
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9 + (r() - 0.5) * 0.2;
    const d = 2700 + r() * 600, h = 500 + r() * 600, w = 450 + r() * 300;
    const m = new THREE.Group();
    m.add(part(new THREE.ConeGeometry(w, h, 7, 1).translate(0, h / 2, 0), toon(0x6a8ab0), 10, false));
    m.add(part(new THREE.ConeGeometry(w * 0.42, h * 0.42, 7, 1).translate(0, h - h * 0.21 + 2, 0), toon(0xffffff), 0, false));
    m.position.copy(toScene(cx + Math.cos(a) * d, cy + Math.sin(a) * d)).setY(-30);
    m.rotation.y = r() * 6;
    group.add(m);
  }
  const centre = toScene(cx, cy);
  const au = aurora(centre); group.add(au.group); anims.push(au);
  const sf = snowfall(centre); group.add(sf.group); anims.push(sf);
  return group;
}
