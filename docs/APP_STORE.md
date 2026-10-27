# Getting Rack & Roll onto the App Store (no Mac needed)

The iPhone app is built on a Mac in the cloud by GitHub (`.github/workflows/ios-testflight.yml`) and sent
straight to TestFlight. Your part is setting up the Apple side once, about an hour in total.

| | Value |
|---|---|
| App name | Rack & Roll |
| Bundle ID | `com.cnmbuckstudios.rackandroll` |
| SKU | `rackandroll` |
| Version | 1.0.0 (from `package.json`) |
| Devices | iPhone only, landscape |
| Primary language | English (U.S.) |
| Category | Games → Sports (secondary: Casual) |
| Studio | Cnmbuck Studios |

## 1. Join the Apple Developer Program ($99 a year)

1. Install the **Apple Developer** app on your iPhone, sign in with your Apple ID (two-factor authentication
   must be on), tap **Account → Enroll Today**, and enroll as an **Individual**.
2. Approval usually takes up to 48 hours. You'll get an email.

**Seller name:** an individual account shows your legal name as the seller on the App Store. To show
"Cnmbuck Studios" instead, enroll as an **Organization**: that needs a registered business (an LLC or
similar) and a D-U-N-S number (free from Apple's D-U-N-S lookup; takes up to two weeks). "Cnmbuck Studios"
still appears in the game, the copyright line and the support page either way.

## 2. Register the app ID

At [developer.apple.com/account](https://developer.apple.com/account) → **Certificates, IDs & Profiles →
Identifiers → +**:

1. Choose **App IDs → App**.
2. Description: `Rack and Roll`. Bundle ID: **Explicit**, `com.cnmbuckstudios.rackandroll`.
3. Leave the capabilities as they are. **Continue → Register**.

While you're there, note your **Team ID** (top right of the page, or **Membership details**): 10 letters
and numbers.

### Register your iPhone (once)

Apple won't sign a build for an account with no devices on it, so register your own iPhone:

1. Find its **UDID** (a long code that identifies the phone). Without a Mac, either:
   - on a Windows PC, connect the iPhone, open the **Apple Devices** app (or iTunes), select the phone and
     click the serial number until it shows the UDID, then copy it; or
   - on the iPhone, open **udid.tech** (or a similar UDID site) in Safari, install the small profile it
     offers, read off the UDID, then remove the profile in Settings → General → VPN & Device Management.
2. developer.apple.com/account → **Certificates, IDs & Profiles → Devices → +**. Platform iOS, any name
   (e.g. "My iPhone"), paste the UDID, **Continue → Register**.

## 3. Create the app in App Store Connect

At [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps → + → New App**:

- Platforms: **iOS**
- Name: **Rack & Roll** (if it's taken, try "Rack & Roll Mini Golf")
- Primary language: English (U.S.)
- Bundle ID: pick `com.cnmbuckstudios.rackandroll`
- SKU: `rackandroll`
- User access: Full access

## 4. Make an API key so GitHub can upload builds

App Store Connect → **Users and Access → Integrations → App Store Connect API → Team Keys → +**
(the first time, Apple asks you to request access; accept it).

1. Name: `GitHub`. Access: **Admin** (needed so it can create the signing certificate for you).
2. **Generate**, then **Download API Key**. You get a file named `AuthKey_XXXXXXXXXX.p8`. You can only
   download it once, so keep it somewhere safe.
3. Note the **Key ID** (in the list) and the **Issuer ID** (above the list).

## 5. Give GitHub the four secrets

On GitHub: **cnmbuck1/poolgolf → Settings → Secrets and variables → Actions → New repository secret**.
Add these four (names exactly as written):

| Name | Value |
|---|---|
| `APPLE_TEAM_ID` | your Team ID from step 2 |
| `ASC_KEY_ID` | the Key ID from step 4 |
| `ASC_ISSUER_ID` | the Issuer ID from step 4 |
| `ASC_PRIVATE_KEY` | open the `.p8` file in a text editor and paste everything, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |

Secrets are encrypted and never shown in the build logs, even though the repository is public.

## 6. Build and install with TestFlight

1. GitHub → **Actions → iPhone build to TestFlight → Run workflow → Run workflow**. It takes about
   10–20 minutes.
2. When it's green, App Store Connect → your app → **TestFlight**. The build appears after Apple processes
   it (usually 5–30 minutes).
3. Add yourself under **Internal Testing** (create a group, add your Apple ID), install the **TestFlight**
   app on your iPhone, and accept the invite. Rack & Roll installs like any other app.
4. To invite friends without adding them to your team, create an **External Testing** group and turn on a
   **public link**. The first external build gets a short beta review (usually a day).

Run the workflow again whenever there's an update you want on your phone; each run uploads a new build.

## 7. Submit to the App Store

Once it plays well on your phone, fill in the App Store page (Claude prepares the text and screenshots,
see `docs/store-listing.md`), pick the build, and **Submit for Review**. Reviews usually take one to
three days.
