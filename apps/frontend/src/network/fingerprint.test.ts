import { describe, expect, it } from "vitest";

import { certificateFingerprintToArrayBuffer, findServerCertificateFingerprint } from "./fingerprint";

describe("findServerCertificateFingerprint", () => {
  it("matches normalized WebTransport addresses", () => {
    const fingerprint = "16AD31D45FEA7EABCD64544B36C3975B0C9C166D495B4152E16977D053A0C400";

    expect(findServerCertificateFingerprint("https://localhost:22334/game", [
      {
        name: "local",
        addr: "https://localhost:22334/wt",
        fingerprint,
      },
    ])).toBe(fingerprint);
  });

  it("ignores servers without a fingerprint", () => {
    expect(findServerCertificateFingerprint("https://localhost:22334/wt", [
      {
        name: "local",
        addr: "https://localhost:22334/wt",
        fingerprint: "",
      },
    ])).toBeUndefined();
  });
});

describe("certificateFingerprintToArrayBuffer", () => {
  it("decodes hex into bytes", () => {
    expect(Array.from(new Uint8Array(certificateFingerprintToArrayBuffer("01ADff")))).toEqual([1, 173, 255]);
  });

  it("accepts colon-separated OpenSSL fingerprints", () => {
    expect(Array.from(new Uint8Array(certificateFingerprintToArrayBuffer("01:AD:ff")))).toEqual([1, 173, 255]);
  });
});
