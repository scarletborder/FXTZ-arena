import Phaser from "phaser";

import type { FightButton } from "../shared";
import { createFightButton } from "./widgets";


export function createSmallTab(scene: Phaser.Scene, x: number, y: number, label: string, active: boolean, onClick: () => void, width = 92): FightButton {
  return createFightButton(scene, x, y, width, 34, label, onClick, { accent: active ? 0xffcf6e : 0x5c7185 });
}