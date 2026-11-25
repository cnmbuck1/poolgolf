# Firebase Analytics (from 1.1.0)

The iPhone app logs anonymous play events to Firebase Analytics so we can see which holes players finish, where
they stop, and how ads and Remove Ads perform. It has no user ID and no advertising ID: the plugin is built with
`AnalyticsWithoutAdIdSupport`, and ad personalisation signals are off in Info.plist. Analytics follows the
in-game switch Settings → "Share anonymous play stats". The web build doesn't include Firebase at all.

## One-time setup (you)

1. Go to https://console.firebase.google.com → **Add project** → name it **Rack & Roll**. Google Analytics: **on**
   (use the default account).
2. In the project, **Add app → iOS**:
   - Apple bundle ID: `com.cnmbuckstudios.rackandroll`
   - App nickname: Rack & Roll
   - App Store ID: `6827656033`
3. Download **GoogleService-Info.plist**. Skip the remaining steps (SDK and init code are already in the app).
4. Add it to GitHub as a secret: repo **cnmbuck1/poolgolf → Settings → Secrets and variables → Actions → New
   repository secret**
   - Name: `GOOGLE_SERVICE_INFO_PLIST`
   - Value: the whole contents of the file (open it in a text editor, copy everything, paste).

The TestFlight workflow writes the file into the app at build time and checks that its bundle ID matches. The
file is git-ignored, so it never lands in the repo. Without the secret the build still succeeds, but analytics
is off. The workflow summary prints a warning when that happens.

## App Privacy (App Store Connect, before submitting 1.1.0)

App Store Connect → the app → **App Privacy** → Edit. Keep everything that's already there for AdMob, and make
sure these are ticked, with **Used for: Analytics**, **Linked to the user: No**, **Used for tracking: No**:

- **Identifiers → Device ID** (Firebase's app-instance ID)
- **Usage Data → Product Interaction**
- **Diagnostics → Other Diagnostic Data**
- **Location → Coarse Location** (Firebase works out the country/region from the IP address)

## Events

| Event | Params |
| --- | --- |
| `hole_start` | course, hole, label, mode, skill |
| `hole_end` | course, hole, label, mode, skill, par, strokes, to_par, stars, time_sec, picked_up, banked |
| `round_end` | course, mode, skill, strokes, to_par |
| `daily_end` | course, hole, label, strokes, goal_met |
| `ad_rewarded` | placement (`double_coins`, `coins`), result (`earned`, `closed`, `unavailable`) |
| `ad_interstitial` | placement |
| `remove_ads` | result (`done`, `cancelled`, `unavailable`, `failed`, `restored`) |
| `skill_change` | skill |

`mode` is one of `career`, `practice`, `round`, `daily`, `party`, `vs`. User property: `skill`.

Useful reports (Firebase → Analytics → Events, or Explore → Funnel):
- **Drop-off by hole:** a funnel of `hole_end` filtered by `course` and ordered by `hole`.
- **Hardest holes:** the average `to_par` and the share of `picked_up` per `label`.
- **Ads:** `ad_rewarded` by `result`; `remove_ads` with result `done`.

To see events live while testing, use Firebase → **DebugView** on a TestFlight build. New events take up to 24
hours to show in the normal reports.
