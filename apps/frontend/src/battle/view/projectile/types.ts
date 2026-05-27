import type { FighterState, ProjectileState } from "@repo/raid-logic";

export type FighterKey = ProjectileState["owner"];
export type CharacterId = FighterState["activeCharacter"]["id"];

export interface BulletFrame {
  readonly key: string;
  readonly texture: string;
  readonly frame: string;
  readonly width: number;
  readonly height: number;
  readonly hitWidth: number;
  readonly hitHeight: number | "full";
}

export interface BulletConfigJson {
  readonly bullet_config: readonly {
    readonly id: string;
    readonly source: string;
    readonly rect: readonly number[];
    readonly hit_box: readonly (number | "full")[];
    readonly offset: readonly (readonly number[])[];
  }[];
}

export type ProjectileDisplay = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type ProjectileSpec =
  | {
      readonly kind: "image";
      readonly frame: BulletFrame;
    }
  | {
      readonly kind: "laser";
      readonly frame: BulletFrame;
    }
  | {
      readonly kind: "fallback";
      readonly texture: string;
      readonly tint: number;
    };

export type ProjectileVisual =
  | {
      readonly kind: "image";
      readonly image: Phaser.GameObjects.Image;
    }
  | {
      readonly kind: "laser";
      readonly container: Phaser.GameObjects.Container;
    };

export interface ProjectileFighters {
  readonly player: FighterState;
  readonly target: FighterState;
}
