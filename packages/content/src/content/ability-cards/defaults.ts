import { secondsToTicks } from "../seconds-to-ticks";
import type { AbilityCardDefinition } from "./types";

export const DEFAULT_ABILITY_CARDS: readonly AbilityCardDefinition[] = [
  {
    id: "extra_life",
    name: "余命",
    cost: 3,
    kind: "passive",
    useLimit: "infinite",
    cooldownTicks: 0,
    description: "初始命数变为 3。",
    gallery: {
      iconAsset: "assets/ability-cards/extra-life/icon.png",
      previewAsset: "assets/ability-cards/extra-life/preview.png",
    },
    effectIds: ["set_initial_lives_3"],
  },
  {
    id: "ember",
    name: "余烬",
    cost: 2,
    kind: "passive",
    useLimit: "infinite",
    cooldownTicks: 0,
    description: "默认 bomb 变为 4，死亡复活也恢复到 4。",
    gallery: {
      iconAsset: "assets/ability-cards/ember/icon.png",
      previewAsset: "assets/ability-cards/ember/preview.png",
    },
    effectIds: ["set_default_bombs_4"],
  },
  {
    id: "backdoor",
    name: "后门",
    cost: 1,
    kind: "passive",
    useLimit: "infinite",
    cooldownTicks: 0,
    description: "角色后方追加可消除普通子弹的矩形护盾。",
    gallery: {
      iconAsset: "assets/ability-cards/backdoor/icon.png",
      previewAsset: "assets/ability-cards/backdoor/preview.png",
    },
    effectIds: ["rear_bullet_shield"],
  },
  {
    id: "multi_shot",
    name: "多射",
    cost: 1,
    kind: "passive",
    useLimit: "infinite",
    cooldownTicks: 0,
    description: "每次左键发射时，额外追加 1 个低速诱导普通矩形子弹。",
    gallery: {
      iconAsset: "assets/ability-cards/multi-shot/icon.png",
      previewAsset: "assets/ability-cards/multi-shot/preview.png",
    },
    effectIds: ["extra_homing_bullet"],
  },
  {
    id: "spirit_strike_card",
    name: "灵击符",
    cost: 1,
    kind: "active",
    useLimit: 3,
    cooldownTicks: secondsToTicks(20),
    description: "清除周围 4 倍判定点圆圈直径范围内的全部弹幕。",
    gallery: {
      iconAsset: "assets/ability-cards/spirit-strike-card/icon.png",
      previewAsset: "assets/ability-cards/spirit-strike-card/preview.png",
    },
    effectIds: ["clear_projectiles_radius_4"],
  },
];
