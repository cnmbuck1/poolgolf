// The garden around every hole: an evening sky, a low warm sun and the lawn.
import * as THREE from 'three';
import { lawnMaterial } from './art';
import { LAWN_Y } from './course';

/** Direction toward the sun: low in the sky, behind and to the left of the default view. */
export const SUN_DIR = new THREE.Vector3(-0.62, 0.42, -0.66).normalize();

const SKY = {
  top: new THREE.Color(0x3f6fae),
  horizon: new THREE.Color(0xf4c08a),
  ground: new THREE.Color(0x56603a),
  sun: new THREE.Color(0xffd29a),
};
export const FOG_COLOR = 0xd9b48c;

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

export function buildLawn() {
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(5000, 64).rotateX(-Math.PI / 2), lawnMaterial());
  lawn.position.y = LAWN_Y;
  lawn.receiveShadow = true;
  return lawn;
}

/** Sky-lit environment map so brass, lacquer and water reflect the evening sky. */
export function skyEnvironment(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMaterial()));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  return tex;
}
