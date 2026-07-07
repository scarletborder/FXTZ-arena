import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/constants", () => ({
  IS_DESKTOP_APP: false,
}));

vi.mock("phaser", () => ({
  default: {
    Input: {
      Keyboard: {
        KeyCodes: {
          W: 87,
          A: 65,
          S: 83,
          D: 68,
          J: 74,
          K: 75,
          L: 76,
          U: 85,
          I: 73,
          ESC: 27,
          ENTER: 13,
          SHIFT: 16,
        },
      },
    },
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
    },
  },
}));

import { createProfile, getProfile, initializeProfileRepository, saveProfile } from "./profile-repository";

class FakeObjectStore {
  constructor(private readonly storage: Map<string, unknown>) {}

  getAll(): FakeRequest {
    return resolveRequest(Array.from(this.storage.values()));
  }

  put(value: unknown): FakeRequest {
    const record = value as { id: string };
    this.storage.set(record.id, value);
    return resolveRequest(value);
  }

  delete(key: string): FakeRequest {
    this.storage.delete(key);
    return resolveRequest(undefined);
  }
}

class FakeTransaction {
  constructor(private readonly storage: Map<string, unknown>) {}

  objectStore(_name: string): FakeObjectStore {
    return new FakeObjectStore(this.storage);
  }
}

class FakeDatabase {
  readonly objectStoreNames = {
    contains: (_name: string) => true,
  };

  constructor(private readonly storage: Map<string, unknown>) {}

  transaction(_name: string, _mode: string): FakeTransaction {
    return new FakeTransaction(this.storage);
  }
}

interface FakeRequest {
  result: unknown;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded: (() => void) | null;
}

function resolveRequest(result: unknown): FakeRequest {
  const request: FakeRequest = {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };
  queueMicrotask(() => {
    request.onsuccess?.();
  });
  return request;
}

describe("profile repository", () => {
  beforeEach(() => {
    const storage = new Map<string, unknown>();
    const db = new FakeDatabase(storage);
    vi.stubGlobal("indexedDB", {
      open: () => {
        const request = resolveRequest(db);
        queueMicrotask(() => {
          request.onupgradeneeded?.();
        });
        return request;
      },
    });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
  });

  it("keeps the profile hash stable when saving the same username repeatedly", async () => {
    await initializeProfileRepository();
    const created = await createProfile("Alice");

    const savedOnce = await saveProfile(created.id, { username: "Alice" });
    const savedTwice = await saveProfile(created.id, { username: "Alice" });

    expect(savedOnce.hash).toBe(created.hash);
    expect(savedTwice.hash).toBe(created.hash);
    expect(getProfile(created.id).hash).toBe(created.hash);
  });
});
