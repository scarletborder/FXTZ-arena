export interface PublicServer {
  readonly name: string;
  readonly addr: string;
  readonly selfAuth?: boolean;
  readonly fingerprint?: string;
}

export const PUBLIC_SERVER: readonly PublicServer[] = [
  {
    name: "湖北十堰",
    addr: "wss://160.202.238.18:47343/",
    selfAuth: true,
  },
  {
    name: "local",
    addr: "https://localhost:22334/wt",
    selfAuth: true,
    fingerprint: "16AD31D45FEA7EABCD64544B36C3975B0C9C166D495B4152E16977D053A0C400",
  }
];
