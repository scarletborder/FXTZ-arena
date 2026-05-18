import Phaser from "phaser";

import { createBackButton, createFightButton, createTextField, drawFightingBackdrop, drawPanel, bodyStyle, headingStyle } from "./ui";
import { uiSettings, type SceneKey, type TextFieldControl } from "./shared";

export class SettingsScene extends Phaser.Scene {
  private activeField: TextFieldControl | undefined;
  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.activeField?.handleKey(event);
  };

  constructor() {
    super("settings" satisfies SceneKey);
  }

  create(): void {
    drawFightingBackdrop(this, "OPTIONS", "SYSTEM");
    createBackButton(this);
    this.add.text(90, 74, "设置", headingStyle(42));

    drawPanel(this, 74, 150, 354, 448, "通用");
    drawPanel(this, 462, 150, 354, 448, "联机");
    drawPanel(this, 850, 150, 354, 448, "关于");

    this.add.text(104, 214, "用户名", bodyStyle("#f6f1e6", 18));
    this.createField(104, 252, 276, "username");

    const debugText = this.add.text(104, 358, "", bodyStyle("#d7e3ef", 18));
    const updateDebug = () => {
      debugText.setText(uiSettings.debug ? "debug 模式：开启" : "debug 模式：关闭");
    };
    updateDebug();
    createFightButton(this, 242, 432, 250, 54, "切换 debug", () => {
      uiSettings.debug = !uiSettings.debug;
      updateDebug();
    }, { accent: 0xf7b733 });

    this.add.text(492, 214, "专用服务器地址", bodyStyle("#f6f1e6", 18));
    this.createField(492, 252, 276, "serverAddress");
    this.add.text(492, 356, "默认监听本地专用服务器", bodyStyle("#b7c7d8", 17));
    this.add.text(492, 396, "默认端口：22334", bodyStyle("#b7c7d8", 17));
    this.add.text(492, 436, "连接状态：未连接 / 本地待机", bodyStyle("#ffcf6e", 17));

    this.add.text(880, 214, "staff", bodyStyle("#f6f1e6", 19));
    this.add.text(880, 258, "Design / Code: fxtz-arena team\nUI Scene M5: Phaser only", bodyStyle("#d7e3ef", 17)).setLineSpacing(10);
    this.add.text(880, 386, "项目网址", bodyStyle("#f6f1e6", 19));
    this.add.text(880, 430, "https://github.com/", bodyStyle("#9fd8ff", 17));

    this.input.keyboard?.on("keydown", this.onKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown", this.onKeyDown);
      this.activeField = undefined;
    });
  }

  private createField(x: number, y: number, width: number, key: "username" | "serverAddress"): void {
    const field = createTextField(this, x, y, width, {
      value: uiSettings[key],
      onChange: (value) => {
        uiSettings[key] = value;
      },
    });
    field.hitArea.on("pointerdown", () => {
      this.activeField?.setActive(false);
      this.activeField = field;
      field.setActive(true);
    });
  }
}
