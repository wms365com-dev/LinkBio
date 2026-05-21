# LinkBio MVP Handoff

## Project Name and Purpose

LinkBio MVP is a Railway-ready custom link-in-bio SaaS app for `myurlc.com`. It lets users sign up, build and publish a branded public profile page, collect leads, review analytics, and start billing flows through Stripe.

## Current Status

- Main Git branch: `main`
- GitHub remote: `https://github.com/wms365com-dev/LinkBio.git`
- Recommended production setup: single Railway app serving `https://www.myurlc.com`
- Legacy fallback: `bluehost-frontend/` contains an older split Bluehost frontend that calls the Railway API
- Runtime: Node.js, Express, EJS
- Data: PostgreSQL when `DATABASE_URL` is set, with a JSON mirror in `/data/linkbio.json`; local fallback is `./data/linkbio.json`
- Uploads: `/data/uploads` on Railway or `./data/uploads` locally
- Tests: no full automated test suite yet; `npm run check` performs a JavaScript syntax check

## Main Features Already Built

- Marketing home page
- Signup, login, logout, forgot-password, and reset-password flows
- Password hashing with Node crypto `scrypt`
- Customer trial and billing gate
- Customer studio for editing and publishing link-in-bio pages
- Public profile pages by username at `/:slug` and `/p/:slug`
- Lead capture forms on public pages
- Click and page-view analytics
- Customer analytics dashboard
- Customer JSON export
- Stripe Checkout starter flows for purchase and billing
- Intake form with file uploads
- Admin login
- Admin dashboard for orders, customers, leads, tickets, feedback, and founder offer stats
- Admin page editor, publish/unpublish controls, account activation/deactivation
- Page revision snapshots and restore
- Support ticket form and API
- Public feedback board with posts, comments, likes, and admin status control
- SEO basics: canonical URLs, robots route, sitemap route, meta descriptions
- Health endpoints at `/health` and `/api/health`
- Legacy PHP frontend for Bluehost split-host mode

## Features Still Pending

- Add a real automated test suite for core routes and data behavior
- Add Stripe webhooks and/or a customer billing portal for more reliable subscription state
- Add durable session storage; current Express sessions are in memory and reset after restarts
- Add new-order and support-ticket email notifications
- Add structured database migrations if the app moves beyond the current JSON-snapshot-in-Postgres model
- Decide whether to fully remove the legacy `bluehost-frontend/` once Railway-only deployment is confirmed
- Add staging and production environment parity checks
- Add custom-domain workflows for customer pages, if needed

## Folder and File Structure

```text
.
├── server.js                 # Main Express app, routes, data store, auth, Stripe, email, uploads
├── package.json              # Node package metadata and scripts
├── package-lock.json         # npm lockfile, lockfileVersion 3
├── railway.json              # Railway deploy restart policy
├── README.md                 # Local developer quickstart
├── HANDOFF.md                # This project handoff document
├── SETUP_NEW_COMPUTER.md     # Step-by-step migration instructions
├── .env.example              # Environment variable names only; no secret values
├── .gitignore                # Excludes secrets, dependencies, generated data, logs, caches
├── push-to-github.bat        # Windows helper for committing/pushing to GitHub
├── public/
│   └── styles.css            # Main app styles
├── views/
│   ├── *.ejs                 # EJS pages for app, admin, auth, public profiles, billing, support
│   └── partials/             # Shared header/footer partials
├── bluehost-frontend/        # Legacy PHP frontend for old Bluehost + Railway split mode
└── data/                     # Local generated JSON data/uploads; ignored and not committed
```

The project itself is nested at `C:\LinkBio\linkbio-mvp\linkbio-mvp` on this computer. The outer `C:\LinkBio` folder also contains `linkbio-mvp.zip`, which is not part of the Git repo.

## Required Programs on the New Computer

- Git
- Node.js 20 or newer; Node 22 LTS or newer is fine
- npm, included with Node.js
- VS Code or another editor
- Railway account and Railway CLI, optional but useful
- PostgreSQL client tools, optional for direct database inspection
- A Stripe account if testing real checkout flows
- SMTP provider credentials if testing password reset email
- PHP/Apache only if maintaining the legacy `bluehost-frontend/`

Current local audit machine versions:

- Node.js `v24.12.0`
- npm `11.6.2`

## Tech Stack

- Framework: Express 4
- Templates: EJS
- Runtime: Node.js `>=20`
- Package manager: npm
- Database: PostgreSQL via `pg`, using one `app_store_snapshots` JSON snapshot table
- Local fallback database: JSON file at `./data/linkbio.json`
- File uploads: `multer`, stored under `/data/uploads` on Railway or `./data/uploads` locally
- Auth/session: `express-session` in-memory store
- Payments: Stripe Checkout via `stripe`
- Email: Nodemailer SMTP
- Hosting: Railway Nixpacks from `package.json`
- Legacy frontend: PHP files in `bluehost-frontend/`

## Commands

```bash
npm install
npm run check
npm start
```

`npm run dev` currently runs the same command as `npm start`.

Railway should detect the Node app and run `npm start`. No Dockerfile, Procfile, or `requirements.txt` is required for the current setup.

## Environment Variables

Do not commit secret values. Copy `.env.example` to `.env` locally, then fill values manually.

```env
PORT=
NODE_ENV=
BASE_URL=
PUBLIC_WEB_URL=
APP_BASE_URL=
API_BASE_URL=
CORS_ALLOWED_ORIGINS=
DATABASE_URL=
DATABASE_SSL=
SESSION_SECRET=
SESSION_COOKIE_NAME=
SESSION_COOKIE_DOMAIN=
SESSION_COOKIE_SAMESITE=
ADMIN_PASSWORD=
SUPPORT_EMAIL=
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
PASSWORD_RESET_TOKEN_TTL_MINUTES=
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID=
OFFER_PRICE_DISPLAY=
TRIAL_DAYS=
PLAN_ACCESS_DAYS=
FOUNDING_MEMBER_LIMIT=
REFERRAL_BONUS_MONTHS_MAX=
PLAN_NAME=
PLAN_PRICE_DISPLAY=
BILLING_PRICE_ID=
BILLING_CHECKOUT_MODE=
PAGE_REVISION_LIMIT=
```

### Where Secrets Are Expected

- Local development: `.env` in the project root
- Railway: service variables on the Railway app service, plus Railway PostgreSQL variable references
- GitHub Actions, if added later: GitHub repository secrets
- Bluehost legacy frontend: `bluehost-frontend/config.php` contains public host configuration; do not place private API keys there

## Suggested Local `.env` Defaults

These are non-secret local values to use as a starting point:

```env
PORT=3000
NODE_ENV=development
BASE_URL=http://localhost:3000
PUBLIC_WEB_URL=http://localhost:3000
APP_BASE_URL=http://localhost:3000
API_BASE_URL=
CORS_ALLOWED_ORIGINS=http://localhost:3000
DATABASE_URL=
DATABASE_SSL=disable
SESSION_COOKIE_NAME=myurlc.sid
SESSION_COOKIE_DOMAIN=
SESSION_COOKIE_SAMESITE=lax
SUPPORT_EMAIL=info@myurlc.com
SMTP_PORT=587
SMTP_SECURE=false
PASSWORD_RESET_TOKEN_TTL_MINUTES=60
OFFER_PRICE_DISPLAY=$1
TRIAL_DAYS=7
PLAN_ACCESS_DAYS=30
FOUNDING_MEMBER_LIMIT=500
REFERRAL_BONUS_MONTHS_MAX=12
PLAN_NAME=myurlc.com Pro
PLAN_PRICE_DISPLAY=$9/month
BILLING_CHECKOUT_MODE=payment
PAGE_REVISION_LIMIT=25
```

Generate fresh values for `SESSION_SECRET` and `ADMIN_PASSWORD`. Add Stripe and SMTP secrets only when testing those integrations.

## Local Setup Steps

1. Clone the repo.
2. Enter the project folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Fill `.env` manually. For JSON fallback, leave `DATABASE_URL` blank.
6. Run `npm run check`.
7. Run `npm start`.
8. Open `http://localhost:3000`.

## GitHub Setup Steps

1. Confirm Git is installed: `git --version`.
2. Clone `https://github.com/wms365com-dev/LinkBio.git`.
3. Confirm the remote: `git remote -v`.
4. Create or edit `.env` locally only; never commit it.
5. Before committing, run `git status --short`.
6. Commit focused changes with clear messages.
7. Push to `origin main`, or use a feature branch if the workflow changes.

## Railway Deployment Steps

1. Create or open the Railway project connected to the GitHub repo.
2. Ensure the app service deploys from branch `main`.
3. Add a Railway PostgreSQL service.
4. Add a persistent volume mounted at `/data`.
5. Set the production custom domain to `www.myurlc.com`.
6. Redirect apex `myurlc.com` to `https://www.myurlc.com`.
7. Add environment variables on the Railway app service.
8. Set `DATABASE_URL` to the Railway PostgreSQL reference, such as `${{Postgres.DATABASE_URL}}`.
9. Set `DATABASE_SSL=require` for Railway PostgreSQL.
10. Deploy and check `/health` and `/api/health`.

Recommended Railway production values:

```env
NODE_ENV=production
BASE_URL=https://www.myurlc.com
PUBLIC_WEB_URL=https://www.myurlc.com
APP_BASE_URL=https://www.myurlc.com
CORS_ALLOWED_ORIGINS=https://www.myurlc.com,https://myurlc.com
SESSION_COOKIE_NAME=myurlc.sid
SESSION_COOKIE_DOMAIN=myurlc.com
SESSION_COOKIE_SAMESITE=lax
SUPPORT_EMAIL=info@myurlc.com
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=require
```

Add secret values separately for `SESSION_SECRET`, `ADMIN_PASSWORD`, SMTP, and Stripe.

## Database Setup and Migration Steps

- There are no standalone migration files.
- On startup, `server.js` creates `app_store_snapshots` if PostgreSQL is configured.
- The app stores the normalized app state as one JSON snapshot row.
- With PostgreSQL enabled, the app also mirrors state to `/data/linkbio.json`.
- Without PostgreSQL, local development uses `./data/linkbio.json`.
- Local `data/` is ignored by Git and must be copied manually only if you need local sample data.
- For production moves, migrate Railway PostgreSQL and the Railway `/data` volume through Railway tooling/backups.

## Known Bugs or Issues

- There is no full automated test suite yet.
- Sessions use the default in-memory Express session store, so logins reset on restart/deploy.
- Stripe billing state is mostly tied to Checkout success; webhooks are still recommended.
- PostgreSQL persistence uses a JSON snapshot table rather than relational migrations.
- Local data and uploads are intentionally ignored; a new computer will start empty unless `.env` points to PostgreSQL or data is copied manually.
- The legacy Bluehost frontend can drift from the Railway EJS app if both are edited independently.

## Testing Checklist

- Run `npm run check`.
- Start with `npm start`.
- Visit `/health` and confirm `ok: true`.
- Visit `/` and confirm the marketing page renders.
- Sign up for a test account.
- Log in and open `/studio`.
- Save a profile and publish it.
- Visit the public profile URL.
- Submit a lead from the public profile.
- Visit `/analytics`.
- Visit `/support` and submit a test ticket.
- Visit `/feedback`.
- Log in to `/admin/login` with `ADMIN_PASSWORD`.
- Confirm admin dashboard shows users, pages, leads, tickets, and feedback.
- Test Stripe only with test keys and test prices.
- Test forgot-password only after SMTP variables are configured.

## Next Recommended Tasks

1. Add route-level smoke tests with a test runner such as Node's built-in `node:test` plus `supertest`.
2. Add Stripe webhooks for checkout and billing events.
3. Add persistent session storage, preferably backed by PostgreSQL or Redis.
4. Add Railway staging environment documentation and verify staging variables.
5. Decide whether to archive or remove `bluehost-frontend/`.
6. Add backup/restore documentation for Railway PostgreSQL and `/data` uploads.

## Do Not Commit Secrets

Never commit `.env`, API keys, database URLs, SMTP passwords, Stripe secret keys, admin passwords, production data exports, or uploaded customer files.
