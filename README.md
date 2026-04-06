# LinkBio MVP

A Railway-ready Express app for selling done-for-you link-in-bio pages.

## What it includes

- Marketing landing page
- Customer signup and login
- 7-day customer free trial with billing gate
- Self-serve page studio with publish/unpublish controls
- Stripe Checkout starter flow
- Customer intake form with file upload
- Admin login and order dashboard
- Admin page editor for links, colors, status, and publish state
- Public bio pages by slug like `/p/greywolf`
- JSON + file storage that can live on a Railway volume

## Stack

- Node.js
- Express
- EJS
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
- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `OFFER_PRICE_DISPLAY`
- `TRIAL_DAYS`
- `PLAN_NAME`
- `PLAN_PRICE_DISPLAY`
- `BILLING_PRICE_ID`
- `BILLING_CHECKOUT_MODE`

4. Run the app

```bash
npm start
```

Open `http://localhost:3000`

## Railway deployment

1. Push this folder to GitHub.
2. Create a Railway project from that repo.
3. Add environment variables:
   - `BASE_URL`
   - `SESSION_SECRET`
   - `ADMIN_PASSWORD`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_ID`
   - `OFFER_PRICE_DISPLAY`
   - `TRIAL_DAYS`
   - `PLAN_NAME`
   - `PLAN_PRICE_DISPLAY`
   - `BILLING_PRICE_ID`
   - `BILLING_CHECKOUT_MODE`
4. Add a persistent volume and mount it to `/data`.
5. Deploy.

## Storage behavior

- Data file path: `/data/linkbio.json` on Railway, or `./data/linkbio.json` locally
- Uploaded images path: `/data/uploads` on Railway, or `./data/uploads` locally
- Public upload URLs are served from `/uploads/...`
- Admin sessions use Express session memory, so they reset after a restart or deploy
- Customer accounts default to a 7-day in-app trial unless you change `TRIAL_DAYS`

## Admin login

Visit `/admin/login`

The password is the value of `ADMIN_PASSWORD`.

## Suggested next upgrades

- Email notifications when a new order lands
- Customer self-serve edit access
- QR codes and simple click analytics
- Multiple pricing tiers
- Custom domains for clients
