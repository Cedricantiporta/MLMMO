import * as THREE from 'three';

// Layered render so heroes/enemies stay readable behind cliffs and trees (MOBA-style x-ray):
//   pass 1  environment + everything not owned by a unit (layer 0)
//   pass 2  silhouettes of units, drawn only where the environment is in front (GreaterDepth)
//   pass 3  units drawn normally on top of their silhouettes
//   pass 4  unit overlays that don't write depth (hp bars, stack pips, blob shadows, ice, glows) + particles
// Silhouettes are drawn against environment depth only, so they never tint a unit's own visible body.
const L_ENV = 0;
const L_HERO = 1;
const L_ENEMY = 2;
const L_OVERLAY = 3;

function silhouette(color) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.42, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false,
  });
}

export class XRayRenderer {
  constructor(game) {
    this.game = game;
    this.heroMat = silhouette(0x7fe0ff);
    this.enemyMat = silhouette(0xff5a4a);
    this.lightsTagged = false;
  }

  tagUnit(unit, layer) {
    unit.root.traverse((o) => {
      if (!o.isMesh && !o.isLine) return;
      const m = o.material;
      const overlay = o.userData.overlay || (m && (m.depthWrite === false || m.depthTest === false));
      o.layers.set(overlay ? L_OVERLAY : layer);
    });
  }

  tagScene() {
    const { scene, hero, enemies } = this.game;
    if (!this.lightsTagged) {
      scene.traverse((o) => { if (o.isLight) o.layers.enableAll(); });
      this.lightsTagged = true;
    }
    for (const o of scene.children) if (o.isPoints) o.layers.set(L_OVERLAY);
    this.tagUnit(hero, L_HERO);
    for (const e of enemies) this.tagUnit(e, L_ENEMY);
  }

  render() {
    const { renderer, scene, camera } = this.game;
    this.tagScene();

    camera.layers.set(L_ENV);
    renderer.render(scene, camera);

    const bg = scene.background;
    scene.background = null;
    renderer.autoClear = false;

    if (this.game.hero.alive) {
      camera.layers.set(L_HERO);
      scene.overrideMaterial = this.heroMat;
      renderer.render(scene, camera);
    }
    camera.layers.set(L_ENEMY);
    scene.overrideMaterial = this.enemyMat;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;

    camera.layers.set(L_HERO);
    camera.layers.enable(L_ENEMY);
    renderer.render(scene, camera);

    camera.layers.set(L_OVERLAY);
    renderer.render(scene, camera);

    renderer.autoClear = true;
    scene.background = bg;
    camera.layers.set(L_ENV);
  }
}
