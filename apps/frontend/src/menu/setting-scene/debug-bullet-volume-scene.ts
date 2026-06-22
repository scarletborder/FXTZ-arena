import Phaser from "phaser";
import { BULLET_ASSET_METRICS } from "@repo/content";
import { assetUrl } from "../../utils/assets";

interface BulletConfigEntry {
  readonly id: string;
  readonly source: string;
  readonly rect: readonly [number, number, number, number];
  readonly hit_box: readonly [number, number | "full"];
  readonly offset: readonly (readonly [number, number])[];
}

interface BulletConfigJson {
  readonly bullet_config: readonly BulletConfigEntry[];
}

interface BulletEntry {
  container: Phaser.GameObjects.Container;
  speed: number;
  rectWidth: number;
  rectHeight: number;
}

export class DebugBulletVolumeScene extends Phaser.Scene {
  private paused = true;
  private bullets: BulletEntry[] = [];
  private pauseText?: Phaser.GameObjects.Text;

  constructor() {
    super("debug-bullet-volume");
  }

  preload(): void {
    this.load.json(
      "bullet-config",
      assetUrl("assets/bullet/bullet_config.json"),
    );
    for (const tex of ["bullet1", "bullet2", "bullet3", "bullet4", "bullet5"]) {
      if (!this.textures.exists(tex)) {
        this.load.image(tex, assetUrl(`assets/bullet/${tex}.png`));
      }
    }
  }

  create(): void {
    // Background
    this.add.rectangle(640, 360, 1280, 720, 0x101820);

    // Title bar
    this.add
      .text(640, 20, "调试弹幕体积 — Shift 切换暂停  ESC 退出", {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "18px",
        color: "#ffcf6e",
      })
      .setOrigin(0.5);

    this.pauseText = this.add
      .text(640, 48, "⏸ 暂停中", {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "15px",
        color: "#ff6b6b",
      })
      .setOrigin(0.5);

    // Input: ESC to exit
    this.input.keyboard?.on("keydown-ESC", () => {
      this.scene.start("settings");
    });

    // Input: Shift to toggle pause
    this.input.keyboard?.on("keydown-SHIFT", () => {
      this.paused = !this.paused;
      if (this.pauseText) {
        this.pauseText.setText(this.paused ? "⏸ 暂停中" : "▶ 播放中");
        this.pauseText.setColor(this.paused ? "#ff6b6b" : "#34d399");
      }
    });

    // Load bullet config and create bullet entries
    const config = this.cache.json.get("bullet-config") as
      | BulletConfigJson
      | undefined;
    if (!config) return;

    const bulletTypes = Object.keys(BULLET_ASSET_METRICS)
      .filter((k) => k.startsWith("bullet_type_"))
      .sort((a, b) => {
        const na = Number(a.split("_").pop());
        const nb = Number(b.split("_").pop());
        return na - nb;
      });

    const COLS = 6;
    const CELL_W = 200;
    const CELL_H = 120;
    const START_X = 110;
    const START_Y = 90;

    for (let i = 0; i < bulletTypes.length; i++) {
      const typeId = bulletTypes[i];
      const cfgEntry = config.bullet_config.find((c) => c.id === typeId);
      if (!cfgEntry) continue;

      const texture = this.textures.get(cfgEntry.source);
      if (!texture) continue;

      // Create frame for offset 0
      const frameKey = `${typeId}_offset_0`;
      const [rx, ry, rw, rh] = cfgEntry.rect;
      if (!texture.has(frameKey)) {
        texture.add(frameKey, 0, rx, ry, rw, rh);
      }

      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = START_X + col * CELL_W + CELL_W / 2;
      const cy = START_Y + row * CELL_H + rw / 2;

      const metrics = BULLET_ASSET_METRICS[typeId];
      const hitH =
        metrics?.hitHeight === "full"
          ? (metrics?.rectHeight ?? rh)
          : (metrics?.hitHeight ?? rh);
      const hitW = metrics?.hitWidth ?? rw;
      const offsetX = metrics?.CenterOffsetX ?? 0;
      const offsetY = metrics?.CenterOffsetY ?? 0;

      // Container for bullet + hitbox + label
      const container = this.add.container(cx, cy);

      // Bullet sprite offset by centerOffset (visual offset from physics body)
      const sprite = this.add.sprite(offsetX, offsetY, cfgEntry.source, frameKey);
      container.add(sprite);

      // Hitbox outline
      const hitGfx = this.add.graphics();
      hitGfx.lineStyle(1, 0xff6b6b, 0.7);
      hitGfx.strokeRect(-hitW / 2, -hitH / 2, hitW, hitH);
      container.add(hitGfx);

      // Label below the bullet
      const labelText = this.add
        .text(0, rw / 2 + 12, typeId.replace("bullet_type_", "#"), {
          fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
          fontSize: "12px",
          color: "#7c8ea0",
        })
        .setOrigin(0.5);
      container.add(labelText);

      this.bullets.push({
        container,
        speed: 1.5,
        rectWidth: rw,
        rectHeight: rh,
      });
    }
  }

  update(_time: number, _delta: number): void {
    if (this.paused) return;

    const arenaWidth = 1280;
    for (const bullet of this.bullets) {
      bullet.container.x += bullet.speed;
      // Wrap around when off-screen
      if (bullet.container.x > arenaWidth + bullet.rectWidth) {
        bullet.container.x = -bullet.rectWidth;
      }
    }
  }
}
