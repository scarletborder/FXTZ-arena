import type { BattleCharacter } from "../presets/characters/base";

export class CharacterLibrary {
  private registry = new Map<string, new () => BattleCharacter>();

  register(id: string, ctor: new () => BattleCharacter): void {
    if (this.registry.has(id)) {
      throw new Error(`BattleCharacter '${id}' is already registered`);
    }
    this.registry.set(id, ctor);
  }

  create(id: string): BattleCharacter {
    const ctor = this.registry.get(id);
    if (!ctor) {
      throw new Error(`Unknown battle character: ${id}`);
    }
    return new ctor();
  }

  has(id: string): boolean {
    return this.registry.has(id);
  }
}

export const characterLibrary = new CharacterLibrary();
