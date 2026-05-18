import { TICK_RATE, type FrameInput, type PlayerId } from "@repo/types";

export interface FighterState {
  readonly playerId: PlayerId;
  readonly x: number;
  readonly y: number;
}

export interface RaidState {
  readonly frame: number;
  readonly fighters: readonly [FighterState, FighterState];
}

const STEP_UNITS = 4;

export function createInitialState(): RaidState {
  return {
    frame: 0,
    fighters: [
      { playerId: "player-1", x: -120, y: 0 },
      { playerId: "player-2", x: 120, y: 0 },
    ],
  };
}

export function advanceFixedTick(
  state: RaidState,
  inputs: readonly FrameInput[] = [],
): RaidState {
  const nextFrame = state.frame + 1;

  return {
    frame: nextFrame,
    fighters: state.fighters.map((fighter) => {
      const input = inputs.find((item) => item.playerId === fighter.playerId);

      if (!input) {
        return fighter;
      }

      return {
        ...fighter,
        x: fighter.x + input.moveX * STEP_UNITS,
        y: fighter.y + input.moveY * STEP_UNITS,
      };
    }) as [FighterState, FighterState],
  };
}

export function runFixedTickExample(frames = TICK_RATE): RaidState {
  let state = createInitialState();

  for (let frame = 0; frame < frames; frame += 1) {
    state = advanceFixedTick(state, [
      {
        frame,
        playerId: "player-1",
        moveX: 1,
        moveY: 0,
        aimRadians: 0,
        fire: false,
        bomb: false,
        reload: false,
        switchCharacter: false,
      },
    ]);
  }

  return state;
}
