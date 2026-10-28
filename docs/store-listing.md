# App Store listing for Rack & Roll

Copy these into App Store Connect → your app → **App Store** tab (version 1.0) and **App Privacy**.
Character limits are Apple's.

## Name and text

**Name** (30): `Rack & Roll Mini Golf` (plain `Rack & Roll` was taken). The home screen still shows `Rack & Roll`.

**Subtitle** (30): `Putt with a pool cue` (the name already says mini golf)

**Promotional text** (170, can be changed any time without review):
> Pull back the cue, bank it off the rails and sink it! Six wild worlds, holiday specials, and an expert course aboard a rolling pirate ship.

**Description** (4,000):
> Mini golf meets pool. Line up your shot with a cue, bank the ball off the rails, put spin on it to curve
> around obstacles, and sink it in as few strokes as you can.
>
> SIX WORLDS, 36 HOLES
> • Candy Land: climb ladders, slide down chutes and dodge gingerbread men on cake layers
> • Jurassic Canyon: lava, volcanoes, geysers and dinosaurs that swing their tails
> • Lunar Links: craters, drifting asteroids and a launch rocket
> • Big Top Circus: trampolines, cannons and a turning carousel
> • Pharaoh's Tomb: scarab portals, sliding stone doors and quicksand
> • Arctic Peaks: slick ice, ski jumps, seals and igloo tunnels
>
> THE EXPERT COURSE
> • Jolly Roger: earn your stars to unlock six holes aboard a pirate ship rolling on the swell, with open
>   hatches, cannon fire, pirates, parrots and a kraken bursting through the deck
>
> HOLIDAY SPECIALS
> • Haunted Hollow every October: ghosts, spider webs, coffins and witches' brooms
> • North Pole Village every December: Santa's sleigh, chimneys, a toy train and nutcrackers
>
> REAL POOL SKILLS
> • Pull back to draw the cue: the further back, the harder the shot
> • A dotted guide shows your line and your banks off the rails
> • Spin pad: side spin curves the ball, backspin stops it, top spin rolls it on
> • Amateur, Intermediate and Pro: as you improve, take away the aids for a real challenge and bigger rewards
>
> SO MUCH TO PLAY
> • Career: three tours of events with star targets
> • Vs Computer: five rivals from Rookie Ricky to Ace Galaxy, with coins at stake
> • Play with friends: 2–4 players pass one phone
> • A new daily challenge every day: keep your streak going
> • Trick shots: banks, swerves and draws in one shot
>
> COLLECT AND UNLOCK
> • Earn up to three stars on every hole
> • Hunt down the golden 8-ball hidden on each hole
> • Win trophies and coins, and unlock 30 ball and cue designs, from a watermelon ball to a light-saber cue
>
> Free to play, with an optional one-time purchase to remove full-screen ads. Plays offline.

**Keywords** (100, comma-separated, no spaces needed):
`putt,pool,billiards,cue,8 ball,putting,arcade,party,friends,pirate,trick shot,snooker,minigolf`
(Words in the name and subtitle already count for search, so they aren't repeated here.)

**What's New** (for later versions): leave empty for 1.0.

## URLs

| Field | Value |
|---|---|
| Support URL | https://cnmbuck1.github.io/poolgolf/support.html |
| Marketing URL (optional) | https://cnmbuck1.github.io/poolgolf/ |
| Privacy Policy URL | https://cnmbuck1.github.io/poolgolf/privacy.html |
| Support email (App Review contact) | cnmbuckstudios@gmail.com |

## General

| Field | Value |
|---|---|
| Category | Games; subcategories Sports and Casual |
| Copyright | `2026 Cnmbuck Studios` |
| Price | Free |
| Availability | All countries (or start with your own) |
| Content rights | Doesn't contain, show or access third-party content |

## Age rating questionnaire

Answer **None** / **No** to everything (violence, gambling, contests, user-generated content, web access,
messaging and so on). Notes:

- *Advertising:* the app contains ads. Answer **Yes** if asked. Turn on **In-App Purchases** for the Remove ads purchase.
- *Simulated gambling:* None. Coin stakes against the computer are won by skill, not chance, and coins
  can't be bought or cashed out.
- *Unrestricted web access:* No (links to the privacy and support pages open in the browser).

Expected result: **4+**.

## App Privacy ("nutrition label")

**Do you or your third-party partners collect data from this app?** Yes. Declare these, each **Not
linked to the user's identity** and **Not used for tracking**:

| Data type | Purpose | What it is |
|---|---|---|
| Usage Data → Product Interaction | Analytics | Finished holes: course, hole, strokes, time, mode |
| Diagnostics → Other Diagnostic Data | Analytics | Game version and device kind/screen size |
| Diagnostics → Crash Data | App Functionality | Unexpected error messages and where in the game they happened |
| Identifiers → Device ID | Analytics | A random ID the game makes, to tell players' holes apart (not the advertising ID) |
| User Content → Other User Content | App Functionality | Feedback a player chooses to send |
| Contact Info → Name | App Functionality | Only if a player types a name into the feedback form |

Players can switch play stats off (Settings → Share anonymous play stats).

**Ads (Google AdMob) add these**, declared for the third party. Check them against Google's current
guidance ("Prepare for Apple's App Privacy details", in the AdMob help centre) when you fill this in:

| Data type | Purpose | Linked to identity? | Used for tracking? |
|---|---|---|---|
| Identifiers → Device ID (the advertising ID, only if the player allows tracking) | Third-Party Advertising, Analytics | No | **Yes** |
| Usage Data → Advertising Data | Third-Party Advertising, Analytics | No | **Yes** |
| Usage Data → Product Interaction | Analytics | No | No |
| Location → Coarse Location (from the IP address) | Third-Party Advertising, Analytics | No | **Yes** |
| Diagnostics → Crash Data, Performance Data, Other Diagnostic Data | Analytics | No | No |

Because some of it is used for tracking, the app asks Apple's "Allow tracking?" question (after Google's
consent form in the EU/UK). Purchases are handled by Apple and aren't collected by the app.

## App Review notes

> Rack & Roll is a single-player and pass-and-play mini golf game. No login is needed. Anonymous play
> statistics (which can be turned off in Settings) and optional feedback are sent to the developer to
> improve hole difficulty. The app shows Google AdMob ads (rewarded videos the player chooses to watch, and
> occasional interstitials halfway through and at the end of a course) and offers a non-consumable "Remove ads" in-app purchase, which
> can be restored from Settings → Restore purchases. To test it, use a Sandbox account.

## Screenshots and preview video

Six iPhone **6.9-inch** screenshots (2868 × 1320, landscape) are in `docs/store-screenshots/`, in this order:

1. `01-aim.png`: Mini golf with a pool cue
2. `02-ship.png`: Then take it to sea (the expert pirate ship)
3. `03-bank.png`: Bank it off the rails
4. `04-worlds.png`: Six worlds to master
5. `05-holidays.png`: Holiday specials
6. `06-space.png`: Rockets, portals and cannons
7. `07-friends.png`: Play with friends
8. `08-levels.png`: Amateur to Pro
9. `09-stars.png`: Stars, trophies and 30 designs

In App Store Connect, open the version page, pick the **6.9" Display** (iPhone) box and drag them in, in that order.
If the page only offers the **6.1"/6.3"** box, use the 2622 × 1206 copies in `docs/store-screenshots/6.3in/` instead.
Apple scales them for smaller iPhones. 
**App preview video:** `docs/store-screenshots/preview.mp4` (1920 × 886, 21 s, with a silent audio track as Apple requires). In the same 6.9" box, drag it
in before the screenshots; it plays first, muted, in the App Store. Apple picks the poster frame from the video;
you can change it after uploading.
