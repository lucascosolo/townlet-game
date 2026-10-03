// Minimal --key value / --flag argument parsing for the CLI tools.
export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[a.slice(2)] = next;
      i++;
    } else {
      out[a.slice(2)] = true;
    }
  }
  return out;
}

export function num(args: Record<string, string | true>, key: string, fallback: number): number {
  const v = args[key];
  if (v === undefined || v === true) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${key} must be a number, got "${v}"`);
  return n;
}

export function str(args: Record<string, string | true>, key: string, fallback: string): string {
  const v = args[key];
  return typeof v === 'string' ? v : fallback;
}
