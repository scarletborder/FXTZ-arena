import Phaser from "phaser";

import { BattleScene } from "./battle-scene";
import { BattleStartScene, BootstrapScene, CodexScene, ConfigureJoystickScene, ConfigureKeyboardScene, ConfigureVirtualJoyScene, DebugBulletVolumeScene, HomeScene, LoadingScene, LocalLanScene, ManualScene, ProfilesManageScene, ResultScene, RoomListScene, RoomLobbyScene, SelectScene, SettingsScene, StoryLoadoutScene, StoryProgressScene, StoryResultScene, StoryStartLoadoutScene, UdpConnectScene, ReplayRecordScene, ReplayPlaybackScene, SpectatorLoadingScene } from "./menu";
import { installDesktopConsoleLogger } from "./platform/desktop-console-log";
import "./styles.css";

installDesktopConsoleLogger();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 720,
  backgroundColor: "#101820",
  scene: [BootstrapScene, HomeScene, BattleStartScene, RoomListScene, RoomLobbyScene, LocalLanScene, UdpConnectScene, SelectScene, StoryStartLoadoutScene, StoryProgressScene, StoryLoadoutScene, LoadingScene, SpectatorLoadingScene, BattleScene, ResultScene, StoryResultScene, CodexScene, ManualScene, SettingsScene, ProfilesManageScene, ConfigureKeyboardScene, ConfigureJoystickScene, ConfigureVirtualJoyScene, DebugBulletVolumeScene, ReplayRecordScene, ReplayPlaybackScene],
  dom: {
    createContainer: true,
  },
  input: {
    gamepad: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
