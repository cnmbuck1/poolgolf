// The Cnmbuck Orb's extras, drawn only while it's the player's ball: a blue-and-orange rim glow that stays
// put while the ball rolls (like the light in the studio logo), a soft glow on the ground beneath it, and a
// light trail behind it while it moves.
import * as THREE from 'three';
import { BALL_R } from './physics';

const BLUE = new THREE.Color(0x2ab4ff), ORANGE = new THREE.Color(0xff9a1a);
const TRAIL = 26; // trail points kept
const TRAIL_LIFE = 0.45; // seconds a trail point lasts

/** A soft round dot for the trail and the ground glow. */
function dotTexture(inner: string, outer: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.45, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SignatureFx {
  readonly group = new THREE.Group();
  private rim: THREE.Mesh;
  private ground: THREE.Mesh;
  private trail: THREE.Points;
  private points: { p: THREE.Vector3; age: number }[] = [];
  private t = 0;

  constructor() {
    this.group.visible = false;
    // Rim glow: brightest at the ball's edge, blue on the screen-left side and orange on the right
    this.rim = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.08, 32, 20), new THREE.ShaderMaterial({
      uniforms: { blue: { value: BLUE }, orange: { value: ORANGE }, pulse: { value: 1 } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 blue; uniform vec3 orange; uniform float pulse; varying vec3 vN; varying vec3 vV;
        void main() {
          float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.4);
          float warm = smoothstep(-0.2, 0.6, vN.x);
          vec3 col = mix(blue, orange, warm);
          gl_FragColor = vec4(col * f * (1.7 + warm * 0.9) * pulse, f);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.rim.renderOrder = 3;
    // Ground glow, like the logo's reflection on the floor
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(BALL_R * 6, BALL_R * 6), new THREE.MeshBasicMaterial({
      map: dotTexture('rgba(60, 190, 255, 0.85)', 'rgba(40, 120, 255, 0.4)'), transparent: true, depthWrite: false, toneMapped: false,
    }));
    this.ground.rotation.x = -Math.PI / 2;
    // Light trail: soft dots that shrink and fade behind the ball. Drawn as colour over the course (not added
    // light), so it shows on pale candy turf as well as on dark night courses.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    geo.setAttribute('life', new THREE.BufferAttribute(new Float32Array(TRAIL), 1));
    geo.setDrawRange(0, 0);
    this.trail = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { size: { value: BALL_R * 2.1 }, scale: { value: 1 } },
      vertexShader: `attribute float life; attribute vec3 color; uniform float size; uniform float scale; varying vec3 vC; varying float vL;
        void main() { vC = color; vL = life; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * (0.35 + 0.65 * life) * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vL;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.3, d) * min(1.0, vL * 1.3) * 0.9; if (a < 0.01) discard;
          gl_FragColor = vec4(mix(vC, vec3(0.85, 0.97, 1.0), smoothstep(0.35, 0.0, d) * vL * 0.35), a); }`,
      transparent: true, depthWrite: false,
    }));
    this.trail.frustumCulled = false;
    this.group.add(this.rim, this.ground, this.trail);
  }

  set on(v: boolean) { this.group.visible = v; if (!v) this.points = []; }
  get on() { return this.group.visible; }

  /** Points are sized in pixels: tell the trail how tall the drawing is (pixels per unit at distance 1). */
  setScale(pxPerUnit: number) { (this.trail.material as THREE.ShaderMaterial).uniforms.scale.value = pxPerUnit; }

  /** Follow the ball: `pos` is its centre, `groundY` the turf under it. */
  update(pos: THREE.Vector3, groundY: number, moving: boolean, visible: boolean, dt: number) {
    if (!this.group.visible) return;
    this.t += dt;
    const pulse = 0.85 + 0.15 * Math.sin(this.t * 3);
    (this.rim.material as THREE.ShaderMaterial).uniforms.pulse.value = pulse;
    this.rim.visible = this.ground.visible = visible;
    this.rim.position.copy(pos);
    this.ground.position.set(pos.x, groundY + 0.8, pos.z);
    const lift = Math.max(0, pos.y - groundY - BALL_R);
    (this.ground.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - lift / 60) * pulse;

    // Trail: drop a point every few units while rolling; points fade out and the oldest go
    for (const p of this.points) p.age += dt;
    this.points = this.points.filter((p) => p.age < TRAIL_LIFE);
    const last = this.points[this.points.length - 1];
    if (moving && visible && (!last || last.p.distanceTo(pos) > BALL_R * 0.35)) {
      this.points.push({ p: pos.clone(), age: 0 });
      if (this.points.length > TRAIL) this.points.shift();
    }
    const geo = this.trail.geometry;
    const P = geo.getAttribute('position') as THREE.BufferAttribute, Cl = geo.getAttribute('color') as THREE.BufferAttribute, Lf = geo.getAttribute('life') as THREE.BufferAttribute;
    const c = new THREE.Color();
    this.points.forEach((pt, i) => {
      const k = 1 - pt.age / TRAIL_LIFE; // 1 fresh, 0 gone
      c.copy(ORANGE).lerp(BLUE, k);
      P.setXYZ(i, pt.p.x, pt.p.y, pt.p.z);
      Cl.setXYZ(i, c.r, c.g, c.b);
      Lf.setX(i, k);
    });
    P.needsUpdate = true; Cl.needsUpdate = true; Lf.needsUpdate = true;
    geo.setDrawRange(0, this.points.length);
  }
}
