export interface PublicServer {
  readonly name: string;
  readonly addr: string;
}

export const PUBLIC_SERVER: readonly PublicServer[] = [
  {
    name: "湖北十堰",
    addr: "ws://160.202.238.18:21483/",
  },
];
