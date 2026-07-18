/**
 * Dotted-path access for arbitrary JSON values.
 *
 * Paths look like `members.0.count` or `rewards.drops` — numeric segments index
 * into arrays, everything else indexes into objects. Getting a missing key
 * returns `undefined`; setting a missing key creates it (arrays are extended
 * with `null` holes when needed).
 */

export function getByPath(root: unknown, path: string): unknown {
  if (path === "") return root;
  const parts = path.split(".");
  let cur: unknown = root;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(part);
      cur = Number.isInteger(idx) ? cur[idx] : undefined;
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

export function setByPath(root: unknown, path: string, value: unknown): void {
  const parts = path.split(".");
  if (parts.length === 0) return;
  let cur: unknown = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const nextPart = parts[i + 1]!;
    const nextIsIndex = /^\d+$/.test(nextPart);
    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (cur[idx] == null) {
        cur[idx] = nextIsIndex ? [] : {};
      }
      cur = cur[idx];
    } else if (typeof cur === "object" && cur !== null) {
      const obj = cur as Record<string, unknown>;
      if (obj[part] == null) {
        obj[part] = nextIsIndex ? [] : {};
      }
      cur = obj[part];
    } else {
      return;
    }
  }
  const last = parts[parts.length - 1]!;
  if (Array.isArray(cur)) {
    cur[Number(last)] = value;
  } else if (typeof cur === "object" && cur !== null) {
    (cur as Record<string, unknown>)[last] = value;
  }
}

export function deleteByPath(root: unknown, path: string): void {
  const parts = path.split(".");
  if (parts.length === 0) return;
  let cur: unknown = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (Array.isArray(cur)) {
      cur = cur[Number(part)];
    } else if (typeof cur === "object" && cur !== null) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return;
    }
    if (cur == null) return;
  }
  const last = parts[parts.length - 1]!;
  if (Array.isArray(cur)) {
    const idx = Number(last);
    if (Number.isInteger(idx)) cur.splice(idx, 1);
  } else if (typeof cur === "object" && cur !== null) {
    delete (cur as Record<string, unknown>)[last];
  }
}
