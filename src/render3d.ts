import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Animated } from './art';
import { buildCourse, Course, disposeGroup, HH, HW, to3, woodTexture } from './course';
import { buildLawn, buildSky, FOG_COLOR, skyEnvironment, SUN_DIR } from './garden';
import { getModels } from './models';
import { BALL_R, CUP_R, heightAt, World } from './physics';

/** Warm grade + soft vignette, applied after tone mapping (one cheap full-screen pass). */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.3 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * vec3(1.03, 1.0, 0.96);
      col = (col - 0.5) * 1.05 + 0.5;
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - vignette * smoothstep(0.45, 0.88, d);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

const C = {
  aim: 0xfdf4a4,
  cue: 0xd9a46a,
  cueButt: 0x3a2416,
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

export type CamMode = 'title' | 'play' | 'sink' | 'debug';

const TILT_3D = 0.95; // whole-hole view elevation (~54°)
const TILT_TITLE = 0.72;
const MAX_DOTS = 160;
const DROPS = 14;

export class Renderer3D {
  private renderer: THREE.WebGLRenderer;
  /** Draw calls, triangles and texture memory from the last frame (for performance checks). */
  get stats() { const i = this.renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, quality: this.quality }; }
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 10, 12000);
  private levelGroup = new THREE.Group();
  private course: Course | null = null;
  private level: World['level'] | null = null;
  private ball: THREE.Mesh;
  private ballShadowFake: THREE.Mesh;
  private dots: THREE.InstancedMesh;
  private ghosts: THREE.Mesh[] = [];
  private cue = new THREE.Group();
  private cuePitch = new THREE.Group();
  private cueMats: THREE.MeshStandardMaterial[] = [];
  private rippleMeshes: THREE.Mesh[] = [];
  private drops: THREE.InstancedMesh;
  private dropState: { p: THREE.Vector3; v: THREE.Vector3 }[] = [];
  private sun: THREE.DirectionalLight;
  private size = { w: 1, h: 1, top: 0, bottom: 0 };

  // Ball spin: angular velocity eases toward pure rolling, so a hard shot skids first.
  private spin = new THREE.Vector3();
  private hop = { y: 0, v: 0 };

  // Whole-hole rig
  private tilt = TILT_3D;
  private baseDist = 1500;
  private offsetY = 0;
  private yaw = 0;
  private distMul = 1;
  private focus = new THREE.Vector3();
  private centre = new THREE.Vector3();
  private span = 1000;
  private mode: CamMode = 'title';
  private shakeAmt = 0;
  follow = true;
  // Shot camera: sits behind the ball and turns with the aim. `overview` shows the whole hole instead.
  private overview = false;
  private shotYaw = 0;
  private blend = 0; // 0 = whole-hole rig, 1 = shot camera
  private camPos = new THREE.Vector3(0, 1400, 1400);
  private camLook = new THREE.Vector3();

  // Adaptive quality: step down resolution and shadow detail if frames run slow.
  private quality = 0;
  private dpr = 1;
  private perf = { time: 0, frames: 0 };
  /** Post-processing (glow, grade, vignette); skipped at lower quality steps. */
  private composer: EffectComposer;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene.fog = new THREE.Fog(FOG_COLOR, 2600, 7000);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.55, 0.95));
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new ShaderPass(GradeShader));

    // Garden: sky, lawn, evening sun with sky fill
    this.scene.add(buildSky(), buildLawn());
    this.scene.environment = skyEnvironment(this.renderer);
    this.scene.add(new THREE.HemisphereLight(0xcfe0f5, 0x4e5a2c, 0.9));
    const sun = (this.sun = new THREE.DirectionalLight(0xffd6a0, 2.6));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    sun.shadow.radius = 4;
    this.scene.add(sun, sun.target);
    this.scene.add(this.levelGroup);

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 40, 24),
      new THREE.MeshPhysicalMaterial({ map: cueBallTexture(), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06 }),
    );
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    // Soft contact shadow so the ball sits on the turf even where the shadow map is blurry
    this.ballShadowFake = new THREE.Mesh(
      new THREE.CircleGeometry(BALL_R * 1.1, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.55 }),
    );
    this.scene.add(this.ballShadowFake);

    const dotGeo = new THREE.CircleGeometry(3.2, 12).rotateX(-Math.PI / 2);
    // The guide draws over everything so walls and the windmill never hide it
    this.dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }), MAX_DOTS);
    this.dots.count = 0;
    // Instanced bounds are cached from the first frame; the guide moves every shot, so never cull it
    this.dots.frustumCulled = false;
    this.dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DOTS * 3), 3);
    this.dots.renderOrder = 3;
    this.scene.add(this.dots);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Mesh(
        new THREE.RingGeometry(BALL_R - 1.8, BALL_R, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: C.aim, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }),
      );
      g.visible = false;
      g.renderOrder = 3;
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
    this.drops.frustumCulled = false;
    this.scene.add(this.drops);
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
    this.level = world.level;
    this.course = buildCourse(world, getModels());
    this.levelGroup.add(this.course.group);

    // Frame the camera and the sun's shadow on this hole's shape
    const b = this.course.bounds;
    this.centre.copy(to3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2));
    this.span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
    const r = this.span * 0.62 + 140;
    const sc = this.sun.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
    sc.near = 50; sc.far = 4000;
    sc.updateProjectionMatrix();
    this.sun.target.position.copy(this.centre);
    this.sun.position.copy(this.centre).addScaledVector(SUN_DIR, 1800);
    this.fitCamera();

    this.ball.quaternion.identity();
    this.spin.set(0, 0, 0);
    this.hop = { y: 0, v: 0 };
    this.drops.count = 0;
  }

  private h(x: number, y: number) { return this.level ? heightAt(this.level, x, y) : 0; }

  // ---------- camera ----------

  /** Whole-hole view instead of the shot camera. */
  setOverview(on: boolean) { this.overview = on; }
  get isOverview() { return this.overview; }

  /**
   * Table-plane basis of the current view, for turning screen drags into aim directions:
   * `fwd` is "up the screen", `right` is "screen right", both in table coordinates.
   */
  aimBasis() {
    const f = new THREE.Vector3().subVectors(this.camLook, this.camPos);
    const l = Math.hypot(f.x, f.z) || 1;
    const fwd = { x: f.x / l, y: f.z / l };
    return { fwd, right: { x: -fwd.y, y: fwd.x } };
  }
  setMode(m: CamMode) { this.mode = m; }
  shake(amount: number) { this.shakeAmt = Math.min(10, this.shakeAmt + amount); }

  /** Dev only: frame a table point up close. */
  private debugCam = { x: 0, y: 0, dist: 0.4, yaw: 0 };
  debugView(x: number, y: number, dist: number, yaw: number) {
    this.debugCam = { x, y, dist, yaw };
    this.mode = 'debug';
  }

  /** Swoop in from a high, turned angle at the start of a hole, then settle behind the ball. */
  intro(world: World) {
    this.yaw = 0.55;
    this.distMul = 1.5;
    this.focus.copy(this.centre);
    this.blend = 0;
    const L = world.level;
    this.shotYaw = Math.atan2(L.cup[1] - L.tee[1], L.cup[0] - L.tee[0]);
  }

  resize(w: number, h: number, dpr: number, top: number, bottom: number) {
    this.size = { w, h, top, bottom };
    this.dpr = dpr;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio());
    this.composer.setSize(w, h);
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
    this.composer.setPixelRatio(this.pixelRatio());
    this.composer.setSize(this.size.w, this.size.h);
    if (this.quality >= 2) {
      this.sun.shadow.mapSize.set(1024, 1024);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    if (this.quality >= 3) {
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.scene.traverse((o) => { if (o instanceof THREE.Mesh) (o.material as THREE.Material).needsUpdate = true; });
    }
  }

  /** Find the camera distance (and vertical image shift) that fits the hole between the HUD bars. */
  private fitCamera() {
    const { w, h, top, bottom } = this.size;
    const cam = this.camera;
    cam.aspect = w / h;
    cam.clearViewOffset();
    const corners: THREE.Vector3[] = [];
    const b = this.course?.bounds ?? { minX: 0, maxX: 1000, minY: 0, maxY: 500 };
    const m = 30; // edging and a little turf beyond it
    for (const x of [b.minX - m, b.maxX + m]) for (const y of [b.minY - m, b.maxY + m]) for (const z of [-5, 20]) corners.push(to3(x, y).setY(z).sub(this.centre));
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
    let lo = 300, hi = 8000;
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

  private updateCamera(world: World, dt: number, time: number, aim: AimState) {
    // The menu uses a lower, more cinematic angle
    const tiltGoal = this.mode === 'title' ? TILT_TITLE : TILT_3D;
    if (Math.abs(this.tilt - tiltGoal) > 0.001) {
      this.tilt += (tiltGoal - this.tilt) * Math.min(1, dt * (this.mode === 'title' ? 3 : 9));
      if (Math.abs(this.tilt - tiltGoal) < 0.002) this.tilt = tiltGoal;
      this.fitCamera();
    }

    let yawT = 0, distT = 1;
    const focusT = this.centre.clone();
    if (this.mode === 'title') {
      // Hole framed to the right of the menu, slowly drifting
      yawT = -0.32 + Math.sin(time * 0.1) * 0.12;
      distT = 0.9;
      focusT.x -= this.span * 0.42;
      focusT.z += 10;
    } else if (this.mode === 'debug') {
      focusT.copy(to3(this.debugCam.x, this.debugCam.y));
      distT = this.debugCam.dist;
      yawT = this.debugCam.yaw;
    } else if (this.mode === 'sink' && this.course) {
      focusT.lerp(this.course.cupPos, 0.55);
      distT = 0.72;
    } else if (this.follow && world.moving && !aim.active) {
      focusT.lerp(to3(world.ball.x, world.ball.y), 0.2);
      distT = 0.93;
    }
    const k = Math.min(1, dt * (this.mode === 'title' ? 1.2 : 1.8));
    this.yaw += (yawT - this.yaw) * k;
    this.distMul += (distT - this.distMul) * k;
    this.focus.lerp(focusT, k);

    // Whole-hole rig
    const d = this.baseDist * this.distMul;
    const ct = Math.cos(this.tilt);
    const posO = new THREE.Vector3(this.focus.x + Math.sin(this.yaw) * ct * d, this.focus.y + Math.sin(this.tilt) * d, this.focus.z + Math.cos(this.yaw) * ct * d);
    const lookO = this.focus.clone();

    // Shot camera: behind the ball along the aim, looking down the line
    const b = world.ball;
    const ball = to3(b.x, b.y).setY(this.h(b.x, b.y) + BALL_R);
    const speed = Math.hypot(b.vx, b.vy);
    let yawGoal = this.shotYaw, yawRate = 0;
    if (aim.active && aim.power > 0.02) { yawGoal = Math.atan2(aim.dy, aim.dx); yawRate = 7; }
    else if (world.moving && speed > 150) { yawGoal = Math.atan2(b.vy, b.vx); yawRate = 1.2; }
    else if (!world.moving && !aim.active) {
      // At rest, turn to face the cup so a straight pull-back aims at the pin
      const [cx, cy] = world.level.cup;
      yawGoal = Math.atan2(cy - b.y, cx - b.x);
      yawRate = 2;
    }
    const dy = Math.atan2(Math.sin(yawGoal - this.shotYaw), Math.cos(yawGoal - this.shotYaw));
    this.shotYaw += dy * Math.min(1, dt * yawRate);
    const dir = new THREE.Vector3(Math.cos(this.shotYaw), 0, Math.sin(this.shotYaw));
    // Ball in the lower third with room to see the line; pulls back as power builds
    let target = ball, back = 380, elev = 0.62, ahead = 120;
    if (aim.active) { back = 380 + aim.power * 30; ahead = 120 + aim.power * 80; }
    else if (world.moving) { back = 420; elev = 0.8; ahead = 40; }
    if (this.mode === 'sink' && this.course) { target = this.course.cupPos.clone(); back = 230; elev = 0.82; ahead = 0; }
    const posS = target.clone().addScaledVector(dir, -back * Math.cos(elev)).setY(target.y + back * Math.sin(elev));
    const lookS = target.clone().addScaledVector(dir, ahead);

    const shotActive = !this.overview && (this.mode === 'play' || this.mode === 'sink');
    this.blend += ((shotActive ? 1 : 0) - this.blend) * Math.min(1, dt * 2.2);
    const kc = 1 - Math.exp(-dt * 6);
    this.camPos.lerp(posO.lerp(posS, this.blend), kc);
    this.camLook.lerp(lookO.lerp(lookS, this.blend), kc);

    const cam = this.camera;
    cam.position.copy(this.camPos);
    if (this.shakeAmt > 0.05) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 14);
    }
    cam.up.set(0, 1, 0);
    cam.lookAt(this.camLook);
    cam.setViewOffset(this.size.w, this.size.h, 0, this.offsetY * (1 - this.blend), this.size.w, this.size.h);
    cam.updateMatrixWorld();
  }

  /** Screen position of a table point (for UI hints). */
  project(x: number, y: number) {
    const v = to3(x, y).setY(this.h(x, y) + BALL_R).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  /** Kick the ball up off the turf after a hard hit. */
  bounceBall(speed: number) { if (speed > 650) this.hop.v = Math.max(this.hop.v, Math.min(90, (speed - 600) / 9)); }

  splash(x: number, y: number) {
    this.dropState = [];
    const y0 = this.h(x, y) + 2;
    for (let i = 0; i < DROPS; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 70;
      this.dropState.push({ p: to3(x, y).setY(y0), v: new THREE.Vector3(Math.cos(a) * s, 120 + Math.random() * 140, Math.sin(a) * s) });
    }
    this.drops.count = DROPS;
  }

  // ---------- per frame ----------

  render(world: World, aim: AimState, cue: CueState, fx: FX, time: number, dt: number) {
    this.renderer.info.reset(); // stats cover the whole frame, including post-processing passes
    this.adaptQuality(dt);
    this.updateCamera(world, dt, time, aim);

    const course = this.course;
    if (course) {
      world.spinners.forEach((s, i) => {
        const mill: Animated | undefined = course.spinnerAnims[i];
        if (mill) mill.update(s.angle, time);
        else if (course.legacySpinners[i]) course.legacySpinners[i].rotation.y = -s.angle;
      });
      for (const a of course.anims) a.update(0, time);
      const pulse = (Math.sin(time * 3) + 1) / 2;
      const ps = CUP_R + 12 + pulse * 6;
      course.cupPulse.scale.set(ps, 1, ps);
      (course.cupPulse.material as THREE.MeshBasicMaterial).opacity = 0.12 + pulse * 0.18;
      for (const m of course.waterMats) m.normalMap?.offset.set(time * 0.02, time * 0.013);
    }

    this.updateBall(world, fx, dt);

    this.rippleMeshes.forEach((m, i) => {
      const r = fx.ripples[i];
      m.visible = !!r && r.t > 0;
      if (!r || r.t <= 0) return;
      m.position.copy(to3(r.x, r.y)).setY(this.h(r.x, r.y) + 1);
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
    if (this.quality <= 1) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
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

    let bx = b.x, by = b.y;
    const ground = this.h(b.x, b.y);
    let bh = ground + BALL_R + this.hop.y;
    if (fx.sink) {
      const t = Math.min(1, fx.sink.t);
      bx += (world.level.cup[0] - bx) * Math.min(1, t * 2);
      by += (world.level.cup[1] - by) * Math.min(1, t * 2);
      bh = this.h(world.level.cup[0], world.level.cup[1]) + BALL_R - t * t * 36;
    }
    this.ball.position.copy(to3(bx, by)).setY(bh);
    this.ball.visible = !fx.splash || fx.splash.t < 0.03;
    this.ballShadowFake.visible = this.ball.visible && !fx.sink;
    this.ballShadowFake.position.copy(to3(bx, by)).setY(ground + 0.6);
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
        const x = a.x + (c.x - a.x) * t, y = a.y + (c.y - a.y) * t;
        const p = to3(x, y);
        const sc = 1 - 0.2 * Math.min(2, s);
        m.makeScale(sc, 1, sc).setPosition(p.x, this.h(x, y) + 1.2, p.z);
        this.dots.setMatrixAt(n, m);
        col.copy(base).multiplyScalar(fade);
        this.dots.setColorAt(n, col);
        n++;
        carry = d + spacing - len;
      }
      if (s < path.contacts && s < this.ghosts.length) {
        const g = this.ghosts[s];
        g.visible = true;
        g.position.copy(to3(c.x, c.y)).setY(this.h(c.x, c.y) + 1.3);
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
    const x = cue.ox ?? b.x, y = cue.oy ?? b.y;
    this.cue.position.copy(to3(x, y)).setY(this.h(x, y) + BALL_R + 2);
    this.cue.rotation.y = -Math.atan2(cue.dy, cue.dx);
    this.cuePitch.position.x = -(BALL_R + cue.pull);
    for (const m of this.cueMats) m.opacity = cue.alpha;
  }
}

// ---------- procedural textures ----------

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
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

// Keep the old table-centre constants visible to callers that position UI hints.
export { HH, HW };
