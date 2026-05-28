export interface PublicServer {
  readonly name: string;
  readonly addr: string;
}

export const PUBLIC_SERVER: readonly PublicServer[] = [
  {
    name: "湖北十堰",
    addr: "wss://arena-api.scarletborder.cn:443/",
  },
];
