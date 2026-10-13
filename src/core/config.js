// Central tunables. Every gameplay number lives here so balancing never requires touching logic.
export const CONFIG = {
  map: { size: 64, playHalf: 28, cellSize: 0.8, seed: 1337 },

  camera: { distance: 22, minDistance: 12, maxDistance: 34, pitch: 0.98, fov: 45 },

  hero: {
    name: 'Sylwen',
    title: 'Elf Archer',
    maxHp: 600,
    speed: 6.2,
    radius: 0.4,
    height: 1.82,
    attackRange: 11,
    attackInterval: 0.75, // seconds between basic attacks
    drawTime: 0.18, // bow draw before release
    damage: [24, 32],
    critChance: 0.18,
    critMult: 1.8,
    arrowSpeed: 32,
    respawnTime: 4,
    respawnInvuln: 1.5,
    freezeImmunity: 1.5, // seconds of freeze immunity after thawing
    retargetInterval: 0.2,
    // Attack-speed stacks shown above the hero: each basic attack adds one; all drop after `decay` s idle.
    stacks: { max: 6, speedPerStack: 0.15, decay: 4 },
  },

  skills: {
    rain: {
      name: 'Rain of Arrows',
      cooldown: 7,
      initialDelay: 1.5,
      castRange: 13,
      radius: 2.6,
      duration: 2,
      delay: 0.55, // launch arrow flight time before rain starts
      tickInterval: 0.2,
      tickDamage: [10, 14],
      arrowsPerSecond: 30,
      castTime: 0.35,
    },
    split: {
      name: 'Splitting Shot',
      cooldown: 12,
      initialDelay: 3,
      duration: 5,
      maxTargets: 5,
      extraDamageMult: 0.85,
    },
  },

  // Enemies never touch the hero: each keeps `standoff` distance and attacks from `attackRange`.
  slimes: {
    normal: {
      label: 'Slime',
      hp: 110,
      speed: 2.6,
      radius: 0.55,
      color: 0x5fd068,
      attack: { kind: 'spit', range: 4.5, interval: 1.6, damage: 13, windup: 0.35, projectileSpeed: 10 },
      standoff: 2.2,
    },
    fire: {
      label: 'Fire Slime',
      hp: 90,
      speed: 2.3,
      radius: 0.55,
      color: 0xff6a2a,
      attack: { kind: 'fireball', range: 7, interval: 2.4, damage: 16, windup: 0.5, projectileSpeed: 8 },
      standoff: 4.5,
      explosion: { radius: 3.2, damage: 40, burnDps: 14, burnDuration: 2 },
      ignite: { radius: 2.8, duration: 5 },
    },
    ice: {
      label: 'Ice Slime',
      hp: 100,
      speed: 2.9,
      radius: 0.55,
      color: 0x6fd8ff,
      attack: { kind: 'slam', range: 2.6, interval: 1.1, damage: 9, windup: 0.3, ringRadius: 2.9 },
      standoff: 1.6,
      explosion: { radius: 3.4, damage: 20, freezeDuration: 2.5 },
    },
  },

  slimeAI: {
    aggroRange: 11,
    aggroOnHit: 6, // seconds a damaged slime stays aggressive regardless of distance
    wanderRadius: 5,
    wanderSpeedMult: 0.4,
    spawnTime: 0.5,
  },

  fire: { dps: 14, statusDuration: 2.0, scorchFade: 22 },

  orb: { dropChance: 0.22, pityKills: 6, healPct: 0.22, magnetRange: 4.5, pickupRange: 0.9, lifetime: 30 },

  spawner: {
    initial: 12,
    max: 18,
    interval: 2.2,
    minDistFromHero: 13,
    weights: { normal: 0.5, fire: 0.25, ice: 0.25 },
  },
};
