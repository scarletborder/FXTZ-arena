import Phaser from "phaser";

import { BattleScene } from "./battle-scene";
import { BattleStartScene, CodexScene, HomeScene, LoadingScene, LocalLanScene, ManualScene, ResultScene, RoomListScene, RoomLobbyScene, SelectScene, SettingsScene, StoryLoadoutScene, StoryProgressScene, StoryResultScene, StoryStartLoadoutScene, UdpConnectScene, ReplayRecordScene, ReplayPlaybackScene, SpectatorLoadingScene } from "./menu";
import { installDesktopConsoleLogger } from "./platform/desktop-console-log";
import { prepareResourcePackSource } from "./utils/resource-pack";
import "./styles.css";

installDesktopConsoleLogger();

void bootstrap();

async function bootstrap(): Promise<void> {
  await prepareResourcePackSource().catch((error) => {
    console.warn("Resource pack cache unavailable:", error);
  });

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: 1280,
    height: 720,
    backgroundColor: "#101820",
    scene: [HomeScene, BattleStartScene, RoomListScene, RoomLobbyScene, LocalLanScene, UdpConnectScene, SelectScene, StoryStartLoadoutScene, StoryProgressScene, StoryLoadoutScene, LoadingScene, SpectatorLoadingScene, BattleScene, ResultScene, StoryResultScene, CodexScene, ManualScene, SettingsScene, ReplayRecordScene, ReplayPlaybackScene],
    dom: {
      createContainer: true,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });
}
