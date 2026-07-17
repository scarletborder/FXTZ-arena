import Phaser from "phaser";

import type { CharacterDefinition } from "@repo/types";

import type { CharacterTileControl } from "../shared";
import { characterName, roleLabel } from "../shared";

import { createEntryTile } from "./entryTile";
import { drawCharacterPreviewIcon } from "./drawCharacterIcon";

export function createCharacterTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  character: CharacterDefinition,
  selected: boolean,
  onClick: () => void,
): CharacterTileControl {
  return createEntryTile(scene, x, y, {
    width: 112,
    height: 152,
    title: characterName(character),
    subtitle: `cost${character.cost}`,
    badge: roleLabel(character.roleClass),
    selected,
    onClick,
    drawIcon: (target) =>
      drawCharacterPreviewIcon(scene, target, 56, 56, 82, 76, character),
  });
}
