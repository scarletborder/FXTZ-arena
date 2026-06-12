import Phaser from "phaser";

export interface BattleKeyMap {
  readonly w: Phaser.Input.Keyboard.Key;
  readonly a: Phaser.Input.Keyboard.Key;
  readonly s: Phaser.Input.Keyboard.Key;
  readonly d: Phaser.Input.Keyboard.Key;
  readonly shift: Phaser.Input.Keyboard.Key;
  readonly r: Phaser.Input.Keyboard.Key;
  readonly tab: Phaser.Input.Keyboard.Key;
  readonly enter: Phaser.Input.Keyboard.Key;
  readonly e: Phaser.Input.Keyboard.Key;
}

export interface BattleKeybinds {
  readonly keys: BattleKeyMap;
  destroy(): void;
}

export function createBattleKeybinds(scene: Phaser.Scene): BattleKeybinds {
  const keyboard = scene.input.keyboard;
  if (!keyboard) {
    throw new Error("Battle scene requires keyboard input.");
  }

  const keys = keyboard.addKeys(
    {
      w: "W",
      a: "A",
      s: "S",
      d: "D",
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      r: "R",
      tab: Phaser.Input.Keyboard.KeyCodes.TAB,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      e: "E",
    },
    true,
    false,
  ) as BattleKeyMap;

  return {
    keys,
    destroy: () => {
      for (const key of Object.values(keys)) {
        keyboard.removeKey(key, true, true);
      }
    },
  };
}
