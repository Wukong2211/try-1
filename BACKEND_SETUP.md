# Borrowed backend setup (free tier)

This project is currently a browser-only prototype. The SQL file creates the Supabase schema and database-side credit operations; it does not create a Supabase account or project for you.

## Create the free project

1. Sign in at [supabase.com](https://supabase.com) and create a project on the Free plan.
2. Choose a project name and a database password. Save the password somewhere private.
3. In the project dashboard, open **SQL Editor**, create a query, paste in `supabase-schema.sql`, and run it.
4. In **Authentication → Providers**, enable Email. In **Authentication → URL Configuration**, add the deployed app URL when you have one.
5. In **Project Settings → API Keys** or the project's **Connect** dialog, copy the **Project URL** and **Publishable key**. A publishable key starts with `sb_publishable_`; older projects may show an `anon` key.

The publishable key is intended for browser apps. Never share or put a `secret` or `service_role` key in the app. The schema enables Row Level Security on all application tables and routes credit transfers through database functions.

## Connect and run the app

The Project URL and publishable key are configured in `supabase-config.js`. The app uses the publishable key in the browser and relies on Supabase Auth, Row Level Security, and database functions for authorization and credit changes. Never add a secret/service-role key to this file.

Run `supabase-upgrade.sql` once in the SQL Editor. It updates item visibility for active borrowers, closes direct request-table writes, pays credits to the lender only after both people confirm the return, restricts Auth/database access to `@srmist.edu.in`, and adds approximate campus pickup coordinates. Existing item listings are assigned the SRM KTR campus-center pin as a safe coarse default; owners can set a better public handoff pin when listing an item.

Run `supabase-communication.sql` once to enable request-scoped in-app messages and opt-in phone sharing. Messages are limited to the borrower and lender while a request is pending or approved. Phone numbers are hidden unless a participant explicitly shares one after approval; the app then offers Call and SMS links to the device's phone apps.

For the current website build, run `supabase-enhancements.sql` in SQL Editor too. It adds listing availability dates, secure one-day extension requests and lender decisions, and changes completed returns to archive the item from public discovery while preserving its transaction history. The SQL is safe to run again. If setting up a brand-new database, the current `supabase-schema.sql` already includes these updates.

For profile photos, run `supabase-profile-photos.sql` once after `supabase-schema.sql` and the SRM email verification function are installed. It creates a public avatar bucket with a 1 MB JPEG limit; authenticated SRM students can upload and delete only files inside their own user-ID folder. Profile photos are public to anyone with the image URL, so avoid private or sensitive pictures.

For the Campus Community screen, run `supabase-campus-community.sql` once in the Supabase SQL Editor after the other schema scripts. It creates the SRM-only skills/help and teammate-finder tables plus private chats. Skill credits are held when a provider approves a session, paid to the helper only after both students confirm completion, and refunded when an eligible session is cancelled. Team chat is available only after an organizer accepts an introduction. Then upload the current `Borrowed-mobile-web.zip` contents to Netlify.

For the Campus marketplace and opportunity board, run `supabase-campus-market.sql` after `supabase-campus-community.sql`. It adds student-to-student item sale, exchange and giveaway posts, campus deals and opportunities, lost and found ID-card notices, owner controls, accepted-interest messaging and SRM-only access. ID-card notices must not include card numbers, photos, QR/barcodes, contact details, or other identifying information; arrange returns by private message at campus security. Sales and payments happen directly between students; Borrowed does not process, hold, or protect money. Posts are user-submitted and are not verified campus endorsements. Then upload the refreshed `Borrowed-mobile-web.zip` to Netlify.

The app accepts only email addresses ending in `@srmist.edu.in`; this is checked in the signup UI and in the database. The app must be served from `localhost` or HTTPS for service workers and email confirmation redirects. For a campus pilot, deploy the `borrowed/site` folder to a static host such as Netlify, then add that deployed URL in **Authentication → URL Configuration**. Until it is hosted, use a local web server rather than opening `index.html` directly.

The Map screen uses MapLibre with OpenFreeMap vector styles (OpenStreetMap-derived), with map attribution visible, and centers near SRM KTR. OpenFreeMap currently provides its public map service without an API key; it is a community service with no SLA. New item owners can place a rounded public pickup pin. The optional location button only reads the current device location to center that user's map; it does not send the location to Supabase. See https://openfreemap.org/ and https://openfreemap.org/tos/ for current terms.

The secret key was accidentally shared in chat. Rotate it under **Project Settings → API Keys**. The app does not use that key; only the publishable key belongs in `supabase-config.js`.
