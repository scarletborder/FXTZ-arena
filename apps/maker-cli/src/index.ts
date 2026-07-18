#!/usr/bin/env node
import { parseArgs } from "./args";
import {
  cmdCreate,
  cmdOverview,
  cmdView,
  cmdEdit,
  cmdAppend,
} from "./commands";

const HELP = `maker-cli — command-line editor for STG stage JSON documents.

USAGE
  maker-cli <command> [args] [options]

COMMANDS
  create <file> [--sample] [--id <id>] [--name <name>]
      Create a new stage document. --sample fills in a full demo stage;
      otherwise an empty stage. --id/--name override the defaults.

  overview <file>
      Print a natural-language English summary of the whole stage: its
      header, the node timeline, enemy definitions, bullet presets, and shop
      presets.

  view <file> <section> <id> [--json]
      Print a natural-language description of one precise item.
      Sections: node | enemy | bullet | shop.
      <id> for a node is its id string, or "#<n>" / "<n>" for a 1-based index.
      --json dumps the raw JSON of the item instead.

  edit <file> <section> <id> <field> <value>
      Overwrite a single field on a precise item with a new value.
      <field> is a dotted path, e.g. "maxHealth", "spawn.x", "members.0.count",
      "rewards.drops". <value> is parsed as: number, boolean, "null" (deletes
      the field), JSON object/array (when starting with { or [), else string.
      Examples:
        edit s.json enemy fairy maxHealth 2000
        edit s.json enemy fairy spawn.x 300
        edit s.json node wave-1 maxDurationSeconds 30
        edit s.json enemy fairy rewards.drops '[{"type":"point","size":"large","count":3}]'

  append <file> <section> <id> [--kind wave|shop] [--from <srcId>] [--json '<json>']
      Append a new item to a section.
      - append <file> node <id> [--kind wave|shop]   (default kind: wave)
      - append <file> enemy <id>
      - append <file> bullet <id>
      - append <file> shop <id>
      --from <srcId> clones an existing item as a template.
      --json '<json>' appends a fully-specified item (its id is forced to <id>).
      Without --from/--json a minimal valid default item is created.

  help
      Show this help.

Every mutating command re-validates the document and prints any error-level
issues. The file is always rewritten as 2-space-indented JSON.
`;

function main(): void {
  const { command, positionals, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "create":
      cmdCreate({ positionals, flags });
      break;
    case "overview":
      cmdOverview({ positionals });
      break;
    case "view":
      cmdView({ positionals, flags });
      break;
    case "edit":
      cmdEdit({ positionals });
      break;
    case "append":
      cmdAppend({ positionals, flags });
      break;
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      break;
    default:
      process.stderr.write(`Unknown command "${command}".\n\n`);
      process.stdout.write(HELP);
      process.exit(1);
  }
}

main();
