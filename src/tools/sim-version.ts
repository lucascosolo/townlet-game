// A hash of the sim's source (src/sim, src/content and src/scenarios: what decides a town's state),
// so a save can say which sim made it (save reliability, 2026-10-11). The same files give the same hash on any machine. The build puts it
// in the browser as __SIM_VERSION__ (vite.config.ts); the fixture tool and the loader test use it directly.
import { createHash, type Hash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function feed(hash: Hash, dir: string): void {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) feed(hash, path);
    else hash.update(path).update('\0').update(readFileSync(path)).update('\0');
  }
}

export function simVersion(dirs = ['src/sim', 'src/content', 'src/scenarios']): string {
  const hash = createHash('sha1');
  for (const dir of dirs) feed(hash, dir);
  return hash.digest('hex').slice(0, 10);
}
