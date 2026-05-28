import { describe, expect, it } from "vitest";

import { createServerConfig } from "../config";

describe("createServerConfig", () => {
  it("uses environment defaults", () => {
    const config = createServerConfig([], { HOST: "127.0.0.1", IPV6_HOST: "::1", PORT: "22335" });

    expect(config.ipv4Host).toBe("127.0.0.1");
    expect(config.ipv6Host).toBe("::1");
    expect(config.port).toBe(22335);
  });

  it("accepts an IPv4 bind address from CLI", () => {
    const config = createServerConfig(["--ipv4=192.168.0.1"], {});

    expect(config.ipv4Host).toBe("192.168.0.1");
    expect(config.ipv6Host).toBe("::");
    expect(config.port).toBe(22334);
  });

  it("accepts an IPv6 bind address from CLI", () => {
    const config = createServerConfig(["--ipv6=::1", "--port=22336"], {});

    expect(config.ipv4Host).toBe("0.0.0.0");
    expect(config.ipv6Host).toBe("::1");
    expect(config.port).toBe(22336);
  });

  it("lets CLI options override environment values", () => {
    const config = createServerConfig(["--ipv6=2001:db8::1", "--port=22337"], {
      HOST: "0.0.0.0",
      PORT: "22334",
    });

    expect(config.ipv4Host).toBe("0.0.0.0");
    expect(config.ipv6Host).toBe("2001:db8::1");
    expect(config.port).toBe(22337);
  });
});
