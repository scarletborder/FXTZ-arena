export interface PublicServer {
  readonly name: string;
  readonly addr: string;
  readonly selfAuth?: boolean;
}

export const PUBLIC_SERVER: readonly PublicServer[] = [
  {
    name: "湖北十堰",
    addr: "wss://160.202.238.18:47343/",
    selfAuth: true,
  },
];
