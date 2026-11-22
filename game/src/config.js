// Coral Bay — configuration, seeded RNG, story data, vehicle and rank tables.
// All names, characters, places and story beats are original inventions.
(function () {
  'use strict';

  // Seeded RNG (mulberry32) so the city layout is identical on every load.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var CB = window.CB || (window.CB = {});

  CB.RNG = mulberry32;
  CB.SEED = 20261122;
  CB.CITY = 1200;          // playable city size (x and z from -600 to 600)
  CB.STREET = 120;         // street grid spacing
  CB.ROAD_W = 18;          // road width
  CB.SAVE_KEY = 'coralbay-save-v1';

  CB.RANKS = [
    { at: 0, name: 'ROOKIE' },
    { at: 2, name: 'HUSTLER' },
    { at: 4, name: 'STREET BOSS' },
    { at: 6, name: 'KINGPIN' },
    { at: 8, name: 'KING OF CORAL BAY' },
  ];

  CB.WEAPONS = [
    { id: 'fists', name: 'FISTS', damage: 25, range: 2.6, rate: 0.35, auto: false, ammo: Infinity, spread: 0 },
    { id: 'pistol', name: 'PISTOL', damage: 34, range: 70, rate: 0.28, auto: false, ammo: 0, spread: 0.012 },
    { id: 'smg', name: 'SMG', damage: 18, range: 55, rate: 0.085, auto: true, ammo: 0, spread: 0.045 },
    { id: 'shotgun', name: 'SHOTGUN', damage: 16, range: 26, rate: 0.8, auto: false, ammo: 0, spread: 0.09, pellets: 7 },
  ];

  CB.CAR_DEFS = {
    sedan:   { name: 'MERIDIAN SEDAN', top: 26, accel: 14, grip: 2.6, color: 0x8a97a8 },
    taxi:    { name: 'BAY CAB', top: 24, accel: 13, grip: 2.6, color: 0xf5c542 },
    coupe:   { name: 'VELOCE GT', top: 34, accel: 19, grip: 3.1, color: 0xc23b3b },
    truck:   { name: 'HAULER PICKUP', top: 22, accel: 11, grip: 2.3, color: 0x4a7a5c },
    van:     { name: 'CARGO VAN', top: 21, accel: 10, grip: 2.2, color: 0xd8d3c8 },
    police:  { name: 'CBPD CRUISER', top: 31, accel: 18, grip: 3.0, color: 0x1c2f4a },
    sport:   { name: 'FALCON S', top: 38, accel: 22, grip: 3.4, color: 0xff7a1a },
  };

  // Story: Rae Delgado vs the Vulture Crew. Eight jobs, sequential.
  CB.MISSIONS = [
    {
      id: 'm1', title: 'FIRST WHEELS', pay: 400,
      brief: 'Rae is broke and on foot. Steal any car on the street and drive it to the gold marker at Marina Row.',
      steps: [
        { type: 'stealCar', text: 'Steal a car (walk up to one and press E)' },
        { type: 'goto', pos: [420, 0, 430], radius: 10, text: 'Drive to Marina Row' },
      ],
    },
    {
      id: 'm2', title: 'THE PICKUP', pay: 600,
      brief: 'Old friend Marisol left a package under the pier. Pick it up and bring it back to the safehouse — no cops.',
      steps: [
        { type: 'goto', pos: [-480, 0, 480], radius: 8, text: 'Collect the package under the pier' },
        { type: 'goto', pos: [-60, 0, -60], radius: 10, text: 'Return to the safehouse' },
      ],
    },
    {
      id: 'm3', title: 'HOT DELIVERY', pay: 900,
      brief: 'A buyer at the north docks wants the package in 90 seconds. Speed draws the eye of the CBPD — drive fast, drive clean.',
      steps: [
        { type: 'timed', pos: [480, 0, -480], radius: 10, time: 90, text: 'Deliver to the north docks — 90 seconds!' },
      ],
    },
    {
      id: 'm4', title: 'STREET HEAT', pay: 800,
      brief: 'The drop went sideways. The CBPD is on Rae at 2 stars. Lose them — break line of sight and stay quiet until the heat dies.',
      steps: [
        { type: 'escape', wanted: 2, text: 'Lose the police — escape the 2-star wanted level' },
      ],
    },
    {
      id: 'm5', title: 'THE EXCHANGE', pay: 1400,
      brief: 'Vulture Crew runners are trading at the old depot. Take them down — all of them — and send the crew a message.',
      steps: [
        { type: 'kill', pos: [-360, 0, -240], radius: 26, count: 4, text: 'Take out the Vulture runners at the depot (0/4)' },
        { type: 'goto', pos: [-60, 0, -60], radius: 10, text: 'Get back to the safehouse' },
      ],
    },
    {
      id: 'm6', title: 'GRAND THEFT MARINA', pay: 1800,
      brief: 'A Falcon S — the fastest car in Coral Bay — sits guarded at the marina lot. Take it. The guards will not just watch.',
      steps: [
        { type: 'kill', pos: [360, 0, 360], radius: 30, count: 3, text: 'Clear the marina guards (0/3)' },
        { type: 'stealCar', carType: 'sport', text: 'Steal the Falcon S' },
        { type: 'goto', pos: [-60, 0, -60], radius: 12, text: 'Bring the Falcon S to the safehouse' },
      ],
    },
    {
      id: 'm7', title: 'THE GETAWAY', pay: 2200,
      brief: 'The whole CBPD is coming — 4 stars, roadblocks, and Air One above. Drive from the marina to the north docks and do not get caught.',
      steps: [
        { type: 'chase', pos: [480, 0, -480], radius: 12, wanted: 4, text: 'Reach the north docks with 4-star heat on you' },
      ],
    },
    {
      id: 'm8', title: 'KING OF CORAL BAY', pay: 5000,
      brief: 'Vulture himself is at the container yard with his last crew. End it. Then drive to the bay overlook and claim the city.',
      steps: [
        { type: 'kill', pos: [0, 0, -480], radius: 34, count: 6, text: 'Take down Vulture and his crew (0/6)' },
        { type: 'goto', pos: [0, 0, 540], radius: 12, text: 'Drive to the bay overlook' },
      ],
    },
  ];

  CB.PICKUPS = [
    { kind: 'cash', pos: [180, 0, 180], amount: 150 },
    { kind: 'cash', pos: [-300, 0, 60], amount: 150 },
    { kind: 'cash', pos: [60, 0, -300], amount: 200 },
    { kind: 'health', pos: [300, 0, -60], amount: 50 },
    { kind: 'health', pos: [-180, 0, 300], amount: 50 },
    { kind: 'armor', pos: [0, 0, 180], amount: 50 },
    { kind: 'armor', pos: [-420, 0, -420], amount: 50 },
    { kind: 'ammo', pos: [420, 0, -180], amount: 48 },
  ];

  CB.SHOP_POS = [240, 0, -240];      // TAC SHOP
  CB.GARAGE_POS = [-240, 0, 240];    // Garage
  CB.SAFEHOUSE_POS = [-60, 0, -60];  // Safehouse (clears wanted)
})();
