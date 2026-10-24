// Haunted Hollow, the Halloween course, in the same cartoon toon-and-ink style as the others: mossy
// graveyard turf under a full moon, jack-o'-lantern bumpers, gravestones, dead trees, ghosts that fade in
// and out, bats, bubbling green slime and witches whose brooms fly the ball across the hole. Purely visual;
// positions come from physics.ts.
import * as THREE from 'three';
import { Animated } from './art';
import { Alien, Bumper, Ghost, LevelDef, Lift, Palm, Pt, Rock } from './levels';
import { alienAt, BALL_R, ghostAt, heightAt, LIFT_CATCH, World } from './physics';
import { blob, cached, canvasTex, organic, part, place, rng, shared, toon, toonRamp, V } from './jurassic';
import { outlineDistance, resample } from './landscape';

type ToScene = (x: number, y: number) => THREE.Vector3;

/** Ink colour for the course: a deep night purple. */
export const HALLOWEEN_INK = 0x140a1c;

// ---------- materials ----------

/** Mossy graveyard turf with darker tufts and a scatter of fallen orange and red leaves. */
export function graveGrassMaterial() {
  return cached('m:gravegrass', () => {
    const r = rng(13);
    const map = canvasTex(512, 512, (g) => {
      g.fillStyle = '#3f5a34';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 3200; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(90,130,70,0.22)' : 'rgba(20,40,20,0.25)';
        g.fillRect(r() * 512, r() * 512, 2, 3);
      }
      for (let i = 0; i < 60; i++) {
        g.save(); g.translate(r() * 512, r() * 512); g.rotate(r() * 6);
        g.fillStyle = ['#e0782a', '#c8401e', '#e8a83a', '#8a3a1a'][i % 4];
        g.beginPath(); g.ellipse(0, 0, 6 + r() * 4, 3 + r() * 2, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    });
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp(), vertexColors: true }));
  });
}

/** Dark earth round the course, thick with fallen leaves. */
export function hollowGroundMaterial() {
  return cached('m:hollowground', () => {
    const r = rng(29);
    const map = canvasTex(512, 512, (g) => {
      g.fillStyle = '#2e2630';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 900; i++) {
        g.save(); g.translate(r() * 512, r() * 512); g.rotate(r() * 6);
        g.fillStyle = ['rgba(200,100,40,0.55)', 'rgba(150,60,30,0.5)', 'rgba(220,160,60,0.45)', 'rgba(70,50,60,0.6)'][i % 4];
        g.beginPath(); g.ellipse(0, 0, 5 + r() * 5, 2.5 + r() * 2, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }, true, 30);
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp() }));
  });
}

/** The curb: black-and-orange banded wood. */
export function hauntedKerb() {
  return cached('m:hauntedkerb', () => {
    const t = canvasTex(128, 32, (g) => {
      g.fillStyle = '#2a1a30'; g.fillRect(0, 0, 128, 32);
      g.fillStyle = '#ff8a1a'; g.fillRect(0, 0, 32, 32);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 26, 128, 6);
    });
    return shared(new THREE.MeshToonMaterial({ map: t, gradientMap: toonRamp() }));
  });
}

/** Glowing green slime with bubbles; its texture drifts so it seems to churn. */
export function slimeMaterial() {
  return cached('m:slime', () => {
    const r = rng(5);
    const map = canvasTex(256, 256, (g) => {
      g.fillStyle = '#3ac828'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 90; i++) {
        const x = r() * 256, y = r() * 256, s = 3 + r() * 10;
        g.fillStyle = 'rgba(190,255,120,0.55)'; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(20,90,10,0.6)'; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x - s * 0.35, y - s * 0.35, s * 0.25, 0, Math.PI * 2); g.fill();
      }
    }, true, 4);
    return shared(new THREE.MeshStandardMaterial({ map, emissive: 0x1a8a10, emissiveMap: map, emissiveIntensity: 0.55, roughness: 0.35 }));
  });
}

/** Stone faces for the raised levels: dark crypt blocks with moss along the top. */
export function cryptSide() {
  return cached('m:side:halloween', () => {
    const r = rng(41);
    const map = canvasTex(256, 128, (g) => {
      g.fillStyle = '#5a5262'; g.fillRect(0, 0, 256, 128);
      g.strokeStyle = 'rgba(25,20,30,0.7)'; g.lineWidth = 2;
      for (let y = 0; y < 128; y += 22) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
        for (let x = (y / 22) % 2 ? 18 : 0; x < 256; x += 36) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 22); g.stroke(); }
      }
      for (let i = 0; i < 140; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.15)'; g.fillRect(r() * 256, r() * 128, 3, 3); }
      g.fillStyle = '#3f5a34'; g.fillRect(0, 0, 256, 10);
      for (let x = 0; x < 256; x += 8) { g.beginPath(); g.moveTo(x, 10); g.lineTo(x + 4, 10 + r() * 14); g.lineTo(x + 8, 10); g.fill(); }
    });
    map.wrapT = THREE.ClampToEdgeWrapping;
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp(), side: THREE.DoubleSide }));
  });
}

/** Cobwebs over the sticky patches (the course's "sand"): little webs scattered on a dusty grey. */
export function cobwebMaterial() {
  return cached('m:cobweb', () => {
    const r = rng(17);
    const map = canvasTex(256, 256, (g) => {
      g.fillStyle = '#5a5664'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = 'rgba(235,235,250,0.75)'; g.lineWidth = 1.2;
      for (let n = 0; n < 4; n++) {
        const cx = 40 + (n % 2) * 140 + r() * 30, cy = 40 + Math.floor(n / 2) * 140 + r() * 30, R = 44 + r() * 14;
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + r() * 0.2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); }
        for (let ring = 1; ring <= 4; ring++) {
          g.beginPath();
          for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI * 2, rr = (R * ring) / 4.4; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (k) g.quadraticCurveTo(cx + Math.cos(a - 0.4) * rr * 0.85, cy + Math.sin(a - 0.4) * rr * 0.85, x, y); else g.moveTo(x, y); }
          g.stroke();
        }
      }
    }, true, 2);
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp() }));
  });
}

const glow = (color: number) => cached(`m:hglow:${color}`, () => shared(new THREE.MeshBasicMaterial({ color, toneMapped: false })));

// ---------- jack-o'-lanterns (bumpers) ----------

/** A ribbed pumpkin, carved with a glowing grinning face turned toward the player. */
function pumpkinBody(r: number, seed: number) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(r, 28, 18);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 - 0.09 * Math.abs(Math.cos(Math.atan2(z, x) * 4)); // eight ribs
    pos.setXYZ(i, x * k, y * 0.78, z * k);
  }
  geo.computeVertexNormals();
  g.add(part(geo, toon(0xff7a14), 1.2));
  place(g, part(organic([V(0, 0), V(1, 4), V(3, 7)], [2.6, 2.2, 1.6], 8, 6), toon(0x5a7a2a), 0.6), 0, r * 0.72, 0);
  // The face: two triangle eyes, a nose and a jagged grin, glowing from inside
  const face = new THREE.Group();
  const tri = (w: number, h: number) => { const s = new THREE.Shape(); s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(0, h / 2); s.closePath(); return new THREE.ShapeGeometry(s); };
  const eyeGeo = tri(r * 0.36, r * 0.3);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(eyeGeo, glow(0xffd04a)); e.position.set(sx * r * 0.32, r * 0.18, 0); face.add(e); }
  const nose = new THREE.Mesh(tri(r * 0.16, r * 0.14), glow(0xffd04a)); nose.position.set(0, -0.02 * r, 0); face.add(nose);
  const m = new THREE.Shape();
  const w = r * 0.62, top = -r * 0.16, bot = -r * 0.42;
  m.moveTo(-w, top);
  for (let k = 0; k <= 6; k++) m.lineTo(-w + (k * 2 * w) / 6, k % 2 ? top - r * 0.08 : top);
  m.quadraticCurveTo(0, bot - r * 0.08, -w, top);
  const mouth = new THREE.Mesh(new THREE.ShapeGeometry(m), glow(0xffb02a)); face.add(mouth);
  face.position.z = r * 0.86; // on the front of the pumpkin, facing the shot camera's usual side
  face.rotation.y = (seed % 3 - 1) * 0.25;
  g.add(face);
  return g;
}

export function jackOLantern(bp: Bumper, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  root.position.copy(toScene(bp.x, bp.y)).setY(heightAt(L, bp.x, bp.y));
  const body = pumpkinBody(bp.r, Math.round(bp.x + bp.y));
  body.position.y = bp.r * 0.74;
  body.rotation.y = Math.atan2(L.tee[0] - bp.x, L.tee[1] - bp.y); // grinning back toward the tee, where shots come from
  root.add(body);
  // A soft orange glow on the turf round it
  const halo = new THREE.Mesh(new THREE.CircleGeometry(bp.r * 1.6, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.y = 0.6;
  root.add(halo);
  const seed = bp.x * 0.013;
  return { group: root, update: (_a, t) => { (halo.material as THREE.MeshBasicMaterial).opacity = 0.09 + 0.04 * Math.sin(t * 5 + seed * 7) * Math.sin(t * 3.1 + seed); } };
}

// ---------- gravestones (rocks) ----------

const ripTex = () => cached('t:rip', () => canvasTex(64, 64, (g) => {
  g.fillStyle = '#8a8494'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#3a3442'; g.font = 'bold 18px serif'; g.textAlign = 'center'; g.fillText('RIP', 32, 30);
  g.fillRect(16, 40, 32, 3); g.fillRect(22, 48, 20, 3);
}));

export function gravestone(rk: Rock, L: LevelDef, toScene: ToScene, i: number) {
  const g = new THREE.Group();
  const w = rk.r * 1.7, h = rk.r * 2.4, d = rk.r * 0.7;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); s.lineTo(-w / 2, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 1.2, bevelThickness: 1.2, bevelSegments: 2, curveSegments: 12 }).translate(0, 0, -d / 2);
  g.add(part(geo, toon(0x8a8494), 1.2));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, w * 0.8), new THREE.MeshToonMaterial({ map: ripTex(), gradientMap: toonRamp() }));
  face.position.set(0, h - w * 0.62, d / 2 + 1.3);
  g.add(face);
  // A little mound of earth at its foot
  place(g, part(blob(w * 0.75, 3, d * 1.2, 0.1, 14), toon(0x3a2e2a), 0.6, false), 0, 0, d * 0.9);
  const r = rng(i * 7 + 3);
  g.rotation.set((r() - 0.5) * 0.18, (r() - 0.5) * 0.5, (r() - 0.5) * 0.14);
  g.position.copy(toScene(rk.x, rk.y)).setY(heightAt(L, rk.x, rk.y) - 1);
  return g;
}

// ---------- dead trees (palms) ----------

export function deadTree(pm: Palm, L: LevelDef, toScene: ToScene, seed = 0) {
  const g = new THREE.Group();
  const r = rng(Math.round(pm.x * 3 + pm.y * 7 + seed));
  const h = pm.height ?? 110, base = pm.r ?? 13;
  const bark = toon(0x3a2e2a, { vertexColors: true });
  const trunk = [V(0, 0), V(r() * 6 - 3, h * 0.35), V(r() * 10 - 5, h * 0.7), V(r() * 14 - 7, h)];
  g.add(part(organic(trunk, [base, base * 0.8, base * 0.55, base * 0.25], 10, 16), bark, 1.4));
  for (let k = 0; k < 5; k++) {
    const t = 0.4 + k * 0.12, a = r() * Math.PI * 2, len = 25 + r() * 30;
    const s = trunk[Math.min(3, Math.round(t * 3))];
    const from = V(s.x, h * t, s.z);
    const mid = from.clone().add(V(Math.cos(a) * len * 0.5, len * 0.35, Math.sin(a) * len * 0.5));
    const tip = from.clone().add(V(Math.cos(a + 0.4) * len, len * 0.75, Math.sin(a + 0.4) * len));
    g.add(part(organic([from, mid, tip], [base * 0.32, base * 0.2, base * 0.08], 6, 8), bark, 0.9));
  }
  g.position.copy(toScene(pm.x, pm.y)).setY(heightAt(L, pm.x, pm.y));
  g.rotation.y = r() * 6;
  return g;
}

// ---------- ghosts ----------

export function ghost(gh: Ghost, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const r = gh.r ?? 18;
  // A sheet: a rounded dome with a wavy hem
  const prof: THREE.Vector2[] = [];
  for (let k = 0; k <= 10; k++) { const a = (k / 10) * (Math.PI / 2); prof.push(new THREE.Vector2(Math.sin(a) * r * 1.05 + 0.01, r * 1.6 + Math.cos(a) * r)); }
  prof.push(new THREE.Vector2(r * 1.1, r * 0.5), new THREE.Vector2(r * 1.2, 0));
  const geo = new THREE.LatheGeometry(prof, 28);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < r * 0.6) { const a = Math.atan2(pos.getZ(i), pos.getX(i)); pos.setY(i, y + Math.sin(a * 7) * r * 0.18 * (1 - y / (r * 0.6))); }
  }
  geo.computeVertexNormals();
  const sheet = new THREE.MeshToonMaterial({ color: 0xf4f6ff, gradientMap: toonRamp(), transparent: true, emissive: 0x6a7aa8, emissiveIntensity: 0.35 });
  const body = new THREE.Mesh(geo, sheet);
  body.castShadow = true;
  root.add(body);
  const dark = new THREE.MeshBasicMaterial({ color: 0x14101c, transparent: true });
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(r * 0.17, 10, 8).scale(1, 1.4, 0.5), dark); e.position.set(sx * r * 0.36, r * 1.75, r * 0.9); root.add(e); }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 10, 8).scale(1, 1.3, 0.5), dark); mouth.position.set(0, r * 1.3, r * 1.0); root.add(mouth);
  // Arms raised: "boo!"
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(organic([V(0, 0), V(sx * r * 0.5, r * 0.3), V(sx * r * 0.7, r * 0.75)], [r * 0.22, r * 0.18, r * 0.14], 8, 8), sheet);
    arm.position.set(sx * r * 0.8, r * 1.2, 0);
    root.add(arm);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(r * 1.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
  root.add(shadow);
  const seed = gh.a[0] * 0.01;
  return {
    group: root,
    update(_a, t) {
      const p = ghostAt(gh, world.time);
      const bob = 6 + Math.sin(t * 2.2 + seed * 10) * 3;
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y));
      body.position.y = bob; root.children.forEach((c) => { if (c !== shadow && c !== body) c.position.y = (c.userData.y ??= c.position.y) + bob; });
      // Turn to face the way it's drifting, and fade: a faint shimmer while it's passable
      if (Math.hypot(p.vx, p.vy) > 1) root.rotation.y = Math.atan2(p.vx, p.vy);
      const o = 0.14 + 0.78 * p.alpha;
      sheet.opacity = o; dark.opacity = Math.max(0.1, p.alpha);
      (shadow.material as THREE.MeshBasicMaterial).opacity = 0.25 * p.alpha;
    },
  };
}

// ---------- bats ----------

export function bat(b: Alien, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const fly = new THREE.Group();
  root.add(fly);
  const black = toon(0x1a1420);
  fly.add(part(new THREE.SphereGeometry(5, 12, 10).scale(1, 0.9, 1.3), black, 0.6));
  place(fly, part(new THREE.SphereGeometry(3.6, 10, 8), black, 0.5), 0, 2, 5);
  for (const sx of [-1, 1]) {
    place(fly, part(new THREE.ConeGeometry(1.4, 4, 6), black, 0.3), sx * 1.8, 5.5, 5);
    place(fly, new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 5), glow(0xff3a2a)), sx * 1.4, 2.8, 8.2);
  }
  // Wings: scalloped membranes that flap from the shoulders
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.lineTo(16, 5); wingShape.quadraticCurveTo(14, -1, 11, -3); wingShape.quadraticCurveTo(8, -1, 6, -5); wingShape.quadraticCurveTo(4, -2, 0, -4); wingShape.closePath();
  const wingGeo = new THREE.ShapeGeometry(wingShape).rotateX(Math.PI / 2);
  const wingMat = new THREE.MeshToonMaterial({ color: 0x2a2030, gradientMap: toonRamp(), side: THREE.DoubleSide });
  const wings: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, wingMat);
    w.scale.x = sx;
    w.position.set(sx * 3, 1, 0);
    fly.add(w);
    wings.push(w);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(8, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
  root.add(shadow);
  const seed = b.x * 0.02;
  return {
    group: root,
    update(_a, t) {
      const p = alienAt(b, world.time);
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y));
      fly.position.y = 12 + Math.sin(t * 7 + seed) * 3;
      root.rotation.y = Math.atan2(p.vx, p.vy);
      const f = Math.sin(t * 22 + seed * 5);
      wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * f * 0.7; });
    },
  };
}

// ---------- witches on brooms (lifts) ----------

function witch() {
  const g = new THREE.Group();
  // The broom: a long handle with a bundle of bristles behind
  const handle = part(new THREE.CylinderGeometry(1.2, 1.2, 64, 6).rotateZ(Math.PI / 2), toon(0x7a4a24), 0.6);
  g.add(handle);
  const bristles = part(new THREE.ConeGeometry(7, 22, 10, 1, true).rotateZ(Math.PI / 2).translate(-38, 0, 0), toon(0xc89a4a, { side: THREE.DoubleSide }), 0.6);
  g.add(bristles);
  place(g, part(new THREE.TorusGeometry(3, 1, 6, 10).rotateY(Math.PI / 2), toon(0x8a2a8a), 0.3), -27, 0, 0);
  // The witch, sitting side-saddle: a black dress, green face, long nose and a pointy hat
  const w = new THREE.Group();
  w.position.set(4, 4, 0);
  g.add(w);
  w.add(part(new THREE.ConeGeometry(9, 22, 12).translate(0, 10, 0), toon(0x6a2a9a), 1));
  // An orange cape streaming behind her
  w.add(part(new THREE.ConeGeometry(8, 20, 10, 1, true).rotateZ(1.2).translate(-10, 16, 0), toon(0xff7a1a, { side: THREE.DoubleSide }), 0.6));
  const head = new THREE.Group(); head.position.set(2, 25, 0); w.add(head);
  head.add(part(new THREE.SphereGeometry(5.2, 14, 10), toon(0x7ac85a), 0.8));
  place(head, part(new THREE.ConeGeometry(1.4, 6, 8).rotateZ(-Math.PI / 2), toon(0x6ab84a), 0.4), 7, -0.5, 0);
  for (const sz of [-1, 1]) place(head, new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 5), glow(0xffe04a)), 4.4, 1.5, sz * 2);
  place(head, part(new THREE.CylinderGeometry(9, 9, 1.2, 18), toon(0x2a1a40), 0.6), 0, 3.5, 0);
  const hat = place(head, part(new THREE.ConeGeometry(5, 15, 12), toon(0x2a1a40), 0.8), -1, 11, 0) as THREE.Mesh;
  hat.rotation.z = 0.35;
  place(head, part(new THREE.TorusGeometry(5, 1.2, 6, 14).rotateX(Math.PI / 2), toon(0xff8a1a), 0.3), 0, 4.5, 0);
  // Hair streaming out behind
  for (const sz of [-1, 1]) place(head, part(organic([V(-3, 0, sz * 3), V(-8, -4, sz * 4), V(-13, -6, sz * 3)], [2, 1.6, 0.8], 6, 6), toon(0x8a3a2a), 0.4), 0, 0, 0);
  // Arms reaching forward to the handle
  for (const sz of [-1, 1]) place(w, part(organic([V(0, 18, sz * 4), V(6, 12, sz * 3), V(10, 3, sz * 1.5)], [2, 1.8, 1.6], 6, 6), toon(0x6a2a9a), 0.5), 0, 0, 0);
  return g;
}

/** A witch circling over her pad; roll onto it and she flies the ball across the hole on her broom. */
export function witchBroom(lf: Lift, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const base = toScene(lf.x, lf.y).setY(heightAt(L, lf.x, lf.y));
  root.position.copy(base);
  // The pad: a glowing purple witch's circle with a ring of little moons
  const pad = new THREE.Group();
  pad.add(part(new THREE.CylinderGeometry(LIFT_CATCH + 8, LIFT_CATCH + 10, 1.6, 32), toon(0x2a1a34), 0.6, false));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(LIFT_CATCH + 2, 1.6, 6, 40).rotateX(Math.PI / 2), glow(0xb05aff));
  ring.position.y = 1.2;
  pad.add(ring);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    place(pad, new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), glow(0xffd04a)), Math.cos(a) * (LIFT_CATCH - 6), 1.6, Math.sin(a) * (LIFT_CATCH - 6));
  }
  root.add(pad);
  const rider = witch();
  rider.scale.setScalar(1.15);
  root.add(rider);
  let phase: 'idle' | 'flying' | 'away' = 'idle', awayT = 0;
  const last = new THREE.Vector3(), dir = new THREE.Vector3(1, 0, 0);
  const seed = lf.x * 0.01;
  return {
    group: root,
    update(_a, t) {
      (ring.material as THREE.MeshBasicMaterial).color.setHSL(0.78, 0.9, 0.55 + 0.15 * Math.sin(t * 4));
      const flying = world.air?.src === lf;
      if (flying) {
        // The ball sits in the bristles; the witch flies just ahead of it
        const b = world.ball;
        const p = toScene(b.x, b.y).setY(heightAt(L, b.x, b.y) + BALL_R + (b.z ?? 0)).sub(base);
        if (phase !== 'flying') { phase = 'flying'; last.copy(p); }
        const d = p.clone().sub(last);
        if (d.lengthSq() > 0.01) dir.lerp(d.normalize(), 0.2).normalize();
        last.copy(p);
        rider.rotation.set(0, -Math.atan2(dir.z, dir.x), Math.asin(Math.max(-0.6, Math.min(0.6, dir.y))));
        rider.position.copy(p).addScaledVector(dir, 30).setY(p.y + 4);
      } else if (phase === 'flying') { phase = 'away'; awayT = 0; }
      if (phase === 'away') {
        // Off she goes with a cackle, up into the night, then back to her circle
        awayT += 1 / 60;
        rider.position.addScaledVector(dir, 6).y += 3;
        if (awayT > 2.5) phase = 'idle';
      }
      if (phase === 'idle') {
        const a = t * 0.9 + seed;
        rider.position.set(Math.cos(a) * 26, 34 + Math.sin(t * 2) * 4, Math.sin(a) * 26);
        rider.rotation.set(0, -a - Math.PI / 2, 0.08 * Math.sin(t * 2));
      }
    },
  };
}

// ---------- the haunted hollow around the course ----------

function fencePost() {
  const g = new THREE.Group();
  const iron = toon(0x1a1420);
  g.add(part(new THREE.CylinderGeometry(1.4, 1.4, 46, 6).translate(0, 23, 0), iron, 0.4));
  place(g, part(new THREE.ConeGeometry(2.6, 7, 6), iron, 0.3), 0, 49, 0);
  return g;
}

function mansion() {
  const g = new THREE.Group();
  const wall = toon(0x2a2234), roof = toon(0x1a1420);
  g.add(part(new THREE.BoxGeometry(420, 260, 160).translate(0, 130, 0), wall, 3, false));
  g.add(part(new THREE.ConeGeometry(260, 160, 4).rotateY(Math.PI / 4).scale(1, 1, 0.5).translate(0, 340, 0), roof, 3, false));
  for (const x of [-250, 250]) {
    g.add(part(new THREE.CylinderGeometry(55, 55, 380, 10).translate(x, 190, 0), wall, 3, false));
    g.add(part(new THREE.ConeGeometry(75, 160, 10).translate(x, 460, 0), roof, 3, false));
  }
  // Lit windows
  const win = glow(0xffc04a);
  for (const [x, y] of [[-120, 80], [0, 80], [120, 80], [-120, 180], [120, 180], [-250, 260], [250, 260], [0, 300]]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(36, 50), win);
    w.position.set(x, y, Math.abs(x) === 250 ? 56 : 81);
    g.add(w);
  }
  return g;
}

export function hauntedLandscape(L: LevelDef, outline: Pt[], toScene: ToScene, lawnH: (x: number, y: number) => number, anims: Animated[]) {
  const group = new THREE.Group();
  const r = rng(Math.round(L.tee[0] * 5 + L.cup[1] * 3));
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const centre = toScene(cx, cy);
  const clearOf = (x: number, y: number, gap: number) => { const o = outlineDistance(outline, x, y); return !o.inside && o.d > gap; };
  const at = (x: number, y: number, lift = 0) => toScene(x, y).setY(lawnH(x, y) + lift);

  // A wrought-iron fence just outside the curb
  const posts = resample(outline, 46);
  posts.forEach((p, i) => {
    const x = p.x + p.nx * 34, y = p.y + p.ny * 34;
    if (!clearOf(x, y, 20)) return;
    const post = fencePost();
    post.position.copy(at(x, y));
    group.add(post);
    const q = posts[(i + 1) % posts.length], x2 = q.x + q.nx * 34, y2 = q.y + q.ny * 34;
    if (!clearOf(x2, y2, 20)) return;
    const a = at(x, y), b = at(x2, y2);
    for (const h of [12, 38]) {
      const rail = part(new THREE.CylinderGeometry(0.9, 0.9, a.distanceTo(b), 4), toon(0x1a1420), 0.3, false);
      rail.position.copy(a).add(b).multiplyScalar(0.5).setY((a.y + b.y) / 2 + h);
      rail.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
      group.add(rail);
    }
  });

  // Gravestones, dead trees and lit pumpkins scattered round the hollow
  for (let i = 0; i < 70; i++) {
    const x = cx + (r() - 0.5) * 2600, y = cy + (r() - 0.5) * 1700;
    if (!clearOf(x, y, 90)) continue;
    const k = r();
    if (k < 0.45) { const g = gravestone({ x, y, r: 12 + r() * 8 }, L, toScene, i); g.position.y = lawnH(x, y) - 1; group.add(g); }
    else if (k < 0.75) { const tr = deadTree({ x, y, height: 120 + r() * 120, r: 12 + r() * 6 }, L, toScene, i); tr.position.y = lawnH(x, y); group.add(tr); }
    else { const pk = jackOLantern({ x, y, r: 14 + r() * 10, n: 5, color: '' }, L, toScene); pk.group.position.y = lawnH(x, y); group.add(pk.group); anims.push(pk); }
  }

  // The haunted mansion on the hill behind, and a huge full moon
  const house = mansion();
  house.position.copy(centre).add(V(-300, -10, -1500));
  group.add(house);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(260, 48), new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false, toneMapped: false }));
  moon.position.copy(centre).add(V(700, 1100, -2600));
  group.add(moon);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(460, 48), new THREE.MeshBasicMaterial({ color: 0xffe8a8, transparent: true, opacity: 0.18, fog: false, depthWrite: false }));
  halo.position.copy(moon.position).add(V(0, 0, -5));
  group.add(halo);

  // Will-o'-the-wisps: small glowing lights drifting low over the graves
  const wispMat = new THREE.MeshBasicMaterial({ color: 0x9affc8, transparent: true, opacity: 0.8, toneMapped: false });
  for (let i = 0; i < 6; i++) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), wispMat);
    group.add(w);
    const ph = i * 1.7, rad = 620 + i * 70;
    anims.push({ group: w, update: (_a, t) => { w.position.copy(centre).add(V(Math.cos(t * 0.21 + ph) * rad, 30 + Math.sin(t * 1.3 + ph) * 12, Math.sin(t * 0.17 + ph) * rad * 0.6)); } });
  }
  return group;
}
