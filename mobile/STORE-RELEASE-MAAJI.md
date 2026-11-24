# Maaji — App Store & Google Play release

The Maaji app is this Expo app branded for the venue `maaji-restaurant`
(decided 2026-11-20: same Expo app as Rangla Punjab, published from the same
Apple and Google accounts). General build notes live in [BUILDS.md](BUILDS.md);
this file is the Maaji-specific checklist.

## Identity (fixed after the first release — do not change)

| | Value |
| --- | --- |
| Name under the icon | **Maaji** |
| Store name | **Maaji Restaurant** |
| iOS bundle ID | `de.maajirestaurant.app` |
| Android package | `de.maajirestaurant.app` |
| URL scheme | `maajirestaurant://` |
| Version | **1.0.0** (build numbers: EAS, `autoIncrement`, remote) |
| Apple team | `NFHFDX372C` (same account as Rangla Punjab) |
| Google Play | same Play Console as Rangla Punjab |
| Expo / EAS owner | `elvoriatech` (Elvoria account — log in with it before building) |
| Server baked into the build | `https://maaji-freiburg.com` (eas.json `production`) |

A new version for a later release:
`pnpm brand:mobile --venue maaji-restaurant --version 1.0.1` in the repo root,
then commit `mobile/brand.generated.json`.

## Done in the repo

- Brand: name, IDs, icon (1024², no transparency), Android adaptive icon,
  splash on the Maaji green, in-app palette — all from `brand.generated.json`.
- Permission texts are venue-neutral (no "Rangla Punjab" left in the build):
  location ("does not use your location"), microphone ("does not record
  audio"), camera + photos (complaint photo).
- Apple privacy manifest in `app.config.js` (`ios.privacyManifests`):
  no tracking; required-reason APIs (file timestamp, user defaults, system
  boot time); collected data = name, phone, email, address, purchase history,
  photos, customer support — linked, app functionality only.
- `eas.json` → `submit.production`: Apple team, Play service account path
  (`mobile/play-service-account.json`, git-ignored), Play track `internal`
  as a draft.
- Dependencies aligned with Expo SDK 57; `expo-asset` added (required by
  `expo-audio`, missing → possible crash in release builds).
  `npx expo-doctor`: 21/21 checks pass.
- Production JS bundles for iOS and Android build and point at
  `maaji-freiburg.com`.

## Build and submit (you, logged in to your accounts)

```bash
cd mobile
npx eas-cli login                                   # the Elvoria Expo account (owner: elvoriatech)
npx eas-cli build -p ios --profile production       # creates the EAS project "maaji-restaurant" on first run
npx eas-cli build -p android --profile production
npx eas-cli submit -p ios --latest
npx eas-cli submit -p android --latest              # only after the FIRST AAB was uploaded by hand
```

On the first iOS build EAS asks to log in to Apple and offers to create the
distribution certificate and provisioning profile for `de.maajirestaurant.app`
— let it (or pick existing ones). On the first Android build it offers to
generate the upload keystore — let it, EAS keeps it. **Never commit a
certificate, keystore, `.p8`/`.p12` or password.**

## Status 2026-11-23

- **iOS:** build 1.0.0 (1) installed and running on the owner's iPhone
  (Xcode, team NFHFDX372C, push + Sign in with Apple). App Store archive
  built (`mobile/ios/build/Maaji.xcarchive`, git-ignored). **Upload blocked:**
  App Store Connect has no app with bundle ID `de.maajirestaurant.app` in
  team NFHFDX372C (Xcode: `missingApp`). Create it (step 1 below), then
  re-run the export/upload:
  `xcodebuild -exportArchive -archivePath ios/build/Maaji.xcarchive -exportOptionsPlist ios/build/ExportOptions.plist -exportPath ios/build/export -allowProvisioningUpdates`
- **Build numbers:** that first upload is iOS build **1**. EAS keeps its own
  remote counter, so before the first EAS iOS build run
  `npx eas-cli build:version:set -p ios` and set it to **2** or higher.
- **Android:** prebuild verified — `de.maajirestaurant.app`, versionCode 1,
  1.0.0. Unused permissions blocked in `app.json`
  (`RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE`), so
  the Play listing does not have to justify microphone or storage access.
- **EAS login:** this Mac is logged in as `zahoor1989`, which is not a member
  of `elvoriatech`. Log in as Elvoria, or invite zahoor1989 to the
  organisation on expo.dev, before `eas build`.

## Android upload key plan (Play App Signing)

1. `npx eas-cli build -p android --profile production` (logged in for
   `elvoriatech`). When asked "Generate a new Android Keystore?" answer
   **yes**: EAS creates the **upload key** and stores it.
2. Back it up once: `npx eas-cli credentials -p android` → Download
   keystore. Keep the `.jks` and its passwords in your password manager,
   never in the repo.
3. Play Console → create "Maaji Restaurant" → **Play App Signing** stays on
   (default): Google holds the app signing key, EAS's key only uploads.
   A lost upload key can then be reset through Play support.
4. Upload the first `.aab` by hand to **Internal testing**, fill Data safety
   + content rating, then create the service account and save its JSON as
   `mobile/play-service-account.json` for `npx eas-cli submit -p android --latest`.
5. For the dispatch-QR app link: Play Console → App signing → SHA-256
   fingerprint into `public/.well-known/assetlinks.json` (see BUILDS.md).

## ⛔ Only you can do (accounts, credentials, money)

| # | Where | What |
| --- | --- | --- |
| 1 | App Store Connect | New app: bundle ID `de.maajirestaurant.app`, name "Maaji Restaurant", primary language German, SKU e.g. `maaji-restaurant-ios`. |
| 2 | Apple Developer | Register the bundle ID (EAS can do it), capabilities: Push Notifications, Sign in with Apple. Time-sensitive notifications are in the entitlements. |
| 3 | Apple Developer | APNs key for push (`eas credentials` → iOS → Push key), same as BACKLOG P7-11b. |
| 4 | Google Play Console | Create app "Maaji Restaurant", default language German, app (not game), free. |
| 5 | Google Play Console | Upload the FIRST `.aab` by hand (internal testing), then set up a service account and save its JSON as `mobile/play-service-account.json` for `eas submit`. |
| 6 | Firebase | Android app `de.maajirestaurant.app` → download `google-services.json` into `mobile/` (FCM push). Without it Android builds, but receives no push. |
| 7 | Server | Live Stripe / PayPal keys + webhook secret / webhook ID (see BUILDS.md table) before real guests pay in the app. |
| 8 | Optional | Apple Pay (`APPLE_MERCHANT_ID`), Google sign-in client IDs, universal links (`APPLE_UNIVERSAL_LINKS=1`) — each documented in BUILDS.md, all off by default. |

## Store listing assets (checklist)

Ready-to-upload files live in [`store/`](store/) (2026-11-24). Screenshots are
from the **Release** build against the live server (`maaji-freiburg.com`) in
the iOS Simulator, status bar set to 9:41 / full battery, German UI. Retake
them when the menu or the home banner changes: build Release for the
simulator, then `xcrun simctl io <device> screenshot <file>`.

### Both stores
- [ ] Privacy policy URL: `https://maaji-freiburg.com/legal/privacy`
- [ ] Support URL / contact: `https://maaji-freiburg.com` + restaurant email and phone
- [ ] Imprint (DE requirement for the seller): `https://maaji-freiburg.com/legal/impressum`
- [x] App icon: from the build (1024² for Apple is taken from the binary); Play's **512×512 PNG** → `store/android/icon-512.png`

### Apple App Store
- [x] Screenshots **iPhone 6.9"** (1320×2868) — `store/ios/iphone-6.9/` (6)
- [x] Screenshots **iPad 13"** (2064×2752) — `store/ios/ipad-13/` (4); required because the app supports iPad (`supportsTablet: true`)
- [ ] Subtitle (≤30), promotional text (≤170), description, keywords (≤100)
- [ ] Category: **Food & Drink**; secondary optional: Lifestyle
- [ ] Age rating questionnaire: no alcohol/tobacco sales, no user-generated public content → 4+
- [ ] App Privacy: same data as the privacy manifest above — Name, Phone, Email, Physical address, Purchase history, Photos (complaint photo), Customer support; linked to the user; App functionality; **no tracking**. Payment info: collected by Stripe/PayPal, not by the app.
- [ ] Encryption: `usesNonExemptEncryption: false` is set → no export documentation needed
- [ ] Review notes + demo account (see below)

### Google Play
- [x] Phone screenshots: 1080×1920 (9:16) — `store/android/phone/` (6, the iPhone shots on the brand green)
- [x] 7" and 10" tablet screenshots — `store/android/tablet/` (4, 2064×2752; the same set fits both slots)
- [x] **Feature graphic 1024×500** — `store/android/feature-graphic-1024x500.png`
- [ ] Short description (≤80), full description (≤4000)
- [ ] Category: **Food & Drink**; contact email
- [ ] Content rating questionnaire (IARC)
- [ ] **Data safety**: collected — name, email, phone, address, purchase history, photos, app interactions not shared; encrypted in transit; users can request deletion; payment info processed by Stripe/PayPal
- [ ] Target audience: 18+ / not for children
- [ ] Ads: **no ads**

## Draft store texts (please review — your restaurant, your voice)

**Subtitle / short description (DE):** Indisch-pakistanisch in Freiburg bestellen

**Description (DE):**

> Maaji – indisch-pakistanische Leckereien in Freiburg, jetzt als App.
>
> • Die ganze Speisekarte mit Allergenen und Filtern (vegetarisch, vegan, glutenfrei, halal)
> • Zum Abholen oder zur Lieferung bestellen – bezahlen mit Karte, PayPal oder bar
> • Bestellung live verfolgen
> • Punkte sammeln und Prämien einlösen
> • Gutscheine kaufen und verschenken
> • Tisch reservieren
>
> Frisch gekocht, wie bei Maaji zu Hause.

**Description (EN):**

> Maaji – Indian & Pakistani food in Freiburg, now as an app.
> Browse the full menu with allergens and diet filters, order for pickup or
> delivery, pay by card, PayPal or cash, track your order live, collect
> points, buy gift cards and book a table.

**Keywords (Apple, DE):** indisch,pakistanisch,freiburg,lieferung,abholung,curry,biryani,naan,halal,restaurant

## App Review notes (paste into both stores)

> Maaji Restaurant is the ordering app of one restaurant in Freiburg,
> Germany. To place an order without paying, choose **pickup** and **cash**
> ("Bei Abholung zahlen"); the restaurant confirms cash orders by phone, so
> please use the demo account below and do not expect a call.
> Gift cards are for meals at the restaurant (goods consumed outside the
> app, guideline 3.1.3(e)) and are paid with Stripe/PayPal.
> Staff screens (order board, sales) need a staff login and are not part of
> the guest experience.
> Demo guest login: <email> / <password>  ← create a dedicated reviewer account

- [ ] Create a **reviewer guest account** (not a staff account — the staff
      board shows real orders) and put it in both review forms.

## Before submitting — quick device check

- [ ] Install the production build via TestFlight / Play internal testing.
- [ ] Order once with Cash (code e-mail arrives, "Wir rufen Sie an" shows), once by card in test mode.
- [ ] Push notification arrives (needs #3 and #6 above).
- [ ] No "Rangla" anywhere on screen; the launch screen shows the Maaji figure on green.

## Housekeeping

`mobile/ios/Maaji/` (generated, git-ignored) currently holds `maaji.dump`
(a database dump) and `maaji-uploads.tgz`. They are not part of the app,
but customer data must not sit in a native project folder — move them to
an encrypted backup location and delete them from there.
