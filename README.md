# MLMMO — Elf Archer (prototype)

Lightweight MMORPG-style action game built with **Three.js + Vite**. No external assets: models, textures and effects are all procedural, and the build is about 160 kB gzipped.

## Play
- **WASD / arrow keys:** move
- **Mouse wheel:** zoom
- **P:** pause
- **Attacks and skills are automatic.** The archer targets the nearest enemy on screen. If it is out of range she walks to it (unless you are steering), then shoots.

### Hero: Sylwen, Elf Archer
| Skill | Effect |
|---|---|
| Auto Shot | Homing arrows, crits |
| Rain of Arrows | Fires an arrow skyward, then arrows rain for 2 s on the densest enemy cluster |
| Splitting Shot | For 5 s, every shot hits up to 5 enemies |

There is no mana and there are no potions. Enemies drop **health orbs**: a random chance, with a guaranteed drop after 6 kills without one.

### Enemies
Enemies never touch you. Each type keeps its own distance and attack speed.
| Slime | Attack | On death |
|---|---|---|
| Normal | Spit at mid range, medium speed | Splat |
| Fire | Slow, long-range fireball | Explodes and sets the grass on fire. Burning ground hurts heroes **and** enemies |
| Ice | Fast, short-range frost slam | Explodes and freezes everyone nearby, heroes **and** enemies |

## Develop
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
```

## Deploy (Vercel)
Import the repo in Vercel. It detects Vite automatically; `vercel.json` sets the build command to `npm run build` and the output directory to `dist`.

## Architecture
All tunables live in `src/core/config.js`. `PLAN.md` holds the module contract.
```
src/core      Game loop, input, camera, config, rng
src/world     Map (World.js: ground, trees, bounds) and FireField (burnable grass grid)
src/entities  Unit base, status effects, ElfArcher (+ procedural model), Slime, HealthOrb
src/combat    Arrows, Rain of Arrows, skills, enemy projectiles
src/fx        GPU point particles and one-shot effects
src/ui        DOM HUD (HP, skills, damage numbers)
src/systems   Spawner
```
The map is self-contained in `src/world/World.js`, so a new map can be swapped in without touching gameplay code.
