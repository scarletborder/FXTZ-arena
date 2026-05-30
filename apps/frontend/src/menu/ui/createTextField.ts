import Phaser from "phaser";

import type { TextFieldControl } from "../shared";

import { bodyStyle } from "./styles";
import { drawAngledPanel } from "./drawAngledPanel";
import { FONT } from "./constants";

interface TextFieldOptions {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly maxLength?: number;
  readonly onFocus?: (field: TextFieldControl) => void;
}

let activeTextField: TextFieldControl | undefined;

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
    if (cleanedUp) {
      return;
    }
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
    if (cleanedUp) {
      return;
    }
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
    if (cleanedUp) {
      return;
    }
    value = nativeInput.value.slice(0, maxLength);
    if (nativeInput.value !== value) {
      nativeInput.value = value;
    }
    cursorIndex = nativeInput.selectionStart ?? value.length;
    options.onChange(value);
    redraw();
  };

  const updateCursorFromDom = () => {
    if (cleanedUp) {
      return;
    }
    cursorIndex = nativeInput.selectionStart ?? value.length;
    redraw();
  };

  const focusNativeInput = () => {
    if (cleanedUp) {
      return;
    }
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