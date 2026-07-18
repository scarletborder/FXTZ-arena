/**
 * Parses a raw string value from the CLI into the JSON value it represents.
 *
 * Resolution order:
 *  1. "null"      → returns `{ delete: true }` so the caller can unset a field.
 *  2. "true"/"false" (any case) → boolean.
 *  3. starts with `{` or `[` → parsed as JSON (object/array).
 *  4. a valid finite number → number.
 *  5. otherwise → the raw string.
 *
 * Agents should pass JSON objects/arrays as a single shell-quoted argument.
 */
export type ParsedValue =
  | { delete: true }
  | { value: unknown };

export function parseValue(raw: string): ParsedValue {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase() === "null") return { delete: true };
  if (trimmed.toLowerCase() === "true") return { value: true };
  if (trimmed.toLowerCase() === "false") return { value: false };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { value: JSON.parse(trimmed) };
    } catch (e) {
      throw new Error(`Invalid JSON value: ${(e as Error).message}`);
    }
  }
  const num = Number(trimmed);
  if (trimmed !== "" && Number.isFinite(num)) return { value: num };
  return { value: trimmed };
}

export function describeValue(v: unknown): string {
  if (v === undefined) return "(unset)";
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
