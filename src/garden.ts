// The garden around every hole: an evening sky, a low warm sun and the lawn.
import * as THREE from 'three';
import { lawnMaterial } from './art';
import { LAWN_Y } from './course';
import { Theme } from './levels';

/** Direction toward the sun: low in the sky, behind and to the left of the default view. */
export const SUN_DIR = new THREE.Vector3(-0.62, 0.42, -0.66).normalize();

/** Sky and lighting for each course's theme. */
export interface Atmosphere { top: number; horizon: number; ground: number; sun: number; fog: number; sunLight: number; sunIntensity: number; hemiSky: number; hemiGround: number; hemiIntensity: number; exposure: number }
export const ATMOSPHERE: Record<Theme, Atmosphere> = {
  garden: { top: 0x3f6fae, horizon: 0xf4c08a, ground: 0x56603a, sun: 0xffd29a, fog: 0xd9b48c, sunLight: 0xffd6a0, sunIntensity: 2.6, hemiSky: 0xcfe0f5, hemiGround: 0x4e5a2c, hemiIntensity: 0.9, exposure: 1.0 },
  // Bright cartoon sunset: lilac sky fading to warm peach
  jurassic: { top: 0x7a74c8, horizon: 0xffb27a, ground: 0x8a5a3a, sun: 0xffd08a, fog: 0xe8a878, sunLight: 0xffe0b0, sunIntensity: 2.6, hemiSky: 0xffe0c8, hemiGround: 0x7a5030, hemiIntensity: 1.1, exposure: 1.0 },
  // Deep indigo space with a violet glow on the horizon; bright, slightly cool sunlight on the moon
  // Valley of the Kings at dusk: violet sky, a low amber sun on the sandstone
  tomb: { top: 0x4a3a8a, horizon: 0xffa860, ground: 0xb08050, sun: 0xffc070, fog: 0xd89870, sunLight: 0xffd8a0, sunIntensity: 2.7, hemiSky: 0xffd0b0, hemiGround: 0x8a5a30, hemiIntensity: 1.05, exposure: 1.0 },
  // Polar twilight: deep teal sky, a low pale sun skimming the snow
  arctic: { top: 0x1a3a6a, horizon: 0xa8d8f0, ground: 0xd8e8f4, sun: 0xfff0e0, fog: 0xc8e0f0, sunLight: 0xfff4ec, sunIntensity: 2.5, hemiSky: 0xd0e8ff, hemiGround: 0xa8b8d0, hemiIntensity: 1.2, exposure: 0.95 },
  // Candy Land: a bright pastel day, candy-pink haze on the horizon
  candy: { top: 0x5ab0f0, horizon: 0xffd0e8, ground: 0xd8c8ff, sun: 0xfff4d8, fog: 0xf0d8f4, sunLight: 0xfff4e8, sunIntensity: 2.5, hemiSky: 0xfff0f8, hemiGround: 0xd0c0f0, hemiIntensity: 1.15, exposure: 1.0 },
  // Inside the big top: warm spotlit air under the striped canvas
  circus: { top: 0x3a0a14, horizon: 0x8a3a2a, ground: 0x6a4a2a, sun: 0xfff0c8, fog: 0x2a1410, sunLight: 0xfff0d8, sunIntensity: 2.7, hemiSky: 0xffd8b0, hemiGround: 0x6a3a20, hemiIntensity: 1.05, exposure: 1.0 },
  space: { top: 0x070720, horizon: 0x4b3a8e, ground: 0x2e2c44, sun: 0xfff2dc, fog: 0x2a2650, sunLight: 0xf6f2ff, sunIntensity: 2.9, hemiSky: 0xb8c0ff, hemiGround: 0x403a5a, hemiIntensity: 1.0, exposure: 1.0 },
};
const SKY = {
  top: new THREE.Color(0x3f6fae),
  horizon: new THREE.Color(0xf4c08a),
  ground: new THREE.Color(0x56603a),
  sun: new THREE.Color(0xffd29a),
};
export const FOG_COLOR = 0xd9b48c;

/** Point the shared sky uniforms at a theme (all sky meshes share these colour objects). */
export function setSkyTheme(a: Atmosphere) {
  SKY.top.setHex(a.top); SKY.horizon.setHex(a.horizon); SKY.ground.setHex(a.ground); SKY.sun.setHex(a.sun);
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: SKY.top }, horizon: { value: SKY.horizon }, ground: { value: SKY.ground },
      sunColor: { value: SKY.sun }, sunDir: { value: SUN_DIR },
    },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunColor; uniform vec3 sunDir; varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, ground, pow(min(-h * 4.0, 1.0), 0.6));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.45);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export function buildSky() {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5200, 32, 16), skyMaterial());
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

/** The lawn around a hole, with the fairway's outline cut out so dips in the course show through. */
export function buildLawn(outline: [number, number][], toScene: (x: number, y: number) => THREE.Vector3) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 5000, 0, Math.PI * 2, false);
  const hole = new THREE.Path(outline.map(([x, y]) => { const p = toScene(x, y); return new THREE.Vector2(p.x, -p.z); }));
  shape.holes.push(hole);
  const lawn = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48).rotateX(-Math.PI / 2), lawnMaterial());
  lawn.position.y = LAWN_Y;
  lawn.receiveShadow = true;
  return lawn;
}

/** Sky-lit environment map so brass, lacquer and water reflect the sky (built for the current theme). */
export function skyEnvironment(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMaterial()));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  return tex;
}
