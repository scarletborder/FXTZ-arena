import Phaser from "phaser";

import { BattleScene } from "./battle-scene";
import { BattleStartScene, CodexScene, HomeScene, LoadingScene, LocalLanScene, ResultScene, RoomListScene, RoomLobbyScene, SelectScene, SettingsScene, UdpConnectScene } from "./menu";
import { installDesktopConsoleLogger } from "./platform/desktop-console-log";
import "./styles.css";

installDesktopConsoleLogger();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 720,
  backgroundColor: "#101820",
  scene: [HomeScene, BattleStartScene, RoomListScene, RoomLobbyScene, LocalLanScene, UdpConnectScene, SelectScene, LoadingScene, BattleScene, ResultScene, CodexScene, SettingsScene],
  dom: {
    createContainer: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
