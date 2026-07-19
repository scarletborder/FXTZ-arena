# SKILL.md — maker-cli

A skill for **editing STG stage JSON documents from the command line**.

`maker-cli` is the headless counterpart of the `maker` web app. It operates on
the `@repo/stage-schema` `StageDocument` format (the same JSON the game's
`JsonMobSpawner` consumes via `json:<id>`). Use it whenever you need to inspect
or mutate a stage file programmatically — it gives you stable, English,
human/agent-readable output and re-validates after every change.

## When to use

- An agent/user asks to inspect, create, or modify a stage JSON file.
- You need to make a precise, reproducible edit to a stage without the GUI.
- You want a compact English digest of a stage's contents.

Do **not** use it for: hand-editing arbitrary game code, or editing files that
are not `schemaVersion: 1` stage documents.

## Prerequisites

Build the tool first (once per checkout):

```bash
pnpm --filter maker-cli build
```

Then invoke as:

```bash
node apps/maker-cli/dist/index.js <command> ...     # direct
pnpm --filter maker-cli exec maker-cli <command> ... # via bin
```

Below, `maker-cli` denotes either. The file argument is a path to a `.json`
stage document (created/rewritten in place).

## Command grammar

```
create   <file> [--sample] [--id <id>] [--name <name>]
overview <file>
view     <file> <section> <id> [--json]
edit     <file> <section> <id> <field> <value>
append   <file> <section> <id> [--kind wave|shop] [--from <srcId>] [--symmetry mirror|axis] [--json '<json>']
help
```

### Sections & ids

- `node` — a timeline node. `<id>` = node id string, or `#<n>` / bare `<n>` for
  **1-based** index.
- `enemy` / `bullet` / `shop` — keyed by their id in `enemyDefs` /
  `bulletPresets` / `shopPresets`.

### `edit` field path & value rules

- `<field>` is a dotted path: `maxHealth`, `spawn.x`, `members.0.count`,
  `rewards.drops`, `rarityPulls.common`. Numeric segments index arrays.
- `<value>` parsing order:
  1. `null` → **delete** the field.
  2. `true`/`false` (any case) → boolean.
  3. starts with `{` or `[` → JSON (pass as one shell-quoted arg).
  4. finite number → number.
  5. else → string.
- After each edit the file is rewritten (2-space JSON) and re-validated; error
  issues are printed. Fix any reported errors before finishing.

### `append` modes

- Default — a minimal valid item (minion enemy, wave node, etc.).
- `--from <srcId>` — clone an existing item as a template (id forced to `<id>`).
- `--symmetry mirror|axis` — (requires `--from`, `node`/`enemy` sections only)
  reflect every coordinate of the clone so it occupies the mirrored half of the
  arena. `mirror` flips across the vertical center axis (`x' = width - x`),
  `axis` flips across the horizontal center axis (`y' = height - y`). Circle
  paths also flip `clockwise` and rotate `startAngleDegrees`; `drift`/`follow`
  negate the reflected velocity/offset component. Fire patterns are angle-based
  and left untouched. Ideal for building two-player cooperate waves that should
  look symmetric on both halves.
- `--json '<json>'` — append a fully-specified item (id forced to `<id>`).
- `--kind wave|shop` — node only (default `wave`).

## Standard workflow

1. **Inspect** the target stage:
   ```bash
   maker-cli overview stage.json
   maker-cli view stage.json enemy fairy
   maker-cli view stage.json node wave-1
   ```
2. **Make one edit at a time**, reading the before/after + validation block:
   ```bash
   maker-cli edit stage.json enemy fairy maxHealth 2000
   maker-cli edit stage.json node wave-1 maxDurationSeconds 30
   maker-cli edit stage.json node wave-1 clearOnTimeout true
   ```
3. **Grow** the stage by appending, then edit the new item's details:
   ```bash
   maker-cli append stage.json enemy bat --from fairy
   maker-cli edit stage.json enemy bat displayName "Bat"
   maker-cli append stage.json node wave-3
   maker-cli append stage.json node w3m0 --json '{"kind":"wave","id":"w3m0","minNextWaveSeconds":6,"maxNextWaveSeconds":12,"members":[{"key":"a","enemyDefId":"bat","class":"minion","spawnAtSeconds":0}]}'
   ```
4. **Re-verify** at the end:
   ```bash
   maker-cli overview stage.json     # includes a validation block
   ```

## Common patterns

- **Clone + tweak an enemy variant:**
  `append <f> enemy elite2 --from elite` then edit `maxHealth`, `tint`, drops.
- **Add a wave that times out and clears** (boss enrage / phase reset):
  `append <f> node wave-x` then `edit <f> node wave-x maxDurationSeconds 20`
  and `edit <f> node wave-x clearOnTimeout true`.
- **Set multi-size drops** (point small ×3 + power large ×1):
  ```
  edit <f> enemy fairy rewards.drops '[{"type":"point","size":"small","count":3},{"type":"power","size":"large","count":1}]'
  ```
- **Remove an optional field:** `edit <f> enemy fairy textureKey null`.
- **Read raw JSON** of one item (no prose): `view <f> enemy fairy --json`.
- **Clone a wave mirrored for the two-player layout** (full coordinate reflection):
  ```
  append <f> node wave-1-mirror --from wave-1 --symmetry mirror
  ```
- **Make a single wave member spawn on both halves** (runtime reflection of the
  spawn position only — cheap, no movement mirroring):
  ```
  edit <f> node wave-1 members.0.symmetry mirror
  ```
  The spawner then emits the original instance plus a reflected copy, so one
  entry covers both players. Prefer this for straight-descents / centered
  patterns; use `append --from --symmetry` when the motion itself must mirror.

## Rules & gotchas

- Never edit the JSON by hand while using the CLI — always go through the CLI so
  validation runs. If you must hand-edit, run `overview` afterward to re-check.
- `null` **deletes** a field; it does not store JSON null. Use a real value or
  `--json` for object/array fields.
- Numeric node ids are addressed by `#<n>` or bare `<n>` (1-based) to avoid
  ambiguity with string ids.
- Shell-quote any value containing spaces, braces, or brackets.
- The CLI rewrites the whole file (2-space JSON + trailing newline). Prefer
  committing the file via your normal git workflow; the CLI does not commit.
- On any error the process exits non-zero and the file is **not** rewritten.

## Output contract (for callers)

- stdout: the natural-language result (and `view`/`overview` digests).
- stderr: `error: <message>` on failure; exit code 1.
- Mutating commands append a `Validation:` block (`OK` or a bulleted list).
