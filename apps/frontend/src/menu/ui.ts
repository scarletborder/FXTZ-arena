import Phaser from "phaser";
import type { AbilityCardDefinition, CharacterDefinition } from "@repo/content";
import { APP_BUILD_LABEL } from "@repo/constants";

import type { CardTileControl, CharacterTileControl, FightButton, TextFieldControl } from "./shared";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
const FONT = "Arial, 'Microsoft YaHei', sans-serif";

interface FightButtonOptions {
  readonly enabled?: boolean;
  readonly subLabel?: string;
  readonly accent?: number;
}

interface TextFieldOptions {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly maxLength?: number;
  readonly onFocus?: (field: TextFieldControl) => void;
}

interface EntryTileOptions {
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly subtitle: string;
  readonly badge: string;
  readonly selected: boolean;
  readonly accent?: number;
  readonly onClick: () => void;
  readonly drawIcon: (target: Phaser.GameObjects.Container) => void;
}

interface EntryTileControl {
  readonly container: Phaser.GameObjects.Container;
  readonly hitArea: Phaser.GameObjects.Rectangle;
  readonly width: number;
  readonly height: number;
  setSelected(selected: boolean): void;
  setHovered(hovered: boolean): void;
}

let activeTextField: TextFieldControl | undefined;

export function createFightButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  onClick?: () => void,
  options: FightButtonOptions = {},
): FightButton {
  let enabled = options.enabled ?? true;
  let hovered = false;
  const accent = options.accent ?? 0xe33d44;
  const container = scene.add.container(x - width / 2, y - height / 2);
  const background = scene.add.graphics();
  const labelText = scene.add.text(width / 2, options.subLabel ? height / 2 - 9 : height / 2, nonEmptyText(label), {
    fontFamily: FONT,
    fontSize: "22px",
    fontStyle: "700",
    color: enabled ? "#f6f1e6" : "#7f8994",
  }).setOrigin(0.5);
  const subText = options.subLabel
    ? scene.add.text(width / 2, height / 2 + 18, options.subLabel, bodyStyle(enabled ? "#b7c7d8" : "#68717b", 13)).setOrigin(0.5)
    : undefined;
  const hitArea = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: enabled });

  const redraw = () => {
    background.clear();
    const fill = enabled ? (hovered ? 0x252e3d : 0x151b26) : (hovered ? 0x373d46 : 0x2b2f36);
    const stroke = enabled ? (hovered ? 0xffcf6e : accent) : (hovered ? 0x8a919b : 0x656a72);
    drawAngledPanel(background, 0, 0, width, height, fill, stroke, enabled ? 0.98 : 0.72);
    background.lineStyle(3, stroke, enabled ? 1 : 0.45);
    background.lineBetween(18, height - 7, width - 20, height - 7);
    labelText.setColor(enabled ? (hovered ? "#ffffff" : "#f6f1e6") : (hovered ? "#a7afb8" : "#7f8994"));
    subText?.setColor(enabled ? "#b7c7d8" : (hovered ? "#87909a" : "#68717b"));
  };

  hitArea.on("pointerover", () => {
    hovered = true;
    redraw();
  });
  hitArea.on("pointerout", () => {
    hovered = false;
    redraw();
  });
  hitArea.on("pointerdown", () => {
    if (enabled) {
      redraw();
    }
  });
  hitArea.on("pointerup", () => {
    if (enabled) {
      onClick?.();
    }
  });

  container.add([background, labelText, hitArea]);
  if (subText) {
    container.add(subText);
  }
  redraw();

  return {
    container,
    setEnabled(nextEnabled: boolean): void {
      enabled = nextEnabled;
      hitArea.disableInteractive();
      hitArea.setInteractive({ useHandCursor: enabled });
      redraw();
    },
    setLabel(nextLabel: string): void {
      if (!labelText.active || !labelText.scene) {
        return;
      }
      labelText.setText(nonEmptyText(nextLabel));
    },
  };
}

function nonEmptyText(text: string): string {
  return text.length > 0 ? text : " ";
}

export function createSmallTab(scene: Phaser.Scene, x: number, y: number, label: string, active: boolean, onClick: () => void, width = 92): FightButton {
  return createFightButton(scene, x, y, width, 34, label, onClick, { accent: active ? 0xffcf6e : 0x5c7185 });
}

export function createBackButton(scene: Phaser.Scene, target: string = "home"): void {
  createFightButton(scene, 1138, 62, 160, 44, "返回", () => scene.scene.start(target), { accent: 0x5c7185 });
}

export function createTextField(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  options: TextFieldOptions,
): TextFieldControl {
  const container = scene.add.container(x, y);
  const background = scene.add.graphics();
  const label = scene.add.text(16, 12, options.value, bodyStyle("#f6f1e6", 17)).setWordWrapWidth(width - 30);
  const hitArea = scene.add.rectangle(0, 0, width, 46, 0xffffff, 0.001)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: true });
  let active = false;
  let value = options.value;
  let cursorIndex = value.length;
  const maxLength = options.maxLength ?? 42;
  const domEvents = "input focusin focusout keydown keyup click pointerdown touchstart mouseup touchend select";
  const domElement = scene.add.dom(0, 0).createFromHTML('<input name="textField" type="text" />').setOrigin(0, 0);
  const nativeInput = domElement.getChildByName("textField") as HTMLInputElement | null;
  let cleanedUp = false;

  if (!nativeInput) {
    throw new Error("Failed to create text field DOM input.");
  }

  nativeInput.value = value;
  nativeInput.maxLength = maxLength;
  nativeInput.autocomplete = "off";
  nativeInput.spellcheck = false;
  nativeInput.setAttribute("autocapitalize", "none");
  nativeInput.setAttribute("aria-label", "text input");
  Object.assign(nativeInput.style, {
    width: `${width}px`,
    height: "46px",
    boxSizing: "border-box",
    border: "0",
    outline: "0",
    margin: "0",
    padding: "0 14px",
    background: "transparent",
    color: "transparent",
    caretColor: "transparent",
    opacity: "0.01",
    font: `16px ${FONT}`,
    pointerEvents: "auto",
  } satisfies Partial<CSSStyleDeclaration>);

  const redraw = () => {
    background.clear();
    drawAngledPanel(background, 0, 0, width, 46, active ? 0x151b26 : 0x0f141d, active ? 0xffcf6e : 0x5c7185, 1);
    label.setColor(active ? "#ffcf6e" : "#f6f1e6");
    const displayValue = active
      ? `${value.slice(0, cursorIndex)}_${value.slice(cursorIndex)}`
      : value;
    label.setText(displayValue);
  };

  const syncNativeInput = () => {
    if (nativeInput.value !== value) {
      nativeInput.value = value;
    }
    nativeInput.setSelectionRange(cursorIndex, cursorIndex);
  };

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    domElement.removeListener(domEvents);
    domElement.off("focusin", onDomFocusIn);
    domElement.off("focusout", onDomFocusOut);
    domElement.off("input", onDomInput);
    domElement.off("keydown", onDomKeyDown);
    domElement.off("keyup", updateCursorFromDom);
    domElement.off("click", onDomPointerFocus);
    domElement.off("pointerdown", onDomPointerFocus);
    domElement.off("touchstart", onDomPointerFocus);
    domElement.off("mouseup", updateCursorFromDom);
    domElement.off("touchend", updateCursorFromDom);
    domElement.off("select", updateCursorFromDom);
    if (activeTextField === control) {
      activeTextField = undefined;
    }
  };

  const setActive = (nextActive: boolean) => {
    if (nextActive && activeTextField && activeTextField !== control) {
      activeTextField.setActive(false);
    }
    const wasActive = active;
    active = nextActive;
    if (nextActive) {
      activeTextField = control;
      if (!wasActive) {
        options.onFocus?.(control);
      }
    } else if (activeTextField === control) {
      activeTextField = undefined;
    }
    if (!nextActive && nativeInput === document.activeElement) {
      nativeInput.blur();
    }
    redraw();
  };

  const applyNativeValue = () => {
    value = nativeInput.value.slice(0, maxLength);
    if (nativeInput.value !== value) {
      nativeInput.value = value;
    }
    cursorIndex = nativeInput.selectionStart ?? value.length;
    options.onChange(value);
    redraw();
  };

  const updateCursorFromDom = () => {
    cursorIndex = nativeInput.selectionStart ?? value.length;
    redraw();
  };

  const focusNativeInput = () => {
    nativeInput.focus({ preventScroll: true });
    syncNativeInput();
  };

  const onDomFocusIn = () => {
    setActive(true);
    syncNativeInput();
  };
  const onDomFocusOut = () => {
    setActive(false);
  };
  const onDomInput = () => {
    applyNativeValue();
  };
  const onDomKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === "Escape") {
      nativeInput.blur();
    }
  };
  const onDomPointerFocus = () => {
    setActive(true);
    focusNativeInput();
  };

  const control: TextFieldControl = {
    container,
    hitArea,
    setValue(nextValue: string): void {
      value = nextValue.slice(0, maxLength);
      cursorIndex = value.length;
      syncNativeInput();
      options.onChange(value);
      redraw();
    },
    setActive,
    focus(): void {
      focusNativeInput();
    },
    blur(): void {
      nativeInput.blur();
    },
    handleKey(event: KeyboardEvent): void {
      if (!active || document.activeElement instanceof HTMLInputElement) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key === "Backspace") {
        if (cursorIndex > 0) {
          value = `${value.slice(0, cursorIndex - 1)}${value.slice(cursorIndex)}`;
          cursorIndex -= 1;
        }
      } else if (event.key === "ArrowLeft") {
        cursorIndex = Math.max(0, cursorIndex - 1);
      } else if (event.key === "ArrowRight") {
        cursorIndex = Math.min(value.length, cursorIndex + 1);
      } else if (event.key.length === 1 && value.length < maxLength) {
        value = `${value.slice(0, cursorIndex)}${event.key}${value.slice(cursorIndex)}`;
        cursorIndex += event.key.length;
      }
      syncNativeInput();
      options.onChange(value);
      redraw();
    },
    handlePaste(text: string): void {
      if (!active || text.length === 0 || document.activeElement instanceof HTMLInputElement) {
        return;
      }
      const nextValue = `${value.slice(0, cursorIndex)}${text}${value.slice(cursorIndex)}`.slice(0, maxLength);
      cursorIndex = Math.min(cursorIndex + text.length, nextValue.length);
      value = nextValue;
      syncNativeInput();
      options.onChange(value);
      redraw();
    },
  };

  hitArea.on("pointerdown", () => {
    setActive(true);
    focusNativeInput();
  });
  hitArea.on("pointerover", () => {
    if (!active) {
      background.clear();
      drawAngledPanel(background, 0, 0, width, 46, 0x121822, 0x7f8994, 1);
    }
  });
  hitArea.on("pointerout", () => {
    redraw();
  });

  container.add([background, label, domElement, hitArea]);
  domElement.addListener(domEvents);
  domElement.on("focusin", onDomFocusIn);
  domElement.on("focusout", onDomFocusOut);
  domElement.on("input", onDomInput);
  domElement.on("keydown", onDomKeyDown);
  domElement.on("keyup", updateCursorFromDom);
  domElement.on("click", onDomPointerFocus);
  domElement.on("pointerdown", onDomPointerFocus);
  domElement.on("touchstart", onDomPointerFocus);
  domElement.on("mouseup", updateCursorFromDom);
  domElement.on("touchend", updateCursorFromDom);
  domElement.on("select", updateCursorFromDom);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  container.once("destroy", cleanup);
  redraw();

  return control;
}

export function drawFightingBackdrop(scene: Phaser.Scene, word: string, subWord: string): void {
  const graphics = scene.add.graphics();
  graphics.fillGradientStyle(0x0a0e14, 0x101820, 0x15171d, 0x0a0e14, 1);
  graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  graphics.lineStyle(1, 0x273548, 0.36);
  for (let x = -240; x < GAME_WIDTH + 260; x += 42) {
    graphics.lineBetween(x, GAME_HEIGHT, x + 320, 0);
  }
  graphics.fillStyle(0xe33d44, 0.2);
  graphics.fillTriangle(0, 128, 360, 90, 0, 214);
  graphics.fillStyle(0x26c6da, 0.14);
  graphics.fillTriangle(GAME_WIDTH, 520, 840, 650, GAME_WIDTH, 684);
  scene.add.text(720, 62, word, {
    fontFamily: FONT,
    fontSize: "92px",
    fontStyle: "900",
    color: "#ffffff",
  }).setOrigin(0.5).setAlpha(0.055);
  scene.add.text(722, 136, subWord, {
    fontFamily: FONT,
    fontSize: "34px",
    fontStyle: "900",
    color: "#ffffff",
  }).setOrigin(0.5).setAlpha(0.07);
}

export function drawTitleBlock(scene: Phaser.Scene, title: string, subtitle: string): void {
  scene.add.text(640, 114, title, {
    fontFamily: FONT,
    fontSize: "66px",
    fontStyle: "900",
    color: "#f6f1e6",
  }).setOrigin(0.5);
  scene.add.text(640, 182, subtitle, bodyStyle("#ffcf6e", 22)).setOrigin(0.5);
}

export function drawBuildLabel(scene: Phaser.Scene, x = GAME_WIDTH - 26, y = GAME_HEIGHT - 22): Phaser.GameObjects.Text {
  return scene.add.text(x, y, APP_BUILD_LABEL, {
    ...bodyStyle("#9fb4c8", 15),
    align: "right",
  }).setOrigin(1, 1).setAlpha(0.82);
}

export function drawPanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, title: string): void {
  const graphics = scene.add.graphics();
  drawAngledPanel(graphics, x, y, width, height, 0x101820, 0x34475c, 0.88);
  if (title) {
    scene.add.text(x + 26, y + 18, title, bodyStyle("#ffcf6e", 18));
  }
}

export function drawPanelToLayer(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, x: number, y: number, width: number, height: number, title: string): void {
  const graphics = scene.add.graphics();
  drawAngledPanel(graphics, x, y, width, height, 0x101820, 0x34475c, 0.88);
  layer.add(graphics);
  if (title) {
    layer.add(scene.add.text(x + 24, y + 18, title, bodyStyle("#ffcf6e", 17)));
  }
}

export function drawAngledPanel(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, fill: number, stroke: number, alpha: number): void {
  const cut = Math.min(22, width * 0.16, height * 0.4);
  const points = [
    new Phaser.Geom.Point(x + cut, y),
    new Phaser.Geom.Point(x + width, y),
    new Phaser.Geom.Point(x + width - cut, y + height),
    new Phaser.Geom.Point(x, y + height),
  ];
  graphics.fillStyle(fill, alpha).fillPoints(points, true);
  graphics.lineStyle(2, stroke, alpha).strokePoints(points, true);
}

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

export function createPreviewArena(scene: Phaser.Scene, x: number, y: number, title: string, draw: (target: Phaser.GameObjects.Container) => void): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const graphics = scene.add.graphics();
  drawAngledPanel(graphics, 0, 0, 508, 220, 0x0f141d, 0x34475c, 0.98);
  graphics.lineStyle(1, 0x273548, 0.55);
  for (let row = 0; row < 5; row += 1) {
    graphics.lineBetween(28, 36 + row * 36, 478, 36 + row * 36);
  }
  container.add(graphics);
  container.add(scene.add.text(24, 20, title, bodyStyle("#ffcf6e", 18)));
  draw(container);
  return container;
}

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
    title: character.name,
    subtitle: `cost${character.cost}`,
    badge: roleLabel(character.roleClass),
    selected,
    onClick,
    drawIcon: (target) => drawCharacterIcon(scene, target, 56, 38, 0.82),
  });
}

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
    subtitle: `${card.kind === "active" ? "主动" : "被动"} cost${card.cost}`,
    badge: card.kind === "active" ? "主动使用" : "被动",
    selected,
    onClick,
    drawIcon: (target) => drawCardIcon(scene, target, 58, 34, card.kind, 0.76),
  });
}

export function createCodexTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  title: string,
  cost: number,
  tag: string,
  selected: boolean,
  drawIcon: (target: Phaser.GameObjects.Container) => void,
  onClick: () => void,
): CharacterTileControl {
  return createEntryTile(scene, x, y, {
    width: 164,
    height: 142,
    title,
    subtitle: `cost${cost}`,
    badge: tag,
    selected,
    onClick,
    drawIcon,
  });
}

function createEntryTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: EntryTileOptions,
): EntryTileControl {
  let selected = options.selected;
  let hovered = false;
  const container = scene.add.container(x - options.width / 2, y - options.height / 2);
  const background = scene.add.graphics();
  const hitArea = scene.add.rectangle(0, 0, options.width, options.height, 0xffffff, 0.001)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: true });
  const titleText = scene.add.text(options.width / 2, options.height - 40, options.title, bodyStyle("#f6f1e6", options.width === 164 ? 15 : 14)).setOrigin(0.5);
  const subtitleText = scene.add.text(options.width / 2, options.height - 20, options.subtitle, bodyStyle("#ffcf6e", options.width === 164 ? 13 : 12)).setOrigin(0.5);
  const badgeText = scene.add.text(options.width / 2, 16, options.badge, bodyStyle("#9fb4c8", 12)).setOrigin(0.5);
  const draw = () => {
    background.clear();
    const fill = selected ? 0x263244 : hovered ? 0x18212d : 0x151b26;
    const stroke = selected ? 0xffcf6e : hovered ? (options.accent ?? 0x5c7185) : 0x34475c;
    drawAngledPanel(background, 0, 0, options.width, options.height, fill, stroke, 1);
    badgeText.setColor(selected ? "#ffcf6e" : hovered ? "#d7e3ef" : "#9fb4c8");
    titleText.setColor(selected ? "#ffffff" : "#f6f1e6");
    subtitleText.setColor(selected ? "#ffcf6e" : hovered ? "#d7e3ef" : "#ffcf6e");
  };
  const iconLayer = scene.add.container(0, 0);
  options.drawIcon(iconLayer);
  container.add([background, iconLayer, badgeText, titleText, subtitleText, hitArea]);
  hitArea.on("pointerover", () => {
    hovered = true;
    draw();
  });
  hitArea.on("pointerout", () => {
    hovered = false;
    draw();
  });
  hitArea.on("pointerdown", () => {
    draw();
  });
  hitArea.on("pointerup", () => {
    options.onClick();
  });
  draw();
  return {
    container,
    hitArea,
    width: options.width,
    height: options.height,
    setSelected(nextSelected: boolean): void {
      selected = nextSelected;
      draw();
    },
    setHovered(nextHovered: boolean): void {
      hovered = nextHovered;
      draw();
    },
  };
}

export function drawCharacterIcon(scene: Phaser.Scene, target: Phaser.GameObjects.Container, x: number, y: number, scale = 1): void {
  const graphics = scene.add.graphics();
  graphics.fillStyle(0xe33d44, 1).fillTriangle(x, y - 34 * scale, x - 30 * scale, y + 28 * scale, x + 34 * scale, y + 24 * scale);
  graphics.lineStyle(4 * scale, 0xf6f1e6, 1).strokeCircle(x, y + 6 * scale, 8 * scale);
  graphics.lineStyle(3 * scale, 0x101820, 0.9).lineBetween(x - 22 * scale, y + 12 * scale, x + 26 * scale, y - 12 * scale);
  target.add(graphics);
}

export function drawCardIcon(scene: Phaser.Scene, target: Phaser.GameObjects.Container, x: number, y: number, kind: AbilityCardDefinition["kind"], scale = 1): void {
  const graphics = scene.add.graphics();
  graphics.fillStyle(kind === "active" ? 0x26c6da : 0xf7b733, 1).fillCircle(x, y, 25 * scale);
  graphics.lineStyle(3 * scale, 0xf6f1e6, 1).strokeCircle(x, y, 17 * scale);
  graphics.lineStyle(3 * scale, 0x101820, 0.75).lineBetween(x - 20 * scale, y, x + 20 * scale, y);
  graphics.lineBetween(x, y - 20 * scale, x, y + 20 * scale);
  target.add(graphics);
}

function roleLabel(role: CharacterDefinition["roleClass"]): string {
  return {
    assault: "突击",
    suppress: "压制",
    scout: "侦察",
    sniper: "狙击",
  }[role];
}
