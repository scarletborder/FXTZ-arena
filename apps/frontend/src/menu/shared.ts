import Phaser from "phaser";
import { DEFAULT_ABILITY_CARDS, DEFAULT_CHARACTERS, type AbilityCardDefinition, type CharacterDefinition } from "@repo/content";
import type { PlayerId } from "@repo/types";

import type { BattleSceneData } from "../battle/loadout";
import { ConnectionManager } from "../network";

export type SceneKey = "home" | "battle-start" | "lobby" | "settings" | "codex" | "select" | "loading" | "result";
export type SelectionMode = "ai" | "training" | "online";
export type CodexTab = "characters" | "cards";

export interface UiSettings {
  username: string;
  debug: boolean;
  serverAddress: string;
}

export interface SelectionData {
  readonly mode: SelectionMode;
  /** Set when mode === "online" — the room this client is in. */
  readonly roomId?: string;
  /** Set when mode === "online" — this client's player slot. */
  readonly playerId?: PlayerId;
}

export interface LoadingData extends BattleSceneData {
  readonly mode: SelectionMode;
}

/** Global ConnectionManager singleton, shared across scenes. */
export const connectionManager = new ConnectionManager();

export interface ResultData {
  readonly winnerName?: string;
  readonly durationSeconds?: number;
  readonly shots?: number;
  readonly hits?: number;
  readonly bombUses?: number;
  readonly deaths?: number;
  readonly returnScene?: string;
}

export interface FightButton {
  readonly container: Phaser.GameObjects.Container;
  setEnabled(enabled: boolean): void;
  setLabel(label: string): void;
}

export interface TextFieldControl {
  readonly container: Phaser.GameObjects.Container;
  readonly hitArea: Phaser.GameObjects.Rectangle;
  setActive(active: boolean): void;
  handleKey(event: KeyboardEvent): void;
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

const savedUsername = typeof localStorage !== "undefined"
  ? localStorage.getItem("fxtz_username")
  : null;

export const uiSettings: UiSettings = {
  username: savedUsername ?? "Player",
  debug: false,
  serverAddress: "ws://localhost:22334",
};

export function getCharacterById(id: CharacterDefinition["id"]): CharacterDefinition {
  const character = DEFAULT_CHARACTERS.find((item) => item.id === id);
  if (!character) {
    throw new Error(`Missing character: ${id}`);
  }
  return character;
}

export function getCardById(id: AbilityCardDefinition["id"]): AbilityCardDefinition {
  const card = DEFAULT_ABILITY_CARDS.find((item) => item.id === id);
  if (!card) {
    throw new Error(`Missing ability card: ${id}`);
  }
  return card;
}

export function roleLabel(role: CharacterDefinition["roleClass"]): string {
  return {
    assault: "突击",
    suppress: "压制",
    scout: "侦察",
    sniper: "狙击",
  }[role];
}

export function speedLabel(speed: CharacterDefinition["moveSpeed"]): string {
  return {
    low: "低",
    medium: "中",
    high: "高",
  }[speed];
}
