import Phaser from "phaser";

import { BattleScene } from "./battle-scene";
import { BattleStartScene, CodexScene, HomeScene, LoadingScene, ResultScene, SelectScene, SettingsScene } from "./menu";
import "./styles.css";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 720,
  backgroundColor: "#101820",
  scene: [HomeScene, BattleStartScene, SelectScene, LoadingScene, BattleScene, ResultScene, CodexScene, SettingsScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
