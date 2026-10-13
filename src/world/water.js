import * as THREE from 'three';
import { RIVER, RIVER_CURVE, sampleChain } from './layout.js';

export const WATER_Y = -0.07;
export const BED_DEPTH = 0.22;

// Ribbon following the river centre line. u = along (world units), v = -1..1 across.
export function buildWater() {
  const pts = sampleChain(RIVER_CURVE, 0.9);
  const half = RIVER.w / 2 + 1.1;
  const pos = [], uv = [], idx = [];
  pts.forEach((p, i) => {
    const nx = -p.tz, nz = p.tx;
    pos.push(p.x - nx * half, WATER_Y, p.z - nz * half, p.x + nx * half, WATER_Y, p.z + nz * half);
    uv.push(p.s, -1, p.s, 1);
    if (i < pts.length - 1) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]),
    vertexShader: /* glsl */`
      uniform float time; varying vec2 vUv; varying vec3 vP;
      #include <fog_pars_vertex>
      void main(){
        vUv = uv; vP = position;
        vec3 transformed = position;
        transformed.y += sin(position.x*0.9 + time*1.3)*0.012 + sin(position.z*1.1 - time)*0.012;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float time; varying vec2 vUv; varying vec3 vP;
      #include <fog_pars_fragment>
      void main(){
        float a = abs(vUv.y);
        float depth = 1.0 - smoothstep(0.0, 0.85, a);
        vec3 shallow = vec3(0.015, 0.11, 0.12);
        vec3 deep = vec3(0.004, 0.04, 0.06);
        float w1 = sin(vP.x*1.7 + vP.z*1.1 + time*0.9)*0.5+0.5;
        float w2 = sin(vP.x*3.1 - vP.z*2.3 - time*1.4)*0.5+0.5;
        vec3 col = mix(shallow, deep, depth*0.85);
        col += vec3(0.01,0.035,0.03) * w1 * w2;
        float streak = smoothstep(0.85, 1.0, sin(vUv.x*1.6 - time*0.8 + sin(vUv.y*5.0)*2.0)) * 0.012;
        col += streak;
        float foam = smoothstep(0.62, 0.9, a) * (0.55 + 0.45*sin(vUv.x*5.0 + time*1.5 + vUv.y*3.0));
        col = mix(col, vec3(0.20,0.34,0.30), foam*0.5);
        float alpha = (1.0 - smoothstep(0.86, 1.0, a)) * 0.9;
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return { mesh, mat };
}
