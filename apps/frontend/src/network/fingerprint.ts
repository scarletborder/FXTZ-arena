import { PUBLIC_SERVER, type PublicServer } from "@repo/constants";

import { normalizeServerAddress } from "./address";

export function findServerCertificateFingerprint(
  address: string,
  servers: readonly PublicServer[] = PUBLIC_SERVER,
): string | undefined {
  const normalizedAddress = normalizeServerAddress(address);
  const match = servers.find((server) => {
    if (!server.fingerprint?.trim()) {
      return false;
    }
    return normalizeServerAddress(server.addr) === normalizedAddress;
  });

  return match?.fingerprint?.trim() || undefined;
}

export function certificateFingerprintToArrayBuffer(fingerprint: string): ArrayBuffer {
  debugger;
  const hex = fingerprint.replace(/[\s:]/g, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Certificate fingerprint must be an even-length hex string.");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes.buffer;
}
