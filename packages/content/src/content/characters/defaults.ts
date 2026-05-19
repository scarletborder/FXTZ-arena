import { secondsToTicks } from "../seconds-to-ticks";
import type { CharacterDefinition } from "./types";

const DEMO_GALLERY = {
  portraitAsset: "assets/characters/reimu/portrait.png",
  attackPreviewAsset: "assets/characters/reimu/attack-preview.png",
};

function buildDemoCharacters(
  role: CharacterDefinition["roleClass"],
  namePrefix: string,
  count: number,
  cost: number,
): CharacterDefinition[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `demo_${role}_${index + 1}` as CharacterDefinition["id"],
    name: `${namePrefix}${index + 1}`,
    cost,
    roleClass: role,
    moveSpeed: role === "assault" ? "high" : role === "sniper" ? "low" : "medium",
    ammoCapacity: role === "sniper" ? 2 : 4,
    reloadTicksPerAmmo: secondsToTicks(1),
    reloadStartPolicy: "keep_current",
    reloadCommitPolicy: "commit_per_ammo",
    fireRate: role === "sniper" ? "low" : "medium",
    bulletSpeed: role === "sniper" ? "high" : "medium",
    description: "占位角色，用于滚动列表展示。",
    normalAttackId: "reimu_homing_shot",
    bombId: "reimu_clear_bomb",
    gallery: DEMO_GALLERY,
  }));
}

const DEMO_CHARACTERS: CharacterDefinition[] = [
  ...buildDemoCharacters("assault", "demoAssault", 6, 3),
  ...buildDemoCharacters("suppress", "demoSupress", 6, 4),
  ...buildDemoCharacters("scout", "demoScout", 6, 2),
  ...buildDemoCharacters("sniper", "demoSniper", 6, 5),
];

export const DEFAULT_CHARACTERS: readonly CharacterDefinition[] = [
  {
    id: "reimu",
    name: "博丽灵梦",
    cost: 4,
    roleClass: "suppress",
    moveSpeed: "medium",
    ammoCapacity: 5,
    reloadTicksPerAmmo: secondsToTicks(0.8),
    reloadStartPolicy: "keep_current",
    reloadCommitPolicy: "commit_per_ammo",
    fireRate: "medium",
    bulletSpeed: "low",
    description: "低速诱导弹与清弹 bomb，适合压制弹幕空间。",
    normalAttackId: "reimu_homing_shot",
    bombId: "reimu_clear_bomb",
    gallery: {
      portraitAsset: "assets/characters/reimu/portrait.png",
      attackPreviewAsset: "assets/characters/reimu/attack-preview.png",
    },
  },
  {
    id: "marisa",
    name: "魔理沙",
    cost: 5,
    roleClass: "sniper",
    moveSpeed: "high",
    ammoCapacity: 2,
    reloadTicksPerAmmo: secondsToTicks(1.5),
    reloadStartPolicy: "reset_to_zero",
    reloadCommitPolicy: "commit_on_finish",
    fireRate: "low",
    bulletSpeed: "high",
    description: "高速激光与长前摇魔炮，爆发强但动作约束明显。",
    normalAttackId: "marisa_laser",
    bombId: "marisa_master_spark",
    gallery: {
      portraitAsset: "assets/characters/marisa/portrait.png",
      attackPreviewAsset: "assets/characters/marisa/attack-preview.png",
    },
  },
  {
    id: "sakuya",
    name: "咲夜",
    cost: 4,
    roleClass: "assault",
    moveSpeed: "medium",
    ammoCapacity: 3,
    reloadTicksPerAmmo: secondsToTicks(1),
    reloadStartPolicy: "keep_current",
    reloadCommitPolicy: "commit_on_finish",
    fireRate: "medium",
    bulletSpeed: "medium",
    description: "平行双弹和时间停止 bomb，擅长近中距离压迫。",
    normalAttackId: "sakuya_parallel_knives",
    bombId: "sakuya_time_stop",
    gallery: {
      portraitAsset: "assets/characters/sakuya/portrait.png",
      attackPreviewAsset: "assets/characters/sakuya/attack-preview.png",
    },
  },
  ...DEMO_CHARACTERS,
];
