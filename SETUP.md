# Heirloom: setup and launch (iPhone first)

Heirloom identifies old items from photos and shows a realistic value backed by verified sold prices.
Stack: Expo SDK 58, Firebase (Auth, Firestore, Storage, Functions, Hosting), RevenueCat, Claude.

```
src/app/            screens: onboarding, paywall, (tabs)/index, scan, settings, item/[id]
src/lib/            firebase, purchases, images, items, account, report (PDF), export (CSV)
functions/src/      index.ts (scan limits, background job, purchases, deletion)
                    evidence.ts (code check on model values; `npm test` in functions/)
site/               privacy, terms and support pages (Firebase Hosting)
store/app-store.md  listing text, privacy answers, review notes, launch checklist
```

How a scan works: the app calls `startAppraisal`, which reserves a scan and stores the photos. A background function then
calls Claude and writes the result to Firestore, so it finishes even if the user leaves the app. A failed or unusable scan
is refunded. Comparables are kept only if their URL really appeared in search results, and code lowers the confidence when
verified sold prices are missing or below the estimate.

## 1. Firebase (new project, same Google account as FitHit)

1. https://console.firebase.google.com → **Add project** → `heirloom`.
2. Upgrade to the **Blaze** plan.
3. **Authentication → Sign-in method**: enable **Anonymous** and **Apple**. For a native iOS app, Apple needs no Services ID:
   enable it and save.
4. **Firestore Database → Create database**, production mode, location `nam5`.
5. **Storage → Get started**, production mode, same location.
6. **Project settings → Your apps → Web** → register → copy the values into `.env` (copy `.env.example`).
7. Put the project id in `.firebaserc`.

## 2. Backend

Replace `SUPPORT_EMAIL`, `OPERATOR_NAME` and `LAST_UPDATED` in `site/*.html` first, then:

```bash
npx firebase-tools login
cd functions && npm install && npm test && cd ..
npx firebase-tools functions:secrets:set ANTHROPIC_API_KEY       # console.anthropic.com/settings/keys
npx firebase-tools functions:secrets:set REVENUECAT_SECRET_KEY   # RevenueCat → API keys → new secret key (v1)
npx firebase-tools deploy --only functions,firestore:rules,storage,hosting
```

Without the RevenueCat secret, every user counts as free and report purchases can't be confirmed.

Set a monthly limit in the Anthropic console. Each scan is one Claude Opus 5.5 call with up to 5 web searches, so measure
the real cost per scan on your first tests, then tune `FREE_SCANS` and `PRO_DAILY_SCANS`. Free scans are tied to an
anonymous account, so someone reinstalling the app gets more; watch for this after launch.

## 3. Apple

1. Join the Apple Developer Program ($99/year).
2. In **Certificates, Identifiers & Profiles**, confirm `com.himmat.heirloom` has **Sign in with Apple** enabled. EAS does
   this during the first iOS build if you let it manage credentials.
3. In **App Store Connect**, create the app with that bundle id and complete **Agreements, Tax and Banking** (paid apps
   can't sell without it).
4. Create the products listed in `store/app-store.md`: both subscriptions in one group, with a 3-day free trial on yearly,
   plus the consumable report.

## 4. RevenueCat (project 7e22306b)

1. **Apps → + New → App Store**, bundle id `com.himmat.heirloom`, and upload the In-App Purchase key from App Store Connect.
2. **Entitlements → + New** → `pro`.
3. **Products**: add `heirloom_pro_annual` and `heirloom_pro_monthly`, attached to `pro`. Add `heirloom_item_report`, attached
   to no entitlement.
4. **Offerings → default**: Annual and Monthly packages. Mark it current.
5. Copy the public key (`appl_…`) into `.env`.

## 5. Build and test on an iPhone (no Mac needed)

Add the `.env` values to EAS, then build. You'll need a borrowed iPhone for TestFlight:

```bash
npx eas-cli@latest env:push --environment production --path .env
npx eas-cli@latest build --profile production --platform ios     # asks you to log in to Apple the first time
npx eas-cli@latest submit --platform ios                         # uploads to TestFlight
```

Test purchases with a Sandbox Apple ID. Go through the checklist at the end of `store/app-store.md`, then submit for review
in App Store Connect.

## Testing on Android meanwhile

```bash
npx eas-cli@latest build --profile development --platform android
npx expo start --dev-client
```

A dev build reads your local `.env`, so config changes need no rebuild. Expo Go won't work, because RevenueCat is native
code. Sign in with Apple is hidden on Android. Purchases there need a Play Console app and a RevenueCat Play app.

## Not built yet

- Google sign-in (needed before an Android launch, so Android users can back up).
- Native App Check, which would make free-scan abuse harder.
