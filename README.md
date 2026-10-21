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

Jurassic holes also use `tumbleweeds`, `volcanoes` and `dinos` (their moving colliders live in `movers()` in `physics.ts`). Each hole can define an `outline` (the fairway edging, as a polygon), `slopes` (`hill` bumps or bowls, and `tilt` planes), `water` and `sand` (organic shapes from `blob()` and `creek()`), `bridges`, `rocks` and `spinners` (windmill or turnstile) in `src/levels.ts`. Bunkers are dished into the terrain; water is sunk below the turf with sloped banks. `heightAt()` in `physics.ts` is shared by the physics (the ball rolls downhill) and the renderer (the turf is shaped to match). Holes without an outline keep the original rectangle.

## Project layout

```
src/levels.ts    course data (edit or add holes here)
src/physics.ts   ball physics, collisions, aim ray-cast
src/render3d.ts  camera, ball, cue, aim guide, effects
src/course.ts    builds each hole: sloped turf, timber edging, obstacles, garden dressing
src/garden.ts    evening sky and sun
src/landscape.ts curved kerb, rolling lawn, flower beds, grasses, topiary, river stones
src/jurassic.ts  Jurassic course: dirt, lava, volcanoes, tumbleweeds, dinosaurs, prehistoric planting
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
