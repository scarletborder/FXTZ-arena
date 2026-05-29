import { describe, expect, it } from "vitest";

import { normalizeServerAddress } from "./address";

describe("normalizeServerAddress", () => {
  it("keeps full websocket URLs and adds the default port", () => {
    expect(normalizeServerAddress("ws://localhost")).toBe("ws://localhost:22334/");
    expect(normalizeServerAddress("wss://example.com:443/game")).toBe("wss://example.com/game");
  });

  it("treats HTTPS URLs as WebTransport endpoints", () => {
    expect(normalizeServerAddress("https://localhost")).toBe("https://localhost:22334/wt");
    expect(normalizeServerAddress("https://example.com:443/game")).toBe("https://example.com/wt");
  });

  it("accepts bare IPv4 and host names", () => {
    expect(normalizeServerAddress("192.168.0.1")).toBe("ws://192.168.0.1:22334/");
    expect(normalizeServerAddress("example.com:22335")).toBe("ws://example.com:22335/");
  });

  it("wraps bare IPv6 addresses in brackets", () => {
    expect(normalizeServerAddress("::1")).toBe("ws://[::1]:22334");
    expect(normalizeServerAddress("2001:db8::12")).toBe("ws://[2001:db8::12]:22334");
  });

  it("accepts bracketed IPv6 addresses with or without a port", () => {
    expect(normalizeServerAddress("[::1]")).toBe("ws://[::1]:22334/");
    expect(normalizeServerAddress("[::1]:22335")).toBe("ws://[::1]:22335/");
  });
});
