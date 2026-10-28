# Rack & Roll — prototype

A landscape mini-golf game played with a pool cue and pool ball across six themed courses: **Aim • Bank • Avoid • Sink.**
One TypeScript/HTML5-canvas codebase, packaged for **iOS (App Store)** and **Android (Google Play)** with [Capacitor](https://capacitorjs.com).

## What's in the prototype

- **Candy Land**, the opening 6-hole course (par 21), each hole confirmed solvable at or under par by a shot simulator. Mint-frosted fairways and **cake layers stacked into levels**: icing rims along their solid edges, and open edges dripping with frosting where the ball rolls off and drops to the level below. **Rainbow chutes** slide the ball down a level (one is a shortcut over a chocolate river, one sends an overhit ball all the way back to the start, like the board game), and **candy-cane ladders** carry it up to the next layer. Gumdrop bumpers, lollipop trees, strolling gingerbread men, chocolate ponds (+1 stroke) and sugar bunkers, with cupcakes, giant lollipops, ice-cream mountains, cotton-candy clouds and a rainbow around. Holes:
  1. **Sugar Rush**: tee off the top of a cake layer and roll off its open edge onto the fairway, round the chocolate pond
  2. **Candy Cane Ladder**: the cup is up on a cake layer; roll onto the ladder's foot past a strolling gingerbread man
  3. **Chocolate Falls**: drop off the tee layer and cross the wafer bridge, or find the chute that slides you over the river
  4. **Gingerbread Lane**: stop on the timed platform in front of the cake, ride it up and roll across the cake, or go round through the lanes
  5. **Chutes & Ladders** (par 5): two ladders up the cake steps to the top layer; overshoot the cup and the chute behind it slides you back to the start
  6. **Cake Walk**: a two-layer cake with the cup on top; its open east sides tumble an overhit ball back down to the ground
  (The original Garden Club holes are kept in the code, and its garden look still hosts the trick shots.)
- **Moving platforms** on a timer: they rest level with the ground, rise to the level above, hold, then sink back (`Tier.move`; marked with yellow-and-black hazard stripes). Roll on while one is down, ride it up, and roll off when it's level with the next layer; raised, its sides are walls. On **Gingerbread Lane** (Candy Land), **Crater Hop** (Lunar Links, a hover pad up to a green on a mesa, now par 4) and **Hall of Doors** (Pharaoh's Tomb, a stone lift to the altar as the last of three timed gates).
- **Multi-level holes on every course**, each with its own way up and its own look for the raised level (red-rock mesa, moon plateau, circus stage, sandstone dais, snowy ridge): **Geyser Mesa** in the canyon (a geyser erupts and throws the ball up onto the mesa, or climb the timber ladder), **Lunar Landing** on the moon (roll into the launch rocket and it flies the ball up to the landing plateau, or climb the gantry), **Human Cannonball** under the big top (the swinging cannon fires onto the raised stage, or take the striped ladder), **Pharaoh's Chamber** in the tomb (stone stairs or a scarab portal up to the burial dais) and **Ski Jump** in the Arctic (a chairlift up the ridge, and a toboggan run that sends an overhit ball back to the start).
- **Jurassic Canyon**, a second 6-hole course (par 19), picked from **Courses** on the main menu. Drawn in a cartoon style (flat toon shading and ink outlines) under a lilac-and-peach sunset: packed-dirt fairways with a rounded rock kerb; glowing lava rivers and pools (+1 stroke), volcanoes whose slopes push the ball away, tumbleweeds that roll across the line, and big-eyed dinosaurs you can roll the ball between the legs of: a brontosaurus that walks across the course, a T-rex that sweeps its tail behind it, and a plated stegosaurus. Dressed with chunky palms, round bushes, boulders, a ribcage, an egg nest and smoking volcanoes on the horizon.
- **Lunar Links**, a third 6-hole course (par 20) on the moon, in the same cartoon style under a starry sky with the Earth, a ringed planet and a passing UFO: pale moon-dust fairways pocked with craters that curl the ball, cracks into open space (+1 stroke) crossed by metal bridges, moon rocks, moon trees, asteroids drifting across the line, asteroids that crash down after a red warning ring and sit there until they crumble, rockets that land on their pads and blast off again, little aliens hopping in circles, and astronauts that wave or moonwalk on patrol. Dressed with glowing crystals, craters, a rocket and a flag.
- **Big Top Circus**, a fourth 6-hole course (par 21) inside a striped big-top tent: red felt fairways with a striped ring curb, a sawdust floor, stands full of spectators, bunting and roving spotlights. Interactive obstacles: **trampolines** that bounce the ball into the air over walls and obstacles (the faster it arrives, the further it flies), **swinging cannons** that fire it across the tent (`cannonAngle()`), clowns on unicycles, elephants on drums, a carousel and a dunk tank. A flight that lands outside the course is **out of bounds**: +1 stroke and back to where the shot was played from. Holes: Center Ring, Clown Alley, Human Cannonball, Bounce House, Carousel, Grand Finale.
- **Pharaoh's Tomb**, a fifth 6-hole course (par 21) of sandstone temple floors in a desert valley at dusk, with pyramids, a sphinx, palms and torches. Mechanics: **scarab portals** (roll into the teal one, come out of the violet one at the same speed, heading the way its arrow points), **sliding stone doors** that rise and sink on staggered timers (`doorLift()`), **quicksand** that grips and drags the ball toward its middle and swallows it if it stops there (+1 stroke), shuffling **mummies**, and lotus columns and obelisks. Holes: Scarab Gate, Quicksand Flats, Hall of Doors, Mummy's Curse, Oasis, Pharaoh's Chamber.
- **Arctic Peaks**, a sixth 6-hole course (par 22) of snowy fairways under the northern lights, with pines, snowmen, peaks and falling snow. Mechanics built around bypassing obstacles: **seals** that catch a passing ball and flip it with their tail over walls toward the cup, **ski jumps** that launch a fast ball straight over obstacles, **igloo tunnels** (in one door, out the other), slick **ice** (much less friction) with **holes in the ice** (+1 stroke), waddling **penguins** and **polar bears** on floes. Holes: Snowfall, Penguin Parade, Ski Jump, Polar Bear Pass, Frozen Lake, Northern Lights.
- **Watch how to play** on the main menu (`src/demo.ts`): a 15-second demo hole played by the game itself, with captions: pull back to aim and set power, the guide running into a gumdrop, dragging the spin pad, the guide curving round it, and the curving shot into the cup.
- **Tips for every hole** (`src/tips.ts`): the lightbulb in the scorecard opens what's best to do and best to avoid on the hole being played, and pauses play while it's open.
- **Playtesting** (`src/telemetry.ts`, see **docs/PLAYTESTING.md**): every finished hole and every piece of feedback (the speech-bubble button on the menu, or Report a bug in the pause menu) is recorded with the build and kind of device, on the device and, once connected, in a Google Sheet (`docs/playtest-sheet.gs`) whose Summary tab ranks holes by average strokes over par. Settings → Playtest results shows the same in the game. A GitHub Actions workflow publishes the web build to GitHub Pages for testers, hidden from search engines and behind a tester code.
- **Career** on the main menu: three tours (Amateur, Pro, Champions) of six events, one per course. Each event sets a round target (3 over par, par, 3 under par); beating it by 2 or 4 more earns a second and third star. Every event in an open tour can be played in any order, and a tour opens once every event in the one before is cleared. First clears pay 60/120/250 coins and every new star pays 15. Saved on the device (`src/career.ts`).
- **Shot replays**: every shot is recorded as it's played (`src/replay.ts`), and the results screen offers **Watch replay** for the whole hole, with the cue strike, hits, sounds, sinks and splashes. A hole in one slows to slow motion as the ball nears the cup; a SLO-MO button slows any replay.
- **Spin**: a cue-ball pad above the power bar sets where the cue strikes. Side spin swerves the ball as it rolls and kicks it off walls; topspin rolls on further and pushes through a hit; backspin bites and pulls the ball back off a wall. The cue tip moves to match, and with spin on the aim guide plays the shot out on flat ground so the dots bend with the swerve (`spinPath()` in `physics.ts`).
- **Trick shots** (Career → Trick Shots): nine one-shot challenges in small themed arenas (`src/tricks.ts`): First Bank, Swerve (side spin), Draw Back (backspin), Windmill Run (timing), Thread the Needle, Moonshot (asteroids), Double Bank, Lava Bridge and Three Cushions. A miss resets the ball for another go; a drop that breaks the rule (too few banks, wrong spin) says why. Each pays 25 to 75 coins the first time, with a slow-motion replay. Every trick is checked solvable by a shot search.
- **Daily challenge** (card on the main menu): one challenge per day, the same for everyone, chosen from the date (`src/daily.ts`). It cycles through all 18 holes and 9 trick shots in a fresh order each cycle; hole days ask for par, or a birdie every third day. Completing it pays 20 coins plus 5 per day of streak (up to +50), and the card shows the streak and the time until the next one. Retries are allowed; coins are paid once a day.
- **Sound and music**, all synthesized live with the Web Audio API (no audio files): a soundtrack per course from a small step sequencer (`src/music.ts`; a gentle menu theme, a bouncy glockenspiel tune in Candy Land, bouncy garden, marimba and tribal drums in the canyon, space pads and arpeggios, a calliope waltz under the big top, desert plucks and darbuka in the tomb, a celesta shimmer in the Arctic), and sound effects for every event (`src/audio.ts`): cue strikes, hits, the cup rattle and drop, crowd cheers scaled to the score (a roar for an ace, applause for par, an "ohh" for a big number), splashes, lava, the void, sand, trampolines, cannons, portals, quicksand, out-of-bounds whistles, and characters that react when hit (elephant trumpet, clown honk, dino roar, mummy groan, alien warble, astronaut radio beep, palm rustle). **Settings** and the pause menu have separate switches for sound effects, music and vibration.
- **Vs Computer** (main menu): match play against a ladder of five computer rivals (`src/ai.ts`): Rookie Ricky, Cue-Ball Carla, Bankshot Bob, The Professor and Ace Galaxy, each unlocked by beating the one before. You play each hole, then watch your rival play it (FAST speeds that up); the lower score wins the hole and the most holes wins the match. The computer plans by playing candidate shots out in a copy of the hole with the same physics (including where moving obstacles will be, and whether to wait for a gap), scores them by the walking distance left to the cup, prefers lines that still work when it misses by its usual amount, and then strays from the plan by its skill's aim and power error. Weaker rivals only partly read slopes and craters. A first win pays 30 to 250 coins, and a rematch win a fifth of that. Matches have a **stake** (free against Rookie Ricky, then 25, 50, 100 and 250 coins), paid when the match starts and paid back double on a win; a loss or quitting forfeits it. A player under 50 coins is topped up to 50 once a day, so nobody gets stuck. A match that ends all square goes to a **closest-to-the-pin shootout**: one shot each from the same open spot about 300 units from the cup on the last hole (the player's ball is marked with a gold flag); sinking it wins outright, closest wins otherwise, and a dead heat shoots again.
- **Haunted Hollow** (Halloween special, `src/halloween.ts`): a seventh 6-hole course (par 21) open each year from 1 October to 7 November (`SEASONAL` and `inSeason()` in `levels.ts`; `?season=open` forces it open for testing). Night-time graveyard turf under a full moon with an iron fence, a haunted mansion and will-o'-the-wisps. Mechanics: **ghosts** that drift back and forth and fade out for part of every cycle (solid only while visible, `ghostAt()`), circling **bats** (bouncy movers), **witches' brooms** (`lifts` of kind `broom`: roll onto the purple circle and the witch flies the ball across the hole or up a level), **coffins** (portals: in at the green one, out of the purple one), **pumpkin catapults** (cannons drawn as giant jack-o'-lanterns), **spider webs** (`webs`: roll in and you're caught, +1 stroke and back to where you hit from), jack-o'-lantern bumpers, gravestones and green slime. Holes: Pumpkin Patch, Graveyard Shift, Witch's Flight, Cauldron Bubble, Bat Cave, Haunted Mansion. Out of season it shows as "back in October" on Pick a Course; it's kept out of Career, the daily challenge and the all-course trophies, and its golden 8-balls are extra.
- **North Pole Village** (Christmas special, `src/christmas.ts`): an eighth 6-hole course (par 19) open each year from 1 December to 6 January (the season wraps the new year). A snowy village at dusk with candy-cane posts strung with lights, little houses, a great tree and falling snow. Mechanics: **Santa's sleigh** (`lifts` of kind `sleigh`: roll onto the landing pad and it flies the ball up onto the rooftops), **chimneys** (portals), a **toy train** (`chutes` here are flat tracks: the train always runs at the same speed and lets the ball off gently at the end of the line), marching **nutcracker soldiers** (`nutcrackers`), rolling **snowballs** (tumbleweeds), a frozen pond with holes in the ice, present bumpers, snowmen, fir trees and snowdrifts. Holes: Jingle Bell Lane, Snowball Alley, Santa's Sleigh Ride, Frozen Pond, Chimney Drop, Toy Train Express. Out of season it shows as "back in December".
- **Skull Island** (expert course, `src/pirate.ts`): a seventh regular-size course (par 19), locked until the player has 36 hole stars on the six regular courses (`EXPERT` and `unlockStars` in `levels.ts`; five taps on its locked tile in Pick a Course open it early for testing). Every hole is played aboard a galleon in an open turquoise sea (`ship`: the fairway is the deck, with masts for `pillars` and a hull down into the sea; the swell pushes the ball toward `dir` and back, and the view rolls with it). Mechanics: **rocking ship decks** (`decks`, a part of a hole that rolls), narrow **plank bridges**, **cannonball volleys** (meteors), **ship's cannons**, **pirates** and **parrots** (movers), a **kraken's tentacle** (a spinner), **sea caves** (portals), quicksand, rolling barrels, treasure-chest bumpers, barrels and pilings. Holes: Walk the Plank, Cannon Cove, Rocking Deck, Kraken's Lair, Treasure Hold, Captain's Quarters. Pars are set so the strongest computer rival, with Pro's strict cup, averages about par. Like the holiday courses, it's kept out of Career, the daily challenge and the all-course trophies.
- **Play with friends** (main menu): pass-and-play for 2–4 players on one phone. Each picks a name and a ball; everyone plays each hole in turn from the tee, with a shared scorecard, the hole winner after each hole and the overall winner at the end. Party games don't pay coins or count toward stars, golden 8-balls or stats.
- **Beat my score** (`src/challenge.ts`): after a practice hole or a full round, *Challenge a friend* shares a link (native share sheet in the app, Web Share or the clipboard in a browser). The course, hole, score and sender's name travel in the link (`?c=`), so there's no server. Opening it on the web version starts the same hole or round with the score to beat (no tester code needed); the result says who won and offers *Send <name> your score*.
- **Progress and trophies** (`src/progress.ts`, the ★ button on the main menu): every hole has three **hole stars** (★ par, ★★ birdie or better, ★★★ hole in one; 10 coins per new star) shown on the course cards and the hole result, and a hidden **golden 8-ball** (36 in all, 15 coins each) floating somewhere reachable, often on a raised level or across a hazard; rolling through it collects it. The **trophy room** lists 24 achievements with progress bars (stars, 8-balls, aces, a star on every hole of each course, launches of every kind, chutes and ladders, portals, bank and spin sinks, a round on every course, a 7-day daily streak), each paying 15 to 1,000 coins; *Golden touch* (all 36 golden 8-balls) wins the Golden 8 ball and *Grand master* (54 stars) the Grand Master cue. Saved on the device, separately from coins.
- **Cues & Balls** on the main menu: 16 ball designs (classic, eight ball, tennis, soccer, basketball, baseball, beach ball, golf ball, tie-dye, galaxy, watermelon, smiley, gold, golden 8, chrome, neon glow) and 14 cues (classic maple, grand master; USA-themed Old Glory, Uncle Sam, Fourth of July and Bald Eagle; candy cane, light saber, hot rod flames, royal gold, camo, tie-dye, slugger and galaxy), painted in code (`src/gear.ts`). Unlocked with **coins** earned on every hole (2 per hole, +5 par, +15 birdie, +30 eagle, +75 hole in one, +5 bank-shot sink; +25 per round and +50 under par; new players start with 100). Prices run from 250 to 2,500 coins, so the full collection is a long-term goal. Five designs are won, not bought: the Gold ball (hole in one), the Bald Eagle cue (under-par round), the Galaxy ball (a round of Lunar Links), the Golden 8 ball (all 36 golden 8-balls) and the Grand Master cue (54 hole stars). Coins and unlocks are saved on the device (`src/wallet.ts`).
  1. **Lava Run**: a lava river crossed by a wide bridge on the line to the cup
  2. **Tumbleweed Flats**: time the gaps between three rolling tumbleweeds
  3. **Bronto Crossing**: under the brontosaurus or round the lava pools
  4. **Rex's Lair**: a dogleg up to the T-rex guarding the green
  5. **Volcano Ridge**: two volcanoes shoulder the fairway
  6. **Extinction**: stegosaurus, tumbleweeds and a lava river before a raised green
- **Garden setting** (Three.js): evening sky and sun; flowing fairways with rounded corners, a curved timber kerb and mowing stripes that follow the shape; rolling lawn with raised flower beds, ornamental grasses, topiary, hedges, lamp posts and trees; sunken ponds and creeks lined with river stones, lily pads and reeds; raked bunkers, plank footbridges, boulders and turnstiles.
- **Aiming**: pull down to draw the cue back, drag sideways to turn, and hold near a screen edge to keep turning all the way round.
- **Camera**: a shot camera sits behind the ball and turns with the aim; at rest it faces down the route to the cup, then follows the rolling ball; it swoops in at the start of each hole and moves in when the ball drops. The **TABLE** button switches to the whole-table view (and **BALL** back).
- **Cue**: draws back with power, strikes the ball, then follows through and fades.
- **Physics**: harder hits lose more energy, cushions and walls grip some of the ball's sideways speed, lip-outs, and visual skid-then-roll spin plus a small hop off hard hits.
- **Aim guide** follows the shot through two banks (bumpers, walls and cushions), with a ring at each contact.
- **Sound** (all synthesized): cue tip, cushion thump, wood knock, ball clack, spinner, rolling rumble that follows speed (gritty in sand), cup rattle, splash, and a short result jingle.
- **Interface**: hole banner, round progress dots, running score to par, power meter, "Bank shot" / "Lipped out" calls, a first-shot tutorial, a scorecard, and settings for sound, the bank guide and camera follow.
- **Premium art pass (Hole 1 is the benchmark):** `src/art.ts` holds the visual design system: cached procedural textures (turf, mahogany, oak, coursed stone, shingles, planks, fern fronds, Persian rug) and shared materials (polished wood, brass, stone). It also holds detailed props: stone walls with oak caps and brass rivets built on the exact collision capsules, a windmill (stone tower, shingle cap, plank sails, oak sweepers that match the spinner collider), a brass cup with a waving flag, and brass lanterns. A level opts in with `art: 'premium'`; the mahogany table, lanterns, ferns and room apply to every hole.
- **Main menu** after the concept art: Courses (practise any hole), Settings, Progress and How to play work. Cues & Balls, Achievements, Friends and Shop show a "not in this prototype yet" panel.
- Quality steps down automatically (resolution, then shadow detail) on slower phones.
- Native apps are locked to landscape and the status bar is hidden.

## 3D models

Hole 1 and the table dressing use detailed models built in Blender: windmill, stone/brick wall kit, cup, lantern posts, barrels, planters and rocks. They're stored as GLB in `src/assets/models/`. The scripts that generate them live in `assets-src/blender/`. Credits and licenses are in `ASSETS.md`.

To rebuild the models:

```bash
python3 -m venv .bpy && .bpy/bin/pip install bpy==5.2.2   # Blender as a Python module (Python 3.13)
npm run assets                                             # build + quantize into src/assets/models
```

## Course shapes and slopes

Jurassic holes also use `tumbleweeds`, `volcanoes`, `palms` and `dinos`; Lunar holes use `asteroids`, `meteors`, `rockets`, `aliens`, `astronauts`, `craters` and `palms` (drawn as moon trees) (moving colliders live in `movers()` in `physics.ts`). Each hole can define an `outline` (the fairway edging, as a polygon), `slopes` (`hill` bumps or bowls, and `tilt` planes), `water` and `sand` (organic shapes from `blob()` and `creek()`), `bridges`, `rocks` and `spinners` (windmill or turnstile) in `src/levels.ts`. Bunkers are dished into the terrain; water is sunk below the turf with sloped banks. `heightAt()` in `physics.ts` is shared by the physics (the ball rolls downhill) and the renderer (the turf is shaped to match). Holes without an outline keep the original rectangle.

## Project layout

```
src/levels.ts    course data (edit or add holes here)
src/physics.ts   ball physics, collisions, aim ray-cast
src/render3d.ts  camera, ball, cue, aim guide, effects
src/course.ts    builds each hole: sloped turf, timber edging, obstacles, garden dressing
src/garden.ts    evening sky and sun
src/landscape.ts curved kerb, rolling lawn, flower beds, grasses, topiary, river stones
src/jurassic.ts  Jurassic course: dirt, lava, volcanoes, tumbleweeds, dinosaurs, prehistoric planting (and the shared toon helpers)
src/space.ts     Lunar course: moon dust, the void, asteroids, aliens, astronauts, stars, planets, rocket
src/gear.ts      Ball and cue designs for the Cues & Balls menu
src/wallet.ts    Coins, prices and unlocks
src/career.ts    Career tours, events, targets and stars
src/progress.ts  Hole stars, golden 8-ball spots and the trophy room
src/replay.ts    Shot recording and playback
src/tricks.ts    Trick-shot challenges and their rules
src/daily.ts     Daily challenge: picking the day's challenge, streaks and rewards
src/ai.ts        Computer opponents and their shot planner
src/circus.ts    Circus course: felt, sawdust, tent, trampolines, cannons, clowns, elephants
src/tomb.ts      Tomb course: sandstone, desert, portals, doors, quicksand, mummies, columns, pyramids
src/candy.ts     Candy course: frosting, cake layers, chutes, ladders, gumdrops, lollipops, gingerbread men
src/arctic.ts    Arctic course: snow, ice, seals, ski jumps, igloos, penguins, polar bears, aurora
src/main.ts      game flow, input, HUD, haptics
src/audio.ts     WebAudio sound effects
ios/  android/   generated native projects (Capacitor)
```

## Run it

```bash
npm install
npm run dev          # play in a browser at http://localhost:5173 (use phone-landscape size in devtools)
                     # --host is on, so you can also open it from your phone on the same Wi-Fi
```

## Build for devices

```bash
npm run ios          # build → sync → opens Xcode (needs a Mac with Xcode)
npm run android      # build → sync → opens Android Studio
```

Before you submit to the stores:
1. Change `appId` in `capacitor.config.ts` (now the placeholder `com.example.poolgolf`) to a reverse-domain ID you own, such as `com.yourcompany.rackandroll`. Then update it in Xcode (Bundle Identifier) and `android/app/build.gradle` (`applicationId`), or re-create the platforms.
2. The **Rack & Roll** app icon (an 8-ball rolling past a golf flag on green felt) and splash screen (the wordmark on dark felt) are already in both projects. They're drawn in `assets-src/brand/brand.html`; after changing it, run `node assets-src/brand/render.cjs` to regenerate every size.
3. iOS: set your signing team in Xcode, then Product → Archive → upload to App Store Connect / TestFlight.
4. Android: Build → Generate Signed Bundle (.aab) → upload to a Play Console internal-testing track.

## Next steps

- More holes, moving and tilting obstacles, and star ratings.
- Use `@capacitor/preferences` for saves, and Game Center / Play Games for leaderboards.
