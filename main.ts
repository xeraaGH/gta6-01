// Coral Bay — entrypoint: hands the game in.
// Copies game/ and screenshots/ from this repository into /output and writes
// /output/dossier.json with the kit's vendored make.fun library, exactly as
// the scorer rebuilds it. Runs twice and must write identical bytes both times.
//
// Local check:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play locally:  node serve.ts  (then open http://localhost:8080)

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files in all, or a path under game/ over 1000 bytes: game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Validate what was just handed in, so a broken copy fails loudly here
// instead of at the gate: game/index.html must exist, every screenshot must
// be within the gate's size cap, and the dossier must be non-empty.
const indexStat = statSync(join(out, 'game', 'index.html'));
if (!indexStat.isFile() || indexStat.size === 0 || indexStat.size > 1048576) {
  throw new Error('game/index.html is missing, empty or over the 1 MiB cap');
}
const shotNames = readdirSync(join(out, 'screenshots')).filter((n) => !n.startsWith('.'));
if (shotNames.length < 3 || shotNames.length > 4) {
  throw new Error(`expected 3 or 4 screenshots, found ${shotNames.length}`);
}
for (const name of shotNames) {
  const s = statSync(join(out, 'screenshots', name));
  if (!s.isFile() || s.size > 262144) throw new Error(`screenshot ${name} is over the 256 KiB cap`);
}
const dossierStat = statSync(join(out, 'dossier.json'));
if (!dossierStat.isFile() || dossierStat.size === 0 || dossierStat.size > 1572864) {
  throw new Error('dossier.json is missing, empty or over the 1.5 MiB cap');
}
console.log(`Coral Bay handed in: ${shotNames.length} screenshots, dossier ${dossierStat.size} bytes`);
