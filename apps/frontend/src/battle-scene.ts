import Phaser from "phaser";
import { BattleEvents, GAME_HEIGHT, GAME_WIDTH, type ArenaBounds } from "@repo/constants";
import type { BattleSceneData } from "./battle/loadout";
import { BattleLayout, createBattleLayout, sameBattleLayout } from "./battle/view/layout";
import { BattleView } from "./battle/view";
import { createBattleViewModel } from "./battle/view/model";
import { installBattleAudioBridge, installBattleBgmBridge, type BattleAudioBridge, type BattleBgmBridge } from "./sound";
import { BattleAudioDirector } from "./battle/sfx/audio";
import BgmCmd from "./commands/BgmCmd";
import ConsoleCmd, { DebugHashRow } from "./commands/ConsoleCmd";

import { resolveArenaBounds } from "./battle/utils/battle-helpers";
import { BattleReplayManager } from "./battle/adapters/phaser/replay-controller";
import { BattleResultHandler } from "./battle/result-handler";
import { BattleInputController } from "./battle/input-controller";
import { BattleDebugController, type DebugPointSize } from "./battle/adapters/phaser/debug-controller";
import { BattleSession } from "./battle/session/battle-session";
import { PhaserBattleRollbackAdapter } from "./battle/adapters/phaser/rollback-adapter";
import { PhaserBattleNetworkHost } from "./battle/adapters/phaser/network-host";
import { createLocalCombatConnection } from "./network/combat/local-connection";
import { connectionManager } from "./menu/shared";
import { BattlePauseController } from "./battle/view/controller/BattlePauseController";
import { CollaborateShopController } from "./battle/view/controller/CollaborateShopController";
import { CollaborateTransitionController } from "./battle/view/controller/CollaborateTransitionController";

export class BattleScene extends Phaser.Scene {
  private view!: BattleView;
  private readonly audioDirector = new BattleAudioDirector();
  private battleAudioBridge: BattleAudioBridge | undefined;
  private battleBgmBridge: BattleBgmBridge | undefined;

  private battleSession!: BattleSession;
  private networkHost!: PhaserBattleNetworkHost;
  private rollbackFacade!: PhaserBattleRollbackAdapter;
  private replayMgr!: BattleReplayManager;
  private resultHandler!: BattleResultHandler;
  private inputCtrl!: BattleInputController;
  private debugCtrl!: BattleDebugController;

  private pauseCtrl!: BattlePauseController;
  private transitionCtrl!: CollaborateTransitionController;
  private shopCtrl!: CollaborateShopController;

  private battleLayout: BattleLayout | undefined;
  private arenaBounds!: ArenaBounds;
  private applyingBattleLayout = false;
  private pendingLayoutRefresh: Phaser.Time.TimerEvent | undefined;
  private rollbackVisualFrames = 0;
  private localSingleDevice = false;

  constructor() {
    super("battle");
  }

  preload(): void {}

  create(data: BattleSceneData = {}): void {
    this.arenaBounds = resolveArenaBounds(data.mapId ?? data.battleConfig?.mapId);
    this.applyingBattleLayout = false;
    this.rollbackVisualFrames = 0;
    this.localSingleDevice = data.localSingleDevice === true;

    // 1. 优先初始化输入控制器
    this.inputCtrl = new BattleInputController(this, data, this.arenaBounds);

    // 2. 初始化视口、音频和背景音乐布局
    this.applyBattleLayout(createBattleLayout(), true);
    this.battleAudioBridge = installBattleAudioBridge(this);
    this.battleBgmBridge = installBattleBgmBridge(this);
    BgmCmd.PlayMap(data.mapId ?? data.battleConfig?.mapId);

    this.input.setDefaultCursor(data.replayData || data.spectatorData ? "auto" : "none");
    this.input.mouse?.disableContextMenu();

    // 3. 初始化回放系统
    this.replayMgr = new BattleReplayManager(this, data);
    this.replayMgr.initialize(this.inputCtrl.getKeys(), this.battleBgmBridge);

    if (this.replayMgr.isReplayMode || this.replayMgr.isSpectatorMode) {
      ConsoleCmd.uninstall(this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdownBattleScene(), this);
      return;
    }

    this.rollbackFacade = new PhaserBattleRollbackAdapter(
      this,
      data,
      () => this.battleSession?.getRollbackHistory() ?? null,
      () => this.battleSession?.getRuntime().frame ?? 0,
      () => this.battleSession?.getConfirmedFrame(),
      () => this.debugCtrl?.getLiveHashEnabled() ?? false,
      () => this.audioDirector,
    );

    const networkEnabled = data.mode === "online" || (data.mode === "local" && !data.localSingleDevice);
    this.networkHost = new PhaserBattleNetworkHost(this, networkEnabled);
    this.battleSession = new BattleSession({
      sceneData: data,
      connection: data.mode === "local" ? createLocalCombatConnection() : connectionManager,
      networkHost: this.networkHost,
      output: this.rollbackFacade,
      input: {
        isLocked: () => this.debugCtrl?.isInputLocked() ?? false,
        create: (fighter, previousShotsFired) =>
          this.inputCtrl.generateInput(
            fighter,
            previousShotsFired,
            () => this.battleSession.getCurrentOutput()?.state?.collaborateExtra,
            this.battleSession?.localFighterKey() ?? "Player1",
            this.shopCtrl?.getPendingPurchaseItemId(),
            this.shopCtrl?.getPendingActiveCardSwitchId(),
            () => this.shopCtrl?.clearPending(),
          ),
        createTarget: (fighter, previousShotsFired) => {
          const input = this.inputCtrl.generateP2Input(fighter, previousShotsFired);
          if (!input) {
            throw new Error("Second-player input is unavailable");
          }
          return input;
        },
      },
      host: {
        isActive: () => this.scene.isActive(),
        recordInputFrame: (frame, player, target) => this.events.emit(BattleEvents.RECORD_FRAME, frame, player, target),
        shouldFinishBattle: () => Phaser.Input.Keyboard.JustDown(this.inputCtrl.getKeys().enter),
        finishBattle: () => this.events.emit(BattleEvents.GO_TO_RESULT),
        onRollback: () => {
          this.rollbackVisualFrames = 2;
        },
      },
    });
    this.events.on(BattleEvents.RESET_ACCUMULATOR, () => this.battleSession.resetAccumulator());

    // 执行物理超前赶进逻辑
    if (this.battleSession.isLogicReady() && data.battleZeroTimeMs !== undefined) {
      const elapsedMs = performance.now() - data.battleZeroTimeMs;
      this.battleSession.fastForward(elapsedMs, this.inputCtrl.getLastInput());
    }

    // 7. 初始化 UI 视图与模块管理器
    this.view = new BattleView(
      this,
      data.mode === "online" || data.mode === "local" ? "online" : (data.mode ?? "training"),
      data.mapId ?? data.battleConfig?.mapId,
      data.battleMode ?? data.battleConfig?.battleMode ?? "versus",
      { localSingleDevice: data.localSingleDevice === true },
    );

    this.pauseCtrl = new BattlePauseController(
      this,
      data,
      () => this.resultHandler.isResultScheduled(),
      () => this.events.emit(BattleEvents.RESET_ACCUMULATOR),
      this.battleBgmBridge,
      this.inputCtrl,
    );

    this.transitionCtrl = new CollaborateTransitionController(this, () => this.inputCtrl.getKeys());
    this.shopCtrl = new CollaborateShopController(this, () => this.inputCtrl.getKeys());

    // 【核心修复 3】安全保护结果处理器依赖
    this.resultHandler = new BattleResultHandler(
      this,
      data,
      () => this.battleSession.getCurrentOutput()?.state,
      () => this.battleSession?.localFighterKey() ?? "Player1",
      () => this.battleSession?.getLocalPlayerId() ?? null,
      () => this.rollbackFacade.getFinalDebugHashes(),
      () => this.replayMgr.getRecorder(),
    );

    this.debugCtrl = new BattleDebugController(this, data, this.battleSession, this.view, this.inputCtrl.getMobileControls(), this.arenaBounds, (input) =>
      this.inputCtrl.setLastInput(input),
    );

    // 8. 绑定跨控制器的桥接事件
    this.events.on(BattleEvents.END_REPLAY, (winnerSlot: "Player1" | "Player2") => {
      this.replayMgr.endBattle(winnerSlot);
    });

    ConsoleCmd.install(this);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.scheduleBattleLayoutRefresh, this);
    this.scale.on(Phaser.Scale.Events.ORIENTATION_CHANGE, this.scheduleBattleLayoutRefresh, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdownBattleScene(), this);
  }

  private applyBattleLayout(layout: BattleLayout, force = false): void {
    if (!force && sameBattleLayout(this.battleLayout, layout)) {
      return;
    }
    this.battleLayout = layout;
    this.applyingBattleLayout = true;
    try {
      this.scale.setGameSize(layout.width, layout.height);
      this.cameras.main.setSize(layout.width, layout.height);
      this.cameras.main.setScroll(-layout.arenaInsetX, -layout.arenaInsetY);
    } finally {
      this.applyingBattleLayout = false;
    }

    // 【防御性代码修复】增加安全可选链导航
    this.inputCtrl?.createMobileControls(layout);
  }

  update(_: number, delta: number): void {
    if (this.replayMgr.isReplayMode || this.replayMgr.isSpectatorMode) {
      this.replayMgr.update(delta);
      return;
    }

    this.pauseCtrl.update(delta);
    if (this.pauseCtrl.isPaused()) {
      return;
    }

    // 准备界面更新数据
    const currentOutput = this.battleSession.getCurrentOutput();
    const localFighterKey = this.battleSession.localFighterKey();
    const controllerModel = createBattleViewModel({
      state: currentOutput.state,
      input: this.inputCtrl.getLastInput(),
      localFighterKey,
      arenaBounds: this.arenaBounds,
    });

    // 1. 更新商店面板逻辑输入
    this.shopCtrl.update(controllerModel.shop, delta);

    // 2. 更新核心物理步进计算
    this.battleSession.update(delta);

    // 3. 更新输入设备光标状态和坐标采样
    this.shopCtrl.updateCursor(controllerModel.shop);
    this.inputCtrl.updateAimCoordinate();

    // 4. 渲染核心战斗视口
    const lastInput = this.inputCtrl.getLastInput();
    const presentationModel = createBattleViewModel({
      state: currentOutput.state,
      input: lastInput,
      localFighterKey,
      arenaBounds: this.arenaBounds,
      alpha: this.battleSession.getAccumulator() / 16.666,
      rollbackBlend: this.rollbackVisualFrames > 0 ? 0.7 : 1,
      secondaryInput: this.localSingleDevice ? this.inputCtrl.getLastP2Input() : undefined,
    });
    this.view.render(presentationModel);

    // 5. 更新 UI
    this.transitionCtrl.update(presentationModel.transition, delta);

    if (this.rollbackVisualFrames > 0) {
      this.rollbackVisualFrames -= 1;
    }

    if (this.debugCtrl.isDebugPhysicsEnabled()) {
      this.renderDebugPhysics();
    }

    // 单机模式下，如果联机同步网络未跑起（Offline），当 GameOver 时延迟向结果处理器发出结算请求
    if (!this.battleSession.isSyncRunning() && this.battleSession.isGameOver() && !this.resultHandler.isResultScheduled()) {
      this.time.delayedCall(900, () => this.events.emit(BattleEvents.GO_TO_RESULT));
    }
  }

  // --- 兼容 ConsoleCmd 反射调用的公有转发方法 ---
  getDebugFrame(): number {
    return this.debugCtrl.getFrame();
  }

  getRecentDebugHashes(count = 50): DebugHashRow[] {
    return this.debugCtrl.getRecentHashes(count);
  }

  getDebugHash(frame: number): DebugHashRow | null {
    return this.debugCtrl.getHash(frame);
  }

  getDebugLiveHashEnabled(): boolean {
    return this.debugCtrl.getLiveHashEnabled();
  }

  setDebugLiveHashEnabled(enabled: boolean): void {
    this.debugCtrl.setLiveHashEnabled(enabled);
  }

  rollbackDebugToFrame(frame: number): boolean {
    return this.debugCtrl.rollbackToFrame(frame);
  }

  runDebugPresetScript(): DebugHashRow[] | null {
    return this.debugCtrl.runPresetScript();
  }

  spawnDebugPoint(size: DebugPointSize): boolean {
    return this.debugCtrl.spawnPoint(size);
  }

  setDebugPoint(pointCount: number): boolean {
    return this.debugCtrl.setPoint(pointCount);
  }

  passStoryStage(): boolean {
    return this.debugCtrl.passStoryStage();
  }

  setDebugPhysicsEnabled(enabled: boolean): void {
    this.debugCtrl.setDebugPhysicsEnabled(enabled);
  }

  isDebugPhysicsEnabled(): boolean {
    return this.debugCtrl.isDebugPhysicsEnabled();
  }

  saveDebugLog(targetFrame?: number): string | null {
    return this.rollbackFacade.saveDebugLog(targetFrame);
  }

  private renderDebugPhysics(): void {
    const bodies = this.battleSession.readDebugBodies();
    if (bodies) this.view.renderDebugBodies(bodies);
  }

  private scheduleBattleLayoutRefresh(): void {
    if (this.applyingBattleLayout || !this.scene.isActive()) {
      return;
    }
    this.pendingLayoutRefresh?.remove(false);
    this.pendingLayoutRefresh = this.time.delayedCall(80, () => {
      this.pendingLayoutRefresh = undefined;
      this.applyBattleLayout(createBattleLayout());
    });
  }

  private shutdownBattleScene(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.scheduleBattleLayoutRefresh, this);
    this.scale.off(Phaser.Scale.Events.ORIENTATION_CHANGE, this.scheduleBattleLayoutRefresh, this);

    this.battleAudioBridge?.dispose();
    this.battleAudioBridge = undefined;
    this.battleBgmBridge?.dispose();
    this.battleBgmBridge = undefined;

    this.pauseCtrl?.destroy();
    this.view?.destroy();
    this.pendingLayoutRefresh?.remove(false);
    this.pendingLayoutRefresh = undefined;

    const prevScale = this.inputCtrl.getPreviousScaleAutoCenter();
    if (prevScale !== undefined) {
      this.scale.autoCenter = prevScale;
    }

    this.inputCtrl.destroy();
    this.transitionCtrl?.destroy();
    this.shopCtrl?.destroy();

    this.scale.setGameSize(GAME_WIDTH, GAME_HEIGHT);
    this.cameras.main?.setSize(GAME_WIDTH, GAME_HEIGHT);
    this.cameras.main?.setScroll(0, 0);
    this.input?.setDefaultCursor("auto");

    ConsoleCmd.uninstall(this);
    this.battleSession?.destroy();
    this.networkHost?.destroy();
  }
}
