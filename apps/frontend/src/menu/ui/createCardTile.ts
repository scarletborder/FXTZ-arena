import Phaser from "phaser";
import { t } from "@repo/i18n";

import type { AbilityCardDefinition } from "@repo/content";

import type { CardTileControl } from "../shared";

import { createEntryTile } from "./entryTile";
import { drawCardIcon } from "./drawCardIcon";

export function createCardTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  card: AbilityCardDefinition,
  selected: boolean,
  onClick: () => void,
): CardTileControl {
  return createEntryTile(scene, x, y, {
    width: 116,
    height: 104,
    title: card.name,
    subtitle: `${card.kind === "active" ? t("select.active") : t("select.passive")} cost${card.cost}`,
    badge: card.kind === "active" ? t("codex.active_use") : t("select.passive"),
    selected,
    onClick,
    drawIcon: (target) => drawCardIcon(scene, target, 58, 34, card, 0.76),
  });
}
