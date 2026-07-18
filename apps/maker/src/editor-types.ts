export type Selection =
  | { kind: "overview" }
  | { kind: "preview" }
  | { kind: "node"; index: number }
  | { kind: "enemy"; id: string }
  | { kind: "bullet"; id: string }
  | { kind: "shop"; id: string }
  | { kind: "json" };
