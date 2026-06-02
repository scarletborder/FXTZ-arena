import { IS_DESKTOP_APP } from "@repo/constants";

import { findServerCertificateFingerprint } from "../../network/fingerprint";
import { isWebTransportAddress, normalizeServerAddress } from "../../network/address";
import { WsNetworkTransport, WtNetworkTransport } from "../../network/transport";
import type { BaseNetworkTransport } from "../../network/transport";

const PROBE_TIMEOUT_MS = 6_000;

export interface ProbeResult {
  readonly kind: "ok" | "trust_required" | "error";
  readonly latencyMs?: number;
}

export function probeCustomServer(
  rawAddress: string,
  onResult: (result: ProbeResult, trustUrl: string) => void,
): () => void {
  const startedAt = performance.now();
  let settled = false;
  let transport: BaseNetworkTransport | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let trustUrl = "";

  const finish = (result: ProbeResult) => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    transport?.close();
    onResult(result, trustUrl);
  };

  try {
    const address = normalizeServerAddress(rawAddress);
    trustUrl = toTrustUrl(address);
    const trustRequiredResult: ProbeResult = mayNeedTrust(address)
      ? { kind: "trust_required" }
      : { kind: "error" };

    transport = isWebTransportAddress(address)
      ? new WtNetworkTransport(
        address,
        {
          open: () => finish({ kind: "ok", latencyMs: Math.max(1, Math.round(performance.now() - startedAt)) }),
          close: () => finish(trustRequiredResult),
          error: () => finish(trustRequiredResult),
          message: () => undefined,
        },
        IS_DESKTOP_APP ? undefined : findServerCertificateFingerprint(address),
      )
      : new WsNetworkTransport(address, {
        open: () => finish({ kind: "ok", latencyMs: Math.max(1, Math.round(performance.now() - startedAt)) }),
        close: () => finish(trustRequiredResult),
        error: () => finish(trustRequiredResult),
        message: () => undefined,
      });

    timeout = setTimeout(() => {
      finish(trustRequiredResult);
    }, PROBE_TIMEOUT_MS);
    transport.open();
  } catch {
    finish({ kind: "error" });
  }

  return () => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    transport?.close();
  };
}

function mayNeedTrust(address: string): boolean {
  if (IS_DESKTOP_APP) {
    return false;
  }
  return /^wss:\/\//i.test(address) || /^https:\/\//i.test(address);
}

export function toTrustUrl(addr: string): string {
  if (!addr) {
    return "";
  }
  try {
    const url = new URL(addr);
    if (url.protocol === "wss:") {
      url.protocol = "https:";
    } else if (url.protocol === "ws:") {
      url.protocol = "http:";
    }
    url.pathname = "/echo";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    if (/^wss:\/\//i.test(addr)) {
      return `${addr.replace(/^wss:\/\//i, "https://").replace(/\/[^/?#]*(?:[?#].*)?$/, "")}/echo`;
    }
    if (/^ws:\/\//i.test(addr)) {
      return `${addr.replace(/^ws:\/\//i, "http://").replace(/\/[^/?#]*(?:[?#].*)?$/, "")}/echo`;
    }
    return addr;
  }
}
