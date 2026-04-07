# LinkBio MVP

A Railway-ready Express app for selling done-for-you and self-serve link-in-bio pages.

## What it includes

- Marketing landing page
- Customer signup and login
- 7-day customer free trial with billing gate
- Self-serve page studio with publish/unpublish controls
- Stripe Checkout starter flow
- Customer intake form with file upload
- Admin login and order dashboard
- Admin page editor for links, colors, status, and publish state
- Public bio pages by username like `/greywolf`
- SEO basics including canonical tags, `robots.txt`, and `sitemap.xml`
- PostgreSQL-backed app data with a volume-backed JSON mirror
- Volume-backed uploads for logos, profile media, and background images

## Stack

- Node.js
- Express
- EJS
- PostgreSQL
- Stripe
- Railway

## Local setup

1. Install dependencies

```bash
npm install
```

2. Copy the environment file

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

3. Fill in the values you want to use

- `BASE_URL`
- `DATABASE_URL`
- `DATABASE_SSL`
- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `OFFER_PRICE_DISPLAY`
- `TRIAL_DAYS`
- `FOUNDING_MEMBER_LIMIT`
- `PLAN_NAME`
- `PLAN_PRICE_DISPLAY`
- `BILLING_PRICE_ID`
- `BILLING_CHECKOUT_MODE`

4. Run the app

```bash
npm start
```

Open `http://localhost:3000`

For local-only JSON fallback, leave `DATABASE_URL` blank.

## Railway deployment

1. Push this folder to GitHub.
2. Create a Railway project from that repo.
3. Add a Railway PostgreSQL service and copy its `DATABASE_URL` into the app service.
4. Add environment variables:
   - `BASE_URL`
   - `DATABASE_URL`
   - `DATABASE_SSL`
   - `SESSION_SECRET`
   - `ADMIN_PASSWORD`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_ID`
   - `OFFER_PRICE_DISPLAY`
   - `TRIAL_DAYS`
   - `FOUNDING_MEMBER_LIMIT`
   - `PLAN_NAME`
   - `PLAN_PRICE_DISPLAY`
   - `BILLING_PRICE_ID`
   - `BILLING_CHECKOUT_MODE`
5. Add a persistent volume and mount it to `/data`.
6. Deploy.

Recommended Railway combo:

- PostgreSQL stores app data such as users, pages, referrals, leads, analytics, and tickets
- The `/data` volume stores uploads and keeps a mirrored JSON snapshot for fallback/recovery

## Storage behavior

- App data lives in PostgreSQL when `DATABASE_URL` is set
- A mirrored JSON snapshot is also written to `/data/linkbio.json` on Railway, or `./data/linkbio.json` locally
- Uploaded images path: `/data/uploads` on Railway, or `./data/uploads` locally
- Public upload URLs are served from `/uploads/...`
- If PostgreSQL is unavailable, the app falls back to the volume JSON snapshot
- Admin sessions use Express session memory, so they reset after a restart or deploy
- Customer accounts default to a 7-day in-app trial unless you change `TRIAL_DAYS`
- The founder offer defaults to the first 500 users unless you change `FOUNDING_MEMBER_LIMIT`
- Page revisions keep the latest 25 restore points per page so you can roll back content changes safely

## Safe rollout workflow

To keep improving the product without hurting live users:

1. Use one Railway environment for staging and one for production.
2. Test new changes in staging against the same feature flow users rely on:
   - signup
   - studio save/publish
   - public page
   - analytics
   - billing
3. Deploy production only after staging passes.
4. If a page-level change causes a problem, use the admin order screen to restore a previous page version.
5. Keep PostgreSQL enabled for app data and the `/data` volume mounted for uploads and JSON recovery.

## Health endpoint

`/health` now reports whether PostgreSQL is configured and whether the app is currently using PostgreSQL or the volume JSON fallback for app data.

## Admin login

Visit `/admin/login`

The password is the value of `ADMIN_PASSWORD`.

## Suggested next upgrades

- Email notifications when a new order lands
- Customer self-serve edit access
- QR codes and simple click analytics
- Multiple pricing tiers
- Custom domains for clients
