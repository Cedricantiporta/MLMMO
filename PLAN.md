# MLMMO — Plan & Architecture Contract

Lightweight MMORPG-style action game. **Three.js + Vite**, vanilla ES modules, zero external assets
(everything procedural), static build → Vercel.

Gameplay reference: Archero / Vampire Survivors auto-combat + Ragnarok-style slimes +
Diablo-style health orbs + Divinity/Magicka-style elemental ground effects.

## Gameplay rules
- **Movement:** WASD / arrow keys (camera-relative, camera looks toward -Z, so W = -Z, D = +X). Mouse wheel = zoom. P = pause.
- **Basic attack (auto):** hero picks nearest enemy **visible on screen**. If within attack range → shoots arrows automatically.
  If out of range and no WASD input → hero auto-walks toward it until in range, then shoots. WASD always overrides auto-walk;
  hero can still shoot while moving if a target is in range (kiting).
- **Skills (auto):** cast automatically when off cooldown and a valid target exists. **No mana.**
  1. **Rain of Arrows** – shoots an arrow skyward, then arrows rain for 2 s on a small circle (best enemy cluster on screen), damage ticks.
  2. **Splitting Shot** – 5 s buff: every basic attack splits to hit up to 5 enemies.
- **No potions.** Enemies drop **health orbs** periodically (chance + pity counter). Orbs magnet to the hero if hurt.
- **Enemies never touch the hero.** Each enemy type has its own *attack range* and *attack speed*; it approaches until it is
  within its preferred range, stops, and attacks from there (slime spit projectile / ground slam ring). Enemies keep a
  minimum standoff distance and back off if the hero walks into them.
- **Slimes**
  - *Normal* – mid range (≈4.5) green spit globs, medium speed.
  - *Fire* – long range (≈7) slow fireballs. **On death explodes**: AoE damage + ignites grass in a radius. Burning grass
    applies Burn DoT to **anyone** standing in it (hero AND enemies).
  - *Ice* – short range (≈2.6) fast frost slam ring. **On death explodes**: freezes everyone nearby (hero AND enemies).
- Hero: female adult elf archer (~1.8 units tall), procedural low-poly model with bow, quiver, cape, long hair, pointed ears.
- Map: small 64×64 meadow, trees/rocks obstacles, tree wall border. Final map design comes later — keep map code isolated in `src/world/`.

## Model / team split
- **Opus** – planning, this contract, delegation, integration review.
- **Sonnet** – writes code (3 parallel modules below), fixes.
- **Haiku** – verification: build, headless browser smoke test, console-error check, screenshot.

## File layout & ownership
```
index.html, src/main.js, src/style.css                 (Engine agent)
src/core/config.js   (ALREADY WRITTEN by Opus — the tunables; read it, extend only if needed)
src/core/rng.js      (ALREADY WRITTEN — mulberry32, rand, hash01, lerpAngle, clamp)
src/core/Game.js, Input.js, CameraRig.js               (Engine agent)
src/world/World.js, FireField.js                       (Engine agent)
src/fx/Particles.js, Effects.js                        (Engine agent)
src/ui/HUD.js                                          (Engine agent)
src/entities/Unit.js, StatusEffects.js                 (Engine agent)
src/entities/ElfArcher.js, ElfArcherModel.js           (Hero agent)
src/combat/arrowMesh.js, Arrow.js, RainOfArrows.js, Skill.js   (Hero agent)
src/entities/Slime.js, HealthOrb.js                    (Enemy agent)
src/combat/EnemyProjectile.js                          (Enemy agent)
src/systems/Spawner.js                                 (Enemy agent)
```

## Interface contract (MUST match exactly)

### Game (`src/core/Game.js`) — `export class Game`
Constructor `new Game(containerEl)`; `start()` runs the RAF loop (dt clamped to 0.05). Use `performance.now()`, not THREE.Clock.
Properties:
- `renderer, scene, camera, time` (seconds), `paused`
- `input: Input`, `cameraRig: CameraRig`, `particles: Particles`, `fx: Effects`, `world: World`, `fire: FireField`, `hud: HUD`
- `hero: ElfArcher`, `enemies: Slime[]`, `actors: object[]`, `spawner: Spawner`, `stats = { kills }`
Methods:
- `addActor(a)` – `a.update(dt)` returns `false` when finished; then `a.dispose?.()` is called and it is removed.
- `after(seconds, fn)` – simple timer.
- `isOnScreen(vec3) → bool` – camera frustum test (sphere r=0.6 at y+0.5).
- `enemiesInRadius(pos, r, exclude?) → Slime[]` – alive enemies (distance on XZ, includes enemy radius).
- `unitsInRadius(pos, r, exclude?) → Unit[]` – alive enemies + hero (if alive).
- `nearestEnemy(pos, maxDist=Infinity, filterFn?) → Slime|null`
- `onEnemyKilled(slime)` – kills++, health orb drop roll (chance + pity, see config.orb), spawns `new HealthOrb(game, pos)` via addActor.
Update order per frame: frustum → timers → hero.update → enemies.update → separation (circle push between units, frozen units
immovable, then `world.resolveCircle`) → fire.update → actors → remove enemies with `removed===true` (call `dispose()`)
→ spawner.update → particles.update → world.update → cameraRig.update(dt, hero.position). HUD updates every frame even when paused.
Game constructs in this order: input, cameraRig, particles, fx, world, fire, `world.indexTufts(fire)`, hero, hud, spawner; `cameraRig.snap(hero.position)`.
`window.__game = game` in main.js for debugging.

### Unit (`src/entities/Unit.js`) — `export class Unit`
`constructor(game, { maxHp, radius, team, height })` (team: `'hero'|'enemy'`)
- `root: THREE.Group` (added to scene by constructor; **never rotated** — models rotate inside it), `position` (= root.position),
  `hp, maxHp, radius, height, team, alive=true, removed=false, invuln=0, aimHeight` (default height*0.55)
- `status: StatusEffects`, `get frozen()` → `status.frozen`
- `registerFlashMaterials(mats[])` – stores base emissive; `updateFlash(dt)` – white flash on hit (red for hero), cyan tint while frozen.
- `takeDamage(amount, { type='physical', crit=false, source=null } = {}) → dealt` – ignores if !alive or invuln>0; rounds; spawns
  `game.hud.damageNumber(this, amount, type, crit)`; `hp<=0` → `this.die(source)`. Types: `physical|crit|fire|burn|ice|poison`.
- `heal(amount)` – clamps, `hud.floatText(this, '+N', 'heal')`, `fx.heal(position)`.
- `die(source)` – base sets `alive=false`. Subclasses override and call super.
- `dispose()` – removes root from scene.

### StatusEffects (`src/entities/StatusEffects.js`)
`applyBurn(dps, duration)`, `applyFreeze(duration) → bool` (respects `freezeImmune`; after thaw sets
`freezeImmune = unit.freezeImmunity || 0`), `update(dt)` (burn ticks every 0.5s as `takeDamage(dps*0.5,{type:'burn'})`,
emits flame particles while burning; while frozen shows a translucent ice block mesh around the unit; shatter particles on thaw),
`clear()`, getters `burning`, `frozen`, fields `burnTime`, `freezeTime`.

### Particles (`src/fx/Particles.js`) — `emit(pos, opts)`; `burst(pos, count, opts)`; `update(dt)`; `resize()`
opts: `{ vx,vy,vz, spread (random velocity magnitude for burst), color (hex), alpha=1, size=0.3 (world units), life=1,
gravity=0, drag=0, grow=0, additive=false }`. Two THREE.Points pools (additive soft / normal), custom ShaderMaterial,
attributes named `aColor`/`aSize` (not `color`).

### Effects (`src/fx/Effects.js`) — fire-and-forget visuals (internally actors)
`shockwave(pos, radius, color, life)`, `flashSphere(pos, radius, color, life)`, `explosion(pos, radius)`, `frostNova(pos, radius)`,
`splat(pos, color)`, `hitSpark(pos, color)`, `heal(pos)`, `castBurst(pos, color)`. Explosions call `game.cameraRig.shake(amp, time)`.

### World (`src/world/World.js`)
`half` (playable half-size), `obstacles: {x,z,r}[]`, `resolveCircle(pos, r)` (push out of obstacles + clamp bounds),
`randomOpenPoint(avoidPos, minDist) → Vector3`, `indexTufts(fire)`, `burnTufts(cellIndex)`, `regrowTufts(cellIndex)`, `update(dt)`
(sun shadow light follows hero). Lights, procedural grass canvas texture, instanced grass tufts, instanced trees/rocks.

### FireField (`src/world/FireField.js`)
Grid of cells (`CONFIG.map.cellSize`) over the map: `cellIndex(x,z) → int|-1`, `ignite(pos, radius, duration)`,
`isBurning(x,z) → bool`, `update(dt)` (instanced additive flame cones, DataTexture scorch/glow overlay on ground,
embers, applies `status.applyBurn(CONFIG.fire.dps, CONFIG.fire.statusDuration)` to hero & enemies standing on burning cells,
scorch fades over `CONFIG.fire.scorchFade` seconds then `world.regrowTufts`).

### HUD (`src/ui/HUD.js`)
`damageNumber(unit, amount, type, crit)`, `floatText(unitOrPos, text, cls)`, `hurt()` (red vignette pulse), `update(dt)`
(HP bar with lag bar, statuses: Burning/Frozen/Splitting Shot, skill bar with conic cooldown overlays for
`hero.attackCooldownFrac`, `hero.skills.rain`, `hero.skills.split` (+ active buff `hero.splitTime`), stats line Kills / Slimes /
FPS, death overlay with `hero.respawnTimer`, paused overlay). DOM floaters pooled, projected from world each frame.

### Skill (`src/combat/Skill.js`)
`new Skill(def)` → `def, cd` (starts at `def.initialDelay ?? 1.5`), `ready`, `cdFrac` (0..1), `update(dt)`, `trigger()`.

### ElfArcher (`src/entities/ElfArcher.js`) extends Unit
Fields used by others: `skills = { rain: Skill, split: Skill }`, `splitTime` (buff seconds left), `attackCooldownFrac`,
`respawnTimer`, `target`, `freezeImmunity`, `getBowWorldPosition(out)`. Hero `takeDamage` also calls `game.hud.hurt()`.

### Slime (`src/entities/Slime.js`) extends Unit
`new Slime(game, type, position)` (type `'normal'|'fire'|'ice'`), `type`, `def`, `aggro(seconds)`. `die()` triggers
type-specific death; sets `removed = true` when the death animation ends.

### HealthOrb (`src/entities/HealthOrb.js`) — actor: `new HealthOrb(game, pos)`.
### Spawner (`src/systems/Spawner.js`) — `new Spawner(game)` spawns `CONFIG.spawner.initial` immediately; `update(dt)`.
