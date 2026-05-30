import Phaser from "phaser";

import { FONT } from "./constants";

export function headingStyle(size: number): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: "900",
    color: "#f6f1e6",
  };
}

export function bodyStyle(color: string, size: number): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
  };
}