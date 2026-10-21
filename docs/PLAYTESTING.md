# Playtesting Rack & Roll

Three stages, from easiest to most real:

| Stage | How testers play | Cost | Good for |
|---|---|---|---|
| 1. Web link (now) | Open a link in the phone's browser, turn the phone sideways, play. "Add to Home Screen" makes it full screen. | Free | Friends and family, this week |
| 2. TestFlight (iPhone) and Google Play internal testing (Android) | Install the real app from an invite link | Apple Developer Program $99/year; Google Play developer account $25 once | Real performance, vibration, app store feel |
| 3. Public beta | Same as 2, with a public TestFlight link / open testing track | Same | Strangers, before launch |

## What the game records

Every finished hole (course, hole, par, strokes, how long it took, whether they picked up, which mode) and
every piece of feedback, plus the build, the kind of device and an anonymous tester id. Nothing else: no
location, no contacts, and no name unless the tester types one into the feedback form.

- **In the game:** Settings → **Playtest results** shows average strokes per hole against par (hardest holes
  first) and the latest feedback. On the web link it shows what was played on that device; on the Google
  Sheet you see everyone.
- **Feedback:** the speech-bubble button on the main menu, or **Report a bug / feedback** in the pause menu.
  Testers pick Bug, Idea or Love it and type a note; the hole they're on and the build go along automatically.

## Step 1: put the web build online (GitHub Pages)

The repository is public, so GitHub Pages hosting is free.

1. On GitHub, open the repository → **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open the **Actions** tab, pick **Web build to GitHub Pages**, and press **Run workflow** (or just push).

The game is then at **https://cnmbuck1.github.io/poolgolf/**, and every push to `main` updates it within a
couple of minutes.

### Keeping it to invited testers

- The web build tells search engines not to list it (`noindex`), so only people you give the link to find it.
- It asks for a **tester code** the first time it's opened, then remembers it on that phone. The code isn't
  written anywhere in this public repository, only its hash (`TESTER_CODE_HASH` in `src/playtest.config.ts`).
  To change it, run `node scripts/tester-code.mjs NEWCODE`, paste the result there and push. Phones that
  already got in will be asked for the new code. Set it to `''` to turn the gate off.
- The gate only applies to the web link; the app builds, claude.ai and local runs skip it.
- This keeps out casual visitors and forwarded links, not a determined person. For real invite-only access,
  put the build behind Cloudflare Access (free for up to 50 people, testers sign in with a code emailed to
  them), or use TestFlight / Google Play internal testing.

## Step 2: collect everyone's results in a Google Sheet (about 5 minutes)

1. Create a new Google Sheet (sheets.new), name it "Rack & Roll playtest".
2. **Extensions → Apps Script.** Delete what's there, paste in all of `docs/playtest-sheet.gs`, and save.
3. **Deploy → New deployment.** Click the gear next to "Select type", choose **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. **Deploy**, allow the permissions it asks for (it only touches this spreadsheet), and copy the
   **Web app URL** (it ends in `/exec`).
5. Paste that URL into `src/playtest.config.ts` (`PLAYTEST_URL = '...'`), commit and push. (Or send the URL to
   Claude to do it.)

From then on the sheet fills in by itself:

- **Plays**: one row per finished hole.
- **Feedback**: one row per report.
- **Summary**: average strokes per hole against par, the holes testers struggle with most at the top.

A tester who plays offline sends their results the next time they open the game. The repository is
public, so the URL can be found; anyone who did could post rows to the sheet. That's fine for a playtest,
but don't put anything private in it.

## Step 3 (later): TestFlight and Google Play internal testing

- **iPhone:** join the Apple Developer Program, set your own app ID (see the README), then in Xcode
  Product → Archive → Distribute → TestFlight. In App Store Connect add testers by email (up to 100 internal
  testers, or 10,000 with a public link after a short beta review). TestFlight has its own feedback: testers
  take a screenshot in the app and send it with a note, and you get crash reports, both in App Store Connect.
- **Android:** create the app in the Play Console, upload a signed bundle (`.aab`) to **Internal testing**,
  and add testers' Google accounts (up to 100). They install from an opt-in link.

The in-game feedback button and the Google Sheet keep working in the app builds too.

## Message to send testers

> Hi! I'm making a mini-golf game played with a pool cue, called **Rack & Roll**, and I'd love your help
> testing it. Open this link on your phone: https://cnmbuck1.github.io/poolgolf/ and turn your phone sideways.
> (On iPhone, tap Share → Add to Home Screen to play full screen.)
> It'll ask for a tester code: **[your code]**
> Play a course or two. When something breaks, confuses you, or you love it, tap the speech bubble on the
> main menu (or Pause → Report a bug) and tell me. Your scores are sent anonymously so I can see which holes
> are too hard. Thank you!

## What to look for

- Holes whose average is more than about 1 stroke over par (shown in red in Playtest results): too hard,
  or something isn't clear.
- Holes nearly everyone birdies: too easy.
- Lots of "picked up" (10 strokes) on one hole: something is confusing or broken there.
- Repeated feedback about the same thing.
