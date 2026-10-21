# Pool Golf — prototype

A landscape mini-golf game in an evening garden, played with a pool cue and pool ball: **Aim • Bank • Avoid • Sink.**
One TypeScript/HTML5-canvas codebase, packaged for **iOS (App Store)** and **Android (Google Play)** with [Capacitor](https://capacitorjs.com).

## What's in the prototype

- 6 holes (par 19), each confirmed solvable at or under par by a shot simulator
  1. **Break Shot**: a dogleg garden fairway. The windmill guards the cup, so the straight line to the pin has to be timed through its sweepers; a brick wall under it closes the low lane. The lane from the tee falls gently toward the bottom edge, a hill sits on the top bank route, and the green is a shallow bowl. Drifting arrows on the turf show which way it falls (Settings → Slope arrows)
  2. **Lily Pond**: a sunken lily pond crosses the fairway. Take the plank bridge, or risk the bunker strip along the bottom; a boulder guards the cup
  3. **Rock Garden**: an oval green with boulders, three pool-ball bumpers, a central rise and a bunker short of the cup
  4. **The Creek**: a winding creek with two footbridges, a green tilted toward the water and a bunker by the cup
  5. **Turnstiles**: three lanes joined by stone walls, with turnstiles sweeping two of the gaps
  6. **Eight Ball**: brick walls funnel toward a racked set of pool balls in front of a raised green, with bunkers on both sides
- **Jurassic Canyon**, a second 6-hole course (par 19), picked from **Courses** on the main menu. Drawn in a cartoon style (flat toon shading and ink outlines) under a lilac-and-peach sunset: packed-dirt fairways with a rounded rock kerb; glowing lava rivers and pools (+1 stroke), volcanoes whose slopes push the ball away, tumbleweeds that roll across the line, and big-eyed dinosaurs you can roll the ball between the legs of: a brontosaurus that walks across the course, a T-rex that sweeps its tail behind it, and a plated stegosaurus. Dressed with chunky palms, round bushes, boulders, a ribcage, an egg nest and smoking volcanoes on the horizon.
- **Lunar Links**, a third 6-hole course (par 19) on the moon, in the same cartoon style under a starry sky with the Earth, a ringed planet and a passing UFO: pale moon-dust fairways pocked with craters that curl the ball, cracks into open space (+1 stroke) crossed by metal bridges, moon rocks, moon trees, asteroids drifting across the line, asteroids that crash down after a red warning ring and sit there until they crumble, rockets that land on their pads and blast off again, little aliens hopping in circles, and astronauts that wave or moonwalk on patrol. Dressed with glowing crystals, craters, a rocket and a flag.
- **Big Top Circus**, a fourth 6-hole course (par 21, a step up from the first three at par 19) inside a striped big-top tent: red felt fairways with a striped ring curb, a sawdust floor, stands full of spectators, bunting and roving spotlights. Interactive obstacles: **trampolines** that bounce the ball into the air over walls and obstacles (the faster it arrives, the further it flies), **swinging cannons** that fire it across the tent (`cannonAngle()`), clowns on unicycles, elephants on drums, a carousel and a dunk tank. A flight that lands outside the course is **out of bounds**: +1 stroke and back to where the shot was played from. Holes: Center Ring, Clown Alley, Human Cannonball, Bounce House, Carousel, Grand Finale.
- **Pharaoh's Tomb**, a fifth 6-hole course (par 22) of sandstone temple floors in a desert valley at dusk, with pyramids, a sphinx, palms and torches. Mechanics: **scarab portals** (roll into the teal one, come out of the violet one at the same speed, heading the way its arrow points), **sliding stone doors** that rise and sink on staggered timers (`doorLift()`), **quicksand** that grips and drags the ball toward its middle and swallows it if it stops there (+1 stroke), shuffling **mummies**, and lotus columns and obelisks. Holes: Scarab Gate, Quicksand Flats, Hall of Doors, Mummy's Curse, Oasis, Pharaoh's Chamber.
- **Arctic Peaks**, a sixth 6-hole course (par 23) of snowy fairways under the northern lights, with pines, snowmen, peaks and falling snow. Mechanics built around bypassing obstacles: **seals** that catch a passing ball and flip it with their tail over walls toward the cup, **ski jumps** that launch a fast ball straight over obstacles, **igloo tunnels** (in one door, out the other), slick **ice** (much less friction) with **holes in the ice** (+1 stroke), waddling **penguins** and **polar bears** on floes. Holes: Snowfall, Penguin Parade, Ski Jump, Polar Bear Pass, Frozen Lake, Northern Lights.
- **Career** on the main menu: three tours (Amateur, Pro, Champions) of three events, one per course. Each event sets a round target (3 over par, par, 3 under par); beating it by 2 or 4 more earns a second and third star. Events open in order, and a tour opens once every event in the one before is cleared. First clears pay 100/200/400 coins and every new star pays 25. Saved on the device (`src/career.ts`).
- **Shot replays**: every shot is recorded as it's played (`src/replay.ts`), and the results screen offers **Watch replay** for the whole hole, with the cue strike, hits, sounds, sinks and splashes. A hole in one slows to slow motion as the ball nears the cup; a SLO-MO button slows any replay.
- **Spin**: a cue-ball pad above the power bar sets where the cue strikes. Side spin swerves the ball as it rolls and kicks it off walls; topspin rolls on further and pushes through a hit; backspin bites and pulls the ball back off a wall. The cue tip moves to match, and with spin on the aim guide plays the shot out on flat ground so the dots bend with the swerve (`spinPath()` in `physics.ts`).
- **Trick shots** (Career → Trick Shots): nine one-shot challenges in small themed arenas (`src/tricks.ts`): First Bank, Swerve (side spin), Draw Back (backspin), Windmill Run (timing), Thread the Needle, Moonshot (asteroids), Double Bank, Lava Bridge and Three Cushions. A miss resets the ball for another go; a drop that breaks the rule (too few banks, wrong spin) says why. Each pays 50 to 150 coins the first time, with a slow-motion replay. Every trick is checked solvable by a shot search.
- **Daily challenge** (card on the main menu): one challenge per day, the same for everyone, chosen from the date (`src/daily.ts`). It cycles through all 18 holes and 9 trick shots in a fresh order each cycle; hole days ask for par, or a birdie every third day. Completing it pays 40 coins plus 10 per day of streak (up to +100), and the card shows the streak and the time until the next one. Retries are allowed; coins are paid once a day.
- **Sound and music**, all synthesized live with the Web Audio API (no audio files): a soundtrack per course from a small step sequencer (`src/music.ts`; a gentle menu theme, bouncy garden, marimba and tribal drums in the canyon, space pads and arpeggios, a calliope waltz under the big top, desert plucks and darbuka in the tomb, a celesta shimmer in the Arctic), and sound effects for every event (`src/audio.ts`): cue strikes, hits, the cup rattle and drop, crowd cheers scaled to the score (a roar for an ace, applause for par, an "ohh" for a big number), splashes, lava, the void, sand, trampolines, cannons, portals, quicksand, out-of-bounds whistles, and characters that react when hit (elephant trumpet, clown honk, dino roar, mummy groan, alien warble, astronaut radio beep, palm rustle). **Settings** and the pause menu have separate switches for sound effects, music and vibration.
- **Vs Computer** (main menu): match play against a ladder of five computer rivals (`src/ai.ts`): Rookie Ricky, Cue-Ball Carla, Bankshot Bob, The Professor and Ace Galaxy, each unlocked by beating the one before. You play each hole, then watch your rival play it (FAST speeds that up); the lower score wins the hole and the most holes wins the match. The computer plans by playing candidate shots out in a copy of the hole with the same physics (including where moving obstacles will be, and whether to wait for a gap), scores them by the walking distance left to the cup, prefers lines that still work when it misses by its usual amount, and then strays from the plan by its skill's aim and power error. Weaker rivals only partly read slopes and craters. A first win pays 60 to 500 coins. A match that ends all square goes to a **closest-to-the-pin shootout**: one shot each from the same open spot about 300 units from the cup on the last hole (the player's ball is marked with a gold flag); sinking it wins outright, closest wins otherwise, and a dead heat shoots again.
- **Cues & Balls** on the main menu: 15 ball designs (classic, eight ball, tennis, soccer, basketball, baseball, beach ball, golf ball, tie-dye, galaxy, watermelon, smiley, gold, chrome, neon glow) and 13 cues (classic maple; USA-themed Old Glory, Uncle Sam, Fourth of July and Bald Eagle; candy cane, light saber, hot rod flames, royal gold, camo, tie-dye, slugger and galaxy), painted in code (`src/gear.ts`). Unlocked with **coins** earned on every hole (5 per hole, +10 par, +25 birdie, +50 eagle, +100 hole in one, +10 bank-shot sink; +50 per round and +100 under par; new players start with 150). Three designs are won, not bought: the Gold ball (hole in one), the Bald Eagle cue (under-par round) and the Galaxy ball (a round of Lunar Links). Coins and unlocks are saved on the device (`src/wallet.ts`).
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
- **Main menu** after the concept art: Courses (practise any hole), Settings, Stats and How to play work. Cues & Balls, Achievements, Friends and Shop show a "not in this prototype yet" panel.
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
src/replay.ts    Shot recording and playback
src/tricks.ts    Trick-shot challenges and their rules
src/daily.ts     Daily challenge: picking the day's challenge, streaks and rewards
src/ai.ts        Computer opponents and their shot planner
src/circus.ts    Circus course: felt, sawdust, tent, trampolines, cannons, clowns, elephants
src/tomb.ts      Tomb course: sandstone, desert, portals, doors, quicksand, mummies, columns, pyramids
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
1. Change `appId` in `capacitor.config.ts` (now `com.example.poolgolf`) to a reverse-domain ID you own. Then update it in Xcode (Bundle Identifier) and `android/app/build.gradle` (`applicationId`), or re-create the platforms.
2. Add an app icon and splash screen, for example with `npx @capacitor/assets generate`.
3. iOS: set your signing team in Xcode, then Product → Archive → upload to App Store Connect / TestFlight.
4. Android: Build → Generate Signed Bundle (.aab) → upload to a Play Console internal-testing track.

## Next steps

- More holes, moving and tilting obstacles, and star ratings.
- Use `@capacitor/preferences` for saves, and Game Center / Play Games for leaderboards.
