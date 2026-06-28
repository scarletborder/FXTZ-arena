// settings/keyboard-tab.ts
import Phaser from "phaser";
import { t } from "@repo/i18n";
import {
  bodyStyle,
  createFightButton,
  createRectangleButton,
  drawAngledPanel,
} from "../ui";
import {
  settingsRepository,
  setKeybinds,
} from "../../store/settings";
import type { SettingsScene } from "./index";
import { KeybindSettings, DEFAULT_KEYBINDS } from "../../battle/input-controller";

interface KeyRowConfig {
  action: keyof KeybindSettings;
  labelKey: string;
}

const LEFT_COLUMN_KEYS: KeyRowConfig[] = [
  { action: "moveUp", labelKey: "settings.keyboard.actions.move_up" },
  { action: "moveLeft", labelKey: "settings.keyboard.actions.move_left" },
  { action: "moveDown", labelKey: "settings.keyboard.actions.move_down" },
  { action: "moveRight", labelKey: "settings.keyboard.actions.move_right" },
  { action: "reload", labelKey: "settings.keyboard.actions.reload" },
];

const RIGHT_COLUMN_KEYS: KeyRowConfig[] = [
  { action: "activeCard", labelKey: "settings.keyboard.actions.active" },
  { action: "alternate", labelKey: "settings.keyboard.actions.alt" },
  { action: "info", labelKey: "settings.keyboard.actions.info" },
  { action: "enter", labelKey: "settings.keyboard.actions.enter" },
];

function getKeyDisplayName(value: string | number): string {
  if (typeof value === "string") {
    return value.toUpperCase();
  }
  const KeyCodes = Phaser.Input.Keyboard.KeyCodes;
  for (const [name, code] of Object.entries(KeyCodes)) {
    if (code === value) {
      return name.toUpperCase();
    }
  }
  return String(value);
}

function getPhaserKey(event: KeyboardEvent): string | number {
  if (event.keyCode) {
    return event.keyCode;
  }
  return event.key.toUpperCase();
}

// 冲突检测函数
function findDuplicates(keybinds: KeybindSettings) {
  const seen = new Map<string | number, Array<keyof KeybindSettings>>();

  for (const [action, key] of Object.entries(keybinds)) {
    const act = action as keyof KeybindSettings;
    if (!seen.has(key)) {
      seen.set(key, []);
    }
    seen.get(key)!.push(act);
  }

  const duplicates = new Set<string | number>();
  const duplicatedActions = new Set<keyof KeybindSettings>();

  for (const [key, actions] of seen.entries()) {
    if (actions.length > 1) {
      duplicates.add(key);
      actions.forEach(act => duplicatedActions.add(act));
    }
  }

  return {
    duplicated: duplicates.size > 0,
    duplicates,
    duplicatedActions
  };
}

export function renderKeyboardTab(scene: SettingsScene, layer: Phaser.GameObjects.Container): void {
  // 1. 声明编辑时的临时键位对象
  let tempKeybinds: KeybindSettings = { ...settingsRepository.get().keybinds };

  let listeningAction: keyof KeybindSettings | null = null;
  let activeCaptureCleanup: (() => void) | undefined = undefined;

  // 2. 将频繁擦写重绘的 tabContent 与用于长驻展示的 statusText 做物理层级的拆分
  const tabContent = scene.add.container(0, 0);

  // 状态反馈文本直接作为 layer 的子元素（避开 tabContent.removeAll(true) 的批量销毁）
  const statusText = scene.add.text(36, 376, "", bodyStyle("#ffcf6e", 16));

  layer.add(tabContent);
  layer.add(statusText);

  const cleanupKeyCapture = () => {
    if (activeCaptureCleanup) {
      activeCaptureCleanup();
      activeCaptureCleanup = undefined;
    }
    listeningAction = null;
  };

  const drawTabContent = () => {
    // 核心修复：传入 true，彻底销毁内部旧组件，阻止它们退回到 Scene 全局显示列表
    tabContent.removeAll(true);

    // 重新绘制标题
    tabContent.add(sectionTitle(scene, 36, 34, t("settings.keyboard.sections.movement")));
    tabContent.add(sectionTitle(scene, 580, 34, t("settings.keyboard.sections.actions")));

    // 执行冲突检测
    const dupCheck = findDuplicates(tempKeybinds);

    // 绘制左半列
    LEFT_COLUMN_KEYS.forEach((config, idx) => {
      const isDuplicated = dupCheck.duplicatedActions.has(config.action);
      tabContent.add(
        createKeybindRow(
          scene,
          36,
          80 + idx * 56,
          510,
          48,
          config.action,
          t(config.labelKey) ?? config.labelKey,
          tempKeybinds[config.action],
          () => startListening(config.action),
          listeningAction === config.action,
          isDuplicated
        )
      );
    });

    // 绘制右半列
    RIGHT_COLUMN_KEYS.forEach((config, idx) => {
      const isDuplicated = dupCheck.duplicatedActions.has(config.action);
      tabContent.add(
        createKeybindRow(
          scene,
          580,
          80 + idx * 56,
          510,
          48,
          config.action,
          t(config.labelKey) ?? config.labelKey,
          tempKeybinds[config.action],
          () => startListening(config.action),
          listeningAction === config.action,
          isDuplicated
        )
      );
    });

    // 确认变动按钮
    const confirmButton = createFightButton(
      scene,
      750,
      366,
      160,
      42,
      t("settings.keyboard.confirm"),
      () => {
        cleanupKeyCapture();
        const checkResult = findDuplicates(tempKeybinds);

        if (checkResult.duplicated) {
          statusText.setText(t("settings.keyboard.conflict_error")).setColor("#ff5c66");
          drawTabContent(); // 刷新以重绘红色冲突边框
        } else {
          setKeybinds(tempKeybinds); // 持久化到全局 store 与 LocalStorage
          statusText.setText(t("settings.keyboard.save_success")).setColor("#34d399");
          drawTabContent();
        }
      },
      { accent: 0x34d399 }
    );
    tabContent.add(confirmButton.container);

    // 恢复默认按钮
    const resetButton = createFightButton(
      scene,
      930,
      366,
      160,
      42,
      t("settings.keyboard.reset"),
      () => {
        cleanupKeyCapture();
        tempKeybinds = { ...DEFAULT_KEYBINDS };
        statusText.setText(t("settings.keyboard.reset_success")).setColor("#ffcf6e");
        drawTabContent();
      },
      { accent: 0x5c7185 }
    );
    tabContent.add(resetButton.container);
  };

  const startListening = (action: keyof KeybindSettings) => {
    cleanupKeyCapture();
    listeningAction = action;
    statusText.setText(""); // 开启捕获时重置文本
    drawTabContent();

    const captureHandler = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const keyVal = getPhaserKey(event);
      tempKeybinds[action] = keyVal; // 只写入本地临时缓存，点击确认变动前不修改全局设置

      cleanupKeyCapture();
      drawTabContent();
    };

    window.addEventListener("keydown", captureHandler, true);
    activeCaptureCleanup = () => {
      window.removeEventListener("keydown", captureHandler, true);
    };
  };

  drawTabContent();

  scene.addCleanup(() => {
    cleanupKeyCapture();
  });
}

function createKeybindRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  _action: keyof KeybindSettings,
  actionLabel: string,
  currentValue: string | number,
  onStartBinding: () => void,
  isBinding: boolean,
  isDuplicated: boolean
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const background = scene.add.graphics();

  const fill = isBinding ? 0x221c25 : 0x151b26;
  const stroke = isDuplicated ? 0xff5c66 : isBinding ? 0xffcf6e : 0x34475c;

  drawAngledPanel(background, 0, 0, width, height, fill, stroke, 1);

  const textColor = isDuplicated ? "#ff8890" : "#f6f1e6";
  const labelText = scene.add.text(18, Math.round(height / 2 - 10), actionLabel, bodyStyle(textColor, 16));

  const btnLabel = isBinding ? t("settings.keyboard.press_key") : `[ ${getKeyDisplayName(currentValue)} ]`;

  // 键位按钮的 Y 坐标由 6 下移至 9，整体重心下移且维持与单元格下框的边界填充
  const keyBtn = createRectangleButton(
    scene,
    width - 158,
    24, // Y 坐标偏移下移
    140,
    height - 15, // 按钮高度自适应（48 - 15 = 33）
    btnLabel,
    onStartBinding,
    { accent: isDuplicated ? 0xff5c66 : isBinding ? 0xffcf6e : 0x5c7185 }
  );

  container.add([background, labelText, keyBtn.container]);
  return container;
}

function sectionTitle(scene: Phaser.Scene, x: number, y: number, label: string): Phaser.GameObjects.Text {
  return scene.add.text(x, y, label, {
    ...bodyStyle("#ffcf6e", 18),
    fontStyle: "700",
  });
}
