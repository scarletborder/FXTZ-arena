import type { BattleAbilityCard } from "./base";

export class CardLibrary {
  private registry = new Map<string, new () => BattleAbilityCard>();

  register(id: string, ctor: new () => BattleAbilityCard): void {
    if (this.registry.has(id)) {
      throw new Error(`BattleAbilityCard '${id}' is already registered`);
    }
    this.registry.set(id, ctor);
  }

  create(id: string): BattleAbilityCard {
    const ctor = this.registry.get(id);
    if (!ctor) {
      throw new Error(`Unknown ability card: ${id}`);
    }
    return new ctor();
  }

  has(id: string): boolean {
    return this.registry.has(id);
  }

  ids(): string[] {
    return Array.from(this.registry.keys());
  }
}

export const cardLibrary = new CardLibrary();
