import * as THREE from 'three';
import { Bumper, WORLD_H, WORLD_W, Zone } from './levels';
import { BALL_R, CUP_R, SPINNER_R, WALL_R, World } from './physics';

// The physics runs on a flat 2D table (x, y). In 3D that table lies on the XZ plane,
// centred on the origin, with the felt surface at y = 0.
const RAIL = 38;
const RAIL_H = 16;
const HW = WORLD_W / 2;
const HH = WORLD_H / 2;
const FLOOR_Y = -330;
const to3 = (x: number, y: number) => new THREE.Vector3(x - HW, 0, y - HH);

const C = {
  bg: 0x0d1622,
  floor: 0x5a4030,
  rug: 0x1f3a46,
  rail: 0x364957,
  plinth: 0x2a1d16,
  felt: 0x58a262,
  cushion: 0x4a8f55,
  wood: 0xe8bd77,
  water: 0x2d5d66,
  waterDeep: 0x1d3c4a,
  sand: 0xe6d29c,
  spinner: 0xe8e1ca,
  cupRim: 0x9a8a62,
  aim: 0xfdf4a4,
  cue: 0xd9a46a,
  cueButt: 0x3a2416,
  sight: 0xf3ead2,
  lamp: 0xffe2b0,
};

export type GuideMode = 'full' | 'short';
export interface AimState { active: boolean; dx: number; dy: number; power: number; guide: GuideMode }
/** Where the cue is drawn, independent of aiming so it can animate the strike. */
export interface CueState { visible: boolean; dx: number; dy: number; pull: number; alpha: number; ox?: number; oy?: number }

export interface FX {
  sink?: { t: number };
  splash?: { x: number; y: number; t: number };
  ripples: { x: number; y: number; t: number }[];
}

export type CamMode = 'title' | 'play' | 'sink';

const TILT_3D = 0.95; // camera elevation in radians (~54°)
const TILT_TOP = Math.PI / 2 - 0.001;
const MAX_DOTS = 160;
const DROPS = 14;

export class Renderer3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 10, 6000);
  private levelGroup = new THREE.Group();
  private ball: THREE.Mesh;
  private ballShadowFake: THREE.Mesh;
  private spinners: THREE.Group[] = [];
  private dots: THREE.InstancedMesh;
  private ghosts: THREE.Mesh[] = [];
  private cue = new THREE.Group();
  private cuePitch = new THREE.Group();
  private cueMats: THREE.MeshStandardMaterial[] = [];
  private cupPulse!: THREE.Mesh;
  private cupPos = new THREE.Vector3();
  private rippleMeshes: THREE.Mesh[] = [];
  private drops: THREE.InstancedMesh;
  private dropState: { p: THREE.Vector3; v: THREE.Vector3 }[] = [];
  private waterMats: THREE.MeshPhysicalMaterial[] = [];
  private size = { w: 1, h: 1, top: 0, bottom: 0 };
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Ball spin: angular velocity eases toward pure rolling, so a hard shot skids first.
  private spin = new THREE.Vector3();
  private hop = { y: 0, v: 0 };

  // Camera rig
  private tilt = TILT_3D;
  private tiltTarget = TILT_3D;
  private baseDist = 1500;
  private offsetY = 0;
  private yaw = 0;
  private distMul = 1;
  private focus = new THREE.Vector3();
  private mode: CamMode = 'title';
  private shakeAmt = 0;
  follow = true;

  // Adaptive quality: step down resolution and shadow detail if frames run slow.
  private quality = 0;
  private dpr = 1;
  private perf = { time: 0, frames: 0 };
  private lamp!: THREE.SpotLight;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.scene.background = new THREE.Color(C.bg);
    this.scene.fog = new THREE.Fog(C.bg, 2200, 4200);

    this.addEnvironmentMap();
    this.addLights();
    this.addRoom();
    this.addTable();
    this.scene.add(this.levelGroup);

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 40, 24),
      new THREE.MeshPhysicalMaterial({ map: cueBallTexture(), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06 }),
    );
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    // Soft contact shadow so the ball sits on the cloth even where the shadow map is blurry
    this.ballShadowFake = new THREE.Mesh(
      new THREE.CircleGeometry(BALL_R * 1.1, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.55 }),
    );
    this.scene.add(this.ballShadowFake);

    const dotGeo = new THREE.CircleGeometry(3.2, 12).rotateX(-Math.PI / 2);
    this.dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false }), MAX_DOTS);
    this.dots.count = 0;
    this.dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DOTS * 3), 3);
    this.dots.renderOrder = 2;
    this.scene.add(this.dots);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Mesh(
        new THREE.RingGeometry(BALL_R - 1.8, BALL_R, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: C.aim, transparent: true, depthWrite: false, toneMapped: false }),
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
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(2.4, 8, 6), new THREE.MeshStandardMaterial({ color: 0xbfe6f0, roughness: 0.05, transparent: true, opacity: 0.8 }), DROPS);
    this.drops.count = 0;
    this.scene.add(this.drops);
  }

  // ---------- static scene ----------

  /** A tiny procedural "room" baked into an environment map for glossy reflections. */
  private addEnvironmentMap() {
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x0a0f16);
    const panel = (w: number, h: number, color: number, intensity: number, pos: [number, number, number]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(...pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(6, 2.2, C.lamp, 6, [0, 6, 0]); // the lamp above the table
    panel(10, 4, 0x6f8aa8, 0.6, [0, 2, -9]); // dim walls
    panel(10, 4, 0x6f8aa8, 0.4, [-9, 2, 0]);
    panel(10, 4, 0x8a7458, 0.4, [9, 2, 0]);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(env, 0.04).texture;
    pmrem.dispose();
  }

  private addLights() {
    this.scene.add(new THREE.HemisphereLight(0xcfe0f5, 0x2a2018, 0.4));

    // Warm billiard lamp: the main light and the only shadow caster
    const lamp = (this.lamp = new THREE.SpotLight(C.lamp, 3.1, 0, 0.78, 0.6, 0));
    lamp.position.set(-80, 900, 140);
    lamp.target.position.set(0, 0, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.camera.near = 300;
    lamp.shadow.camera.far = 1600;
    lamp.shadow.bias = -0.0004;
    lamp.shadow.radius = 5;
    this.scene.add(lamp, lamp.target);

    // Cool rim from behind the table to separate objects from the felt
    const rim = new THREE.DirectionalLight(0x9cc4ff, 0.7);
    rim.position.set(300, 400, -700);
    this.scene.add(rim);
  }

  private addRoom() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: C.floor, roughness: 0.7, map: floorTexture() }),
    );
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const rugGeo = new THREE.ShapeGeometry(roundRectShape(1700, 1100, 40), 12);
    const ruv = rugGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) / 1700 + 0.5, ruv.getY(i) / 1100 + 0.5);
    const rug = new THREE.Mesh(
      rugGeo.rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: C.rug, roughness: 1, map: rugTexture() }),
    );
    rug.position.y = FLOOR_Y + 1;
    rug.receiveShadow = true;
    this.scene.add(rug);

    // Turned legs
    const legGeo = new THREE.LatheGeometry(
      [[0, 0], [30, 0], [30, 20], [20, 40], [24, 90], [16, 140], [22, 175], [28, 190], [0, 190]].map(([x, y]) => new THREE.Vector2(x, y)),
      20,
    );
    const legMat = new THREE.MeshStandardMaterial({ color: C.plinth, roughness: 0.45, metalness: 0.05 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(sx * (HW - 20), FLOOR_Y, sz * (HH - 20));
      leg.castShadow = true;
      this.scene.add(leg);
    }
  }

  private addTable() {
    // Apron (table body) in dark wood
    const apron = new THREE.Mesh(
      extrudeRoundRect(WORLD_W + RAIL * 2 - 16, WORLD_H + RAIL * 2 - 16, 44, 110),
      new THREE.MeshStandardMaterial({ color: C.plinth, roughness: 0.4, map: woodTexture() }),
    );
    apron.position.y = -140;
    apron.castShadow = true;
    apron.receiveShadow = true;
    this.scene.add(apron);

    // Rails: rounded frame with the felt opening cut out
    const outer = roundRectShape(WORLD_W + RAIL * 2, WORLD_H + RAIL * 2, 46);
    outer.holes.push(roundRectShape(WORLD_W + 14, WORLD_H + 14, 26));
    const railGeo = new THREE.ExtrudeGeometry(outer, { depth: RAIL_H + 30, bevelEnabled: true, bevelThickness: 4, bevelSize: 4, bevelSegments: 4, curveSegments: 24 });
    railGeo.rotateX(-Math.PI / 2);
    const rail = new THREE.Mesh(railGeo, new THREE.MeshPhysicalMaterial({ color: C.rail, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 }));
    rail.position.y = -30;
    rail.castShadow = true;
    rail.receiveShadow = true;
    this.scene.add(rail);

    // Felt cushions along the inside of the rails
    const cushionShape = roundRectShape(WORLD_W + 16, WORLD_H + 16, 27);
    cushionShape.holes.push(roundRectShape(WORLD_W, WORLD_H, 22));
    const cushionGeo = new THREE.ExtrudeGeometry(cushionShape, { depth: 40, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 2, curveSegments: 20 });
    cushionGeo.rotateX(-Math.PI / 2);
    const cushion = new THREE.Mesh(cushionGeo, new THREE.MeshStandardMaterial({ color: C.cushion, roughness: 0.95 }));
    cushion.position.y = -30;
    cushion.receiveShadow = true;
    cushion.castShadow = true;
    this.scene.add(cushion);

    // Mother-of-pearl diamond sights
    const diamond = new THREE.Shape([new THREE.Vector2(0, 5.5), new THREE.Vector2(4, 0), new THREE.Vector2(0, -5.5), new THREE.Vector2(-4, 0)]);
    const dGeo = new THREE.ShapeGeometry(diamond).rotateX(-Math.PI / 2);
    const dMat = new THREE.MeshStandardMaterial({ color: C.sight, roughness: 0.2, metalness: 0.3 });
    const yTop = RAIL_H + 4.3;
    const put = (x: number, z: number) => { const m = new THREE.Mesh(dGeo, dMat); m.position.set(x, yTop, z); this.scene.add(m); };
    for (let i = 1; i < 8; i++) { put(-HW + (WORLD_W * i) / 8, -HH - RAIL / 2 - 3); put(-HW + (WORLD_W * i) / 8, HH + RAIL / 2 + 3); }
    for (let i = 1; i < 4; i++) { put(-HW - RAIL / 2 - 3, -HH + (WORLD_H * i) / 4); put(HW + RAIL / 2 + 3, -HH + (WORLD_H * i) / 4); }
  }

  private buildCue() {
    const len = 320;
    const mk = (geo: THREE.BufferGeometry, color: number, x: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, transparent: true, ...extra });
      this.cueMats.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.z = -Math.PI / 2; // cylinder axis along +x, thin end toward the ball
      m.position.x = x;
      m.castShadow = true;
      this.cuePitch.add(m);
    };
    mk(new THREE.CylinderGeometry(2.6, 4.6, len * 0.62, 18), C.cue, -len * 0.31 - 8, { map: woodTexture() });
    mk(new THREE.CylinderGeometry(4.6, 6.2, len * 0.38, 18), C.cueButt, -len * 0.62 - len * 0.19 - 8, { roughness: 0.25, metalness: 0.1 });
    mk(new THREE.CylinderGeometry(4.65, 4.65, 6, 18), 0xd8c08a, -len * 0.62 - 8, { metalness: 0.8, roughness: 0.25 }); // brass joint
    mk(new THREE.CylinderGeometry(2.6, 2.6, 7, 14), 0xf3efe2, -4.5); // ferrule
    mk(new THREE.CylinderGeometry(2.5, 2.6, 2.4, 14), 0x3f74a8, -0.2, { roughness: 0.9 }); // chalked tip
    this.cuePitch.rotation.z = -0.09; // lift the butt a little
    this.cue.add(this.cuePitch);
    this.cue.visible = false;
    this.scene.add(this.cue);
  }

  // ---------- per hole ----------

  /** Rebuild everything specific to a hole. */
  setLevel(world: World) {
    disposeGroup(this.levelGroup);
    this.spinners = [];
    this.waterMats = [];
    const L = world.level;
    const add = (o: THREE.Object3D) => { this.levelGroup.add(o); return o; };

    // Felt with the cup cut out
    const felt = roundRectShape(WORLD_W + 2, WORLD_H + 2, 22);
    const hole = new THREE.Path();
    hole.absarc(L.cup[0] - HW, -(L.cup[1] - HH), CUP_R, 0, Math.PI * 2, true);
    felt.holes.push(hole);
    const feltMesh = new THREE.Mesh(
      new THREE.ShapeGeometry(felt, 40).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: C.felt, roughness: 0.92, map: feltTexture(), bumpMap: feltBump(), bumpScale: 0.6 }),
    );
    // ShapeGeometry UVs are in world units; scale them so the cloth texture tiles.
    const uv = feltMesh.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 250, uv.getY(i) / 250);
    feltMesh.receiveShadow = true;
    add(feltMesh);
    const under = new THREE.Mesh(new THREE.BoxGeometry(WORLD_W, 2, WORLD_H), new THREE.MeshBasicMaterial({ color: 0x0c151c }));
    under.position.y = -31;
    add(under);

    // Cup with a brass rim
    this.cupPos = to3(L.cup[0], L.cup[1]);
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(CUP_R, CUP_R, 30, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1612, side: THREE.BackSide, roughness: 0.9 }));
    liner.position.copy(this.cupPos).setY(-15);
    add(liner);
    const cupBottom = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x030405 }));
    cupBottom.position.copy(this.cupPos).setY(-29);
    add(cupBottom);
    const rim = new THREE.Mesh(new THREE.RingGeometry(CUP_R, CUP_R + 3, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: C.cupRim, metalness: 0.9, roughness: 0.3 }));
    rim.position.copy(this.cupPos).setY(0.3);
    add(rim);
    this.cupPulse = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false }));
    this.cupPulse.position.copy(this.cupPos).setY(0.5);
    add(this.cupPulse);
    // Flag pin
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 90, 8), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3, metalness: 0.4 }));
    pin.position.copy(this.cupPos).add(new THREE.Vector3(CUP_R * 0.45, 30, -CUP_R * 0.2));
    pin.castShadow = true;
    add(pin);
    const flag = new THREE.Mesh(flagGeometry(), new THREE.MeshStandardMaterial({ color: 0xffcb67, side: THREE.DoubleSide, roughness: 0.7 }));
    flag.position.copy(pin.position).add(new THREE.Vector3(0, 44, 0));
    flag.castShadow = true;
    flag.name = 'flag';
    add(flag);

    // Tee marker
    const tee = new THREE.Mesh(new THREE.RingGeometry(BALL_R + 7, BALL_R + 9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
    tee.position.copy(to3(L.tee[0], L.tee[1])).setY(0.4);
    add(tee);

    // Sand traps with a soft lip
    for (const z of L.sand ?? []) {
      const lip = new THREE.Mesh(zoneGeometry(z, 3), new THREE.MeshStandardMaterial({ color: 0xbfa970, roughness: 1 }));
      lip.position.y = 0.2;
      add(lip);
      const tex = sandTexture();
      const m = new THREE.Mesh(zoneGeometry(z, 0, 140), new THREE.MeshStandardMaterial({ color: C.sand, roughness: 1, map: tex, bumpMap: tex, bumpScale: 1.2 }));
      m.position.y = 0.3;
      m.receiveShadow = true;
      add(m);
    }
    // Water: grassy bank, dark depth, glossy surface with moving ripples
    for (const z of L.water ?? []) {
      const bank = new THREE.Mesh(zoneGeometry(z, 5), new THREE.MeshStandardMaterial({ color: 0x4d7a57, roughness: 1 }));
      bank.position.y = 0.25;
      add(bank);
      const deep = new THREE.Mesh(zoneGeometry(z, -10), new THREE.MeshBasicMaterial({ color: C.waterDeep }));
      deep.position.y = 0.35;
      add(deep);
      const mat = new THREE.MeshPhysicalMaterial({ color: C.water, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.82, normalMap: waterNormal(), normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 1 });
      this.waterMats.push(mat);
      const w = new THREE.Mesh(zoneGeometry(z, 0, 160), mat);
      w.position.y = 0.5;
      w.receiveShadow = true;
      add(w);
    }

    // Walls and bars: varnished wood capsules lying on the felt
    const woodMat = new THREE.MeshPhysicalMaterial({ color: C.wood, roughness: 0.45, map: woodTexture(), clearcoat: 0.6, clearcoatRoughness: 0.25 });
    for (const s of world.segs) {
      const a = to3(s.ax, s.ay);
      const b = to3(s.bx, s.by);
      const len = a.distanceTo(b);
      const geo = new THREE.CapsuleGeometry(s.r, len, 6, 18).rotateZ(Math.PI / 2);
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
      const mat = new THREE.MeshPhysicalMaterial({ color: C.spinner, roughness: 0.35, clearcoat: 0.8 });
      for (const rot of [0, Math.PI / 2]) {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(SPINNER_R, s.len * 2, 6, 14).rotateZ(Math.PI / 2), mat);
        arm.rotation.y = rot;
        arm.castShadow = true;
        g.add(arm);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(11, 13, SPINNER_R * 2 + 8, 24), new THREE.MeshStandardMaterial({ color: 0xc9a85c, roughness: 0.3, metalness: 0.85 }));
      hub.castShadow = true;
      g.add(hub);
      g.position.copy(to3(s.x, s.y)).setY(SPINNER_R + 4);
      this.spinners.push(g);
      add(g);
    }

    this.ball.quaternion.identity();
    this.spin.set(0, 0, 0);
    this.hop = { y: 0, v: 0 };
    this.drops.count = 0;
  }

  // ---------- camera ----------

  setTopView(top: boolean) { this.tiltTarget = top ? TILT_TOP : TILT_3D; }
  get isTopView() { return this.tiltTarget === TILT_TOP; }
  setMode(m: CamMode) { this.mode = m; }
  shake(amount: number) { this.shakeAmt = Math.min(10, this.shakeAmt + amount); }

  /** Swoop in from a high, turned angle at the start of a hole. */
  intro() {
    this.yaw = 0.55;
    this.distMul = 1.5;
    this.focus.set(0, 0, 0);
  }

  resize(w: number, h: number, dpr: number, top: number, bottom: number) {
    this.size = { w, h, top, bottom };
    this.dpr = dpr;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(w, h, false);
    this.fitCamera();
  }

  private pixelRatio() { return Math.min(this.dpr, [2, 1.5, 1.25, 1][this.quality]); }

  /** Called every frame; after a sustained slow stretch, drop one quality step. */
  private adaptQuality(dt: number) {
    if (dt <= 0 || this.quality >= 3) return;
    this.perf.time += dt;
    this.perf.frames++;
    if (this.perf.time < 2) return;
    const avg = this.perf.time / this.perf.frames;
    this.perf = { time: 0, frames: 0 };
    if (avg < 1 / 45) return;
    this.quality++;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(this.size.w, this.size.h, false);
    if (this.quality >= 2) {
      this.lamp.shadow.mapSize.set(1024, 1024);
      this.lamp.shadow.map?.dispose();
      this.lamp.shadow.map = null;
    }
    if (this.quality >= 3) {
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.scene.traverse((o) => { if (o instanceof THREE.Mesh) (o.material as THREE.Material).needsUpdate = true; });
    }
  }

  /** Find the camera distance (and vertical image shift) that fits the table between the HUD bars. */
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
    this.baseDist = hi;
    const wantCenter = (1 - (2 * top) / h + (-1 + (2 * bottom) / h)) / 2;
    const haveCenter = (r.maxY + r.minY) / 2;
    this.offsetY = ((wantCenter - haveCenter) * h) / 2;
  }

  private updateCamera(world: World, dt: number, time: number, aiming: boolean) {
    if (Math.abs(this.tilt - this.tiltTarget) > 0.001) {
      this.tilt += (this.tiltTarget - this.tilt) * Math.min(1, dt * 9);
      if (Math.abs(this.tilt - this.tiltTarget) < 0.002) this.tilt = this.tiltTarget;
      this.fitCamera();
    }

    let yawT = 0, distT = 1;
    const focusT = new THREE.Vector3();
    if (this.mode === 'title') {
      yawT = Math.sin(time * 0.12) * 0.7;
      distT = 1.05;
    } else if (this.mode === 'sink') {
      focusT.copy(this.cupPos).multiplyScalar(0.55);
      distT = 0.72;
    } else if (this.follow && world.moving && !aiming) {
      // Lean toward the ball while it rolls, without ever losing the table
      focusT.copy(to3(world.ball.x, world.ball.y)).multiplyScalar(0.2);
      distT = 0.93;
    }
    const k = Math.min(1, dt * (this.mode === 'title' ? 1.2 : 1.8));
    this.yaw += (yawT - this.yaw) * k;
    this.distMul += (distT - this.distMul) * k;
    this.focus.lerp(focusT, k);

    const d = this.baseDist * this.distMul;
    const cam = this.camera;
    const ct = Math.cos(this.tilt);
    cam.position.set(this.focus.x + Math.sin(this.yaw) * ct * d, this.focus.y + Math.sin(this.tilt) * d, this.focus.z + Math.cos(this.yaw) * ct * d);
    if (this.shakeAmt > 0.05) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 14);
    }
    // Straight down needs a different "up" so lookAt stays stable
    if (this.tilt > 1.5) cam.up.set(0, 0, -1); else cam.up.set(0, 1, 0);
    cam.lookAt(this.focus);
    cam.setViewOffset(this.size.w, this.size.h, 0, this.offsetY, this.size.w, this.size.h);
    cam.updateMatrixWorld();
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

  /** Screen position of a table point (for UI hints). */
  project(x: number, y: number) {
    const v = to3(x, y).setY(BALL_R).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  /** Kick the ball up off the cloth after a hard hit. */
  bounceBall(speed: number) { if (speed > 650) this.hop.v = Math.max(this.hop.v, Math.min(90, (speed - 600) / 9)); }

  splash(x: number, y: number) {
    this.dropState = [];
    for (let i = 0; i < DROPS; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 70;
      this.dropState.push({ p: to3(x, y).setY(2), v: new THREE.Vector3(Math.cos(a) * s, 120 + Math.random() * 140, Math.sin(a) * s) });
    }
    this.drops.count = DROPS;
  }

  // ---------- per frame ----------

  render(world: World, aim: AimState, cue: CueState, fx: FX, time: number, dt: number) {
    this.adaptQuality(dt);
    this.updateCamera(world, dt, time, aim.active);

    world.spinners.forEach((s, i) => { if (this.spinners[i]) this.spinners[i].rotation.y = -s.angle; });

    const pulse = (Math.sin(time * 3) + 1) / 2;
    const ps = CUP_R + 12 + pulse * 6;
    this.cupPulse.scale.set(ps, 1, ps);
    (this.cupPulse.material as THREE.MeshBasicMaterial).opacity = 0.12 + pulse * 0.18;
    const flag = this.levelGroup.getObjectByName('flag');
    if (flag) flag.rotation.y = Math.sin(time * 1.7) * 0.25;

    for (const m of this.waterMats) m.normalMap?.offset.set(time * 0.02, time * 0.013);

    this.updateBall(world, fx, dt);

    this.rippleMeshes.forEach((m, i) => {
      const r = fx.ripples[i];
      m.visible = !!r && r.t > 0;
      if (!r || r.t <= 0) return;
      m.position.copy(to3(r.x, r.y)).setY(1);
      const s = 10 + r.t * 55;
      m.scale.set(s, 1, s);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - r.t);
    });
    if (this.drops.count) {
      const mtx = new THREE.Matrix4();
      let alive = 0;
      this.dropState.forEach((d, i) => {
        d.v.y -= 900 * dt;
        d.p.addScaledVector(d.v, dt);
        if (d.p.y > 0) alive++;
        mtx.makeTranslation(d.p.x, Math.max(-50, d.p.y), d.p.z);
        this.drops.setMatrixAt(i, mtx);
      });
      this.drops.instanceMatrix.needsUpdate = true;
      if (!alive) this.drops.count = 0;
    }

    this.updateAim(world, aim);
    this.updateCue(world, cue);
    this.renderer.render(this.scene, this.camera);
  }

  private updateBall(world: World, fx: FX, dt: number) {
    const b = world.ball;
    // Spin eases toward true rolling (v / r), so fast shots visibly skid at first.
    const target = new THREE.Vector3(b.vy, 0, -b.vx).divideScalar(BALL_R);
    this.spin.lerp(target, Math.min(1, dt * (world.moving ? 5 : 12)));
    const w = this.spin.length();
    if (w > 1e-4) this.ball.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(this.spin.clone().divideScalar(w), w * dt));

    this.hop.v -= 1600 * dt;
    this.hop.y = Math.max(0, this.hop.y + this.hop.v * dt);
    if (this.hop.y === 0) this.hop.v = this.hop.v < -80 ? -this.hop.v * 0.35 : 0;

    let bx = b.x, by = b.y, bh = BALL_R + this.hop.y;
    if (fx.sink) {
      const t = Math.min(1, fx.sink.t);
      bx += (world.level.cup[0] - bx) * Math.min(1, t * 2);
      by += (world.level.cup[1] - by) * Math.min(1, t * 2);
      bh = BALL_R - t * t * 36;
    }
    this.ball.position.copy(to3(bx, by)).setY(bh);
    this.ball.visible = !fx.splash || fx.splash.t < 0.03;
    this.ballShadowFake.visible = this.ball.visible && !fx.sink;
    this.ballShadowFake.position.copy(to3(bx, by)).setY(0.6);
    const sh = 1 + this.hop.y / 40;
    this.ballShadowFake.scale.set(sh, 1, sh);
    (this.ballShadowFake.material as THREE.MeshBasicMaterial).opacity = 0.55 / sh;
  }

  private updateAim(world: World, aim: AimState) {
    const on = aim.active && aim.power > 0.02;
    this.ghosts.forEach((g) => (g.visible = false));
    if (!on) { this.dots.count = 0; return; }

    // The full guide reaches further with more power and always shows two banks.
    const path = aim.guide === 'full' ? world.aimPath(aim.dx, aim.dy, 320 + aim.power * 700, 2) : world.aimPath(aim.dx, aim.dy, 150, 0);
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
        const sc = 1 - 0.2 * Math.min(2, s);
        m.makeScale(sc, 1, sc).setPosition(p.x, 1.2, p.z);
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
  }

  private updateCue(world: World, cue: CueState) {
    this.cue.visible = cue.visible && cue.alpha > 0.01;
    if (!this.cue.visible) return;
    const b = world.ball;
    this.cue.position.copy(to3(cue.ox ?? b.x, cue.oy ?? b.y)).setY(BALL_R + 2);
    this.cue.rotation.y = -Math.atan2(cue.dy, cue.dx);
    this.cuePitch.position.x = -(BALL_R + cue.pull);
    for (const m of this.cueMats) m.opacity = cue.alpha;
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
  const g = new THREE.ExtrudeGeometry(roundRectShape(w, h, r), { depth, bevelEnabled: true, bevelThickness: 3, bevelSize: 3, bevelSegments: 2, curveSegments: 16 });
  return g.rotateX(-Math.PI / 2);
}

/** Flat geometry for a zone, grown (or shrunk, if negative) by `grow`. UVs tile every `uvSize` units. */
function zoneGeometry(z: Zone, grow: number, uvSize = 0) {
  let shape: THREE.Shape;
  if (z.kind === 'circle') {
    shape = new THREE.Shape();
    shape.absarc(0, 0, Math.max(2, z.r + grow), 0, Math.PI * 2, false);
  } else {
    shape = roundRectShape(z.w + grow * 2, z.h + grow * 2, Math.max(4, 26 + grow));
  }
  const g = new THREE.ShapeGeometry(shape, 32).rotateX(-Math.PI / 2);
  if (uvSize) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / uvSize, uv.getY(i) / uvSize);
  }
  const c = z.kind === 'circle' ? to3(z.x, z.y) : to3(z.x + z.w / 2, z.y + z.h / 2);
  return g.translate(c.x, 0, c.z);
}

function flagGeometry() {
  const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(30, -9), new THREE.Vector2(0, -18)]);
  return new THREE.ShapeGeometry(s);
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

function disposeGroup(g: THREE.Group) {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
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

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, rgb: string, maxA: number, size = 1.5) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${rgb},${Math.random() * maxA})`;
    g.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
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
    g.fillStyle = '#f2f6f6';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#c8473b';
    for (const [x, y] of [[64, 64], [192, 64], [128, 10], [128, 118]]) { g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); }
  });
}

function blobTexture() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.9)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

function feltTexture() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 9000, '0,0,0', 0.06);
    speckle(g, 256, 256, 3000, '255,255,255', 0.05);
  });
}

function feltBump() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 12000, '0,0,0', 0.25, 1);
    speckle(g, 256, 256, 12000, '255,255,255', 0.25, 1);
  }, false);
}

function sandTexture() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 128);
    speckle(g, 128, 128, 1400, '140,110,50', 0.45, 1.6);
    speckle(g, 128, 128, 600, '255,250,235', 0.6, 1.2);
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
function woodTexture() {
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

function floorTexture() {
  const t = canvasTex(512, 512, (g) => {
    const plankH = 64;
    for (let row = 0; row < 8; row++) {
      const offset = (row * 173) % 512;
      for (let k = -1; k < 2; k++) {
        const shade = 0.85 + Math.random() * 0.25;
        g.fillStyle = `rgb(${Math.round(255 * shade)},${Math.round(240 * shade)},${Math.round(225 * shade)})`;
        g.fillRect(offset + k * 512, row * plankH, 512, plankH);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(offset + k * 512, row * plankH, 2, plankH);
      }
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(0, row * plankH, 512, 2);
      for (let i = 0; i < 10; i++) {
        g.strokeStyle = `rgba(90,60,30,${0.05 + Math.random() * 0.1})`;
        g.beginPath();
        const y = row * plankH + 6 + Math.random() * (plankH - 12);
        g.moveTo(0, y);
        g.bezierCurveTo(170, y + 3, 340, y - 3, 512, y);
        g.stroke();
      }
    }
  });
  t.repeat.set(10, 10);
  return t;
}

function rugTexture() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(232,189,119,0.7)';
    g.lineWidth = 5;
    g.strokeRect(12, 12, 232, 232);
    g.lineWidth = 2;
    g.strokeRect(24, 24, 208, 208);
    speckle(g, 256, 256, 6000, '0,0,0', 0.12);
  });
}
