import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Bakes every static Mesh under `group` (including those inside nested plain Groups listed in
// `flatten`, or all nested groups not in `keep`) into at most two meshes: one for FrontSide and
// one for DoubleSide parts, using per-vertex colors. Originals are removed and disposed.
export function bakeGroup(group, { front, double, keep = new Set(), forceDouble = false }) {
  const buckets = { front: [], double: [] };
  const originals = [];
  const tmpColor = new THREE.Color();

  const visit = (node, matrix) => {
    for (const child of [...node.children]) {
      child.updateMatrix();
      const m = new THREE.Matrix4().multiplyMatrices(matrix, child.matrix);
      if (child.isMesh) {
        const src = child.material;
        let geo = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        geo.applyMatrix4(m);
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
        if (!geo.attributes.normal) geo.computeVertexNormals();
        tmpColor.copy(src.color);
        if (src.emissive) {
          const i = src.emissiveIntensity ?? 1;
          tmpColor.r = Math.min(1, tmpColor.r + src.emissive.r * i);
          tmpColor.g = Math.min(1, tmpColor.g + src.emissive.g * i);
          tmpColor.b = Math.min(1, tmpColor.b + src.emissive.b * i);
        }
        const n = geo.attributes.position.count;
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = tmpColor.r; col[i * 3 + 1] = tmpColor.g; col[i * 3 + 2] = tmpColor.b; }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        (forceDouble || src.side === THREE.DoubleSide ? buckets.double : buckets.front).push(geo);
        originals.push(child);
      } else if (child.isGroup && !keep.has(child)) {
        visit(child, m);
        originals.push(child);
      }
    }
  };
  visit(group, new THREE.Matrix4());

  for (const o of originals) {
    o.removeFromParent();
    if (o.isMesh) o.geometry.dispose();
  }
  for (const [key, mat] of [['front', front], ['double', double]]) {
    const list = buckets[key];
    if (!list.length) continue;
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, mat);
    group.add(mesh);
  }
}
