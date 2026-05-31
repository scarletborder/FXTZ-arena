import type { PlayerId } from "@repo/types";

export function resolveResultWinnerName(params: {
  readonly winnerPlayerId: PlayerId | null;
  readonly localPlayerId: PlayerId | null;
  readonly localPlayerName: string;
  readonly opponentName: string;
  readonly playerDeaths: number;
  readonly targetDeaths: number;
}): string {
  if (params.winnerPlayerId !== null) {
    return params.winnerPlayerId === params.localPlayerId
      ? params.localPlayerName
      : params.opponentName;
  }

  return params.playerDeaths > params.targetDeaths
    ? params.opponentName
    : params.localPlayerName;
}