const DEFAULT_WS_PORT = 22334;

export function normalizeServerAddress(input: string): string {
  const value = input.trim();
  if (value.length === 0) {
    return `ws://localhost:${DEFAULT_WS_PORT}`;
  }

  if (/^wss?:\/\//i.test(value)) {
    return ensurePort(value);
  }

  if (value.startsWith("[")) {
    return ensurePort(`ws://${value}`);
  }

  if (isBareIpv6(value)) {
    return `ws://[${value}]:${DEFAULT_WS_PORT}`;
  }

  return ensurePort(`ws://${value}`);
}

function isBareIpv6(value: string): boolean {
  const withoutPath = value.split(/[/?#]/, 1)[0] ?? value;
  return (withoutPath.match(/:/g)?.length ?? 0) >= 2;
}

function ensurePort(urlLike: string): string {
  const hasExplicitPort = /^(wss?:\/\/)?\[[^\]]+\]:\d+(?:[/?#]|$)/i.test(urlLike)
    || /^(wss?:\/\/)?[^/[?:#]+:\d+(?:[/?#]|$)/i.test(urlLike);
  const url = new URL(urlLike);
  if (!url.port && !hasExplicitPort) {
    url.port = String(DEFAULT_WS_PORT);
  }
  return url.toString();
}
