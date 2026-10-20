import * as THREE from 'three';
import { Bumper, WORLD_H, WORLD_W, Zone } from './levels';
import { BALL_R, CUP_R, SPINNER_R, WALL_R, World } from './physics';

// The physics runs on a flat 2D table (x, y). In 3D that table lies on the XZ plane,
// centred on the origin, with the felt surface at y = 0.
const RAIL = 38;
const RAIL_H = 16;
const HW = WORLD_W / 2;
const HH = WORLD_H / 2;
const to3 = (x: number, y: number) => new THREE.Vector3(x - HW, 0, y - HH);

const C = {
  bg: 0x101b29,
  floor: 0x16253a,
  rail: 0x364957,
  plinth: 0x223140,
  felt: 0x6cb574,
  wood: 0xe8bd77,
  water: 0x2d5d66,
  waterDeep: 0x203f4d,
  sand: 0xe6d29c,
  spinner: 0xe8e1ca,
  cupRim: 0x15272d,
  aim: 0xfdf4a4,
  cue: 0xb67e49,
  cueButt: 0x6e4524,
  sight: 0xe8e1ca,
};

export interface AimState { active: boolean; dx: number; dy: number; power: number }

export interface FX {
  sink?: { t: number };
  splash?: { x: number; y: number; t: number };
  ripples: { x: number; y: number; t: number }[];
}

const TILT_3D = 0.95; // camera elevation in radians (~54°)
const TILT_TOP = Math.PI / 2 - 0.001;
const MAX_DOTS = 160;

export class Renderer3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 10, 5000);
  private levelGroup = new THREE.Group();
  private ball: THREE.Mesh;
  private spinners: THREE.Group[] = [];
  private dots: THREE.InstancedMesh;
  private ghosts: THREE.Mesh[] = [];
  private cue = new THREE.Group();
  private cupPulse!: THREE.Mesh;
  private rippleMeshes: THREE.Mesh[] = [];
  private waterMats: THREE.MeshStandardMaterial[] = [];
  private lastBall = { x: 0, y: 0 };
  private size = { w: 1, h: 1, top: 0, bottom: 0 };
  private tilt = TILT_3D;
  private lastFrame = performance.now();
  private tiltTarget = TILT_3D;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(C.bg);

    this.addLights();
    this.addTable();
    this.scene.add(this.levelGroup);

    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), new THREE.MeshStandardMaterial({ map: cueBallTexture(), roughness: 0.25 }));
    this.ball.castShadow = true;
    this.scene.add(this.ball);

    const dotGeo = new THREE.CircleGeometry(3.4, 12).rotateX(-Math.PI / 2);
    this.dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }), MAX_DOTS);
    this.dots.count = 0;
    this.dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DOTS * 3), 3);
    this.dots.renderOrder = 2;
    this.scene.add(this.dots);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Mesh(
        new THREE.RingGeometry(BALL_R - 2, BALL_R, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: C.aim, transparent: true, depthWrite: false }),
      );
      g.visible = false;
      g.renderOrder = 2;
      this.ghosts.push(g);
      this.scene.add(g);
    }

    this.buildCue();
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xdcf0ff, transparent: true, depthWrite: false }),
      );
      r.visible = false;
      this.rippleMeshes.push(r);
      this.scene.add(r);
    }
  }

  private addLights() {
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x1a2633, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-260, 700, 380);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -620; sc.right = 620; sc.top = 420; sc.bottom = -420; sc.near = 100; sc.far = 1600;
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 4;
    this.scene.add(sun);
  }

  private addTable() {
    // Floor glow under the table
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1500, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: C.floor, roughness: 1 }));
    floor.position.y = -140;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Plinth (table body)
    const plinth = new THREE.Mesh(
      extrudeRoundRect(WORLD_W + RAIL * 2 - 30, WORLD_H + RAIL * 2 - 30, 40, 110),
      new THREE.MeshStandardMaterial({ color: C.plinth, roughness: 0.8 }),
    );
    plinth.position.y = -140;
    plinth.castShadow = true;
    this.scene.add(plinth);

    // Rails: rounded frame with the felt opening cut out
    const outer = roundRectShape(WORLD_W + RAIL * 2, WORLD_H + RAIL * 2, 46);
    outer.holes.push(roundRectShape(WORLD_W, WORLD_H, 22));
    const railGeo = new THREE.ExtrudeGeometry(outer, { depth: RAIL_H + 30, bevelEnabled: true, bevelThickness: 4, bevelSize: 4, bevelSegments: 3, curveSegments: 24 });
    railGeo.rotateX(-Math.PI / 2);
    const rail = new THREE.Mesh(railGeo, new THREE.MeshStandardMaterial({ color: C.rail, roughness: 0.55 }));
    rail.position.y = -30;
    rail.castShadow = true;
    rail.receiveShadow = true;
    this.scene.add(rail);

    // Diamond sights
    const diamond = new THREE.Shape([new THREE.Vector2(0, 5), new THREE.Vector2(4, 0), new THREE.Vector2(0, -5), new THREE.Vector2(-4, 0)]);
    const dGeo = new THREE.ShapeGeometry(diamond).rotateX(-Math.PI / 2);
    const dMat = new THREE.MeshBasicMaterial({ color: C.sight });
    const yTop = RAIL_H + 4.2;
    const put = (x: number, z: number) => { const m = new THREE.Mesh(dGeo, dMat); m.position.set(x, yTop, z); this.scene.add(m); };
    for (let i = 1; i < 8; i++) { put(-HW + (WORLD_W * i) / 8, -HH - RAIL / 2); put(-HW + (WORLD_W * i) / 8, HH + RAIL / 2); }
    for (let i = 1; i < 4; i++) { put(-HW - RAIL / 2, -HH + (WORLD_H * i) / 4); put(HW + RAIL / 2, -HH + (WORLD_H * i) / 4); }
  }

  private buildCue() {
    const len = 300;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 5.6, len, 16), new THREE.MeshStandardMaterial({ color: C.cue, roughness: 0.45 }));
    shaft.rotation.z = -Math.PI / 2; // axis along +x, thin end at +x
    shaft.position.x = -len / 2;
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.8, len * 0.35, 16), new THREE.MeshStandardMaterial({ color: C.cueButt, roughness: 0.5 }));
    butt.rotation.z = -Math.PI / 2;
    butt.position.x = -len + (len * 0.35) / 2;
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 8, 12), new THREE.MeshStandardMaterial({ color: 0xf3efe2 }));
    ferrule.rotation.z = -Math.PI / 2;
    ferrule.position.x = -4;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.8, 3, 12), new THREE.MeshStandardMaterial({ color: 0x3f74a8 }));
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 1.5;
    const pitch = new THREE.Group();
    pitch.add(shaft, butt, ferrule, tip);
    pitch.rotation.z = -0.1; // lift the butt a little
    pitch.name = 'pitch';
    for (const m of [shaft, butt, ferrule, tip]) m.castShadow = true;
    this.cue.add(pitch);
    this.cue.visible = false;
    this.scene.add(this.cue);
  }

  /** Rebuild everything specific to a hole. */
  setLevel(world: World) {
    disposeGroup(this.levelGroup);
    this.spinners = [];
    this.waterMats = [];
    const L = world.level;
    const add = (o: THREE.Object3D) => { this.levelGroup.add(o); return o; };

    // Felt with the cup cut out
    const felt = roundRectShape(WORLD_W, WORLD_H, 22);
    const hole = new THREE.Path();
    hole.absarc(L.cup[0] - HW, -(L.cup[1] - HH), CUP_R, 0, Math.PI * 2, true);
    felt.holes.push(hole);
    const feltMesh = new THREE.Mesh(
      new THREE.ShapeGeometry(felt, 32).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: C.felt, roughness: 0.95, map: feltTexture() }),
    );
    feltMesh.receiveShadow = true;
    add(feltMesh);
    // Felt body below (so the rail inner bevel doesn't show the void)
    const under = new THREE.Mesh(new THREE.BoxGeometry(WORLD_W, 2, WORLD_H), new THREE.MeshBasicMaterial({ color: 0x0c151c }));
    under.position.y = -31;
    add(under);

    // Cup
    const cupPos = to3(L.cup[0], L.cup[1]);
    const cupWall = new THREE.Mesh(new THREE.CylinderGeometry(CUP_R, CUP_R, 30, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x0b1419, side: THREE.BackSide, roughness: 1 }));
    cupWall.position.copy(cupPos).setY(-15);
    add(cupWall);
    const cupBottom = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x030608 }));
    cupBottom.position.copy(cupPos).setY(-29);
    add(cupBottom);
    const rim = new THREE.Mesh(new THREE.RingGeometry(CUP_R, CUP_R + 8, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: C.cupRim, roughness: 0.6 }));
    rim.position.copy(cupPos).setY(0.3);
    rim.receiveShadow = true;
    add(rim);
    this.cupPulse = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    this.cupPulse.position.copy(cupPos).setY(0.5);
    add(this.cupPulse);

    // Tee marker
    const tee = new THREE.Mesh(new THREE.RingGeometry(BALL_R + 7, BALL_R + 9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
    tee.position.copy(to3(L.tee[0], L.tee[1])).setY(0.4);
    add(tee);

    // Sand and water
    for (const z of L.sand ?? []) {
      const m = new THREE.Mesh(zoneGeometry(z, 0), new THREE.MeshStandardMaterial({ color: C.sand, roughness: 1, map: sandTexture() }));
      m.position.y = 0.3;
      m.receiveShadow = true;
      add(m);
    }
    for (const z of L.water ?? []) {
      const edge = new THREE.Mesh(zoneGeometry(z, 4), new THREE.MeshStandardMaterial({ color: 0x5b8a6a, roughness: 1 }));
      edge.position.y = 0.25;
      add(edge);
      const mat = new THREE.MeshStandardMaterial({ color: C.water, roughness: 0.12, metalness: 0.3 });
      this.waterMats.push(mat);
      const w = new THREE.Mesh(zoneGeometry(z, 0), mat);
      w.position.y = 0.4;
      w.receiveShadow = true;
      add(w);
      const deep = new THREE.Mesh(zoneGeometry(z, -12), new THREE.MeshStandardMaterial({ color: C.waterDeep, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 }));
      deep.position.y = 0.5;
      deep.receiveShadow = true;
      add(deep);
    }

    // Walls and bars (capsules lying on the felt)
    const woodMat = new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.5, map: woodTexture() });
    for (const s of world.segs) {
      const a = to3(s.ax, s.ay);
      const b = to3(s.bx, s.by);
      const len = a.distanceTo(b);
      const geo = new THREE.CapsuleGeometry(s.r, len, 6, 16).rotateZ(Math.PI / 2);
      const m = new THREE.Mesh(geo, woodMat);
      m.position.copy(a).add(b).multiplyScalar(0.5).setY(WALL_R);
      m.scale.y = 1.25;
      m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      m.castShadow = true;
      m.receiveShadow = true;
      add(m);
    }

    for (const bp of L.bumpers ?? []) add(bumperMesh(bp));

    for (const s of world.spinners) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: C.spinner, roughness: 0.4 });
      for (const rot of [0, Math.PI / 2]) {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(SPINNER_R, s.len * 2, 6, 12).rotateZ(Math.PI / 2), mat);
        arm.rotation.y = rot;
        arm.castShadow = true;
        g.add(arm);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, SPINNER_R * 2 + 6, 24), new THREE.MeshStandardMaterial({ color: 0x9f9883, roughness: 0.4 }));
      hub.castShadow = true;
      g.add(hub);
      g.position.copy(to3(s.x, s.y)).setY(SPINNER_R + 4);
      this.spinners.push(g);
      add(g);
    }

    this.lastBall = { x: world.ball.x, y: world.ball.y };
    this.ball.quaternion.identity();
  }

  setTopView(top: boolean) { this.tiltTarget = top ? TILT_TOP : TILT_3D; }
  get isTopView() { return this.tiltTarget === TILT_TOP; }

  resize(w: number, h: number, dpr: number, top: number, bottom: number) {
    this.size = { w, h, top, bottom };
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(w, h, false);
    this.fitCamera();
  }

  /** Place the camera so the whole table fits between the HUD bar and the power bar. */
  private fitCamera() {
    const { w, h, top, bottom } = this.size;
    const cam = this.camera;
    cam.aspect = w / h;
    cam.clearViewOffset();
    const corners: THREE.Vector3[] = [];
    for (const x of [-HW - RAIL, HW + RAIL]) for (const z of [-HH - RAIL, HH + RAIL]) for (const y of [-30, RAIL_H + 4]) corners.push(new THREE.Vector3(x, y, z));
    const dir = new THREE.Vector3(0, Math.sin(this.tilt), Math.cos(this.tilt));
    const availH = 2 - (2 * (top + 6)) / h - (2 * (bottom + 6)) / h;
    const availW = 2 - (2 * 14) / w;
    const v = new THREE.Vector3();
    const project = (d: number) => {
      cam.position.copy(dir).multiplyScalar(d);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const c of corners) {
        v.copy(c).project(cam);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      return { minX, maxX, minY, maxY };
    };
    let lo = 300, hi = 6000;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      const r = project(mid);
      if (r.maxX - r.minX <= availW && r.maxY - r.minY <= availH) hi = mid; else lo = mid;
    }
    const r = project(hi);
    // Shift the image so the table sits centred in the free band.
    const wantCenter = (1 - (2 * top) / h + (-1 + (2 * bottom) / h)) / 2;
    const haveCenter = (r.maxY + r.minY) / 2;
    cam.setViewOffset(w, h, 0, ((wantCenter - haveCenter) * h) / 2, w, h);
  }

  /** Convert a screen point to table coordinates (or null if it misses the table plane). */
  pick(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, p)) return null;
    return { x: p.x + HW, y: p.z + HH };
  }

  render(world: World, aim: AimState, fx: FX, time: number) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (Math.abs(this.tilt - this.tiltTarget) > 0.001) {
      this.tilt += (this.tiltTarget - this.tilt) * Math.min(1, dt * 9);
      if (Math.abs(this.tilt - this.tiltTarget) < 0.002) this.tilt = this.tiltTarget;
      this.fitCamera();
    }

    // Spinners
    world.spinners.forEach((s, i) => { if (this.spinners[i]) this.spinners[i].rotation.y = -s.angle; });

    // Cup pulse
    const pulse = (Math.sin(time * 3) + 1) / 2;
    const ps = CUP_R + 12 + pulse * 6;
    this.cupPulse.scale.set(ps, 1, ps);
    (this.cupPulse.material as THREE.MeshBasicMaterial).opacity = 0.15 + pulse * 0.2;

    for (const m of this.waterMats) m.color.setHSL(0.53, 0.38, 0.29 + Math.sin(time * 1.4) * 0.02);

    // Ball: roll it by the distance travelled
    const b = world.ball;
    const dx = b.x - this.lastBall.x;
    const dy = b.y - this.lastBall.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.001 && dist < 200) {
      const axis = new THREE.Vector3(dy, 0, -dx).normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(axis, dist / BALL_R);
      this.ball.quaternion.premultiply(q);
    }
    this.lastBall = { x: b.x, y: b.y };
    let bx = b.x, by = b.y, bh = BALL_R;
    if (fx.sink) {
      const t = Math.min(1, fx.sink.t);
      bx += (world.level.cup[0] - bx) * Math.min(1, t * 2);
      by += (world.level.cup[1] - by) * Math.min(1, t * 2);
      bh = BALL_R - t * 34;
    }
    this.ball.position.copy(to3(bx, by)).setY(bh);
    this.ball.visible = !fx.splash || fx.splash.t < 0.05;
    if (fx.splash) this.ball.position.y = BALL_R - fx.splash.t * 200;

    // Ripples
    this.rippleMeshes.forEach((m, i) => {
      const r = fx.ripples[i];
      m.visible = !!r && r.t > 0;
      if (!r || r.t <= 0) return;
      m.position.copy(to3(r.x, r.y)).setY(1);
      const s = 10 + r.t * 50;
      m.scale.set(s, 1, s);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - r.t);
    });

    this.updateAim(world, aim);
    this.renderer.render(this.scene, this.camera);
  }

  private updateAim(world: World, aim: AimState) {
    const on = aim.active && aim.power > 0.02;
    this.cue.visible = on;
    this.ghosts.forEach((g) => (g.visible = false));
    if (!on) { this.dots.count = 0; return; }

    const b = world.ball;
    // The guide reaches further with more power and always shows two banks.
    const path = world.aimPath(aim.dx, aim.dy, 320 + aim.power * 700, 2);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const base = new THREE.Color(C.aim);
    let n = 0;
    const spacing = 20;
    let carry = 0;
    for (let s = 0; s < path.pts.length - 1 && n < MAX_DOTS; s++) {
      const a = path.pts[s], c = path.pts[s + 1];
      const len = Math.hypot(c.x - a.x, c.y - a.y);
      const fade = [1, 0.7, 0.45][Math.min(2, s)];
      for (let d = carry; d < len && n < MAX_DOTS; d += spacing) {
        const t = d / len;
        const p = to3(a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t);
        m.makeTranslation(p.x, 1.2, p.z);
        this.dots.setMatrixAt(n, m);
        col.copy(base).multiplyScalar(fade);
        this.dots.setColorAt(n, col);
        n++;
        carry = d + spacing - len;
      }
      if (s < path.contacts && s < this.ghosts.length) {
        const g = this.ghosts[s];
        g.visible = true;
        g.position.copy(to3(c.x, c.y)).setY(1.3);
        (g.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
      }
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;

    // Cue: behind the ball, pulled back with power
    this.cue.position.copy(to3(b.x, b.y)).setY(BALL_R + 2);
    this.cue.rotation.y = -Math.atan2(aim.dy, aim.dx);
    const pitch = this.cue.getObjectByName('pitch')!;
    pitch.position.x = -(BALL_R + 6 + aim.power * 70);
  }
}

// ---------- geometry helpers ----------

function roundRectShape(w: number, h: number, r: number) {
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

function extrudeRoundRect(w: number, h: number, r: number, depth: number) {
  const g = new THREE.ExtrudeGeometry(roundRectShape(w, h, r), { depth, bevelEnabled: false, curveSegments: 16 });
  return g.rotateX(-Math.PI / 2);
}

/** Flat geometry for a zone, grown (or shrunk, if negative) by `grow`. */
function zoneGeometry(z: Zone, grow: number) {
  let shape: THREE.Shape;
  if (z.kind === 'circle') {
    shape = new THREE.Shape();
    shape.absarc(0, 0, Math.max(2, z.r + grow), 0, Math.PI * 2, false);
  } else {
    shape = roundRectShape(z.w + grow * 2, z.h + grow * 2, Math.max(4, 26 + grow));
  }
  const g = new THREE.ShapeGeometry(shape, 32).rotateX(-Math.PI / 2);
  const c = z.kind === 'circle' ? to3(z.x, z.y) : to3(z.x + z.w / 2, z.y + z.h / 2);
  return g.translate(c.x, 0, c.z);
}

function bumperMesh(bp: Bumper) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(bp.r, 32, 20), new THREE.MeshStandardMaterial({ map: poolBallTexture(bp.color, bp.n), roughness: 0.2 }));
  m.position.copy(to3(bp.x, bp.y)).setY(bp.r);
  m.rotation.z = Math.PI / 2; // turn the number disc to face up
  m.rotation.x = 0.35;
  m.castShadow = true;
  return m;
}

function disposeGroup(g: THREE.Group) {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) { (mat as THREE.MeshStandardMaterial).map?.dispose(); mat.dispose(); }
    }
  });
  g.clear();
}

// ---------- procedural textures ----------

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
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

function cueBallTexture() {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = '#eef4f6';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#c8473b';
    for (const [x, y] of [[64, 64], [192, 64], [128, 10], [128, 118]]) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
  });
}

function feltTexture() {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 128);
    // Very soft cloth noise
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * 256, Math.random() * 128, 1.5, 1.5);
    }
  });
}

function sandTexture() {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(140,110,50,${0.15 + Math.random() * 0.25})`;
      g.fillRect(Math.random() * 64, Math.random() * 64, 1.5, 1.5);
    }
  }, 4);
}

function woodTexture() {
  return canvasTex(128, 32, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 32);
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(150,100,40,${0.08 + Math.random() * 0.12})`;
      g.lineWidth = 1 + Math.random();
      g.beginPath();
      const y = Math.random() * 32;
      g.moveTo(0, y);
      g.bezierCurveTo(40, y + 3, 80, y - 3, 128, y + 1);
      g.stroke();
    }
  });
}

