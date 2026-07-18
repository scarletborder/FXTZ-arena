# maker-cli

A command-line editor for **STG stage JSON documents** (the `@repo/stage-schema`
format consumed by the game's `JsonMobSpawner` and edited by the `maker` web
app). It is designed to be driven by humans and, especially, by agents: every
command prints a **natural-language English** description of the result and
re-validates the document after each mutation.

## Install

`maker-cli` is a workspace package. Build it once:

```bash
pnpm --filter maker-cli build      # outputs dist/index.js (with shebang)
```

Run it via node, or through the linked bin:

```bash
node apps/maker-cli/dist/index.js <command> ...
# or, after build, via pnpm:
pnpm --filter maker-cli exec maker-cli <command> ...
```

In the examples below `maker-cli` stands for either form.

## Commands

```
maker-cli <command> [args] [options]
```

| Command | Description |
| --- | --- |
| `create <file> [--sample] [--id <id>] [--name <name>]` | Create a new stage document (empty, or `--sample` for a full demo). |
| `overview <file>` | Natural-language summary of the whole stage: header, node timeline, enemy defs, bullet presets, shop presets. |
| `view <file> <section> <id> [--json]` | Natural-language detail of one precise item. Sections: `node` \| `enemy` \| `bullet` \| `shop`. |
| `edit <file> <section> <id> <field> <value>` | Overwrite one field of an item. `field` is a dotted path. |
| `append <file> <section> <id> [flags]` | Append a new item to a section. |
| `help` | Show built-in help. |

### Sections & ids

- `node` — a node in the timeline. `<id>` is the node's id string, or `#<n>` /
  a bare number for a **1-based** index (e.g. `#2`).
- `enemy` / `bullet` / `shop` — an entry in `enemyDefs` / `bulletPresets` /
  `shopPresets`, addressed by its key id.

### `edit` — field addressing & value parsing

`<field>` is a dotted path into the item:

- `maxHealth`
- `spawn.x`
- `members.0.count` (numeric segments index into arrays)
- `rewards.drops`
- `rarityPulls.common`

`<value>` is parsed in this order:

1. `null` → **deletes** the field.
2. `true` / `false` (case-insensitive) → boolean.
3. Starts with `{` or `[` → parsed as JSON (object/array). Pass as a single
   shell-quoted argument.
4. A finite number → number.
5. Otherwise → string.

After every mutation the file is rewritten as 2-space-indented JSON and the
document is re-validated; any error-level issues are printed.

### `append` — creating new items

```
append <file> node <id> [--kind wave|shop]
append <file> enemy <id>
append <file> bullet <id>
append <file> shop <id>
```

Flags:

- `--from <srcId>` — clone an existing item as a template (handy for "another
  fairy variant"). The new item's id is forced to `<id>`.
- `--json '<json>'` — append a fully-specified item (its id is forced to
  `<id>`). Useful when an agent has constructed the exact object it wants.
- `--kind wave|shop` — for `node` only; selects the node kind (default `wave`).

With neither `--from` nor `--json`, a minimal valid default is created.

## Examples

```bash
# Start from the demo stage
maker-cli create stage.json --sample

# See everything
maker-cli overview stage.json

# Inspect one enemy
maker-cli view stage.json enemy fairy
maker-cli view stage.json node wave-1
maker-cli view stage.json node #2 --json

# Tweak fields
maker-cli edit stage.json enemy fairy maxHealth 2000
maker-cli edit stage.json enemy fairy spawn.x 300
maker-cli edit stage.json node wave-1 maxDurationSeconds 30
maker-cli edit stage.json node wave-1 clearOnTimeout true
maker-cli edit stage.json enemy fairy rewards.drops \
  '[{"type":"point","size":"large","count":3}]'

# Remove a field
maker-cli edit stage.json enemy fairy textureKey null

# Grow the stage
maker-cli append stage.json node wave-3 --kind wave
maker-cli append stage.json enemy bat --from fairy
maker-cli append stage.json bullet beam \
  --json '{"id":"beam","bullet":{"kind":"knife","speedRank":"high","width":8,"height":8}}'
maker-cli append stage.json shop second_shop
```

## Output contract

- All command output is plain text on stdout; errors go to stderr and the
  process exits non-zero on failure.
- Mutating commands print what changed (before/after) and a validation block.
- `view`/`overview` output is stable English prose, suitable for an agent to
  read back into its context.

## Development

```bash
pnpm --filter maker-cli check-types   # tsc --noEmit
pnpm --filter maker-cli build          # bunchee -> dist/index.js
pnpm --filter maker-cli dev            # bunchee --watch
```

Source layout (`apps/maker-cli/src/`):

- `index.ts` — entry, arg dispatch, help text.
- `args.ts` — argv → command + positionals + flags.
- `io.ts` — read/write file, item lookup, validation.
- `paths.ts` — dotted-path get/set/delete.
- `values.ts` — value-string parsing.
- `defaults.ts` — default items for `append`.
- `format.ts` — natural-language formatters.
- `commands.ts` — command implementations.

See `SKILL.md` for the agent-facing usage guide.
