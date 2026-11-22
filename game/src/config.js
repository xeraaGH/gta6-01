// Coral Bay — shared constants, tuning and mission data.
// One job: everything every other module reads, nothing else.

const CONFIG = {
  // City layout (metres). Streets run on a grid; blocks hold buildings.
  BLOCK: 44,            // building block size
  ROAD: 12,             // road width
  PITCH: 56,            // BLOCK + ROAD
  STREETS: [-112, -56, 0, 56, 112], // street centre lines (x and z)
  CITY: 140,            // half-extent of the built city
  BEACH_Z: 150,         // where the sand starts (south)
  OCEAN_Z: 178,         // where the water starts

  // Colours — sun-soaked coastal city.
  SKY: 0x8ec9e8,
  FOG: 0xa8d0e6,
  SUN: 0xfff2d8,
  GROUND: 0x9aa78c,
  ROAD_COLOR: 0x3a3f46,
  SIDEWALK: 0xb8b2a4,
  SAND: 0xe8d29a,
  OCEAN: 0x2e7fa8,
  BUILDING_PALETTE: [0xe8d8c0, 0xd8c8b8, 0xc8d8e0, 0xe0b8a8, 0xb8c8b0, 0xd8d0e8, 0xf0e0c0, 0xc0c8d8],
  CAR_PALETTE: [0xc0392b, 0x2471a3, 0xf1c40f, 0x1e8449, 0x7d3c98, 0xe67e22, 0x2c3e50, 0xbdc3c7],

  // Player tuning.
  WALK_SPEED: 6.5,
  SPRINT_SPEED: 10.5,
  JUMP_VELOCITY: 8.5,
  GRAVITY: 22,
  PLAYER_HEALTH: 100,

  // Car tuning.
  CAR_ACCEL: 16,
  CAR_BRAKE: 30,
  CAR_MAX_SPEED: 30,
  CAR_REVERSE_MAX: 10,
  CAR_STEER: 1.9,
  CAR_DRAG: 0.6,

  // Wanted system.
  WANTED_MAX: 5,
  WANTED_DECAY_SECONDS: 14,   // seconds clean before one star drops
  STEAL_STARS: 1,
  HIT_PED_STARS: 1,
  ATTACK_STARS: 1,

  // Police.
  POLICE_CAR_SPEED: 26,
  POLICE_OFFICER_SPEED: 7.5,
  BUST_SECONDS: 2.0,          // held by police this long = busted

  SAVE_KEY: 'coral-bay-save-v1',
};

// Story: Rook, a driver new in Coral Bay, works for Mara Voss.
const STORY = {
  hero: 'Rook',
  contact: 'Mara Voss',
  city: 'Coral Bay',
  intro: 'You are Rook, a wheelman fresh off the ferry in Coral Bay. Mara Voss runs this town\'s jobs from the Coral Diner. Prove yourself, get paid, and stay out of the Coral Bay PD\'s way.',
};

// Mission steps: goto = reach the marker; steal = get in any car; pickup = reach
// the marker and press E; evade = drop the wanted level to zero; timed = reach
// the marker before the clock runs out; deliver = reach the marker while in a car.
const MISSIONS = [
  {
    id: 1, name: 'First Day in Coral Bay', reward: 150,
    brief: 'Mara Voss is waiting at the Coral Diner. Walk over and say hello.',
    steps: [
      { type: 'goto', pos: [28, 0, -20], radius: 4, text: 'Walk to the Coral Diner (blue marker)' },
    ],
  },
  {
    id: 2, name: 'Borrowed Wheels', reward: 250,
    brief: 'Mara needs wheels. "Borrow" any car and bring it to the garage on Marina Row.',
    steps: [
      { type: 'steal', text: 'Get in any car (walk up and press E)' },
      { type: 'deliver', pos: [56, 0, 84], radius: 5, text: 'Drive the car to the garage on Marina Row' },
    ],
  },
  {
    id: 3, name: 'The Pickup', reward: 400,
    brief: 'A package is waiting on the boardwalk. Pick it up and drop it at the Marina.',
    steps: [
      { type: 'goto', pos: [-84, 0, 140], radius: 4, text: 'Go to the boardwalk pickup' },
      { type: 'pickup', pos: [-84, 0, 140], radius: 3, text: 'Press E to grab the package' },
      { type: 'deliver', pos: [112, 0, 140], radius: 5, text: 'Deliver the package to the Marina' },
    ],
  },
  {
    id: 4, name: 'Hot Wheels', reward: 500,
    brief: 'The cops saw the pickup. Lose the heat — get your wanted level to zero.',
    steps: [
      { type: 'wanted', stars: 2, text: 'The heat is on — you are wanted' },
      { type: 'evade', text: 'Lose the cops: stay out of sight until the stars clear' },
    ],
  },
  {
    id: 5, name: 'The Getaway', reward: 800,
    brief: 'Mara is at the Coral Bank plaza and the PD is closing in. Pick her up and get her to the safehouse.',
    steps: [
      { type: 'goto', pos: [-28, 0, -84], radius: 4, text: 'Pick up Mara at the Coral Bank plaza' },
      { type: 'wanted', stars: 3, text: 'Three stars — the whole precinct is coming' },
      { type: 'deliver', pos: [-112, 0, 84], radius: 5, text: 'Drive Mara to the safehouse on Coral Row' },
    ],
  },
  {
    id: 6, name: 'Beach Run', reward: 700,
    brief: 'A client on the far pier wants the package in 90 seconds. Drive the beach road fast.',
    steps: [
      { type: 'pickup', pos: [0, 0, 140], radius: 3, text: 'Press E to grab the package on the boardwalk' },
      { type: 'timed', pos: [-112, 0, 140], radius: 5, seconds: 90, text: 'Deliver to the far pier in 90 seconds' },
    ],
  },
  {
    id: 7, name: 'The Heist', reward: 1500,
    brief: 'The gold car at the Coral Bank plaza is the prize. Take it and bring it to the chop shop.',
    steps: [
      { type: 'steal-gold', pos: [-28, 0, -84], radius: 4, text: 'Steal the gold car at the Coral Bank plaza' },
      { type: 'deliver', pos: [84, 0, -112], radius: 5, text: 'Drive it to the chop shop on Palm Row' },
    ],
  },
  {
    id: 8, name: 'King of Coral Bay', reward: 3000,
    brief: 'One last run: reach the lighthouse with the whole city on your tail, then vanish.',
    steps: [
      { type: 'wanted', stars: 4, text: 'Four stars — every unit in Coral Bay is on you' },
      { type: 'deliver', pos: [112, 0, 140], radius: 6, text: 'Reach the lighthouse at the Marina' },
      { type: 'evade', text: 'Now lose them all. Stay clean until the stars clear' },
    ],
  },
];

// Small helpers shared by every module.
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function dist2D(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
