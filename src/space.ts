// Lunar Links: a cartoon moon course in the same toon-and-ink style as Jurassic Canyon.
// Pale moon-dust fairways, starry void chasms, drifting asteroids, hopping aliens and
// moonwalking astronauts, under a black sky with the Earth, a ringed planet and a passing UFO.
// Purely visual; positions of moving things come from physics.ts so what you see is what you hit.
import * as THREE from 'three';
import { Animated } from './art';
import { Alien, Asteroid, Astronaut, LevelDef, Meteor, Palm, Pt, Rocket } from './levels';
import { Models, PieceBatch } from './models';
import { alienAt, astronautAt, heightAt, meteorAt, palmR, rocketAt, tumbleweedAt, World } from './physics';
import { blob, cached, canvasTex, eye, mergeGeos, organic, part, place, rng, shared, toon, toonRamp, V } from './jurassic';
import { outlineDistance, resample } from './landscape';

type ToScene = (x: number, y: number) => THREE.Vector3;

/** Outline colour for the space course. */
export const SPACE_INK = 0x141634;

// ---------- ground materials ----------

/** Little craters drawn into a moon texture: a shaded bowl with a lit rim. */
function craterlets(g: CanvasRenderingContext2D, r: () => number, n: number, min: number, max: number, dark: string, lit: string) {
  for (let i = 0; i < n; i++) {
    const x = r() * 512, y = r() * 512, rad = min + r() * (max - min);
    g.fillStyle = lit;
    g.beginPath(); g.ellipse(x + rad * 0.12, y + rad * 0.12, rad * 1.1, rad * 0.95, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = dark;
    g.beginPath(); g.ellipse(x - rad * 0.08, y - rad * 0.08, rad, rad * 0.85, 0, 0, Math.PI * 2); g.fill();
  }
}

/** Moon dust for the fairways: pale blue-grey with soft blotches, small craters and sparkles. */
export function moonDustMaterial() {
  return cached('m:moondust', () => {
    const r = rng(77);
    const map = canvasTex(512, 512, (g) => {
      g.fillStyle = '#a9abc4';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 70; i++) {
        const x = r() * 512, y = r() * 512, rad = 30 + r() * 60;
        g.fillStyle = r() > 0.5 ? 'rgba(200,202,222,0.5)' : 'rgba(140,140,172,0.45)';
        g.beginPath(); g.ellipse(x, y, rad, rad * (0.5 + r() * 0.4), r() * 3, 0, Math.PI * 2); g.fill();
      }
      craterlets(g, r, 26, 5, 16, 'rgba(110,110,148,0.75)', 'rgba(220,224,245,0.8)');
      for (let i = 0; i < 120; i++) {
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.fillRect(r() * 512, r() * 512, 1.5, 1.5);
      }
    });
    return shared(new THREE.MeshToonMaterial({ map, gradientMap: toonRamp(), vertexColors: true }));
  });
}

/** The moon surface around the course: darker lavender-grey, pocked with craters. */
export function regolithMaterial() {
  return cached('m:regolith', () => {
    const r = rng(41);
    const c = canvasTex(512, 512, (g) => {
      g.fillStyle = '#5c5878';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 80; i++) {
        const x = r() * 512, y = r() * 512, rad = 20 + r() * 55;
        g.fillStyle = r() > 0.5 ? 'rgba(120,116,150,0.5)' : 'rgba(70,64,98,0.45)';
        g.beginPath(); g.ellipse(x, y, rad, rad * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
      }
      craterlets(g, r, 30, 6, 22, 'rgba(48,44,76,0.75)', 'rgba(150,146,180,0.7)');
    }, true, 30);
    return shared(new THREE.MeshToonMaterial({ map: c, gradientMap: toonRamp() }));
  });
}

/** The void: deep space seen through a crack in the moon, full of stars and violet nebula. */
export function voidMaterial() {
  return cached('m:void', () => {
    const r = rng(9);
    const tex = canvasTex(512, 512, (g) => {
      g.fillStyle = '#0a0824';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 14; i++) {
        const x = r() * 512, y = r() * 512, rad = 50 + r() * 90;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        const c = r() > 0.5 ? '140,70,220' : '50,110,220';
        gr.addColorStop(0, `rgba(${c},0.45)`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 260; i++) {
        const s = r() < 0.9 ? 1 + r() * 1.5 : 2.5 + r() * 2;
        g.fillStyle = r() > 0.8 ? '#ffe6a8' : '#ffffff';
        g.beginPath(); g.arc(r() * 512, r() * 512, s, 0, Math.PI * 2); g.fill();
      }
    }, true, 1);
    return shared(new THREE.MeshBasicMaterial({ map: tex }));
  });
}

/** Moon rocks keep their baked shading in cool grey; the kerb is a darker slate. */
export function moonRockSwap(): Record<string, THREE.Material> {
  return cached('m:moonRockSwap', () => ({ Stone: toon(0xa6a4bc, { vertexColors: true }) }));
}
export function moonKerb() { return toon(0x3e4270); }
/** Metal deck plates and dark rails for bridges over the void. */
export function spaceBridgeMaterials() {
  return { Plank: toon(0xb4bad0), Oak: toon(0x4a5076), Timber: toon(0x4a5076) };
}

// ---------- asteroids ----------

/** A lumpy cartoon space rock with a few round craters. */
function asteroidGeo(seed: number) {
  return cached(`g:asteroid:${seed}`, () => {
    const r = rng(seed);
    const g = new THREE.IcosahedronGeometry(1, 3);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const bumps = Array.from({ length: 5 }, () => [V(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), 0.12 + r() * 0.1] as const);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      let k = 1 + 0.08 * Math.sin(v.x * 4 + seed) * Math.cos(v.y * 3);
      for (const [d, s] of bumps) k -= s * Math.max(0, (v.dot(d) - 0.82) / 0.18) ** 2; // dents
      pos.setXYZ(i, v.x * k, v.y * k * 0.88, v.z * k);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** An asteroid drifting along its physics track just above the ground, tumbling slowly. */
export function asteroid(w: Asteroid, world: World, L: LevelDef, toScene: ToScene): Animated {
  const R = w.r ?? 20;
  const seed = Math.round(w.a[0] + w.a[1] * 7);
  const rock = part(asteroidGeo(seed % 5), toon(0x9c8a8a, { vertexColors: false }), 0.05);
  rock.scale.setScalar(R);
  const root = new THREE.Group();
  root.add(rock);
  // A soft shadow that stays on the ground while the rock bobs
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(R * 1.1, 24).rotateX(-Math.PI / 2), cached('m:astshadow', () => shared(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }))));
  const r = rng(seed);
  const axis = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
  const q = new THREE.Quaternion();
  let last = world.time;
  return {
    group: root,
    update() {
      const p = tumbleweedAt(w, world.time);
      const dt = Math.max(0, world.time - last);
      last = world.time;
      const g = heightAt(L, p.x, p.y);
      root.position.copy(toScene(p.x, p.y)).setY(g + R * 1.05 + Math.sin(world.time * 1.7 + seed) * 3);
      q.setFromAxisAngle(axis, dt * 0.9);
      rock.quaternion.premultiply(q);
      if (!shadow.parent) root.add(shadow);
      shadow.position.y = -(root.position.y - g) + 0.6;
    },
  };
}

// ---------- aliens ----------

/** A little green alien: round body, big head with one huge eye, wobbly antennae, stubby legs. */
export function alien(a: Alien, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const seed = Math.round(a.x + a.y);
  const hue = [0x7ce05a, 0x5ad0c8, 0xc77cf0][seed % 3];
  const skin = toon(hue, { vertexColors: true });
  place(body, part(blob(14, 15, 13), skin, 1.2), 0, 20, 0);
  place(body, part(blob(16, 13, 15), skin, 1.2), 2, 44, 0);
  // One big eye looking forward (+x), plus a small smile
  eye(body, 12, 47, 0, 8, 0);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.9, 6, 14, Math.PI * 0.8), toon(0x141634));
  smile.rotation.set(0, Math.PI / 2, Math.PI + 0.3);
  place(body, smile, 16.5, 36, 0);
  // Antennae with glowing tips
  const tipMat = cached('m:alienTip', () => shared(new THREE.MeshToonMaterial({ color: 0xfff27a, emissive: 0xffd02a, emissiveIntensity: 0.9, gradientMap: toonRamp() })));
  const antennae: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const an = new THREE.Group(); an.position.set(0, 55, s * 6); body.add(an);
    an.add(part(organic([V(0, 0), V(-2, 8, s * 3), V(-1, 16, s * 6)], [1.6, 1.3, 1.1], 8, 8), skin, 0.6));
    place(an, part(new THREE.SphereGeometry(3.2, 12, 8), tipMat, 0.6), -1, 17, s * 6);
    antennae.push(an);
  }
  // Arms and legs
  const arms: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const arm = part(organic([V(0, 0), V(3, -6, s * 6), V(6, -12, s * 8)], [3, 2.5, 2.6], 8, 8), skin, 0.7);
    place(body, arm, 2, 28, s * 12);
    arms.push(arm);
    place(body, part(blob(5.5, 4, 6, 0.2, 12), skin, 0.8), 2, 3.5, s * 7);
  }
  return {
    group: root,
    update(_a, t) {
      const p = alienAt(a, world.time);
      // Low-gravity hops: up in a long arc, down again, twice a second
      const hop = Math.abs(Math.sin(world.time * 5 + seed)) * 9;
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y) + hop);
      body.rotation.y = -Math.atan2(p.vy, p.vx);
      body.scale.set(1, 1 + 0.06 * Math.cos(world.time * 10 + seed), 1);
      antennae.forEach((an, i) => { an.rotation.x = (i ? 1 : -1) * 0.25 * Math.sin(t * 6 + i); });
      arms.forEach((arm, i) => { arm.rotation.z = 0.5 * Math.sin(t * 5 + i * Math.PI); });
    },
  };
}

// ---------- astronauts ----------

/** A chubby cartoon astronaut: white suit, gold visor, backpack. Waves, or moonwalks in slow hops. */
export function astronaut(s: Astronaut, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const suit = toon(0xf4f4fa, { vertexColors: true });
  const trim = toon(0xff7a3a);
  // Legs and boots
  for (const z of [-7, 7]) {
    place(body, part(organic([V(0, 22), V(0.5, 12), V(0, 5)], [6.5, 6, 6.2], 12, 8), suit, 1), 0, 0, z);
    place(body, part(blob(8, 4.5, 6.5, 0.2, 14), toon(0x7a7e9a), 1), 2, 3.5, z);
  }
  // Torso, belt and chest panel
  place(body, part(blob(15, 17, 15), suit, 1.3), 0, 34, 0);
  place(body, part(new THREE.TorusGeometry(14.5, 1.8, 8, 28).rotateX(Math.PI / 2), trim, 0.6, false), 0, 26, 0);
  const panel = part(new THREE.BoxGeometry(2, 8, 10), toon(0x5a6aa8), 0.5, false);
  place(body, panel, 14, 36, 0);
  for (const [z, c] of [[-2.5, 0xff4a4a], [2.5, 0x6aff8a]] as const) place(body, part(new THREE.SphereGeometry(1.4, 8, 6), toon(c), 0, false), 15.2, 38, z);
  // Backpack
  place(body, part(new THREE.BoxGeometry(10, 22, 20), toon(0xd8dae8), 1.1), -16, 38, 0);
  // Helmet: a big round bubble with a gold visor and a shine
  place(body, part(blob(14, 14, 14, 0.25), suit, 1.3), 0, 60, 0);
  // The visor is a closed lens on the front of the helmet, so its outline stays clean
  const visor = part(new THREE.SphereGeometry(1, 24, 16).scale(5, 9, 11), cached('m:visor', () => shared(new THREE.MeshToonMaterial({ color: 0xffb83a, emissive: 0x7a4200, emissiveIntensity: 0.35, gradientMap: toonRamp() }))), 0.8, false);
  place(body, visor, 10.5, 61, 0);
  place(body, part(new THREE.SphereGeometry(2.2, 10, 8).scale(1, 1.7, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, false), 15, 65, -4);
  // Arms: the right one waves when standing
  const arms: THREE.Group[] = [];
  for (const z of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(0, 44, z * 15); body.add(arm);
    arm.add(part(organic([V(0, 0), V(2, -8, z * 4), V(4, -16, z * 5)], [5.5, 5, 4.8], 10, 8), suit, 1));
    place(arm, part(new THREE.SphereGeometry(5, 12, 8), trim, 0.8), 4, -18, z * 5);
    arms.push(arm);
  }
  const seed = Math.round(s.a[0] + s.a[1]);
  return {
    group: root,
    update(_a, t) {
      const p = astronautAt(s, world.time);
      const moving = Math.hypot(p.vx, p.vy) > 2;
      // Big floaty bounds while walking; a gentle bob while waving
      const hop = moving ? Math.abs(Math.sin(world.time * 2.6 + seed)) * 16 : Math.abs(Math.sin(t * 1.5)) * 1.5;
      root.position.copy(toScene(p.x, p.y)).setY(heightAt(L, p.x, p.y) + hop);
      if (moving) body.rotation.y = -Math.atan2(p.vy, p.vx);
      else body.rotation.y = -Math.atan2(L.tee[1] - p.y, L.tee[0] - p.x); // face the player
      if (moving) {
        arms.forEach((arm, i) => { arm.rotation.z = 0.5 * Math.sin(world.time * 2.6 + i * Math.PI); arm.rotation.x = 0; });
      } else {
        arms[0].rotation.set(0, 0, 0.15 * Math.sin(t));
        arms[1].rotation.set(-2.5 + 0.35 * Math.sin(t * 6 + seed), 0, 0); // waving hello
      }
    },
  };
}

// ---------- landing rockets ----------

const glow = (color: number, emissive: number, key: string) => cached(`m:glow:${key}`, () => shared(new THREE.MeshToonMaterial({ color, emissive, emissiveIntensity: 1, gradientMap: toonRamp(), transparent: true, opacity: 0.9 })));

/** A puff of moon dust: a flattened ring that expands and fades. */
function dustRing() {
  const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 8, 28).rotateX(Math.PI / 2), new THREE.MeshToonMaterial({ color: 0xd8d6ea, gradientMap: toonRamp(), transparent: true, opacity: 0.8, depthWrite: false }));
  m.scale.set(1, 0.4, 1);
  m.visible = false;
  return m;
}

/**
 * A rocket that drops onto its landing pad on a jet of flame, sits there (solid) for a few seconds,
 * then blasts off again. The pad shows where it will come down.
 */
export function landingRocket(o: Rocket, world: World, L: LevelDef, toScene: ToScene): Animated {
  const root = new THREE.Group();
  const ground = heightAt(L, o.x, o.y);
  root.position.copy(toScene(o.x, o.y)).setY(ground);
  // Landing pad: a flat metal disc with a yellow ring and stripes (the ball rolls over it)
  const pad = new THREE.Group();
  pad.add(part(new THREE.CylinderGeometry(34, 36, 2, 32), toon(0x7c80a4), 0.8, false));
  place(pad, part(new THREE.TorusGeometry(26, 1.8, 6, 32).rotateX(Math.PI / 2), toon(0xffc83a), 0, false), 0, 1.2, 0);
  for (const a of [0, Math.PI / 2]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(30, 0.6, 4), toon(0xffc83a));
    bar.position.y = 1.3; bar.rotation.y = a + Math.PI / 4;
    pad.add(bar);
  }
  pad.position.y = 0.2;
  root.add(pad);
  // The rocket itself, half the size of the scenery rocket so its fins match the collider
  const ship = new THREE.Group();
  const body = rocket();
  body.scale.setScalar(0.5);
  ship.add(body);
  const flame = new THREE.Group();
  flame.add(new THREE.Mesh(new THREE.ConeGeometry(9, 34, 14).rotateX(Math.PI).translate(0, -17, 0), glow(0xffb02a, 0xff7a10, 'flame')));
  flame.add(new THREE.Mesh(new THREE.ConeGeometry(5, 22, 12).rotateX(Math.PI).translate(0, -11, 0), glow(0xfff6c0, 0xffe080, 'core')));
  flame.position.y = 10;
  ship.add(flame);
  root.add(ship);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(30, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.position.y = 2.6;
  root.add(shadow);
  const dust = dustRing();
  dust.position.y = 3;
  root.add(dust);
  return {
    group: root,
    update(_a, t) {
      const p = rocketAt(o, world.time);
      ship.visible = p.h < 0.999;
      ship.position.y = p.h * 900;
      ship.rotation.y = t * 0.3;
      ship.rotation.z = p.landed ? 0 : 0.04 * Math.sin(t * 7);
      // Flame while flying, and briefly as it settles on the pad
      flame.visible = ship.visible && p.h > 0.0005;
      flame.scale.set(1, 0.8 + 0.25 * Math.sin(t * 40) + Math.min(1, p.h * 4) * 0.5, 1);
      (shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 * Math.max(0, 1 - p.h * 2.5);
      shadow.scale.setScalar(0.6 + 0.4 * (1 - Math.min(1, p.h * 2.5)));
      // Dust blows out across the pad on touchdown and lift-off
      const near = p.h > 0 && p.h < 0.12;
      dust.visible = near;
      if (near) {
        const k = 1 - p.h / 0.12;
        dust.scale.set(30 + k * 35, 12 * (1 - k * 0.6), 30 + k * 35);
        (dust.material as THREE.MeshToonMaterial).opacity = 0.75 * (1 - k * 0.5);
      }
    },
  };
}

// ---------- falling asteroids ----------

/**
 * An asteroid that falls out of the sky on a fiery streak: a red ring pulses on the ground where it
 * will land, it crashes down in a puff of dust, sits there glowing hot (solid), then crumbles away.
 */
export function fallingMeteor(m: Meteor, world: World, L: LevelDef, toScene: ToScene): Animated {
  const R = m.r ?? 22;
  const root = new THREE.Group();
  const ground = heightAt(L, m.x, m.y);
  root.position.copy(toScene(m.x, m.y)).setY(ground);
  const ring = new THREE.Mesh(new THREE.RingGeometry(R * 1.05, R * 1.35, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
  ring.position.y = 0.8;
  root.add(ring);
  const rockMat = new THREE.MeshToonMaterial({ color: 0x8a6e6a, emissive: 0xff5a1a, emissiveIntensity: 0, gradientMap: toonRamp() });
  const rock = part(asteroidGeo(Math.round(m.x + m.y) % 5), rockMat, 0.05);
  const fall = new THREE.Group();
  fall.add(rock);
  rock.scale.setScalar(R);
  // Fiery tail streaming up behind it while it falls
  const tail = new THREE.Mesh(new THREE.ConeGeometry(R * 0.9, R * 5, 14).translate(0, R * 2.5, 0), glow(0xffa030, 0xff6010, 'tail'));
  fall.add(tail);
  root.add(fall);
  const dust = dustRing();
  dust.position.y = 3;
  root.add(dust);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(R * 1.1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.position.y = 0.6;
  root.add(shadow);
  // It comes in at a slant from this direction
  const dir = new THREE.Vector3(0.5, 1, -0.35).normalize();
  tail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return {
    group: root,
    update(_a, t) {
      const p = meteorAt(m, world.time);
      ring.visible = p.warning;
      if (p.warning) {
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.4 * Math.abs(Math.sin(t * 7));
        ring.scale.setScalar(1 + 0.08 * Math.sin(t * 7));
      }
      const falling = p.warning && p.h < 1;
      fall.visible = falling || p.size > 0;
      tail.visible = falling;
      fall.position.copy(dir).multiplyScalar(p.h * 900).setY(R * 0.75 + p.h * 900 * dir.y);
      rock.scale.setScalar(R * (falling ? 1 : p.size));
      rock.rotation.set(t * 2, t * 1.3, 0);
      if (!falling) rock.rotation.set(0.4, Math.round(m.x) * 0.1, 0.2);
      // Glows hot on impact and cools off
      rockMat.emissiveIntensity = falling ? 0.8 : Math.max(0, 0.7 - p.u * 0.35);
      shadow.visible = fall.visible;
      shadow.scale.setScalar(falling ? 0.4 + 0.6 * (1 - p.h) : Math.max(0.01, p.size));
      // Dust on impact
      const puff = p.u < 0.6 && !p.warning;
      dust.visible = puff;
      if (puff) {
        const k = p.u / 0.6;
        dust.scale.set(R * (1.2 + k * 2.2), 10 * (1 - k * 0.6), R * (1.2 + k * 2.2));
        (dust.material as THREE.MeshToonMaterial).opacity = 0.8 * (1 - k);
      }
    },
  };
}

// ---------- moon trees ----------

/**
 * A moon tree: a twisting lilac trunk crowned with round, glowing teal-and-pink puffs.
 * Its trunk base matches the physics post.
 */
export function moonTree(pm: Palm, L: LevelDef, toScene: ToScene) {
  const seed = Math.round(pm.x * 3 + pm.y);
  const r = rng(seed);
  const H = pm.height ?? 95, base = palmR(pm);
  const g = new THREE.Group();
  const lean = (r() - 0.5) * 16;
  const bark = toon([0xb88ad8, 0x8ab8e8][seed % 2], { vertexColors: true });
  g.add(part(organic([V(0, -2), V(lean * 0.3, H * 0.3, 5), V(-lean * 0.2, H * 0.6, -4), V(lean, H * 0.85)], [base, base * 0.8, base * 0.65, base * 0.55]), bark, 1.2));
  // A couple of curly branches
  for (const s of [-1, 1]) {
    const y0 = H * (0.55 + r() * 0.15);
    g.add(part(organic([V(0, y0), V(s * 14, y0 + 12, s * 6), V(s * 26, y0 + 18, s * 4), V(s * 30, y0 + 30)], [base * 0.4, base * 0.32, base * 0.26, base * 0.24], 10, 12), bark, 0.9));
  }
  // Canopy puffs
  const colors = seed % 2 ? [0x5ae0c8, 0x7af0d8] : [0xff8ad8, 0xffb0e6];
  const puffs: [number, number, number, number][] = [[lean, H, 0, 26], [-20, H * 0.78 + 20, 8, 18], [24, H * 0.82 + 18, -6, 17], [lean * 0.5, H + 18, -10, 15]];
  puffs.forEach(([x, y, z, rad], i) => place(g, part(blob(rad, rad * 0.85, rad), toon(colors[i % 2], { vertexColors: true }), 1.3), x, y, z));
  // Little glowing fruit
  const fruit = cached('m:moonfruit', () => shared(new THREE.MeshToonMaterial({ color: 0xfff27a, emissive: 0xffd02a, emissiveIntensity: 0.8, gradientMap: toonRamp() })));
  for (let i = 0; i < 6; i++) {
    const [x, y, z, rad] = puffs[i % puffs.length];
    const a = r() * Math.PI * 2;
    place(g, part(new THREE.SphereGeometry(3, 10, 8), fruit, 0.5, false), x + Math.cos(a) * rad * 0.9, y - rad * 0.3 + r() * 6, z + Math.sin(a) * rad * 0.9);
  }
  // Roots spreading into the dust
  const root = part(new THREE.SphereGeometry(base * 1.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x8a86a8), 1.1);
  root.scale.y = 0.35;
  g.add(root);
  g.rotation.y = seed * 0.37;
  g.position.copy(toScene(pm.x, pm.y)).setY(heightAt(L, pm.x, pm.y));
  return g;
}

// ---------- scenery ----------

/** Star field on a dome above the horizon (unaffected by fog), with a few bright twinkly ones. */
function starField(seed: number, centre: THREE.Vector3) {
  const r = rng(seed);
  const n = 2200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, el = Math.asin(0.03 + r() * 0.97);
    const R = 4700;
    pos[i * 3] = centre.x + Math.cos(a) * Math.cos(el) * R;
    pos[i * 3 + 1] = Math.sin(el) * R;
    pos[i * 3 + 2] = centre.z + Math.sin(a) * Math.cos(el) * R;
    const warm = r() > 0.85, b = 0.6 + r() * 0.4;
    col[i * 3] = b; col[i * 3 + 1] = b * (warm ? 0.9 : 0.95); col[i * 3 + 2] = b * (warm ? 0.7 : 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
  stars.frustumCulled = false;
  stars.renderOrder = -0.5;
  return stars;
}

/** A cartoon planet with toon banding (the Earth gets blue seas, green land and white clouds). */
function planet(kind: 'earth' | 'ringed', radius: number) {
  const g = new THREE.Group();
  if (kind === 'earth') {
    const r = rng(3);
    const tex = canvasTex(512, 256, (c) => {
      c.fillStyle = '#3a7ae8'; c.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 12; i++) {
        c.fillStyle = '#5ac85a';
        c.beginPath();
        const x = r() * 512, y = 40 + r() * 176, w = 30 + r() * 60;
        for (let k = 0; k <= 9; k++) { const a = (k / 9) * Math.PI * 2, rr = w * (0.7 + 0.3 * Math.sin(a * 3 + i)); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.6; if (k) c.lineTo(px, py); else c.moveTo(px, py); }
        c.fill();
      }
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 18; i++) { c.beginPath(); c.ellipse(r() * 512, r() * 256, 20 + r() * 40, 6 + r() * 6, 0, 0, Math.PI * 2); c.fill(); }
    });
    g.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 28), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonRamp(), fog: false })));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.06, 40, 28), new THREE.MeshBasicMaterial({ color: 0x6ab4ff, transparent: true, opacity: 0.18, fog: false, side: THREE.BackSide })));
  } else {
    const tex = canvasTex(256, 128, (c) => {
      const cols = ['#e8a86a', '#f4cf8a', '#c8805a', '#f0b878', '#d89a6a'];
      for (let y = 0; y < 128; y += 8) { c.fillStyle = cols[(y / 8) % cols.length]; c.fillRect(0, y, 256, 8); }
    });
    g.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 36, 24), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonRamp(), fog: false })));
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.35, radius * 2.1, 64).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: 0xd8c0f0, gradientMap: toonRamp(), side: THREE.DoubleSide, fog: false, transparent: true, opacity: 0.85 }));
    ring.rotation.set(0.35, 0, 0.25);
    g.add(ring);
  }
  g.traverse((o) => { (o as THREE.Mesh).frustumCulled = false; });
  return g;
}

/** A cartoon rocket standing on its fins: white body, red nose and fins, a round porthole. */
function rocket() {
  const g = new THREE.Group();
  const white = toon(0xf4f4fa), red = toon(0xff5a4a);
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; prof.push(new THREE.Vector2(Math.max(0.5, 26 * Math.sin(Math.PI * (0.15 + t * 0.85)) ** 0.7), 20 + t * 130)); }
  g.add(part(new THREE.LatheGeometry(prof, 28), white, 1.6));
  const nose: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; nose.push(new THREE.Vector2(Math.max(0.3, 15 * (1 - t) ** 0.8), 132 + t * 34)); }
  g.add(part(new THREE.LatheGeometry(nose, 24), red, 1.4));
  for (let i = 0; i < 3; i++) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(26, -6); shape.quadraticCurveTo(30, 30, 0, 60); shape.lineTo(0, 0);
    const fin = part(new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: true, bevelSize: 1.2, bevelThickness: 1.2, bevelSegments: 2 }).translate(0, 0, -1.5), red, 1.2);
    const a = (i / 3) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 18, 8, Math.sin(a) * 18);
    fin.rotation.y = -a;
    g.add(fin);
  }
  const port = part(new THREE.CylinderGeometry(9, 9, 3, 20).rotateZ(Math.PI / 2), toon(0x5ab0ff), 1);
  place(g, port, 24, 100, 0);
  place(g, part(new THREE.TorusGeometry(9.5, 2, 8, 20).rotateY(Math.PI / 2), toon(0xc0c4d8), 0.8, false), 24.5, 100, 0);
  return g;
}

/** A flag on a pole: gold with a cue-ball emblem (no real-world flags). */
function flag() {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(1.6, 1.6, 90, 8).translate(0, 45, 0), toon(0xd8dae8), 0.8));
  const cloth = new THREE.PlaneGeometry(44, 28, 10, 4).translate(22, 74, 0);
  const p = cloth.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 0.15) * 3);
  cloth.computeVertexNormals();
  g.add(part(cloth, toon(0xffc040, { side: THREE.DoubleSide }), 0, false));
  const dot = part(new THREE.CircleGeometry(7, 20).translate(22, 74, 3.2), toon(0xffffff, { side: THREE.DoubleSide }), 0, false);
  g.add(dot);
  return g;
}

/** A glowing crystal cluster. */
function crystals(seed: number, size: number) {
  const r = rng(seed);
  const mat = cached(`m:crystal:${seed % 2}`, () => shared(new THREE.MeshToonMaterial({ color: seed % 2 ? 0x8a6aff : 0x5ae0ff, emissive: seed % 2 ? 0x4a2ac0 : 0x1a8ab0, emissiveIntensity: 0.7, gradientMap: toonRamp() })));
  const geos: THREE.BufferGeometry[] = [];
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const h = size * (0.6 + r() * 0.8), w = size * 0.18;
    const c = new THREE.ConeGeometry(w, h, 6).translate(0, h / 2, 0);
    c.rotateZ((r() - 0.5) * 0.9).rotateX((r() - 0.5) * 0.9).translate((r() - 0.5) * size * 0.5, 0, (r() - 0.5) * size * 0.5);
    geos.push(c);
  }
  return part(mergeGeos(geos), mat, 1);
}

/** A big crater in the ground beyond the course: a raised rim ring around a shaded floor. */
function groundCrater(radius: number) {
  const g = new THREE.Group();
  const rim = part(new THREE.TorusGeometry(radius, radius * 0.16, 10, 40).rotateX(Math.PI / 2), toon(0x77739a), 1.2);
  rim.scale.y = 0.45;
  g.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.95, 36).rotateX(-Math.PI / 2), toon(0x45415f));
  floor.position.y = 0.6;
  floor.receiveShadow = true;
  g.add(floor);
  return g;
}

/** A flying saucer with a glass dome and a little alien pilot, for the sky. */
function ufo() {
  const g = new THREE.Group();
  const hull = part(new THREE.SphereGeometry(1, 32, 16).scale(60, 14, 60), toon(0xc0c6dc), 2);
  g.add(hull);
  place(g, part(new THREE.SphereGeometry(28, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x9ae8ff, gradientMap: toonRamp(), transparent: true, opacity: 0.65 }), 1.5), 0, 6, 0);
  place(g, part(blob(10, 12, 10), toon(0x7ce05a, { vertexColors: true }), 1), 0, 14, 0);
  const lights = cached('m:ufoLight', () => shared(new THREE.MeshBasicMaterial({ color: 0xfff27a })));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    place(g, new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), lights), Math.cos(a) * 52, -3, Math.sin(a) * 52);
  }
  return g;
}

/**
 * Dressing around a moon hole: moon rocks and crystals along the kerb, craters, a rocket and a
 * flag further out, a starry sky with the Earth and a ringed planet, and a UFO cruising past.
 */
export function spaceLandscape(L: LevelDef, outline: Pt[], models: Models, toScene: ToScene, lawnH: (x: number, y: number) => number, anims: Animated[]) {
  const group = new THREE.Group();
  const r = rng(Math.round(L.tee[1] * 13 + L.cup[0] * 7));
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const b = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const [tx, ty] = L.tee;
  const clearOf = (x: number, y: number, gap: number) => { const o = outlineDistance(outline, x, y); return !o.inside && o.d > gap; };
  const at = (x: number, y: number, lift = 0) => toScene(x, y).setY(lawnH(x, y) + lift);

  // Moon rocks and crystals hugging the kerb
  const rocks = new PieceBatch(models);
  resample(outline, 55).forEach((p, i) => {
    const off = 42 + Math.sin(i * 0.9) * 8, x = p.x + p.nx * off, y = p.y + p.ny * off;
    if (!clearOf(x, y, 24) || Math.hypot(x - tx, y - ty) < 120) return;
    if (i % 4 === 2) {
      const c = crystals(i, 22 + r() * 14);
      c.position.copy(at(x, y, -2));
      c.rotation.y = r() * 6;
      group.add(c);
    } else if (i % 2 === 0) {
      const s = 10 + r() * 10, sp = at(x, y);
      rocks.add(`Boulder${1 + (i % 3)}`, new THREE.Matrix4().makeTranslation(sp.x, sp.y + s * 0.2, sp.z).multiply(new THREE.Matrix4().makeRotationY(r() * 6)).multiply(new THREE.Matrix4().makeScale(s * 1.3, s * 0.9, s)));
    }
  });

  const spot = (minGap: number, near: number, far: number) => {
    for (let k = 0; k < 80; k++) {
      const a = r() * Math.PI * 2;
      const x = cx + Math.cos(a) * ((b.maxX - b.minX) / 2 + near + r() * far), y = cy + Math.sin(a) * ((b.maxY - b.minY) / 2 + near * 0.9 + r() * far * 0.8);
      if (clearOf(x, y, minGap) && Math.hypot(x - tx, y - ty) > 200) return [x, y] as const;
    }
    return null;
  };
  // Craters on the plain
  for (let i = 0; i < 7; i++) {
    const s = spot(150, 140, 520);
    if (!s) continue;
    const c = groundCrater(50 + r() * 70);
    c.position.copy(at(s[0], s[1], -3));
    group.add(c);
  }
  // A rocket and a flag
  const rk = spot(160, 160, 220);
  if (rk) { const m = rocket(); m.position.copy(at(rk[0], rk[1], -2)); m.rotation.y = r() * 6; group.add(m); }
  const fl = spot(80, 80, 120);
  if (fl) { const m = flag(); m.position.copy(at(fl[0], fl[1], -2)); m.rotation.y = r() * 6; group.add(m); }
  // Scattered moon rocks and crystal clusters
  for (let i = 0; i < 16; i++) {
    const s = spot(90, 110, 500);
    if (!s) continue;
    if (i % 4 === 0) {
      const c = crystals(i + 50, 30 + r() * 30);
      c.position.copy(at(s[0], s[1], -2));
      group.add(c);
      continue;
    }
    const sz = 16 + r() * 30, sp = at(s[0], s[1]);
    rocks.add(`Boulder${1 + (i % 3)}`, new THREE.Matrix4().makeTranslation(sp.x, sp.y + sz * 0.1, sp.z).multiply(new THREE.Matrix4().makeRotationY(r() * 6)).multiply(new THREE.Matrix4().makeScale(sz * 1.4, sz, sz * 1.2)));
  }
  group.add(rocks.build(moonRockSwap()));

  // Sky: stars, the Earth rising behind the hole, a ringed planet off to the side
  const centre = toScene(cx, cy);
  group.add(starField(L.cup[0] + L.tee[1], centre));
  const earth = planet('earth', 380);
  earth.position.copy(toScene(cx - 900, cy - 3900)).setY(1150);
  earth.rotation.z = 0.4;
  group.add(earth);
  const ringed = planet('ringed', 220);
  ringed.position.copy(toScene(cx + 3200, cy - 2300)).setY(1500);
  group.add(ringed);
  anims.push({ group: earth, update: (_a, t) => { earth.rotation.y = t * 0.03; } });

  // A UFO cruising in a lazy loop high above
  const saucer = ufo();
  group.add(saucer);
  anims.push({
    group: saucer,
    update: (_a, t) => {
      const a = t * 0.12;
      saucer.position.copy(toScene(cx + Math.cos(a) * 900, cy - 500 + Math.sin(a) * 600)).setY(420 + Math.sin(t * 0.8) * 30);
      saucer.rotation.set(Math.sin(t * 0.9) * 0.08, t * 0.8, Math.cos(t * 0.7) * 0.08);
    },
  });

  // Jagged moon mountains on the horizon
  const mtn = toon(0x4e4a70);
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9 + (r() - 0.5) * 0.2;
    const d = 2800 + r() * 500, h = 300 + r() * 450, w = 380 + r() * 300;
    const m = part(new THREE.ConeGeometry(w, h, 7, 1).translate(0, h / 2, 0), mtn, 10, false);
    m.position.copy(toScene(cx + Math.cos(a) * d, cy + Math.sin(a) * d)).setY(-30);
    m.rotation.y = r() * 6;
    group.add(m);
  }
  return group;
}
