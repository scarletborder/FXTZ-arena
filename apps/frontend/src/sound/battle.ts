import Phaser from "phaser";

import AudioCmd, {
  type AudioCommand,
  type AudioPlayOptions,
} from "../commands/AudioCmd";

interface LoopingAudioInstance {
  readonly key: string;
  readonly sound: Phaser.Sound.BaseSound;
  expiresAt: number;
}

export interface BattleAudioBridge {
  dispose(): void;
}

const AUDIO_ALIASES: Readonly<Record<string, string>> = {
  se_power00: "se_power0",
  se_power01: "se_power1",
};

const AUDIO_SPRITE_KEY = "sfx";

export function installBattleAudioBridge(scene: Phaser.Scene): BattleAudioBridge {
  return new BattleAudioBridgeImpl(scene);
}

class BattleAudioBridgeImpl implements BattleAudioBridge {
  private readonly activeLoops = new Map<string, LoopingAudioInstance>();
  private readonly unsubscribe: () => void;

  constructor(private readonly scene: Phaser.Scene) {
    this.unsubscribe = AudioCmd.subscribe((command) => this.handleCommand(command));
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.sweepExpiredLoops, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dispose());
  }

  dispose(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.sweepExpiredLoops, this);
    this.unsubscribe();
    this.resetLoops();
  }

  private handleCommand(command: AudioCommand): void {
    switch (command.type) {
      case "play":
        this.play(command.key, command.options);
        return;
      case "unlock":
        return;
      case "reset":
        this.resetLoops();
        return;
    }
  }

  private play(key: string, options: AudioPlayOptions): void {
    const audioKey = resolveAudioKey(key);
    if (options.loop) {
      this.playLoop(audioKey, options);
      return;
    }
    if (!this.scene.cache.json.exists(AUDIO_SPRITE_KEY)) {
      return;
    }
    this.scene.sound.playAudioSprite(AUDIO_SPRITE_KEY, audioKey, {
      volume: options.volume,
      rate: options.rate,
      detune: options.detune,
      delay: options.delay,
      pan: options.pan,
    });
  }

  private playLoop(
    audioKey: string,
    options: AudioPlayOptions,
  ): void {
    if (!this.scene.cache.json.exists(AUDIO_SPRITE_KEY)) {
      return;
    }

    const groupKey = options.groupKey ?? audioKey;
    const holdMs = options.holdMs ?? 140;
    const expiresAt = this.scene.time.now + holdMs;
    const existing = this.activeLoops.get(groupKey);
    if (existing) {
      existing.expiresAt = expiresAt;
      if (existing.key === audioKey && existing.sound.isPlaying) {
        return;
      }
      this.stopLoop(groupKey, existing);
    }

    const sound = this.scene.sound.addAudioSprite(AUDIO_SPRITE_KEY);
    sound.play(audioKey, {
      loop: true,
      volume: options.volume,
      rate: options.rate,
      detune: options.detune,
      delay: options.delay,
      pan: options.pan,
    });
    this.activeLoops.set(groupKey, {
      key: audioKey,
      sound,
      expiresAt,
    });
  }

  private sweepExpiredLoops(): void {
    const now = this.scene.time.now;
    for (const [groupKey, instance] of this.activeLoops) {
      if (instance.expiresAt > now) {
        continue;
      }
      this.stopLoop(groupKey, instance);
    }
  }

  private resetLoops(): void {
    for (const [groupKey, instance] of this.activeLoops) {
      this.stopLoop(groupKey, instance);
    }
  }

  private stopLoop(groupKey: string, instance: LoopingAudioInstance): void {
    instance.sound.stop();
    instance.sound.destroy();
    this.activeLoops.delete(groupKey);
  }
}

function resolveAudioKey(key: string): string {
  return AUDIO_ALIASES[key] ?? key;
}
