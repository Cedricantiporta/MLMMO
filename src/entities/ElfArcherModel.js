import * as THREE from 'three';
import { createArrowMesh } from '../combat/arrowMesh.js';

// Procedural low-poly female elf archer. ~1.82 tall, feet at y=0, facing +Z, character's left = +X.

const BOW_ARC = 1.5;
const BOW_RADIUS = 0.88;
const BOW_TIP_Y = Math.sin(BOW_ARC / 2) * BOW_RADIUS;
const BOW_TIP_Z = BOW_RADIUS * (Math.cos(BOW_ARC / 2) - 1);
const MAX_PULL = 0.5;

export function createElfArcherModel() {
  const materials = [];

  const mat = (color, { rough = 0.75, metal = 0, emissive = 0x000000, emissiveIntensity = 1, side = THREE.FrontSide } = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity, side });
    materials.push(m);
    return m;
  };

  const M = {
    skin: mat(0xf3d3b9, { rough: 0.65 }),
    lip: mat(0xd98a8e, { rough: 0.5 }),
    hair: mat(0xf1ead2, { rough: 0.45 }),
    brow: mat(0xc9b98a),
    eyeWhite: mat(0xffffff, { rough: 0.3 }),
    eye: mat(0x1fc76b, { rough: 0.25, emissive: 0x0a5a2c, emissiveIntensity: 0.6 }),
    pupil: mat(0x0d1a12),
    tunic: mat(0x2f9a52, { rough: 0.8 }),
    tunicDark: mat(0x1f6b3a, { rough: 0.85 }),
    leggings: mat(0x3f4a30, { rough: 0.8 }),
    leather: mat(0x6b4426, { rough: 0.85 }),
    leatherLight: mat(0x94643a, { rough: 0.8 }),
    leatherDark: mat(0x44291a, { rough: 0.9 }),
    gold: mat(0xe5b43e, { rough: 0.3, metal: 0.85 }),
    gem: mat(0x35e68e, { rough: 0.2, emissive: 0x16b868, emissiveIntensity: 0.7 }),
    cape: mat(0x184a2c, { rough: 0.9, side: THREE.DoubleSide }),
    skirt: mat(0x2f9a52, { rough: 0.85, side: THREE.DoubleSide }),
    bowWood: mat(0x8a5a2e, { rough: 0.6 }),
    fletchW: mat(0xf4f1e6, { rough: 0.8 }),
    fletchG: mat(0x3fae5c, { rough: 0.8 }),
    shaft: mat(0xb98a56, { rough: 0.7 }),
  };

  const add = (geo, material, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const scaled = (mesh, x, y, z) => {
    mesh.scale.set(x, y, z);
    return mesh;
  };

  const root = new THREE.Group();

  // ---------------- Pelvis, legs, skirt ----------------
  const pelvis = group(root, 0, 0.98, 0);
  scaled(add(new THREE.SphereGeometry(0.1, 12, 8), M.leggings, pelvis, 0, 0.0, 0), 1.65, 0.95, 1.2);

  const legs = {};
  for (const [name, s] of [['L', 1], ['R', -1]]) {
    const hip = group(pelvis, s * 0.095, 0, 0);
    add(new THREE.SphereGeometry(0.09, 10, 8), M.leggings, hip);
    add(new THREE.CylinderGeometry(0.088, 0.062, 0.46, 10), M.leggings, hip, 0, -0.23, 0);

    const knee = group(hip, 0, -0.46, 0);
    add(new THREE.SphereGeometry(0.062, 9, 7), M.leggings, knee);
    add(new THREE.CylinderGeometry(0.061, 0.044, 0.44, 10), M.leggings, knee, 0, -0.22, 0);
    // Boot shaft, cuff and foot.
    add(new THREE.CylinderGeometry(0.07, 0.052, 0.32, 10), M.leather, knee, 0, -0.3, 0);
    add(new THREE.CylinderGeometry(0.079, 0.075, 0.06, 10), M.leatherLight, knee, 0, -0.15, 0);
    add(new THREE.BoxGeometry(0.092, 0.07, 0.24), M.leather, knee, 0, -0.485, 0.05);
    scaled(add(new THREE.SphereGeometry(0.05, 8, 6), M.leather, knee, 0, -0.485, 0.17), 0.95, 0.7, 1.1);
    add(new THREE.BoxGeometry(0.096, 0.02, 0.27), M.leatherDark, knee, 0, -0.515, 0.055);
    legs[name] = { hip, knee };
  }

  // Flared tunic skirt with gold hem.
  const skirt = add(new THREE.CylinderGeometry(0.175, 0.33, 0.36, 22, 1, true), M.skirt, pelvis, 0, -0.04, 0);
  skirt.scale.z = 0.92;
  const hem = add(new THREE.TorusGeometry(0.33, 0.011, 5, 24).rotateX(Math.PI / 2), M.gold, pelvis, 0, -0.22, 0);
  hem.scale.z = 0.92;

  // ---------------- Spine / torso ----------------
  const spine = group(pelvis, 0, 0.1, 0);
  scaled(add(new THREE.CylinderGeometry(0.118, 0.125, 0.2, 14), M.tunic, spine, 0, 0.08, 0), 1, 1, 0.74);
  scaled(add(new THREE.CylinderGeometry(0.168, 0.12, 0.3, 16), M.tunic, spine, 0, 0.26, 0), 1, 1, 0.7);
  // Modest bust shaping.
  for (const s of [1, -1]) scaled(add(new THREE.SphereGeometry(0.066, 10, 8), M.tunic, spine, s * 0.068, 0.29, 0.082), 1, 0.95, 0.9);
  // Collar / neckline trim.
  scaled(add(new THREE.TorusGeometry(0.13, 0.012, 5, 18).rotateX(Math.PI / 2), M.gold, spine, 0, 0.405, -0.005), 1, 1, 0.75);
  // Belt with buckle.
  scaled(add(new THREE.CylinderGeometry(0.128, 0.134, 0.055, 16), M.leatherDark, spine, 0, 0.0, 0), 1, 1, 0.78);
  add(new THREE.BoxGeometry(0.06, 0.05, 0.02), M.gold, spine, 0, 0.0, 0.105);
  add(new THREE.BoxGeometry(0.03, 0.026, 0.024), M.leatherDark, spine, 0, 0.0, 0.108);
  // Cross strap for the quiver.
  const strap = add(new THREE.TorusGeometry(0.168, 0.013, 4, 20).rotateX(Math.PI / 2), M.leatherDark, spine, 0, 0.22, 0.0);
  strap.scale.z = 0.95;
  strap.rotation.z = 0.5;

  // Neck.
  add(new THREE.CylinderGeometry(0.043, 0.05, 0.13, 8), M.skin, spine, 0, 0.44, 0);

  // Leather shoulder pads.
  for (const s of [1, -1]) {
    const pad = add(new THREE.SphereGeometry(0.095, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.leather, spine, s * 0.2, 0.37, 0);
    pad.rotation.z = -s * 0.4;
    pad.scale.set(1, 0.85, 1.05);
    const rim = add(new THREE.TorusGeometry(0.092, 0.01, 4, 14).rotateX(Math.PI / 2), M.gold, spine, s * 0.2, 0.37, 0);
    rim.rotation.z = -s * 0.4;
  }

  // ---------------- Arms ----------------
  const arms = {};
  for (const [name, s] of [['L', 1], ['R', -1]]) {
    const shoulder = group(spine, s * 0.2, 0.34, 0);
    shoulder.rotation.z = s * 0.1;
    add(new THREE.SphereGeometry(0.056, 9, 7), M.skin, shoulder);
    add(new THREE.CylinderGeometry(0.066, 0.058, 0.15, 10), M.tunic, shoulder, 0, -0.07, 0); // short sleeve
    add(new THREE.CylinderGeometry(0.05, 0.041, 0.28, 9), M.skin, shoulder, 0, -0.15, 0);

    const elbow = group(shoulder, 0, -0.28, 0);
    add(new THREE.SphereGeometry(0.042, 8, 6), M.skin, elbow);
    add(new THREE.CylinderGeometry(0.042, 0.033, 0.26, 9), M.skin, elbow, 0, -0.13, 0);
    add(new THREE.CylinderGeometry(0.047, 0.04, 0.14, 9), M.leather, elbow, 0, -0.17, 0); // bracer
    add(new THREE.TorusGeometry(0.046, 0.007, 4, 10).rotateX(Math.PI / 2), M.gold, elbow, 0, -0.1, 0);
    scaled(add(new THREE.SphereGeometry(0.04, 8, 6), M.skin, elbow, 0, -0.295, 0.0), 0.9, 1.2, 0.8);
    add(new THREE.SphereGeometry(0.016, 6, 5), M.skin, elbow, s * 0.03, -0.285, 0.025); // thumb

    const grip = group(elbow, 0, -0.29, 0);
    arms[name] = { shoulder, elbow, grip };
  }

  // ---------------- Quiver ----------------
  const quiver = group(spine, -0.03, 0.2, -0.17);
  quiver.rotation.set(0.12, 0, 0.45);
  add(new THREE.CylinderGeometry(0.058, 0.046, 0.46, 9), M.leather, quiver);
  add(new THREE.TorusGeometry(0.058, 0.01, 4, 10).rotateX(Math.PI / 2), M.gold, quiver, 0, 0.22, 0);
  add(new THREE.SphereGeometry(0.047, 8, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.leatherDark, quiver, 0, -0.23, 0);
  const fletchColors = [M.fletchW, M.fletchG, M.fletchW, M.fletchG, M.fletchW];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const ax = Math.cos(a) * 0.026;
    const az = Math.sin(a) * 0.026;
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 4), M.shaft, quiver, ax, 0.3, az);
    add(new THREE.ConeGeometry(0.016, 0.07, 4), fletchColors[i], quiver, ax, 0.385 + (i % 2) * 0.015, az);
  }

  // ---------------- Head ----------------
  const head = group(spine, 0, 0.5, 0);
  const skull = scaled(add(new THREE.SphereGeometry(0.115, 18, 14), M.skin, head, 0, 0.1, 0), 0.92, 1.08, 1.0);
  skull.name = 'skull';
  scaled(add(new THREE.SphereGeometry(0.06, 12, 10), M.skin, head, 0, 0.012, 0.045), 1.05, 0.95, 1.0); // chin
  for (const s of [1, -1]) scaled(add(new THREE.SphereGeometry(0.05, 8, 6), M.skin, head, s * 0.05, 0.06, 0.06), 1, 1, 0.9); // cheeks
  // Eyes.
  for (const s of [1, -1]) {
    scaled(add(new THREE.SphereGeometry(0.021, 8, 6), M.eyeWhite, head, s * 0.043, 0.112, 0.097), 1.1, 0.8, 0.45);
    scaled(add(new THREE.SphereGeometry(0.0145, 8, 6), M.eye, head, s * 0.043, 0.112, 0.104), 1, 1, 0.4);
    scaled(add(new THREE.SphereGeometry(0.0075, 6, 5), M.pupil, head, s * 0.043, 0.112, 0.108), 1, 1, 0.4);
    const brow = add(new THREE.BoxGeometry(0.042, 0.008, 0.01), M.brow, head, s * 0.046, 0.147, 0.1);
    brow.rotation.z = -s * 0.22;
    brow.rotation.y = s * 0.25;
  }
  // Nose and lips.
  add(new THREE.ConeGeometry(0.013, 0.034, 5).rotateX(Math.PI / 2), M.skin, head, 0, 0.083, 0.113);
  scaled(add(new THREE.SphereGeometry(0.02, 8, 6), M.lip, head, 0, 0.043, 0.103), 1.5, 0.5, 0.6);

  // Pointed ears, angled out and up.
  for (const s of [1, -1]) {
    const earPivot = group(head, s * 0.108, 0.13, -0.005);
    earPivot.rotation.set(-0.22, 0, -s * 1.0);
    const ear = add(new THREE.ConeGeometry(0.032, 0.19, 5).translate(0, 0.095, 0), M.skin, earPivot);
    ear.scale.z = 0.42;
    const inner = add(new THREE.ConeGeometry(0.018, 0.12, 4).translate(0, 0.06, 0.006), M.lip, earPivot);
    inner.scale.z = 0.3;
  }

  // Hair: tilted cap, fringe, side locks, back volume and the long swaying back hair.
  const cap = add(new THREE.SphereGeometry(0.128, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M.hair, head, 0, 0.115, -0.012);
  cap.rotation.x = -0.5;
  cap.scale.set(0.99, 1.08, 1.04);
  for (const s of [1, -1]) {
    const bang = scaled(add(new THREE.SphereGeometry(0.06, 8, 6), M.hair, head, s * 0.055, 0.19, 0.075), 1, 0.55, 0.5);
    bang.rotation.z = s * 0.55;
    const lock = add(new THREE.CylinderGeometry(0.03, 0.011, 0.34, 7).translate(0, -0.17, 0), M.hair, head, s * 0.104, 0.1, 0.045);
    lock.rotation.set(-0.05, 0, -s * 0.06);
    lock.scale.z = 0.7;
  }
  scaled(add(new THREE.SphereGeometry(0.12, 12, 10), M.hair, head, 0, 0.09, -0.065), 1.02, 1.1, 0.9);

  const hairBack = group(head, 0, 0.12, -0.115);
  scaled(add(new THREE.CylinderGeometry(0.105, 0.05, 0.62, 10).translate(0, -0.31, 0), M.hair, hairBack), 1, 1, 0.55);
  for (const s of [1, -1]) {
    const strand = add(new THREE.ConeGeometry(0.05, 0.56, 6).rotateX(Math.PI).translate(0, -0.28, 0), M.hair, hairBack, s * 0.055, -0.04, 0.0);
    strand.rotation.z = s * 0.08;
    strand.scale.z = 0.6;
  }

  // Circlet with emerald.
  const circlet = group(head, 0, 0.19, 0);
  circlet.rotation.x = 0.16;
  scaled(add(new THREE.TorusGeometry(0.113, 0.0085, 5, 26).rotateX(Math.PI / 2), M.gold, circlet), 0.99, 1, 1.04);
  const gem = add(new THREE.OctahedronGeometry(0.02), M.gem, circlet, 0, -0.004, 0.118);
  gem.scale.set(0.8, 1.35, 0.7);
  for (const s of [1, -1]) {
    const wing = add(new THREE.ConeGeometry(0.009, 0.045, 4).rotateZ(-s * Math.PI / 2), M.gold, circlet, s * 0.038, -0.003, 0.114);
    wing.scale.z = 0.6;
  }

  // ---------------- Cape ----------------
  const cape = group(spine, 0, 0.37, -0.215);
  const capeGeo = new THREE.PlaneGeometry(0.5, 0.88, 6, 8);
  const cp = capeGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i);
    const y = cp.getY(i); // -0.44 .. 0.44, top is +0.44
    const down = (0.44 - y) / 0.88; // 0 at shoulders, 1 at hem
    const nx = x / 0.25;
    cp.setX(i, x * (0.72 + 0.55 * down));
    cp.setZ(i, nx * nx * (0.07 + 0.03 * down) - down * 0.04);
  }
  capeGeo.computeVertexNormals();
  add(capeGeo, M.cape, cape, 0, -0.44, 0);
  add(new THREE.BoxGeometry(0.3, 0.014, 0.03), M.gold, cape, 0, -0.005, 0.01);

  // ---------------- Bow ----------------
  const bowGroup = new THREE.Group();
  const limb = new THREE.TorusGeometry(BOW_RADIUS, 0.017, 6, 28, BOW_ARC);
  limb.rotateZ(-BOW_ARC / 2);
  limb.rotateY(-Math.PI / 2);
  limb.translate(0, 0, -BOW_RADIUS);
  add(limb, M.bowWood, bowGroup);
  add(new THREE.CylinderGeometry(0.027, 0.027, 0.2, 8), M.leather, bowGroup);
  for (const s of [1, -1]) {
    const cap2 = add(new THREE.SphereGeometry(0.026, 8, 6), M.gold, bowGroup, 0, s * BOW_TIP_Y, BOW_TIP_Z);
    cap2.scale.set(1, 1.1, 1);
    add(new THREE.TorusGeometry(0.03, 0.007, 4, 10), M.gold, bowGroup, 0, s * (BOW_TIP_Y - 0.09), BOW_TIP_Z * 0.8).rotation.x = Math.PI / 2;
  }

  const stringGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, BOW_TIP_Y, BOW_TIP_Z),
    new THREE.Vector3(0, 0, BOW_TIP_Z),
    new THREE.Vector3(0, -BOW_TIP_Y, BOW_TIP_Z),
  ]);
  const bowString = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xf2efe2 }));
  bowString.frustumCulled = false;
  bowGroup.add(bowString);

  // Nocked arrow (shares the arrow geometry/material; not part of the hit-flash set).
  const nock = createArrowMesh();
  nock.visible = false;
  bowGroup.add(nock);

  const setPull = (t) => {
    const pull = Math.min(1, Math.max(0, t));
    const midZ = BOW_TIP_Z - pull * MAX_PULL;
    stringGeo.attributes.position.setZ(1, midZ);
    stringGeo.attributes.position.needsUpdate = true;
    nock.visible = pull > 0.02;
    nock.position.set(0, 0.012, midZ + 0.4);
  };
  setPull(0);

  // Bow in the left hand: vertical when the arm points forward (shoulder.rotation.x = -PI/2).
  bowGroup.rotation.x = Math.PI / 2;
  arms.L.grip.add(bowGroup);

  root.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  return {
    root,
    pelvis,
    spine,
    head,
    hairBack,
    cape,
    legs,
    arms,
    bow: { group: bowGroup, setPull, nock },
    materials,
  };
}
