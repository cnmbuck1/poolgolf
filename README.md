# Pool Golf — prototype

A landscape mini-golf game played on a pool table: **Aim • Bank • Avoid • Sink.**
One TypeScript/HTML5-canvas codebase, packaged for **iOS (App Store)** and **Android (Google Play)** with [Capacitor](https://capacitorjs.com).

## What's in the prototype

- 6 holes (par 20), each confirmed solvable at or under par by a shot simulator
  1. **Break Shot**: the layout from the concept art (L-wall, angled bar, spinner over a pond)
  2. **Bank Street**: bank off the cushion around a divider
  3. **Bumper Pool**: pool balls work as bumpers
  4. **Water Hazard**: water costs +1 stroke and puts the ball back where it was
  5. **Windmills**: an S-shaped course with rotating spinners
  6. **The Rack**: a racked triangle guarding the pocket
- **3D table** (Three.js) in a lamp-lit billiard room: wood floor, rug, turned legs, felt cushions, glossy pool balls, a flag in each cup.
- **Camera**: swoops in at the start of each hole, leans toward the rolling ball, moves closer when the ball drops, shakes slightly on hard hits. The **TOP** button switches to an overhead view.
- **Cue**: draws back with power, strikes the ball, then follows through and fades.
- **Physics**: harder hits lose more energy, cushions and walls grip some of the ball's sideways speed, lip-outs, and visual skid-then-roll spin plus a small hop off hard hits.
- **Aim guide** follows the shot through two banks (bumpers, walls and cushions), with a ring at each contact.
- **Sound** (all synthesized): cue tip, cushion thump, wood knock, ball clack, spinner, rolling rumble that follows speed (gritty in sand), cup rattle, splash, and a short result jingle.
- **Interface**: hole banner, round progress dots, running score to par, power meter, "Bank shot" / "Lipped out" calls, a first-shot tutorial, a scorecard, and settings for sound, the bank guide and camera follow.
- Quality steps down automatically (resolution, then shadow detail) on slower phones.
- Native apps are locked to landscape and the status bar is hidden.

## Project layout

```
src/levels.ts    course data (edit or add holes here)
src/physics.ts   ball physics, collisions, aim ray-cast
src/render3d.ts  Three.js scene (table, obstacles, cue, aim guide, camera)
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
