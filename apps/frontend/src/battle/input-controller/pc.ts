import Phaser from "phaser";

export interface BattleKeyMap {
  readonly moveUp: Phaser.Input.Keyboard.Key;
  readonly moveLeft: Phaser.Input.Keyboard.Key;
  readonly moveDown: Phaser.Input.Keyboard.Key;
  readonly moveRight: Phaser.Input.Keyboard.Key;
  readonly alternate: Phaser.Input.Keyboard.Key;
  readonly reload: Phaser.Input.Keyboard.Key;
  readonly info: Phaser.Input.Keyboard.Key;
  readonly enter: Phaser.Input.Keyboard.Key;
  readonly activeCard: Phaser.Input.Keyboard.Key;
  readonly pause: Phaser.Input.Keyboard.Key;
}

export interface KeybindSettings {
  moveUp: string | number;
  moveLeft: string | number;
  moveDown: string | number;
  moveRight: string | number;
  alternate: string | number;
  reload: string | number;
  info: string | number;
  enter: string | number;
  activeCard: string | number;
  pause: string | number;
}

export interface BattleKeybinds {
  readonly keys: BattleKeyMap;
  destroy(): void;
}

// 默认的 WASD 经典配置
export const DEFAULT_KEYBINDS: KeybindSettings = {
  moveUp: Phaser.Input.Keyboard.KeyCodes.W,         // 87
  moveLeft: Phaser.Input.Keyboard.KeyCodes.A,       // 65
  moveDown: Phaser.Input.Keyboard.KeyCodes.S,       // 83
  moveRight: Phaser.Input.Keyboard.KeyCodes.D,      // 68
  alternate: Phaser.Input.Keyboard.KeyCodes.SHIFT,  // 16
  reload: Phaser.Input.Keyboard.KeyCodes.R,         // 82
  info: Phaser.Input.Keyboard.KeyCodes.TAB,         // 9
  enter: Phaser.Input.Keyboard.KeyCodes.ENTER,      // 13
  activeCard: Phaser.Input.Keyboard.KeyCodes.E,     // 69
  pause: Phaser.Input.Keyboard.KeyCodes.ESC,        // 27
};

export function createBattleKeybinds(
  scene: Phaser.Scene,
  customSettings?: Partial<KeybindSettings>
): BattleKeybinds {
  const keyboard = scene.input.keyboard;
  if (!keyboard) {
    throw new Error("Battle scene requires keyboard input.");
  }
  // 合并外部配置与默认配置
  const settings = { ...DEFAULT_KEYBINDS, ...customSettings };
  const keys = keyboard.addKeys(
    {
      moveUp: settings.moveUp,
      moveLeft: settings.moveLeft,
      moveDown: settings.moveDown,
      moveRight: settings.moveRight,
      alternate: settings.alternate,
      reload: settings.reload,
      info: settings.info,
      enter: settings.enter,
      activeCard: settings.activeCard,
      pause: settings.pause,
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
