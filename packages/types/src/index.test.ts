import { describe, expect, it } from "vitest";

import { DEFAULT_CHARACTERS, TICK_RATE } from "./index";

describe("@repo/types", () => {
  it("exports static combat constants", () => {
    expect(TICK_RATE).toBe(60);
    expect(DEFAULT_CHARACTERS.map((character) => character.id)).toEqual([
      "reimu",
      "marisa",
      "sakuya",
    ]);
  });
});
