import { describe, expect, it } from "vitest";

import { createServerConfig } from "../config";

describe("createServerConfig", () => {
  it("uses environment defaults", () => {
    const config = createServerConfig([], { HOST: "127.0.0.1", PORT: "22335" });

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(22335);
  });

  it("accepts an IPv4 bind address from CLI", () => {
    const config = createServerConfig(["--ipv4=192.168.0.1"], {});

    expect(config.host).toBe("192.168.0.1");
    expect(config.port).toBe(22334);
  });

  it("accepts an IPv6 bind address from CLI", () => {
    const config = createServerConfig(["--ipv6=::1", "--port=22336"], {});

    expect(config.host).toBe("::1");
    expect(config.port).toBe(22336);
  });

  it("lets CLI options override environment values", () => {
    const config = createServerConfig(["--ipv6=2001:db8::1", "--port=22337"], {
      HOST: "0.0.0.0",
      PORT: "22334",
    });

    expect(config.host).toBe("2001:db8::1");
    expect(config.port).toBe(22337);
  });
});
