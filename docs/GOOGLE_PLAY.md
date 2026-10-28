# Google Play: putting Rack & Roll on Android

The Android app is built by the **Android build** workflow on GitHub (no Android Studio needed). This guide is
the part done in your browser: the Play Console, AdMob and the repository secrets.

**The long pole:** new personal developer accounts must run a **closed test with at least 12 testers for 14
days in a row** before they can apply to publish. Start gathering testers (friends and family with Android
phones) early.

| Thing | Value |
|---|---|
| App name | `Rack & Roll Mini Golf` (the phone's home screen shows `Rack & Roll`) |
| Package name | `com.cnmbuckstudios.rackandroll` (fixed for good once the first build is uploaded) |
| Remove ads product ID | `com.cnmbuckstudios.racknroll.removeads` (the same as on iPhone) |
| Price of Remove ads | $2.99 |
| Developer website | `https://cnmbuck1.github.io` (where app-ads.txt is) |
| Privacy policy | `https://cnmbuck1.github.io/poolgolf/privacy.html` |
| Support email | `cnmbuckstudios@gmail.com` |

## 1. The upload key (GitHub secrets)

Google Play only accepts builds signed with your **upload key**. Claude made one; it comes as four small text
files. In GitHub: the **poolgolf** repository → **Settings → Secrets and variables → Actions → New repository
secret**, four times. The **Name** is the file's name (without `.txt`) and the **Secret** is everything in the file:

| Name | Secret |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the contents of `ANDROID_KEYSTORE_BASE64.txt` (one long line) |
| `ANDROID_KEYSTORE_PASSWORD` | the contents of `ANDROID_KEYSTORE_PASSWORD.txt` |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the contents of `ANDROID_KEY_PASSWORD.txt` |

Also keep a copy of `rack-and-roll-upload.jks` and the password somewhere safe (a password manager, or a USB
stick). It's never stored in the repository. If it's ever lost, Google can swap in a new upload key after a
support request, so it's not the end of the world, just slow.

## 2. Create the app in the Play Console

1. [play.google.com/console](https://play.google.com/console) → **Create app**.
   - App name: `Rack & Roll Mini Golf`. Language: English (United States).
   - **Game**, **Free**. Tick the two declarations.
2. **Settings → Developer account → Payments profile**: set up the merchant account (bank and tax), needed to
   sell Remove ads.

## 3. The first build

1. GitHub → **Actions → Android build → Run workflow**, track **alpha**, then **Run workflow**. About 5 minutes.
2. Open the finished run, scroll to **Artifacts**, download **rack-and-roll-android** and unzip it. The `.aab`
   file is for Google Play; the `.apk` can be installed straight onto an Android phone to try it.
3. Play Console → **Test and release → Testing → Closed testing** → **Create track** (or use the **Alpha** track) →
   **Create new release** → upload the `.aab`. If asked about **Play App Signing**, accept Google's default (Google
   keeps the app's key; yours is only for uploading). Release name: `1.0.0 (101)` or similar. Notes: `First test build`.
4. Under the track's **Testers** tab: create an email list with your testers' Gmail addresses, save, and copy
   the **join link** to send them. Each tester opens it on their phone, taps **Become a tester**, then installs
   the game from the Play Store.

Builds for testing tracks always show **test ads**, so testers can tap them safely. Only builds made with the
**production** track get real ads.

## 4. Remove ads

Play Console → **Monetize with Play → Products → In-app products → Create product** (the page only opens once a
build is uploaded):
- Product ID: **`com.cnmbuckstudios.racknroll.removeads`**
- Name: `Remove ads`. Description: `Turns off the full-screen ads for good.`
- Price: **$2.99** (Google converts it for other countries). **Save**, then **Activate**.

Testers on the closed track buy it for real unless they're **licence testers**: **Settings → License testing** →
add your own Gmail (and any tester's) so their purchases are free test purchases.

## 5. AdMob for Android

The Android app is a separate app in AdMob:
1. AdMob → **Apps → Add app → Android**. "Is the app listed?" **No** for now. Name: `Rack & Roll`.
2. Note the **App ID** (`ca-app-pub-8965676427575286~…`).
3. **Ad units → Add ad unit**, twice, set up as on iPhone: **Interstitial** named `Between rounds (Android)`
   and **Rewarded** named `Rewarded coins (Android)`.
4. Send Claude the app ID and the two ad unit IDs. Claude puts them in `src/ads.config.ts` and the Android
   manifest. The privacy message (GDPR) you published covers the Android app too; tick it in **Privacy &
   messaging** if it isn't listed.

The app-ads.txt you already published works for Android as well, once the Play listing's website is
`https://cnmbuck1.github.io`.

## 6. The store listing

**Grow users → Store presence → Main store listing**:

- **App name** (30): `Rack & Roll Mini Golf`
- **Short description** (80): `Mini golf with a pool cue. Bank it off the rails, spin it and sink it!`
- **Full description** (4,000): the same as the App Store description in `docs/store-listing.md`.
- **App icon**: `docs/play-store/icon-512.png`
- **Feature graphic**: `docs/play-store/feature-graphic.png`
- **Phone screenshots**: the nine in `docs/play-store/screenshots/`, in number order. (They're the App Store
  ones trimmed slightly at the sides: Google allows at most 2:1.)
- **Video**: optional, and Google only takes a YouTube link. Skip it for now.

**Store settings**: category **Games → Sports**, tags such as Mini golf, Billiards, Casual; contact email and
website from the table at the top.

## 7. App content (Policy → App content)

Google calls these "declarations". Each has a **Start** button.

**Privacy policy**: `https://cnmbuck1.github.io/poolgolf/privacy.html`

**App access**: *All functionality is available without special access.*

**Ads**: *Yes, my app contains ads.*

**Content rating** (the IARC questionnaire): email `cnmbuckstudios@gmail.com`, category **Game**. Answer **No**
to everything (violence, fear, sexuality, language, controlled substances, crude humour, gambling) except:
- *Does the app allow users to purchase digital goods?* **Yes**.
- *Does the app share the user's location with third parties?* **No** (AdMob only estimates a rough area from
  the internet address, which this question doesn't cover).
- Users interact or exchange content: **No**.

Expected result: **Everyone / PEGI 3**.

**Target audience and content**: tick **13–15, 16–17 and 18 and over** (not the younger ones). Picking under-13s
brings in Google's Families rules, which restrict the kind of ads the game can show. "Could your store listing
unintentionally appeal to children?" **No**.

**Data safety**:
- Does your app collect or share any of the required user data types? **Yes**
- Is all of the user data encrypted in transit? **Yes**
- Do you provide a way for users to request that their data is deleted? **No** (no accounts; the play stats
  are anonymous)
- Then tick these data types and answer for each:

| Data type | Collected | Shared | Optional? | Why |
|---|---|---|---|---|
| Location → Approximate location | Yes | Yes | Required | Advertising or marketing, Analytics |
| Personal info → Name | Yes | No | Optional | App functionality (only if a player types it in a feedback report) |
| App activity → App interactions | Yes | Yes | Optional | Analytics, Advertising or marketing |
| App activity → Other user-generated content | Yes | No | Optional | App functionality (feedback reports) |
| App info and performance → Crash logs | Yes | No | Required | Analytics |
| App info and performance → Diagnostics | Yes | Yes | Required | Analytics |
| Device or other IDs | Yes | Yes | Required | Advertising or marketing, Analytics, Fraud prevention |

For every one: *processed ephemerally?* **No**.

**Government apps**: No. **Financial features**: None. **Health**: None. **News**: No.

## 8. Twelve testers, fourteen days

The closed test counts once at least 12 testers have joined and stayed for 14 days. Testers should actually
play a little; Google looks at it. Updates during the test are fine (run the workflow again and upload the new
`.aab` to the same track).

After 14 days, the Play Console **Dashboard** shows **Apply for production**. It asks how testing went (how
you found testers, what feedback you got, what you changed). Claude can help word it.

## 9. Going live

Once production access is granted:
1. Tell Claude the AdMob IDs if not done yet, then run **Android build** with track **production** (real ads).
2. **Production → Create new release** → upload the `.aab` → **Review release → Start rollout**.
3. Google's review usually takes from a few hours to a few days.
4. In AdMob, link the Android app to its Play listing.

## Optional: builds straight to Google Play

The workflow can upload by itself instead of the download-and-upload steps. In Google Cloud, create a service
account with a JSON key, invite its email in the Play Console (**Users and permissions**, "Release to testing
tracks" and "Release to production"), and save the JSON as the repository secret `PLAY_SERVICE_ACCOUNT_JSON`.
Each run then puts a draft release on the chosen track; you press **Start rollout** in the Play Console.
This only works after the first `.aab` has been uploaded by hand.
