import type { PlayerId } from "@repo/types";
import type { BattleResult } from "@repo/content";

export function resolveResultWinnerName(params: {
  readonly winnerPlayerId: PlayerId | null;
  readonly localPlayerId: PlayerId | null;
  readonly localPlayerName: string;
  readonly opponentName: string;
  readonly playerDeaths: number;
  readonly targetDeaths: number;
}): string {
  if (params.winnerPlayerId !== null && params.localPlayerId !== null) {
    return params.winnerPlayerId === params.localPlayerId
      ? params.localPlayerName
      : params.opponentName;
  }

  return resolveWinnerPlayerId(params) === "Player1"
    ? params.localPlayerName
    : params.opponentName;
}

export function resolveWinnerPlayerId(params: {
  readonly winnerPlayerId: PlayerId | null;
  readonly localPlayerId: PlayerId | null;
  readonly playerDeaths: number;
  readonly targetDeaths: number;
}): "Player1" | "Player2" {
  if (
    params.winnerPlayerId === "Player1" ||
    params.winnerPlayerId === "Player2"
  ) {
    return params.winnerPlayerId;
  }

  const localPlayerId =
    params.localPlayerId === "Player2" ? "Player2" : "Player1";
  const opponentPlayerId = localPlayerId === "Player1" ? "Player2" : "Player1";
  return params.playerDeaths > params.targetDeaths
    ? opponentPlayerId
    : localPlayerId;
}

export function resolveDisplayedBattleResult(params: {
  readonly battleResult: BattleResult;
  readonly battleMode: "versus" | "collaborate";
  readonly winnerPlayerId: PlayerId | null;
}): BattleResult {
  if (
    params.battleResult === "collaborate_victory" ||
    params.battleResult === "collaborate_defeat"
  ) {
    return params.battleResult;
  }
  if (params.battleMode === "collaborate") {
    if (params.winnerPlayerId === "Player1") return "collaborate_victory";
    if (params.winnerPlayerId === "Player2") return "collaborate_defeat";
  }
  return params.battleResult;
}
