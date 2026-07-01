export interface PublicServer {
  readonly name: string;
  readonly addr: string;
  readonly selfAuth?: boolean;
  readonly fingerprint?: string;
}

export const PUBLIC_SERVER: readonly PublicServer[] = [
  {
    name: "local",
    addr: "ws://localhost:22334/",
    selfAuth: true,
  }
];
