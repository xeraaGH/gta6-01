# Coral Bay — an open-world crime game

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/xeraaGH/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/xeraaGH/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

**Coral Bay** is an open-world crime game in the spirit of GTA 6, built for make.fun's
["Make GTA 6" bounty](https://make.fun/bounty/gta6-01) ($1,666 total prize, top 100 paid).
Everything in it is original: the city, the characters, the vehicles, the story, the
art and the sounds. Nothing from Rockstar Games or any other commercial game.

## The game

You are **Rook**, a wheelman fresh off the ferry in **Coral Bay**, a sun-soaked modern
coastal city. **Mara Voss** runs the town's jobs from the Coral Diner. Prove yourself
across **8 story missions**, get paid, and stay out of the Coral Bay PD's way.

- **A living city** — driveable streets, traffic that follows the roads, pedestrians
  on the sidewalks, a beach, a boardwalk, a pier and a lighthouse.
- **Cars to steal and drive** — any parked or traffic car is yours if you can reach it
  (press E). Stealing one puts a star on you.
- **A wanted system** — 1 to 5 stars. The Coral Bay PD sends cruisers and foot officers
  who chase and ram you; stay clean and the heat fades, or lose them in the streets.
- **8 story missions** — from a first hello at the diner to a four-star finale at the
  lighthouse, with cash rewards up to $3,000. Total purse: $6,800.
- **A HUD with a minimap** — health, money, wanted stars, speed, objectives, a timer,
  and a live top-down map with the mission marker and police blips.
- **Save** — progress (money and mission) is kept in localStorage; continue where you
  left off.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse drag | Orbit camera (wheel zooms) |
| Shift | Sprint |
| Space | Jump |
| E | Enter / exit car, pick up a package |
| F or click | Punch |
| Esc | Pause |
| M | Mute |

## How to play

Serve the `game/` folder with any static HTTP server and open `game/index.html`
in desktop Chrome. No build step, no network requests — every file is local,
including the vendored three.js build under `game/vendor/`.

```
python3 -m http.server --directory game 8000
# open http://localhost:8000/
```

## How it is built

- **three.js r186** (vendored as `game/vendor/three.min.js`) renders the city.
- Vanilla JavaScript, split into files with one clear job each:
  `config.js` (tuning + missions), `world.js` (the city), `vehicles.js` (cars),
  `traffic.js` (pedestrians + traffic), `player.js` (on-foot play + camera),
  `police.js` (wanted level + chases), `missions.js` (the story),
  `hud.js` (HUD + minimap + menus), `audio.js` (WebAudio synth sounds),
  `main.js` (boot + game loop).
- `main.ts` (Node 22, stdlib only) hands the game in: it copies `game/` and
  `screenshots/` to the output directory and writes `dossier.json` with the
  kit's `buildDossier`.

## License

MIT — see [LICENSE](LICENSE). Built by an AI agent for make.fun's
"Make GTA 6" bounty.
