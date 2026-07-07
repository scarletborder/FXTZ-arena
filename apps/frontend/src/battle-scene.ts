import Phaser from "phaser";
import { BattleEvents, GAME_HEIGHT, GAME_WIDTH } from "@repo/constants";
import type { BattleSceneData } from "./battle/loadout";
import { BattleLayout, createBattleLayout, sameBattleLayout } from "./battle/manager/layout-manager";
import { BattleView } from "./battle/view";
import { installBattleAudioBridge, installBattleBgmBridge, type BattleAudioBridge, type BattleBgmBridge } from "./sound";
import { BattleAudioDirector } from "./battle/sfx/audio";
import BgmCmd from "./commands/BgmCmd";
import ConsoleCmd, { DebugHashRow } from "./commands/ConsoleCmd";

import { resolveArenaBounds } from "./battle/utils/battle-helpers";
import { BattleReplayManager } from "./battle/manager/replay-manager";
import { BattleResultHandler } from "./battle/result-handler";
import { BattleInputController } from "./battle/input-controller";
import { BattleDebugController } from "./battle/manager/debug-manager";
import { BattleNetworkManager } from "./battle/manager/network-manager";
import { BattleRollbackFacade } from "./battle/manager/rollback-manager";
import { BattleRuntimeAdapter } from "./battle/runtime-adapter";
import { BattlePauseController } from "./battle/view/controller/BattlePauseController";
import { CollaborateShopController } from "./battle/view/controller/CollaborateShopController";
import { CollaborateTransitionController } from "./battle/view/controller/CollaborateTransitionController";

export class BattleScene extends Phaser.Scene {
  private view!: BattleView;
  private readonly audioDirector = new BattleAudioDirector();
  private battleAudioBridge: BattleAudioBridge | undefined;
  private battleBgmBridge: BattleBgmBridge | undefined;

  private networkMgr!: BattleNetworkManager;
  private rollbackFacade!: BattleRollbackFacade;
  private replayMgr!: BattleReplayManager;
  private resultHandler!: BattleResultHandler;
  private runtimeAdapter!: BattleRuntimeAdapter;
  private inputCtrl!: BattleInputController;
  private debugCtrl!: BattleDebugController;

  private pauseCtrl!: BattlePauseController;
  private transitionCtrl!: CollaborateTransitionController;
  private shopCtrl!: CollaborateShopController;

  private battleLayout: BattleLayout | undefined;
  private arenaBounds: any;
  private applyingBattleLayout = false;
  private pendingLayoutRefresh: Phaser.Time.TimerEvent | undefined;
  private rollbackVisualFrames = 0;
  private localSingleDevice = false;

  constructor() {
    super("battle");
  }

  preload(): void { }

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

    // 4. 【核心修复 1】安全链守护外观层依赖
    this.rollbackFacade = new BattleRollbackFacade(
      this,
      data,
      () => this.runtimeAdapter?.getRuntime()?.frame ?? 0,
      () => this.networkMgr?.getConfirmedFrame(), //  当 networkMgr 是 undefined 时，安全返回 undefined，不会报错
      () => this.debugCtrl?.getLiveHashEnabled() ?? false, //  安全返回 false，不会报错
      () => this.audioDirector
    );

    // 5. 【核心修复 2】安全链守护物理适配器依赖
    this.runtimeAdapter = new BattleRuntimeAdapter(
      this,
      data,
      () => this.inputCtrl.getKeys(),
      () => this.debugCtrl?.isInputLocked() ?? false,
      (fighter, prevShots) =>
        this.inputCtrl.generateInput(
          fighter,
          prevShots,
          () => this.runtimeAdapter.getCurrentOutput()?.state?.collaborateExtra,
          this.networkMgr?.localFighterKey() ?? "Player1",
          this.shopCtrl?.getPendingPurchaseItemId(),
          this.shopCtrl?.getPendingActiveCardSwitchId(),
          () => this.shopCtrl?.clearPending()
        ),
      (fighter, prevShots) => this.inputCtrl.generateP2Input(fighter, prevShots),
      () => this.networkMgr?.isSyncRunning() ?? false,
      (input) => this.networkMgr?.step(input),
      (aimConsumed?: boolean) => {
        const lastOutput = this.rollbackFacade.recordFrame(this.runtimeAdapter.getRuntime().outputQueue, aimConsumed);
        if (lastOutput) {
          this.runtimeAdapter.setCurrentOutput(lastOutput);
        }
      }
    );

    // 初始化快照记录：此刻 rollbackFacade 调用时，networkMgr 仍为 undefined，
    // 但因为可选链的保护，它会优雅地回退到本地默认物理帧，成功渡过初始化阶段
    const lastOutput = this.rollbackFacade.recordFrame(this.runtimeAdapter.getRuntime().outputQueue);
    if (lastOutput) {
      this.runtimeAdapter.setCurrentOutput(lastOutput);
    }

    // 6. 初始化联机管理器（在 recordFrame 后正常初始化）
    this.networkMgr = new BattleNetworkManager(
      this,
      data,
      () => this.runtimeAdapter.getRuntime(),
      (record) => this.rollbackFacade.recordStepInputs(record),
      (record) => this.rollbackFacade.recordConfirmedInputs(record),
      (aimConsumed) => {
        const lastOutput = this.rollbackFacade.recordFrame(this.runtimeAdapter.getRuntime().outputQueue, aimConsumed);
        if (lastOutput) {
          this.runtimeAdapter.setCurrentOutput(lastOutput);
        }
      },
      (frame) => this.rollbackFacade.getRollbackRecord(frame),
      (frame) => this.rollbackFacade.pruneAfter(frame),
      (frame) => this.rollbackFacade.pruneBefore(frame),
      () => {
        this.rollbackVisualFrames = 2;
      }
    );

    // 执行物理超前赶进逻辑
    if (this.runtimeAdapter.isLogicReady() && data.battleZeroTimeMs !== undefined) {
      const elapsedMs = performance.now() - data.battleZeroTimeMs;
      this.runtimeAdapter.fastForward(elapsedMs, this.networkMgr.localFighterKey(), this.inputCtrl.getLastInput());
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
      this.inputCtrl
    );

    this.transitionCtrl = new CollaborateTransitionController(
      this,
      () => this.inputCtrl.getKeys()
    );
    this.shopCtrl = new CollaborateShopController(this, () => this.inputCtrl.getKeys());

    // 【核心修复 3】安全保护结果处理器依赖
    this.resultHandler = new BattleResultHandler(
      this,
      data,
      () => this.runtimeAdapter.getCurrentOutput()?.state,
      () => this.networkMgr?.localFighterKey() ?? "Player1",
      () => this.networkMgr?.getLocalPlayerId() ?? null,
      () => this.rollbackFacade.getFinalDebugHashes(),
      () => this.replayMgr.getRecorder()
    );

    this.debugCtrl = new BattleDebugController(
      this,
      data,
      this.runtimeAdapter.getRuntime(),
      this.rollbackFacade.getRollbackManager(),
      this.view,
      this.inputCtrl.getMobileControls(),
      this.arenaBounds,
      (input) => this.inputCtrl.setLastInput(input),
      (input) => this.runtimeAdapter.stepRuntimeWithInput(input),
      () => {
        const lastOutput = this.rollbackFacade.recordFrame(this.runtimeAdapter.getRuntime().outputQueue);
        if (lastOutput) {
          this.runtimeAdapter.setCurrentOutput(lastOutput);
        }
      }
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
    const currentOutput = this.runtimeAdapter.getCurrentOutput();
    const collaborateExtra = currentOutput?.state.collaborateExtra;
    const localFighterKey = this.networkMgr.localFighterKey();
    const isLocalDead = this.runtimeAdapter.localFighterState(localFighterKey).deadUntil > 0;

    // 1. 更新商店面板逻辑输入
    this.shopCtrl.update(
      collaborateExtra,
      localFighterKey,
      {
        Player1: currentOutput?.state.player,
        Player2: currentOutput?.state.target
      },
      delta,
      isLocalDead
    );

    // 2. 更新核心物理步进计算
    this.runtimeAdapter.update(delta, localFighterKey);

    // 3. 更新输入设备光标状态和坐标采样
    this.shopCtrl.updateCursor(collaborateExtra?.shop.open === true);
    this.inputCtrl.updateAimCoordinate();

    // 4. 渲染核心战斗视口
    const lastInput = this.inputCtrl.getLastInput();
    this.view.render(
      currentOutput.state,
      lastInput,
      localFighterKey,
      this.runtimeAdapter.getAccumulator() / 16.666,
      this.rollbackVisualFrames > 0 ? 0.7 : 1,
      this.localSingleDevice ? this.inputCtrl.getLastP2Input() : undefined
    );

    // 5. 更新 UI
    this.transitionCtrl.update(collaborateExtra, localFighterKey, delta);

    if (this.rollbackVisualFrames > 0) {
      this.rollbackVisualFrames -= 1;
    }

    if (this.debugCtrl.isDebugPhysicsEnabled()) {
      this.renderDebugPhysics();
    }

    // 单机模式下，如果联机同步网络未跑起（Offline），当 GameOver 时延迟向结果处理器发出结算请求
    if (
      !this.networkMgr.isSyncRunning() &&
      this.runtimeAdapter.getRuntime().gameOver &&
      !this.resultHandler.isResultScheduled()
    ) {
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

  spawnDebugPoint(size: any): boolean {
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
    const runtime = this.runtimeAdapter.getRuntime();
    if (!runtime.physicsReady) return;
    this.view.renderDebugBodies(runtime.readDebugBodies());
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

    this.arenaBounds = undefined;
    this.scale.setGameSize(GAME_WIDTH, GAME_HEIGHT);
    this.cameras.main?.setSize(GAME_WIDTH, GAME_HEIGHT);
    this.cameras.main?.setScroll(0, 0);
    this.input?.setDefaultCursor("auto");

    ConsoleCmd.uninstall(this);
    this.networkMgr?.destroy();
  }
}
