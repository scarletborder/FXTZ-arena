import type { StageDocument, EnemyDefinition } from "./types";

export function createEmptyStage(partial?: Partial<StageDocument>): StageDocument {
  return {
    schemaVersion: 1,
    id: partial?.id ?? "untitled-stage",
    name: partial?.name ?? "未命名关卡",
    description: partial?.description,
    author: partial?.author,
    arena: partial?.arena ?? { width: 1200, height: 720 },
    compatibleModes: partial?.compatibleModes ?? ["collaborate"],
    enemyDefs: partial?.enemyDefs ?? {},
    bulletPresets: partial?.bulletPresets,
    shopPresets: partial?.shopPresets,
    nodes: partial?.nodes ?? [],
    settings: partial?.settings,
  };
}

const FAIRY: EnemyDefinition = {
  id: "fairy",
  displayName: "妖精",
  textureKey: "enemy_type_1",
  class: "minion",
  maxHealth: 120,
  hitRadius: 28,
  rewards: {
    drops: [
      { type: "point", size: "small", count: 2 },
      { type: "money", size: "small", count: 1 },
    ],
  },
  spawn: { x: 600, y: -40 },
  movement: {
    type: "phases",
    phases: [
      {
        startSeconds: 0,
        durationSeconds: 2,
        path: { kind: "line", from: { x: 600, y: -40 }, to: { x: 600, y: 520 }, ease: "easeOut" },
      },
      {
        startSeconds: 2,
        durationSeconds: 4,
        loop: true,
        path: {
          kind: "circle",
          center: { x: 600, y: 520 },
          radius: 160,
          startAngleDegrees: 0,
          clockwise: true,
        },
      },
    ],
  },
  fire: [
    {
      id: "aimed-volley",
      startSeconds: 1.5,
      intervalSeconds: 1.2,
      pattern: {
        type: "aimed",
        target: "both",
        count: 3,
        spreadDegrees: 18,
        bullet: {
          kind: "orb",
          textureKey: "bullet_type_3_offset_6",
          speedRank: "high",
          width: 10,
          height: 10,
          damage: 1,
          color: "#ff5d8f",
        },
      },
    },
    {
      id: "ring-pulse",
      startSeconds: 2.5,
      intervalSeconds: 2.5,
      pattern: {
        type: "ring",
        count: 16,
        startAngleDegrees: 0,
        rotationDegreesPerShot: 11.25,
        bullet: {
          kind: "knife",
          textureKey: "bullet_type_1",
          speedRank: "medium",
          width: 12,
          height: 12,
          damage: 1,
          color: "#7fd1ff",
        },
      },
    },
  ],
};

const ELITE: EnemyDefinition = {
  id: "elite",
  displayName: "精英妖精",
  textureKey: "enemy_type_3",
  class: "elite",
  maxHealth: 1600,
  hitRadius: 44,
  rewards: {
    drops: [
      { type: "point", size: "large", count: 3 },
      { type: "money", size: "large", count: 2 },
      { type: "power", size: "medium", count: 1 },
    ],
  },
  spawn: { x: 600, y: 120 },
  movement: {
    type: "phases",
    phases: [
      {
        startSeconds: 0,
        durationSeconds: 3,
        path: { kind: "line", from: { x: 600, y: -60 }, to: { x: 600, y: 300 }, ease: "easeOut" },
      },
      {
        startSeconds: 3,
        durationSeconds: 6,
        loop: true,
        path: {
          kind: "bezier",
          from: { x: 600, y: 300 },
          control: { x: 1100, y: 500 },
          to: { x: 600, y: 700 },
        },
      },
    ],
  },
  fire: [
    {
      id: "spiral",
      startSeconds: 1,
      intervalSeconds: 0.5,
      pattern: {
        type: "spiral",
        arms: 4,
        count: 2,
        angularSpeedDegreesPerSecond: 90,
        startAngleDegrees: 0,
        bullet: {
          kind: "orb",
          textureKey: "bullet_type_5",
          speedRank: "medium",
          width: 14,
          height: 14,
          damage: 2,
          color: "#ffd166",
        },
      },
    },
    {
      id: "spread",
      startSeconds: 2,
      intervalSeconds: 1.5,
      pattern: {
        type: "spread",
        count: 9,
        centerDegrees: 90,
        arcDegrees: 120,
        bullet: {
          kind: "diamond",
          textureKey: "bullet_type_2",
          speedRank: "high",
          width: 12,
          height: 12,
          damage: 2,
          color: "#ef476f",
        },
      },
    },
  ],
  forms: [
    { when: "healthBelow", threshold: 0.5, form: "elite_damaged" },
  ],
};

const BOSS: EnemyDefinition = {
  id: "boss",
  displayName: "关底Boss",
  textureKey: "enemy_type_boss",
  class: "boss",
  maxHealth: 4000,
  hitRadius: 60,
  rewards: {
    drops: [
      { type: "point", size: "large", count: 8 },
      { type: "money", size: "large", count: 4 },
      { type: "power", size: "large", count: 2 },
    ],
  },
  spawn: { x: 600, y: 160 },
  movement: {
    type: "phases",
    phases: [
      {
        startSeconds: 0,
        durationSeconds: 4,
        path: { kind: "line", from: { x: 600, y: -80 }, to: { x: 600, y: 240 }, ease: "easeOut" },
      },
      {
        startSeconds: 4,
        durationSeconds: 10,
        loop: true,
        path: { kind: "circle", center: { x: 600, y: 320 }, radius: 120, startAngleDegrees: 0 },
      },
    ],
  },
  spellCard: {
    phases: [
      {
        name: "符卡「星雨」",
        maxHealth: 2000,
        durationSeconds: 30,
        fire: [
          {
            id: "boss-ring",
            startSeconds: 0,
            intervalSeconds: 1.4,
            phase: 0,
            pattern: {
              type: "ring",
              count: 24,
              startAngleDegrees: 0,
              rotationDegreesPerSecond: 7,
              bullet: {
                kind: "orb",
                textureKey: "bullet_type_4",
                speedRank: "medium",
                width: 14,
                height: 14,
                damage: 3,
                color: "#c77dff",
              },
            },
          },
          {
            id: "boss-aimed",
            startSeconds: 0.7,
            intervalSeconds: 1.4,
            phase: 0,
            pattern: {
              type: "aimed",
              target: "both",
              count: 5,
              spreadDegrees: 10,
              bullet: {
                kind: "knife",
                textureKey: "bullet_type_1",
                speedRank: "high",
                width: 12,
                height: 12,
                damage: 3,
                color: "#ff70a6",
              },
            },
          },
        ],
      },
      {
        name: "符卡「终焉之环」",
        maxHealth: 2000,
        durationSeconds: 40,
        fire: [
          {
            id: "boss-spiral",
            startSeconds: 0,
            intervalSeconds: 0.4,
            phase: 1,
            pattern: {
              type: "spiral",
              arms: 6,
              count: 1,
              angularSpeedDegreesPerSecond: 130,
              startAngleDegrees: 0,
              bullet: {
                kind: "orb",
                textureKey: "bullet_type_5",
                speedRank: "high",
                width: 16,
                height: 16,
                damage: 3,
                color: "#ffd166",
              },
            },
          },
        ],
      },
    ],
  },
  forms: [{ when: "always", form: "boss" }],
};

export function createSampleStage(): StageDocument {
  return {
    schemaVersion: 1,
    id: "sample-stage",
    name: "示例关卡：妖精 → 精英 → Boss",
    description: "由关卡制作器生成的示例，演示出怪、移动、弹幕、商店、精英与 Boss 符卡。",
    author: "maker",
    arena: { width: 1200, height: 720 },
    compatibleModes: ["collaborate"],
    enemyDefs: {
      fairy: FAIRY,
      elite: ELITE,
      boss: BOSS,
    },
    shopPresets: {
      default_shop: {
        id: "default_shop",
        name: "补给商店",
        rarityPulls: { common: 4, rare: 1 },
      },
    },
    nodes: [
      {
        kind: "wave",
        id: "wave-1",
        minNextWaveSeconds: 8,
        maxNextWaveSeconds: 18,
        members: [
          { key: "a", enemyDefId: "fairy", class: "minion", spawnAtSeconds: 0, spawn: { x: 300, y: -40 } },
          { key: "b", enemyDefId: "fairy", class: "minion", spawnAtSeconds: 0.4, spawn: { x: 600, y: -40 } },
          { key: "c", enemyDefId: "fairy", class: "minion", spawnAtSeconds: 0.8, spawn: { x: 900, y: -40 } },
          { key: "d", enemyDefId: "fairy", class: "minion", spawnAtSeconds: 1.2, spawn: { x: 450, y: -40 } },
          { key: "e", enemyDefId: "fairy", class: "minion", spawnAtSeconds: 1.6, spawn: { x: 750, y: -40 } },
        ],
      },
      {
        kind: "shop",
        id: "shop-1",
        x: 600,
        y: 420,
        rarityPulls: { common: 4, rare: 1 },
        presetId: "default_shop",
      },
      {
        kind: "wave",
        id: "wave-2",
        minNextWaveSeconds: 8,
        maxNextWaveSeconds: 18,
        members: [
          { key: "elite", enemyDefId: "elite", class: "elite", spawnAtSeconds: 0 },
        ],
      },
      {
        kind: "shop",
        id: "shop-2",
        x: 600,
        y: 420,
        rarityPulls: { common: 4, rare: 2 },
      },
      {
        kind: "wave",
        id: "wave-boss",
        minNextWaveSeconds: 1,
        maxNextWaveSeconds: 999,
        members: [
          { key: "boss", enemyDefId: "boss", class: "boss", spawnAtSeconds: 0 },
        ],
      },
    ],
    settings: {
      background: { textureKey: "map-bg-hakurei-shrine", assetPath: "assets/bg/arena_standard.jpg", bgmKey: "bgm_hakurei-shrine" },
    },
  };
}
