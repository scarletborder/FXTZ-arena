export interface PublicServer {
  readonly name: string;
  readonly addr: string;
  readonly selfAuth?: boolean;
  readonly fingerprint?: string;
}

export const PUBLIC_SERVER: readonly PublicServer[] = [
  {
    name: "湖北十堰1号",
    addr: "wss://160.202.238.18:47343/",
    selfAuth: true,
  },
  {
    name: "湖北十堰1号(desktop专用)",
    addr: "https://160.202.238.18:47343/wt",
    selfAuth: true,
  },
  {
    name: "local",
    addr: "ws://localhost:22334/",
    selfAuth: true,
  }
];
