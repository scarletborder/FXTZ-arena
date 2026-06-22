import { getAbilityCardDefinition, getCharacterDefinition, type AbilityCardDefinition, type CharacterDefinition } from "@repo/content";
import { t } from "@repo/i18n";
import type { BattleResult } from "@repo/content";
import type { BattleRoomMode, PlayerId, PlayerLoadout } from "@repo/types";

import type { BattleSceneData } from "../battle/loadout";
import type { ReplayFile } from "../replay/types";
import { ConnectionManager } from "../network";

export type SceneKey =
  | "bootstrap"
  | "home"
  | "battle-start"
  | "room-list"
  | "lobby"
  | "settings"
  | "codex"
  | "manual"
  | "select"
  | "loading"
  | "result"
  | "local-lan"
  | "udp-connect"
  | "story-start-loadout"
  | "story-progress"
  | "story-loadout"
  | "story-result"
  | "replay-record"
  | "replay-playback"
  | "spectator-loading"
  | "debug-bullet-volume";
export type SelectionMode = "ai" | "training" | "online" | "local" | "local_single" | "debug_cooperate";
export type DebugCooperateJumpTarget = "start" | "elite" | "boss";
export type CodexTab = "characters" | "cards";
export type CpuLoadoutPresetId = "marisa_solo" | "sakuya_cirno" | "kaguya_reisen";

export interface SelectionData {
  readonly mode: SelectionMode;
  readonly mapId?: import("@repo/types").MapId;
  readonly cpuLoadoutPresetId?: CpuLoadoutPresetId;
  /** Set when mode === "online" — the room this client is in. */
  readonly roomId?: string;
  /** Set when mode === "online" — this client's player slot. */
  readonly playerId?: PlayerId;
  /** Battle room mode for online selection rules. */
  readonly battleMode?: BattleRoomMode;
  /** Debug co-op entry point. */
  readonly debugCooperate?: {
    readonly target: DebugCooperateJumpTarget;
    readonly eliteWaveIndex?: number;
  };
  /** Optional callback used by local LAN to hand the chosen loadout back to the orchestrator. */
  readonly onLocalConfirm?: (loadout: PlayerLoadout) => void;
  /** P1 loadout carried into the second local single-player selection pass. */
  readonly localSinglePlayerOneLoadout?: PlayerLoadout;
  /** Optional scene key to return to when leaving the selection screen. */
  readonly returnScene?: SceneKey;
}

export interface LoadingData extends BattleSceneData {
  readonly mode: BattleSceneData["mode"];
}

/** Global ConnectionManager singleton, shared across scenes. */
export const connectionManager = new ConnectionManager();

export interface ResultData {
  readonly winnerName?: string;
  readonly battleResult?: BattleResult;
  readonly durationSeconds?: number;
  readonly players: readonly [ResultPlayerSummary, ResultPlayerSummary];
  readonly returnScene?: string;
  readonly debugHashes?: ResultDebugHashes;
  readonly replay?: ReplayFile;
}

export interface ResultPlayerSummary {
  readonly name: string;
  readonly shots: number;
  readonly bombUses: number;
  readonly hitsTaken: number;
}

export interface ResultDebugHashes {
  readonly finalGlobalHash: string | null;
  readonly finalGlobalInputHash: string | null;
}

export interface FightButton {
  readonly container: Phaser.GameObjects.Container;
  setEnabled(enabled: boolean): void;
  setLabel(label: string): void;
}

export interface TextFieldControl {
  readonly container: Phaser.GameObjects.Container;
  readonly hitArea: Phaser.GameObjects.Rectangle;
  setValue(value: string): void;
  setActive(active: boolean): void;
  focus(): void;
  blur(): void;
  handleKey(event: KeyboardEvent): void;
  handlePaste(text: string): void;
}

export interface CardTileControl {
  readonly container: Phaser.GameObjects.Container;
  readonly hitArea: Phaser.GameObjects.Rectangle;
  readonly width: number;
  readonly height: number;
  setSelected(selected: boolean): void;
  setHovered(hovered: boolean): void;
}

export interface CharacterTileControl {
  readonly container: Phaser.GameObjects.Container;
  readonly hitArea: Phaser.GameObjects.Rectangle;
  readonly width: number;
  readonly height: number;
  setSelected(selected: boolean): void;
  setHovered(hovered: boolean): void;
}

export function roleLabel(role: CharacterDefinition["roleClass"]): string {
  return {
    assault: t("role.assault"),
    suppress: t("role.suppress"),
    scout: t("role.scout"),
    sniper: t("role.sniper"),
  }[role];
}

export function speedLabel(speed: CharacterDefinition["moveSpeed"]): string {
  return {
    low: t("speed.low"),
    medium: t("speed.medium"),
    high: t("speed.high"),
  }[speed];
}

export function getCharacterById(id: CharacterDefinition["id"]): CharacterDefinition {
  const character = getCharacterDefinition(id);
  if (!character) {
    throw new Error(`Missing character: ${id}`);
  }
  return character;
}

export function getCardById(id: AbilityCardDefinition["id"]): AbilityCardDefinition {
  const card = getAbilityCardDefinition(id);
  if (!card) {
    throw new Error(`Missing ability card: ${id}`);
  }
  return card;
}
