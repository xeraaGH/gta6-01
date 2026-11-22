# CORAL BAY — Open-World Crime

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/xeraaGH/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard)
[![reward](https://make.fun/badge/gta6-01/xeraaGH/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01/leaderboard)

An original open-world crime game that plays offline in a desktop browser
from static files. You are Rae Delgado, back in Coral Bay broke — and the
Vulture Crew owns the docks, the streets and the cops they bought. Eight
story jobs stand between Rae and the top of the city.

## The game

- **A complete open world.** A sun-soaked grid city with towers, palms, a
  beach and the bay — explored on foot and by car, with traffic following the
  streets, pedestrians on the sidewalks, and cars you can steal (walk up and
  press E).
- **Wanted system and police who respond.** Crime raises 1–5 stars. The
  Coral Bay PD sends cruisers that chase and ram, roadblocks at 3 stars, and
  the Air One helicopter with its searchlight at 4. Lay low to cool off, or
  reach the safehouse to clear the heat.
- **Eight story missions.** Steal your first wheels, run a timed delivery,
  lose a 2-star tail, take down Vulture runners in a shootout, steal the
  Falcon S supercar from a guarded marina, survive a 4-star getaway, and end
  the crew at the container yard — then claim the bay overlook.
- **Combat and weapons.** Fists, pistol, SMG and a buyable shotgun, with a
  hold-Q weapon wheel, hitscan tracers, muzzle flash and enemy gunmen who
  advance, strafe and shoot back.
- **Progression that rewards play.** Mission payouts, street pickups
  (cash, health, armor, ammo), respect ranks from Rookie to King of Coral
  Bay, a TAC SHOP for guns and gear, and a garage for paint, engine tunes,
  turbo and armor.
- **Feel and polish.** Third-person camera with mouse orbit and zoom, arcade
  driving with handbrake, a HUD with a live circular minimap, health/armor
  bars, wanted stars and speedometer, three synthesized radio stations
  (WebAudio, no audio files), engine hum and sirens, start/pause/mission
  menus, game-over and story-complete screens, and localStorage saves.

## How to play

Serve `game/` with any static server and open `index.html` in desktop
Chrome — no network, no build step:

```sh
node serve.ts   # then open http://localhost:8080
```

WASD move/drive · Shift sprint · Space jump/handbrake · E steal/enter car ·
Click/F shoot · 1–4 or hold Q weapons · R radio · M story · H horn ·
P pause · C camera.

Everything in Coral Bay is original: the city, characters, vehicles, names,
story, art and music. No Rockstar, GTA or other commercial game content.
Three.js (r152) is vendored under `game/vendor/three.min.js`.
