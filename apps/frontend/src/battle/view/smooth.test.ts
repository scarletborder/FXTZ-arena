import { describe, expect, it } from "vitest";

import { smoothValue } from "./smooth";

describe("smoothValue", () => {
  it("moves a current value toward the target by the blend factor", () => {
    expect(smoothValue(10, 20, 0)).toBe(10);
    expect(smoothValue(10, 20, 0.5)).toBe(15);
    expect(smoothValue(10, 20, 1)).toBe(20);
  });
});