import { IS_DESKTOP_APP } from "@repo/constants";

type UnlistenFn = () => void;

interface TauriCoreApi {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

interface TauriEventApi {
  listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn>;
}

export interface UdpPacket {
  readonly addr: string;
  readonly data: Uint8Array;
}

async function loadTauri(): Promise<{ core: TauriCoreApi; event: TauriEventApi }> {
  if (!IS_DESKTOP_APP) {
    throw new Error("UDP is only available in the desktop client");
  }

  const [core, event] = await Promise.all([
    import("@tauri-apps/api/core") as Promise<TauriCoreApi>,
    import("@tauri-apps/api/event") as Promise<TauriEventApi>,
  ]);
  return { core, event };
}

export async function listenUdp(port: number): Promise<string> {
  const { core } = await loadTauri();
  return core.invoke<string>("udp_listen", { port });
}

export async function stopUdp(): Promise<void> {
  const { core } = await loadTauri();
  await core.invoke("udp_stop");
}

export async function sendUdp(addr: string, data: Uint8Array): Promise<void> {
  const { core } = await loadTauri();
  await core.invoke("udp_send", { addr, data: Array.from(data) });
}

export async function subscribeUdp(onPacket: (packet: UdpPacket) => void): Promise<UnlistenFn> {
  const { event } = await loadTauri();
  return event.listen<{ addr: string; data: number[] }>("udp-receive", ({ payload }) => {
    onPacket({ addr: payload.addr, data: new Uint8Array(payload.data) });
  });
}
