import type { PlayerId } from "../core";

export interface BattleInputState {
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly aimX: number;
  readonly aimY: number;
  readonly shootPressed: boolean;
  readonly bombPressed: boolean;
  readonly activeCardPressed: boolean;
  readonly reloadPressed: boolean;
  readonly alternateHeld: boolean;
  readonly infoHeld: boolean;
}

export interface PlayerFrameInput {
  readonly frame: number;
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly aimX: number;
  readonly aimY: number;
  readonly shootPressed: boolean;
  readonly bombPressed: boolean;
  readonly activeCardPressed: boolean;
  readonly reloadPressed: boolean;
  readonly alternateHeld: boolean;
  readonly infoHeld: boolean;
}

export interface FrameInput {
  readonly frame: number;
  readonly playerId: PlayerId;
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly aimRadians: number;
  readonly fire: boolean;
  readonly bomb: boolean;
  readonly reload: boolean;
  readonly switchCharacter: boolean;
}
