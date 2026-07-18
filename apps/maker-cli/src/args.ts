export interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

/**
 * Parses argv (already stripped of node + script path) into a command,
 * positionals, and `--flag value` / `--flag` flags. A bare `--flag` becomes
 * `true`; `--flag value` consumes the next token as its string value.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let i = 0;
  while (i < argv.length) {
    const tok = argv[i]!;
    if (tok.startsWith("--")) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i += 1;
      }
    } else {
      positionals.push(tok);
      i += 1;
    }
  }
  const command = positionals.shift() ?? "help";
  return { command, positionals, flags };
}
