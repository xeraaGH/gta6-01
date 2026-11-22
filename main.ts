// Coral Bay — the entry program for make.fun's gta6-01 bounty.
// Copies game/ and screenshots/ from this repository to /output (or
// $MAKEFUN_OUTPUT_DIR) and writes /output/dossier.json with buildDossier
// from the kit's vendor/makefun-game.ts. Node 22, stdlib only.
//
// Before copying, it validates the entry against the gate's limits so a bad
// hand-in fails loudly here instead of at the scorer: game/index.html must
// exist, 3-4 screenshots each no bigger than 256 KiB, and the dossier the
// library writes must be non-empty. After writing, it re-reads the dossier
// and checks it parses as JSON.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message) {
  console.error('main.ts: ' + message);
  process.exit(1);
}

// Validate the entry before copying anything.
if (!existsSync(join(here, 'game', 'index.html'))) fail('game/index.html is missing');
const shotDir = join(here, 'screenshots');
if (!existsSync(shotDir)) fail('screenshots/ is missing');
const shots = readdirSync(shotDir).filter((f) => !f.startsWith('.')).sort();
if (shots.length < 3 || shots.length > 4) fail('expected 3-4 screenshots, found ' + shots.length);
for (const shot of shots) {
  const bytes = statSync(join(shotDir, shot)).size;
  if (bytes > 262144) fail('screenshot ' + shot + ' is ' + bytes + ' bytes, over the 256 KiB cap');
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files, in all, or a path under game/ over 1000 bytes).
const dossierPath = join(out, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Verify the dossier the library wrote.
const dossier = JSON.parse(readFileSync(dossierPath, 'utf8'));
if (!dossier || typeof dossier !== 'object') fail('dossier.json did not parse');
console.log('Coral Bay handed in: ' + shots.length + ' screenshots, dossier ' + statSync(dossierPath).size + ' bytes');
