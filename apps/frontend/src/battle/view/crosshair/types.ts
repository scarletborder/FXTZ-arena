export interface CrosshairRenderParams {
  readonly pointerX: number;
  readonly pointerY: number;
  readonly danger: boolean;
  readonly highlight?: boolean;
  readonly ammoDisplay: number;
  readonly ammoCount: number;
  readonly ammoMax: number;
  readonly pointCount: number;
  readonly bombs: number;
  readonly lives: number;
  readonly activeCardUses: number;
  readonly activeCardUseLimit: "infinite" | number | undefined;
  readonly activeCardCooldownRemaining: number;
  readonly activeCardCooldownTotal: number;
}

export type ActiveCardStatusParams = Pick<
  CrosshairRenderParams,
  | "activeCardUses"
  | "activeCardUseLimit"
  | "activeCardCooldownRemaining"
  | "activeCardCooldownTotal"
>;
