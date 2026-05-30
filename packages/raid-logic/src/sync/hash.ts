import { fp } from "@shaisrc/fixed-point";

export class DeterministicHasher {
  private value = 0x811c9dc5;

  writeNumber(input: number): void {
    if (!Number.isFinite(input)) {
      this.writeUint32(0);
      return;
    }
    if (Number.isInteger(input)) {
      this.writeUint32(input);
      return;
    }
    this.writeString(fp.fromFloat(input).toString());
  }

  writeString(input: string): void {
    for (let index = 0; index < input.length; index += 1) {
      this.value ^= input.charCodeAt(index) & 0xff;
      this.value = Math.imul(this.value, 0x01000193) >>> 0;
    }
    this.writeUint32(input.length);
  }

  digest(): number {
    return this.value >>> 0;
  }

  private writeUint32(input: number): void {
    const normalized = input >>> 0;
    this.value ^= normalized & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
    this.value ^= (normalized >>> 8) & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
    this.value ^= (normalized >>> 16) & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
    this.value ^= (normalized >>> 24) & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
  }
}

export function stableHash(write: (hasher: DeterministicHasher) => void): number {
  const hasher = new DeterministicHasher();
  write(hasher);
  return hasher.digest();
}
