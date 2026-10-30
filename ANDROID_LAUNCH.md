# Borrowed Android app launch

This folder is the Android wrapper project for Borrowed. Capacitor packages the existing mobile-first UI into an installable Android application. It is not yet a signed Play Store release.

## Build locally

Requirements: Node.js 22 or later, Android Studio, and an Android SDK. Node.js 24 is already installed on the development PC; Android Studio/SDK are not currently detected.

From this `mobile` folder, run:

```powershell
npm install
npm run android:add
npm run android:sync
npm run android:open
```

In Android Studio, let Gradle sync, connect a phone with USB debugging or start an emulator, and use **Run** to install a development build. For Play Store, use **Build → Generate Signed Bundle / APK → Android App Bundle** and create a signing key. Keep that key and its password private and backed up.

When web app files change, copy the latest app files from `../site/` into this project's `www/` folder, then run `npm run android:sync` again. The current `www/` folder was copied from that mobile-first bundle.

## Supabase Auth redirects

Set Supabase **Authentication → URL Configuration** to the public HTTPS site URL used for email confirmation, and add it to the redirect allow-list. Android sign-up now uses that configured Supabase Site URL, because `https://localhost` is not reachable from a confirmation email. After confirmation, users can return to Borrowed and sign in. Do not add a Supabase secret key to the Android package.

## Public Play launch checklist

- Run `supabase-upgrade.sql` so `@srmist.edu.in` restrictions, pickup coordinates, and transaction functions are active.
- Rotate the secret key that was shared in chat. Borrowed only uses the publishable key.
- Confirm signup/confirmation, listing, borrow, approval, two-sided return, and reviews on real devices with SRM email accounts.
- Prepare Play Store app icon, screenshots, description, contact email, privacy policy, data-safety disclosures, and content rating.
- Create a Play Console developer account and upload a signed Android App Bundle.
- If using a new personal Play Console account, Google currently requires a closed test with at least 12 opted-in testers for 14 continuous days before applying for production access.

The current map uses OpenStreetMap's standard public tile service. It is suitable only for modest pilot traffic under its tile policy; a larger public rollout should use a tile provider with an explicit service plan and appropriate usage limits.
