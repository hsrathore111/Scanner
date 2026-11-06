# Heirloom: setup and testing

Photograph an old item to learn what it is, what it may be worth (a range with confidence and real comparable sales),
and where to sell it. Built with Expo (SDK 58), Firebase (Auth, Firestore, Functions), RevenueCat and Claude.

```
src/app/            screens (expo-router)
  onboarding.tsx    3-step intro, then paywall
  paywall.tsx       RevenueCat subscription paywall (custom UI)
  (tabs)/index      Collection + total value (Pro)
  (tabs)/scan       Take/choose photo -> appraisal
  (tabs)/settings   Plan, restore, legal
  item/[id]         Result: value range, confidence, comparables, close-up request,
                    where to sell (Pro), PDF report (one-time IAP)
src/lib/            firebase, purchases, images, items (API), report (PDF)
functions/src/      appraiseItem callable: scan limits, RevenueCat check, Claude + web search
firestore.rules     users can't edit counters or appraisals
```

## How money works

| What | Type | Suggested price | ID |
|---|---|---|---|
| Heirloom Pro, yearly (3-day free trial) | Auto-renewing subscription | $39.99/yr | `heirloom_pro_annual` |
| Heirloom Pro, weekly | Auto-renewing subscription | $6.99/wk | `heirloom_pro_weekly` |
| PDF report for one item | Consumable IAP | $4.99 | `heirloom_item_report` |

- Free: 3 scans (enforced on the server), with identification, value range, confidence and comparables.
- Pro (entitlement `pro`): unlimited scans (25/day cost guard), collection total value, selling guidance.
- A close-up re-check of the same item is free (up to 2 per item).

## 1. Firebase (same Google account as FitHit, but a NEW project)

1. https://console.firebase.google.com → **Add project** → name it `heirloom`.
2. Switch to the **Blaze** plan (Functions need it to call external APIs; the free tier still applies).
3. **Build → Authentication → Sign-in method → Anonymous → Enable**.
4. **Build → Firestore Database → Create database** (production mode, location `nam5 (us-central)`).
5. **Project settings → Your apps → Web (</>)** → register → copy the config values into `.env`
   (copy `.env.example` to `.env`).
6. Put your project id in `.firebaserc`.

## 2. Backend secrets and deploy

```bash
npx firebase-tools login
cd functions && npm install && cd ..

# Anthropic API key from https://console.anthropic.com/settings/keys
npx firebase-tools functions:secrets:set ANTHROPIC_API_KEY

# RevenueCat SECRET key (Project settings → API keys → + New secret key, v1).
# If you skip it, everyone is treated as a free user.
npx firebase-tools functions:secrets:set REVENUECAT_SECRET_KEY

npx firebase-tools deploy --only functions,firestore:rules
```

Each scan is one Claude Opus 5.5 call with up to 5 web searches. Check the actual cost per scan in the Anthropic
console after your first test scans, then adjust `PRO_DAILY_SCANS` / `FREE_SCANS` in `functions/src/index.ts`
(and `src/constants/config.ts`).

## 3. RevenueCat (project 7e22306b)

1. **Apps → + New**: Google Play app with package `com.himmat.heirloom` (and later an App Store app with bundle id
   `com.himmat.heirloom`). Connect the Play service account the same way as FitHit.
2. **Entitlements → + New** → identifier `pro`.
3. **Products**: add `heirloom_pro_annual` and `heirloom_pro_weekly` → attach both to `pro`. Add `heirloom_item_report`
   (not attached to any entitlement).
4. **Offerings → default** → packages **Annual** → `heirloom_pro_annual`, **Weekly** → `heirloom_pro_weekly`. Mark it current.
5. Copy the public SDK keys (`goog_…`, `appl_…`) into `.env`.

## 4. Google Play Console (Android testing)

1. Create a new app "Heirloom" with package `com.himmat.heirloom`.
2. Create the subscriptions and in-app product with the IDs above.
3. Billing only works after a build has been uploaded to a test track: build with the `production` profile once, upload
   the `.aab` to **Internal testing**, and add your Gmail as a **License tester** (Setup → License testing).

## 5. Build and run on your Android phone

```bash
npx eas-cli@latest init                       # links to a new EAS project under himmat12singh
npx eas-cli@latest env:push --environment development --path .env   # or add them on expo.dev
npx eas-cli@latest build --profile development --platform android
# install the APK from the build page, then:
npx expo start --dev-client
```

Expo Go won't work, because RevenueCat needs native code; use the development build. Without RevenueCat keys the app
still runs: the paywall shows a notice, and in development the PDF report can be created for free so you can test it.

## 6. iPhone (later, no Mac needed)

1. Join the Apple Developer Program ($99/yr) and create the app in App Store Connect with bundle id `com.himmat.heirloom`.
2. Create the same subscriptions (one subscription group) and the consumable in App Store Connect; add the App Store
   app in RevenueCat with its In-App Purchase key.
3. `npx eas-cli@latest build --profile production --platform ios` then `npx eas-cli@latest submit -p ios` → test with
   TestFlight on any iPhone (a friend's works) using a Sandbox Apple ID.

## Before submitting to the stores

- Replace the placeholder icon and splash in `assets/` (currently Expo defaults).
- Publish a privacy policy and set `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_SUPPORT_EMAIL`.
- App Store privacy labels: photos are sent to our server and Anthropic for analysis and are not stored on the server;
  the collection is stored in Firestore under an anonymous id.
- Accounts are anonymous. If someone deletes the app, their collection is lost (purchases restore through RevenueCat).
  Adding Sign in with Apple / Google is the next step for keeping collections across devices.
