import Phaser from "phaser";
import type { BattleSceneData, BattleLoadouts } from "./loadout";
import type { PlayerId } from "@repo/types";
import { BattleEvents } from "@repo/constants";
import { uiSettings } from "../store/settings";
import {
  resolveDisplayedBattleResult,
  resolveResultWinnerName,
  resolveWinnerPlayerId,
} from "./utils/result";
import { advanceStoryAfterBattle } from "../story/state";
import type { StoryProgressData, StoryResultData } from "../story/types";
import { createResultPlayerSummary } from "./utils/battle-helpers";
import type { ReplayFile } from "../replay/types";

export class BattleResultHandler {
  private resultScheduled = false;

  constructor(
    private scene: Phaser.Scene,
    private sceneData: BattleSceneData,
    private getState: () => any,
    private getLocalFighterKey: () => "Player1" | "Player2",
    private getLocalPlayerId: () => PlayerId | null,
    private getFinalDebugHashes: () =>
      | { finalGlobalHash: string | null; finalGlobalInputHash: string | null }
      | undefined,
    private getReplayRecorder: () => any,
  ) {
    this.scene.events.on(
      BattleEvents.GO_TO_ONLINE_RESULT,
      this.goToOnlineResult,
      this,
    );
    this.scene.events.on(BattleEvents.GO_TO_RESULT, this.goToResult, this);
    this.scene.events.on(
      BattleEvents.GO_TO_STORY_RESULT,
      this.goToStoryResult,
      this,
    );

    // 监听 UI 层发出的返回/重试事件
    this.scene.events.on(
      BattleEvents.RESTART_LOCAL,
      this.restartLocalBattle,
      this,
    );
    this.scene.events.on(BattleEvents.MAIN_MENU, this.returnToMainMenu, this);
  }

  isResultScheduled(): boolean {
    return this.resultScheduled;
  }

  private returnToMainMenu(): void {
    this.scene.scene.start("home");
  }

  private restartLocalBattle(): void {
    if (this.sceneData.story) {
      this.scene.scene.start("story-progress", {
        state: this.sceneData.story.state,
      } satisfies StoryProgressData);
      return;
    }
    if (this.sceneData.mode === "training") {
      return;
    }
    this.scene.scene.start("loading", {
      ...this.sceneData,
      mode: this.sceneData.mode ?? "ai",
      runtime: undefined,
      p2p: undefined,
      battleZeroTimeMs: undefined,
    } satisfies BattleSceneData);
  }

  private goToOnlineResult(
    winnerPlayerId: PlayerId,
    serverConfirmedFrame?: number,
  ): void {
    if (this.resultScheduled) return;
    this.resultScheduled = true;

    const winnerSlot = this.resolveReplayWinnerPlayerId(winnerPlayerId);
    this.scene.events.emit(BattleEvents.END_REPLAY, winnerSlot);
    this.scene.events.emit(
      BattleEvents.PRINT_DEBUG_HASH_BUNDLE,
      winnerPlayerId,
      serverConfirmedFrame,
    );

    this.scene.scene.start("result", this.createResultData(winnerPlayerId));
  }

  private goToResult(): void {
    if (this.resultScheduled) return;
    this.resultScheduled = true;

    this.scene.events.emit(
      BattleEvents.PRINT_DEBUG_HASH_BUNDLE,
      null,
      undefined,
    );

    if (this.sceneData.story) {
      this.goToStoryResult();
      return;
    }

    const winnerSlot = this.resolveReplayWinnerPlayerId(null);
    this.scene.events.emit(BattleEvents.END_REPLAY, winnerSlot);

    this.scene.scene.start("result", this.createResultData(null));
  }

  private goToStoryResult(forceWon?: boolean): void {
    const story = this.sceneData.story;
    if (!story) return;

    this.resultScheduled = true;
    const state = this.getState();
    const player = state.player;
    const target = state.target;
    const won = forceWon ?? target.deaths > player.deaths;

    const nextState = advanceStoryAfterBattle(story.state, {
      lives: player.lives,
      bombs: player.bombs,
      shots: player.shotsFired,
      bombUses: player.bombUses,
      hitsTaken: player.hitsTaken,
      won,
    });

    if (won) {
      this.scene.events.emit(BattleEvents.END_REPLAY, "Player1");
      this.scene.scene.start("story-progress", {
        state: nextState,
        fromBattle: true,
        clearedStageIndex: story.stageIndex,
      } satisfies StoryProgressData);
      return;
    }

    const winnerSlot = this.resolveReplayWinnerPlayerId(null);
    this.scene.events.emit(BattleEvents.END_REPLAY, winnerSlot);
    const replay = this.buildStoryReplayFile();

    this.scene.scene.start("story-result", {
      story: story.story,
      state: nextState,
      success: false,
      replay,
    } satisfies StoryResultData);
  }

  private createResultData(winnerPlayerId: PlayerId | null) {
    const localPlayerName =
      this.sceneData.playerName ?? uiSettings.username ?? "Player";
    const opponentName =
      this.sceneData.opponentName ??
      (this.sceneData.mode === "online" || this.sceneData.mode === "local"
        ? "Opponent"
        : "CPU");

    const localFighterKey = this.getLocalFighterKey();
    const state = this.getState();
    const localFighterState =
      localFighterKey === "Player1" ? state.player : state.target;
    const opponentFighterState =
      localFighterKey === "Player1" ? state.target : state.player;

    const debugHashes = this.getFinalDebugHashes();
    const winnerSlot = this.resolveReplayWinnerPlayerId(winnerPlayerId);
    const replay = this.buildNormalReplayFile(winnerSlot);
    const battleResult = resolveDisplayedBattleResult({
      battleResult: state.result,
      battleMode: this.sceneData.battleMode ?? "versus",
      winnerPlayerId,
    });

    return {
      winnerName: resolveResultWinnerName({
        winnerPlayerId,
        localPlayerId: this.getLocalPlayerId(),
        localPlayerName,
        opponentName,
        playerDeaths: state.player.deaths,
        targetDeaths: state.target.deaths,
      }),
      battleResult,
      durationSeconds: state.stats.elapsedTicks / 60,
      players: [
        createResultPlayerSummary(localPlayerName, localFighterState),
        createResultPlayerSummary(opponentName, opponentFighterState),
      ] as const,
      returnScene: this.sceneData.returnScene ?? "battle-start",
      debugHashes,
      replay,
    };
  }

  private buildNormalReplayFile(
    winnerPlayerId: "Player1" | "Player2",
  ): ReplayFile | undefined {
    const recorder = this.getReplayRecorder();
    if (!recorder || !this.sceneData.loadouts) return undefined;
    return recorder.finalize({
      title: `${this.sceneData.playerName ?? "Player"} vs ${this.sceneData.opponentName ?? "Opponent"}`,
      mode:
        this.sceneData.mode === "ai" || this.sceneData.mode === "training"
          ? "ai"
          : this.sceneData.mode === "online" || this.sceneData.mode === "local"
            ? "online"
            : "ai",
      player1Id: this.sceneData.playerName ?? "Player",
      player2Id: this.sceneData.opponentName ?? "Opponent",
      winnerPlayerId,
      finalGlobalInputHash:
        this.getFinalDebugHashes()?.finalGlobalInputHash ?? null,
      loadouts: this.sceneData.loadouts,
    });
  }

  private buildStoryReplayFile(): ReplayFile | undefined {
    const recorder = this.getReplayRecorder();
    if (!recorder || !this.sceneData.story) return undefined;
    const storyCtx = this.sceneData.story;
    const stage = storyCtx.story.stages[storyCtx.stageIndex];
    const fallback: BattleLoadouts = {
      player: { primaryCharacterId: "reimu", alternateCharacterId: "marisa" },
      target: { primaryCharacterId: "sakuya", alternateCharacterId: "cirno" },
    };
    return recorder.finalize({
      title: `${storyCtx.story.title} - ${stage?.title ?? "Stage"}`,
      mode: "story",
      difficulty: storyCtx.state.difficulty,
      player1Id: this.sceneData.playerName ?? uiSettings.username ?? "Player",
      player2Id: this.sceneData.opponentName ?? "CPU",
      winnerPlayerId: this.resolveReplayWinnerPlayerId(null),
      finalGlobalInputHash:
        this.getFinalDebugHashes()?.finalGlobalInputHash ?? null,
      loadouts: this.sceneData.loadouts ?? fallback,
    });
  }

  private resolveReplayWinnerPlayerId(
    winnerPlayerId: PlayerId | null,
  ): "Player1" | "Player2" {
    const state = this.getState();
    return resolveWinnerPlayerId({
      winnerPlayerId,
      localPlayerId: this.getLocalPlayerId() ?? "Player1",
      playerDeaths: state.player.deaths,
      targetDeaths: state.target.deaths,
    });
  }
}
