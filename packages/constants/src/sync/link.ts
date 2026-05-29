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
  // {
  //   name: "local",
  //   addr: "wss://localhost:22334/",
  //   selfAuth: true,
  // }
];
