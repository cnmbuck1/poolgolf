# Game Center (from 1.1.0)

Leaderboards and achievements, through the app's own native plugin (`ios/App/App/GameCenterPlugin.swift`, also used
by Gravitor). The game signs in quietly a few seconds after launch. Players who aren't signed in see no prompts,
and the game works the same. The trophy room has **Leaderboards** and **Achievements** buttons.

## Leaderboards (12)

| ID | Name | Score | Sort |
| --- | --- | --- | --- |
| `rackandroll.total_stars` | Total Stars | stars earned | high first |
| `rackandroll.holes_in_one` | Holes in One | total aces | high first |
| `rackandroll.daily_challenge` | Daily Challenge | strokes, **resets every day** (00:00 UTC) | low first |
| `rackandroll.round.<course>` | Best round per course (9) | strokes for the full course | low first |

Round scores are posted when a full course is finished (not in practice, the daily challenge or party mode). After a
round the game shows your world rank, for example "🏆 #12 in the world on Candy Land", and the friend just ahead.

## Achievements (24, 755 points)

One per trophy in the trophy room, with the same names. Points follow each trophy's coin reward. Progress is
reported as a percentage, so partly finished trophies show progress in Game Center. Trophies earned before 1.1.0
are sent the first time the player signs in.

The badge images are in `tools/gamecenter/badges/` (`npm run gamecenter:badges` redraws them).
`tools/gamecenter/catalog.json` is generated from `src/gamecenter/catalog.ts` (`npm run gamecenter:catalog`).

## One-time setup (you)

1. **Create everything in App Store Connect** (2 minutes, no clicking through forms):
   GitHub → cnmbuck1/poolgolf → **Actions → "Set up Game Center" → Run workflow**.
   - Pick the branch **release-1.1** (later **main**, once it's merged).
   - Leave **apply** unticked the first time. It's a dry run that lists what it would create. Check the log.
   - Run it again with **apply** ticked. It creates the 12 leaderboards and 24 achievements, with English names,
     descriptions and badges. It's safe to run again; anything that exists is skipped.

   It uses the same API key secrets as the TestFlight workflow (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY`).
2. **Turn on Game Center for the version:** App Store Connect → the app → the **1.1.0** version page → scroll to
   **Game Center** → tick it, then **choose the leaderboards and achievements** to ship (select all) → Save.
   Apple reviews new leaderboards and achievements together with the version.
3. Test on a TestFlight build. Sign in to Game Center on the iPhone (Settings → Game Center). Sandbox scores show
   only to testers until the version is live.

Leaderboard and achievement IDs can't be reused once created, even if deleted, so don't rename them in
`catalog.ts` after step 1.
