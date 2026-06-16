import type { BattleInputState } from "@repo/raid-logic";
import type { PlayerId, ServerMessage } from "@repo/types";

export class SpectatorInputBuffer {
  private readonly inputs = new Map<PlayerId, Map<number, BattleInputState>>([
    ["Player1", new Map()],
    ["Player2", new Map()],
  ]);

  push(message: Extract<ServerMessage, { type: "input_frame" }>): void {
    this.inputs.get(message.playerId)?.set(message.frame, {
      moveX: message.moveX,
      moveY: message.moveY,
      aimX: Math.trunc(message.aimX),
      aimY: Math.trunc(message.aimY),
      shootPressed: message.shootPressed,
      bombPressed: message.bombPressed,
      activeCardPressed: message.activeCardPressed,
      reloadPressed: message.reloadPressed,
      alternateHeld: message.alternateHeld,
      infoHeld: message.infoHeld,
      transitionReadyPressed: message.transitionReadyPressed === true,
    });
    for (const redundant of message.UnreliableLinkExtra?.redundantInputs ?? []) {
      this.inputs.get(message.playerId)?.set(redundant.frame, {
        moveX: redundant.moveX,
        moveY: redundant.moveY,
        aimX: Math.trunc(redundant.aimX),
        aimY: Math.trunc(redundant.aimY),
        shootPressed: redundant.shootPressed,
        bombPressed: redundant.bombPressed,
        activeCardPressed: redundant.activeCardPressed,
        reloadPressed: redundant.reloadPressed,
        alternateHeld: redundant.alternateHeld,
        infoHeld: redundant.infoHeld,
        transitionReadyPressed: redundant.transitionReadyPressed === true,
      });
    }
  }

  takePair(frame: number): { player: BattleInputState; target: BattleInputState } | null {
    const player = this.inputs.get("Player1")?.get(frame);
    const target = this.inputs.get("Player2")?.get(frame);
    if (!player || !target) {
      return null;
    }
    this.inputs.get("Player1")?.delete(frame);
    this.inputs.get("Player2")?.delete(frame);
    return { player, target };
  }

  hasPair(frame: number): boolean {
    return this.inputs.get("Player1")?.has(frame) === true && this.inputs.get("Player2")?.has(frame) === true;
  }
}
