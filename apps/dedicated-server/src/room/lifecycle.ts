import { randomUUID, randomInt } from "node:crypto";

import type { BattleConfig, PlayerId, PlayerLoadout } from "@repo/types";

import type { InternalRoom } from "./types";

export interface SetReadyResultBoth {
  bothReady: true;
  battleConfig: BattleConfig;
}

export interface SetReadyResultPending {
  bothReady: false;
}

export type SetReadyResult = SetReadyResultBoth | SetReadyResultPending;

export class RoomLifecycle {
  setReady(room: InternalRoom, playerId: PlayerId, loadout: PlayerLoadout): SetReadyResult {
    const idx = room.playerSlots.indexOf(playerId);
    if (idx === -1) throw new Error(`Player ${playerId} is not in this room`);

    room.loadouts[idx] = loadout;

    // Both players have submitted loadouts → transition to loading
    if (room.loadouts[0] && room.loadouts[1]) {
      room.status = "loading";
      room.battleId = randomUUID();
      room.seed = randomInt(0, 2_147_483_647);

      const config: BattleConfig = {
        battleId: room.battleId,
        mapId: room.mapId,
        seed: room.seed,
        fps: 60,
        lifeCount: room.lifeCount,
        defaultBombCount: 3,
        costLimit: room.costLimit,
        players: [
          {
            playerId: room.playerSlots[0]!,
            username: "",
            loadout: room.loadouts[0],
            spawnPointId: "spawn-1",
          },
          {
            playerId: room.playerSlots[1]!,
            username: "",
            loadout: room.loadouts[1],
            spawnPointId: "spawn-2",
          },
        ],
      };

      return { bothReady: true, battleConfig: config };
    }

    return { bothReady: false };
  }

  setLoadingDone(room: InternalRoom, playerId: PlayerId): boolean {
    const idx = room.playerSlots.indexOf(playerId);
    if (idx === -1) throw new Error(`Player ${playerId} is not in this room`);

    room.loadingDone[idx] = true;

    if (room.loadingDone[0] && room.loadingDone[1]) {
      room.status = "fighting";
      return true;
    }

    return false;
  }

  setFinished(room: InternalRoom): void {
    room.status = "finished";
  }
}
