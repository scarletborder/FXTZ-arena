export class DeterministicHasher {
  private value = 0x811c9dc5;

  writeNumber(input: number): void {
    const normalized = Number.isFinite(input) ? Math.trunc(input) : 0;
    this.value ^= normalized & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
    this.value ^= (normalized >>> 8) & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
    this.value ^= (normalized >>> 16) & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
    this.value ^= (normalized >>> 24) & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
  }

  writeString(input: string): void {
    for (let index = 0; index < input.length; index += 1) {
      this.value ^= input.charCodeAt(index) & 0xff;
      this.value = Math.imul(this.value, 0x01000193) >>> 0;
    }
    this.writeNumber(input.length);
  }

  digest(): number {
    return this.value >>> 0;
  }
}

export function stableHash(write: (hasher: DeterministicHasher) => void): number {
  const hasher = new DeterministicHasher();
  write(hasher);
  return hasher.digest();
}
