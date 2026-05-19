export interface BattleFrameContext {
  readonly frame: number;
}

export interface BattleStatsContext<TStats> {
  readonly stats: TStats;
}

export interface BattleCollectionsContext<TProjectile, TEffect> {
  readonly projectiles: TProjectile[];
  readonly effects: TEffect[];
}

export interface FighterSelfContext<TFighter> {
  readonly self: TFighter;
}

export interface FighterDuelContext<TFighter> extends FighterSelfContext<TFighter> {
  readonly opponent: TFighter;
}

export interface FighterPairContext<TFighter> {
  readonly player: TFighter;
  readonly target: TFighter;
}
