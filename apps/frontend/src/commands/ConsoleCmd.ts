import type { BattleScene } from "../battle-scene";

export interface DebugConsoleCommands {
  frame: () => number | null;
  rollback: (frame: number) => boolean | null;
  hashes: (count?: number) => DebugHashRow[] | null;
  hash: (frame: number) => DebugHashRow | null;
  live: (enabled?: boolean) => boolean | null;
  log: (frame?: number) => string | null;
  script: () => DebugHashRow[] | null;
  physics: (enabled?: boolean) => boolean | null;
  spawnPoint: (point: "small" | "medium" | "large") => boolean | null;
  setPoint: (point: number) => boolean | null;
  pass: () => boolean | null;
  help: () => void;
}

export interface DebugHashRow {
  readonly frame: number;
  readonly hash: string;
  readonly action?: string;
}

type ConsoleWindow = Window &
  typeof globalThis & {
    FXTZ?: DebugConsoleCommands;
  };

const BADGE = "FXTZ";

let currentScene: BattleScene | null = null;

function install(scene: BattleScene): DebugConsoleCommands {
  currentScene = scene;
  const commands = createCommands();
  (window as ConsoleWindow).FXTZ = commands;
  printBanner();
  return commands;
}

function uninstall(scene?: BattleScene): void {
  if (!scene || currentScene === scene) {
    currentScene = null;
    delete (window as ConsoleWindow).FXTZ;
  }
}

function createCommands(): DebugConsoleCommands {
  return {
    frame,
    rollback,
    hashes,
    hash,
    live,
    log,
    script,
    physics,
    spawnPoint,
    setPoint,
    pass,
    help,
  };
}

function frame(): number | null {
  const scene = getScene();
  if (!scene) {
    return null;
  }
  const value = scene.getDebugFrame();
  console.log(`[${BADGE}] frame=${value}`);
  return value;
}

function rollback(targetFrame: number): boolean | null {
  const scene = getScene();
  if (!scene) {
    return null;
  }
  const frameId = normalizeFrame(targetFrame);
  if (frameId === null) {
    return printBlocked(`Invalid frame: ${targetFrame}`);
  }
  const ok = scene.rollbackDebugToFrame(frameId);
  if (!ok) {
    return printBlocked(`No snapshot for frame=${frameId}.`);
  }
  printOk(
    `Rolled back to frame=${frameId}, hash=${scene.getDebugHash(frameId)?.hash ?? "missing"}.`,
  );
  return true;
}

function hashes(count = 50): DebugHashRow[] | null {
  const scene = getScene();
  if (!scene) {
    return null;
  }
  const limit = Math.max(1, Math.floor(Number(count) || 50));
  const rows = scene.getRecentDebugHashes(limit);
  console.table(rows);
  return rows;
}

function hash(targetFrame: number): DebugHashRow | null {
  const scene = getScene();
  if (!scene) {
    return null;
  }
  const frameId = normalizeFrame(targetFrame);
  if (frameId === null) {
    return printBlocked(`Invalid frame: ${targetFrame}`);
  }
  const row = scene.getDebugHash(frameId);
  if (!row) {
    return printBlocked(`No hash for frame=${frameId}.`);
  }
  console.table([row]);
  return row;
}

function live(enabled?: boolean): boolean | null {
  const scene = getScene();
  if (!scene) {
    return null;
  }
  const nextEnabled =
    enabled === undefined ? !scene.getDebugLiveHashEnabled() : Boolean(enabled);
  scene.setDebugLiveHashEnabled(nextEnabled);
  printOk(`Live frame hash logging ${nextEnabled ? "enabled" : "disabled"}.`);
  return nextEnabled;
}

function log(targetFrame?: number): string | null {
  const scene = getScene();
  if (!scene) {
    return null;
  }
  const frameId =
    targetFrame === undefined
      ? scene.getDebugFrame()
      : normalizeFrame(targetFrame);
  if (frameId === null) {
    return printBlocked(`Invalid frame: ${targetFrame}`);
  }
  return scene.saveDebugLog(frameId);
}

function script(): DebugHashRow[] | null {
  const scene = getScene();
  if (!scene) {
    return null;
  }
  const rows = scene.runDebugPresetScript();
  if (!rows) {
    return printBlocked(
      "Preset script needs a saved snapshot for frame=30. Let the game run past that frame first.",
    );
  }
  printOk(
    `Preset script completed: frames ${rows[0]?.frame ?? "?"}-${rows.at(-1)?.frame ?? "?"}.`,
  );
  console.table(rows);
  return rows;
}

function physics(enabled?: boolean): boolean | null {
  const scene = getScene();
  if (!scene) {
    return null;
  }
  const nextEnabled =
    enabled === undefined ? !scene.isDebugPhysicsEnabled() : Boolean(enabled);
  scene.setDebugPhysicsEnabled(nextEnabled);
  printOk(`Physics debug overlay ${nextEnabled ? "enabled" : "disabled"}.`);
  return nextEnabled;
}

function spawnPoint(point: "small" | "medium" | "large"): boolean | null {
  const scene = getScene();
  if (!scene) {
    return null;
  }
  const size = normalizePointSize(point);
  if (size === null) {
    return printBlocked(`Invalid point size: ${point}. Use "small", "medium", or "large".`);
  }
  if (!scene.spawnDebugPoint(size)) {
    return printBlocked("FXTZ.spawnPoint is disabled in online battles.");
  }
  printOk(`Spawned ${size} point at the cursor.`);
  return true;
}

function setPoint(point: number): boolean | null {
  const scene = getScene();
  if (!scene) {
    return null;
  }
  const value = normalizePointCount(point);
  if (value === null) {
    return printBlocked(`Invalid point count: ${point}. Use 0-300.`);
  }
  if (!scene.setDebugPoint(value)) {
    return printBlocked("FXTZ.setPoint is disabled in online battles.");
  }
  printOk(`Set current point to ${value}.`);
  return true;
}

function pass(): boolean | null {
  const scene = getScene();
  if (!scene) {
    return null;
  }
  if (!scene.passStoryStage()) {
    return printBlocked("FXTZ.pass is only available during story-mode battles.");
  }
  printOk("Passed the current story stage.");
  return true;
}

function help(): void {
  console.log(`[${BADGE}] Commands`);
  console.log("FXTZ.frame()              当前帧号");
  console.log("FXTZ.rollback(frame)      回滚到某帧");
  console.log("FXTZ.hashes(count = 50)   打印过去若干帧 hash");
  console.log("FXTZ.hash(frame)          打印某帧 hash");
  console.log("FXTZ.live(enabled?)       切换实时 frame-hash 打印，默认关闭");
  console.log("FXTZ.log(frame?)          导出每帧 hash 与双方输入日志");
  console.log(
    "FXTZ.script()             回滚到 frame=30 并执行边界输入脚本，打印期间每帧 hash",
  );
  console.log("FXTZ.physics(enabled?)    切换碰撞体可视化");
  console.log('FXTZ.spawnPoint("small"|"medium"|"large") Spawn a P point at the cursor');
  console.log("FXTZ.setPoint(0..300)     Set current player point directly");
  console.log("FXTZ.pass()               Pass the current story-mode stage");
}

function getScene(): BattleScene | null {
  if (!currentScene) {
    printBlocked("Battle scene is not ready.");
    return null;
  }
  return currentScene;
}

function normalizeFrame(frame: number): number | null {
  const value = Math.floor(Number(frame));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizePointSize(point: unknown): "small" | "medium" | "large" | null {
  return point === "small" || point === "medium" || point === "large" ? point : null;
}

function normalizePointCount(point: unknown): number | null {
  const value = Math.floor(Number(point));
  return Number.isFinite(value) && value >= 0 && value <= 300 ? value : null;
}

function printBanner(): void {
  printOk("Console commands ready as window.FXTZ.");
  help();
}

function printOk(message: string): true {
  console.log(`[${BADGE}] ${message}`);
  return true;
}

function printBlocked(message: string): null {
  console.warn(`[${BADGE}] ${message}`);
  return null;
}

const ConsoleCmd = {
  install,
  uninstall,
};

export default ConsoleCmd;
