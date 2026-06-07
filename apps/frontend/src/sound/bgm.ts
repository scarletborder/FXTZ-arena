import Phaser from "phaser";

import BgmCmd, {
  type BgmCommand,
  type BgmPlayOptions,
} from "../commands/BgmCmd";

export interface BattleBgmBridge {
  pause(): void;
  resume(): void;
  dispose(): void;
}

export function installBattleBgmBridge(scene: Phaser.Scene): BattleBgmBridge {
  return new BattleBgmBridgeImpl(scene);
}

class BattleBgmBridgeImpl implements BattleBgmBridge {
  private bgm: Phaser.Sound.BaseSound | undefined;
  private bgmKey: string | undefined;
  private readonly unsubscribe: () => void;

  constructor(private readonly scene: Phaser.Scene) {
    this.unsubscribe = BgmCmd.subscribe((command) => this.handleCommand(command));
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dispose());
  }

  dispose(): void {
    this.unsubscribe();
    this.stop();
  }

  pause(): void {
    if (this.bgm?.isPlaying) {
      this.bgm.pause();
    }
  }

  resume(): void {
    if (this.bgm?.isPaused) {
      this.bgm.resume();
    }
  }

  private handleCommand(command: BgmCommand): void {
    switch (command.type) {
      case "play":
        this.play(command.key, command.options);
        return;
      case "stop":
      case "reset":
        this.stop();
        return;
    }
  }

  private play(key: string, options: BgmPlayOptions): void {
    if (this.bgmKey === key && this.bgm?.isPlaying) {
      return;
    }

    const entry = BgmCmd.getEntry(this.scene, key);
    if (!entry || !this.scene.cache.audio.exists(key)) {
      return;
    }

    this.stop();
    const bgm = this.scene.sound.add(key, {
      volume: options.volume,
    });

    bgm.addMarker({
      name: "intro",
      start: entry.introStart,
      duration: entry.loopEnd - entry.introStart,
      config: { loop: false },
    });
    bgm.addMarker({
      name: "loop",
      start: entry.loopStart,
      duration: entry.loopEnd - entry.loopStart,
      config: { loop: true },
    });
    bgm.on("complete", (sound: Phaser.Sound.BaseSound) => {
      if (currentMarkerName(sound) === "intro") {
        sound.play("loop");
      }
    });

    this.bgm = bgm;
    this.bgmKey = key;
    bgm.play("intro");
  }

  private stop(): void {
    if (!this.bgm) {
      this.bgmKey = undefined;
      return;
    }
    this.bgm.stop();
    this.bgm.destroy();
    this.bgm = undefined;
    this.bgmKey = undefined;
  }
}

function currentMarkerName(sound: Phaser.Sound.BaseSound): string | undefined {
  const marker = (sound as { readonly currentMarker?: { readonly name?: unknown } }).currentMarker;
  return typeof marker?.name === "string" ? marker.name : undefined;
}
