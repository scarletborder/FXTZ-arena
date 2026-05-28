import Phaser from "phaser";

import { BattleScene } from "./battle-scene";
import { BattleStartScene, CodexScene, HomeScene, LoadingScene, ResultScene, RoomListScene, RoomLobbyScene, SelectScene, SettingsScene } from "./menu";
import "./styles.css";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 720,
  backgroundColor: "#101820",
  scene: [HomeScene, BattleStartScene, RoomListScene, RoomLobbyScene, SelectScene, LoadingScene, BattleScene, ResultScene, CodexScene, SettingsScene],
  dom: {
    createContainer: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
