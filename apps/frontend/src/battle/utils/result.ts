import type { PlayerId } from "@repo/types";

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
  if (params.winnerPlayerId === "Player1" || params.winnerPlayerId === "Player2") {
    return params.winnerPlayerId;
  }

  const localPlayerId = params.localPlayerId === "Player2" ? "Player2" : "Player1";
  const opponentPlayerId = localPlayerId === "Player1" ? "Player2" : "Player1";
  return params.playerDeaths > params.targetDeaths
    ? opponentPlayerId
    : localPlayerId;
}
