# Ads and Remove ads: setting it up

The game side is built and runs on Google's **test ads**: they appear in the app but earn nothing.
Before release you set up two things (AdMob for the ads and App Store Connect for the purchase), and send
Claude the IDs to paste in. About an hour, once your Apple developer account is approved.

**Status:** the real AdMob app and ad units are in `src/ads.config.ts` and `Info.plist`. Copies installed from
**TestFlight always show test ads** (the app checks where it was installed from), so testers can't tap a real ad;
**App Store downloads show real ads**. Five taps on the version line in Settings show "Test ads" or "Real ads".

## How the ads work in the game

| Ad | When | Notes |
|---|---|---|
| **Rewarded video** (player's choice) | After a round, a match or a daily challenge: *Watch an ad to double your coins*. In the Cues & Balls shop and on Vs Computer: *Watch an ad for 50 coins*, up to 5 a day. | The reward is given only if the ad is watched through. |
| **Interstitial** (full screen) | Halfway through a course or match (after hole 3), and when leaving a finished round, match, daily challenge or practice hole. Never between the other holes, and never in pass-and-play. | At most one a minute (rewarded ads don't count), none in a player's first 3 app launches, and none at all after **Remove ads**. |
| ~~Banner~~ | Not used | Earns little and gets in the way of the controls. |

**Remove ads** ($2.99, Settings) turns off interstitials for good. Rewarded ads stay, since players opt into
them. **Restore purchases** in Settings brings it back on a new phone. A player who resets their progress
keeps it.

Consent: the first time ads start (a player's second launch, or when they first tap a rewarded ad), players
in the EU/UK see Google's consent form, then everyone sees Apple's "Allow tracking?" question. Saying no
still shows ads, just less personalised ones. **Settings → Ad privacy choices** lets players change their
answer.

All the timings and amounts are in `src/ads.config.ts`.

## 1. AdMob (Google)

1. Go to [admob.google.com](https://admob.google.com) and sign in with your Google account (cnmbuckstudios@gmail.com
   is a good choice). Fill in your payment and tax details under **Payments**: Google pays out monthly once
   you pass $100.
2. **Apps → Add app → iOS**. If the app isn't on the App Store yet, choose "No" for "Is the app listed?"
   and name it **Rack & Roll**. You can link it to the store listing after release.
3. Note the **App ID**: it looks like `ca-app-pub-1234567890123456~1234567890`.
4. **Ad units → Add ad unit**, twice:
   - **Rewarded**, named `Rewarded coins`. Leave the reward settings as they are; the game decides the reward.
   - **Interstitial**, named `Between rounds`.

   Note both **ad unit IDs** (they look like `ca-app-pub-1234567890123456/1234567890`).
5. **Privacy & messaging → European regulations (GDPR) → Create message**: choose the Rack & Roll app, your
   privacy policy URL (`https://cnmbuck1.github.io/poolgolf/privacy.html`), the default settings, then
   **Publish**. Don't set up an "IDFA explainer" message: the game asks Apple's tracking question itself.
6. Send Claude the **App ID** and the two **ad unit IDs**. Claude pastes them into `src/ads.config.ts` and
   `ios/App/App/Info.plist` and switches off test mode. Until then, keep using the test ads: tapping your own
   real ads can get an AdMob account suspended.

### app-ads.txt

The file for this account is `docs/app-ads.txt` (publisher `pub-8965676427575286`); it has to be served at
`https://cnmbuck1.github.io/app-ads.txt`.


AdMob checks a small file called `app-ads.txt` on your **developer website** (the Marketing URL in your App
Store listing) to confirm the ads are really yours. Unverified apps earn noticeably less. The file must be at
the root of the site, for example `https://cnmbuck1.github.io/app-ads.txt`, not inside `/poolgolf/`. On GitHub
that means a second repository named exactly `cnmbuck1.github.io` with Pages turned on. Claude can set it up
once you have the AdMob publisher ID (the `pub-…` number). The file holds one line:

```
google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0
```

### SKAdNetwork IDs

`Info.plist` lists Google's own ad network ID. Google publishes a longer list of partner networks
("3p-skadnetworks" in the AdMob iOS guide). Adding it lets more advertisers measure their results, which
helps what they bid. Paste the list to Claude and it'll go into `Info.plist`.

## 2. Remove ads in App Store Connect

1. **Business** (the agreements page): accept the **Paid Apps** agreement and fill in banking and tax.
   Purchases can't be tested or sold until that's done.
2. Your app → **Monetization → In-App Purchases → +**:
   - Type: **Non-Consumable**
   - Reference name: `Remove ads`
   - Product ID: **`com.cnmbuckstudios.rackandroll.removeads`** (exactly this; the game looks for it)
   - Price: **$2.99** (tier 3)
   - Display name: `Remove ads`. Description: `Turns off the full-screen ads for good.`
   - Review screenshot: a screenshot of Settings with the Remove ads button (Claude can make one).
3. Submit it **together with the app version** the first time (on the version page, under *In-App Purchases
   and Subscriptions*, add it before you submit).

### Testing the purchase

In TestFlight builds, purchases use Apple's **Sandbox**: nothing is charged. App Store Connect → **Users and
Access → Sandbox → Testers** → add a test Apple ID (any email you don't use for a real Apple ID). On your
iPhone: Settings → App Store → Sandbox Account, sign in with it, then buy Remove ads in the game.

## 3. Before you submit

- Fill in the new App Privacy answers and age-rating notes in `docs/store-listing.md`.
- In App Store Connect, the version's **App Review notes** mention ads and the purchase (already in the listing doc).
- The public web version (GitHub Pages) has no ads, so once the app is out it should be cut back to a demo.
  Claude can do that when you're ready to launch.
