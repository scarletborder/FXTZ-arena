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
  uiSettings,
  updateSingleKeybind,
  resetKeybindsToDefault,
} from "../../store/settings";
import type { SettingsScene } from "./index";
import { KeybindSettings } from "../../battle/input-controller/pc";

interface KeyRowConfig {
  action: keyof KeybindSettings;
  label: string;
}

const LEFT_COLUMN_KEYS: KeyRowConfig[] = [
  { action: "moveUp", label: "向上移动 (Move Up)" },
  { action: "moveLeft", label: "向左移动 (Move Left)" },
  { action: "moveDown", label: "向下移动 (Move Down)" },
  { action: "moveRight", label: "向右移动 (Move Right)" },
  { action: "reload", label: "手动装弹/商店准备 (Reload)" },
];

const RIGHT_COLUMN_KEYS: KeyRowConfig[] = [
  { action: "activeCard", label: "激活卡牌/激活道具 (Active)" },
  { action: "alternate", label: "次要按键/切换商店 (Alt)" },
  { action: "info", label: "战局看板信息 (Info)" },
  { action: "enter", label: "确定按键 (Enter)" },
];

/**
 * 转换器 1：反向解析器
 * 将存储中的 string 或 number 转换为人类可读的键位名（例如 16 转换为 "SHIFT"）
 */
function getKeyDisplayName(value: string | number): string {
  if (typeof value === "string") {
    return value.toUpperCase();
  }

  // 遍历 Phaser 内置的 KeyCodes 进行反向匹配
  const KeyCodes = Phaser.Input.Keyboard.KeyCodes;
  for (const [name, code] of Object.entries(KeyCodes)) {
    if (code === value) {
      return name.toUpperCase();
    }
  }

  return String(value);
}

/**
 * 转换器 2：输入捕获器
 * 拦截键盘事件并转换为 Phaser 兼容的按键码（通常返回 number）
 */
function getPhaserKey(event: KeyboardEvent): string | number {
  // 原生 keyCode (如 16, 9) 在数值上与 Phaser.Input.Keyboard.KeyCodes 完全一致
  if (event.keyCode) {
    return event.keyCode;
  }
  // 回退机制：如果部分浏览器不支持 keyCode 则使用大写字符
  return event.key.toUpperCase();
}

export function renderKeyboardTab(scene: SettingsScene, layer: Phaser.GameObjects.Container): void {
  let listeningAction: keyof KeybindSettings | null = null;
  let activeCaptureCleanup: (() => void) | undefined = undefined;

  const tabContent = scene.add.container(0, 0);
  layer.add(tabContent);

  const cleanupKeyCapture = () => {
    if (activeCaptureCleanup) {
      activeCaptureCleanup();
      activeCaptureCleanup = undefined;
    }
    listeningAction = null;
  };

  const drawTabContent = () => {
    tabContent.removeAll(true);

    // 1. 绘制栏目标题
    tabContent.add(sectionTitle(scene, 36, 34, "键盘移动绑定 (Movement)"));
    tabContent.add(sectionTitle(scene, 580, 34, "行动与交互绑定 (Actions)"));

    // 2. 绘制左半列
    LEFT_COLUMN_KEYS.forEach((config, idx) => {
      tabContent.add(
        createKeybindRow(
          scene,
          36,
          80 + idx * 56,
          510,
          48,
          config.action,
          config.label,
          () => startListening(config.action),
          listeningAction === config.action
        )
      );
    });

    // 3. 绘制右半列
    RIGHT_COLUMN_KEYS.forEach((config, idx) => {
      tabContent.add(
        createKeybindRow(
          scene,
          580,
          80 + idx * 56,
          510,
          48,
          config.action,
          config.label,
          () => startListening(config.action),
          listeningAction === config.action
        )
      );
    });

    // 4. 重置按钮
    const resetButton = createFightButton(
      scene,
      930,
      366,
      160,
      42,
      "恢复默认",
      () => {
        cleanupKeyCapture();
        resetKeybindsToDefault();
        drawTabContent();
      },
      { accent: 0xff5c66 }
    );
    tabContent.add(resetButton.container);
  };

  const startListening = (action: keyof KeybindSettings) => {
    cleanupKeyCapture();
    listeningAction = action;
    drawTabContent(); // 变成高亮的监听态

    const captureHandler = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const keyVal = getPhaserKey(event);
      updateSingleKeybind(action, keyVal); // 保存 string 或 number

      cleanupKeyCapture();
      drawTabContent(); // 刷新渲染
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
  action: keyof KeybindSettings,
  actionLabel: string,
  onStartBinding: () => void,
  isBinding: boolean
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const background = scene.add.graphics();

  const fill = isBinding ? 0x221c25 : 0x151b26;
  const stroke = isBinding ? 0xffcf6e : 0x34475c;
  drawAngledPanel(background, 0, 0, width, height, fill, stroke, 1);

  const labelText = scene.add.text(18, Math.round(height / 2 - 10), actionLabel, bodyStyle("#f6f1e6", 16));

  const rawKey = uiSettings.keybinds[action];
  // 核心更改：通过 getKeyDisplayName 转换，如 16 会被展示为 "SHIFT"
  const btnLabel = isBinding ? "请按下按键..." : `[ ${getKeyDisplayName(rawKey)} ]`;

  const keyBtn = createRectangleButton(
    scene,
    width - 158,
    6,
    140,
    height - 12,
    btnLabel,
    onStartBinding,
    { accent: isBinding ? 0xffcf6e : 0x5c7185 }
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