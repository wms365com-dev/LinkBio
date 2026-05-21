# LinkBio MVP

Railway-ready Express app for `myurlc.com`, a custom link-in-bio SaaS MVP. Users can sign up, edit and publish a public profile page, collect leads, review analytics, send support tickets, post feedback, and start Stripe Checkout billing flows.

## Stack

- Node.js `>=20`
- npm
- Express 4
- EJS
- PostgreSQL on Railway, with local JSON fallback
- Stripe Checkout
- Nodemailer SMTP
- Railway hosting

## Local Setup

1. Install Node.js 20 or newer and Git.
2. Clone the repo.
3. Enter the project folder:

```bash
cd linkbio-mvp
```

If you are on the original audited computer, the repo path is:

```powershell
cd C:\LinkBio\linkbio-mvp\linkbio-mvp
```

4. Install dependencies:

```bash
npm install
```

5. Create your local environment file:

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

6. Fill `.env` manually. Do not commit it.

For local JSON fallback, leave `DATABASE_URL` blank. For PostgreSQL, set `DATABASE_URL` and `DATABASE_SSL`.

Minimum useful local values:

```env
PORT=3000
NODE_ENV=development
BASE_URL=http://localhost:3000
PUBLIC_WEB_URL=http://localhost:3000
APP_BASE_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000
DATABASE_URL=
DATABASE_SSL=disable
SESSION_SECRET=
SESSION_COOKIE_NAME=myurlc.sid
SESSION_COOKIE_DOMAIN=
SESSION_COOKIE_SAMESITE=lax
ADMIN_PASSWORD=
SUPPORT_EMAIL=info@myurlc.com
SMTP_PORT=587
SMTP_SECURE=false
PASSWORD_RESET_TOKEN_TTL_MINUTES=60
TRIAL_DAYS=7
PLAN_ACCESS_DAYS=30
FOUNDING_MEMBER_LIMIT=500
REFERRAL_BONUS_MONTHS_MAX=12
PAGE_REVISION_LIMIT=25
```

Generate your own `SESSION_SECRET` and `ADMIN_PASSWORD`. Add Stripe and SMTP values only when testing those workflows.

7. Run the syntax check:

```bash
npm run check
```

8. Start the app:

```bash
npm start
```

9. Open `http://localhost:3000`.

## Scripts

```bash
npm run check
npm start
npm run dev
```

`npm run dev` currently starts the same server as `npm start`.

## Key Routes

- `/` marketing page
- `/signup` customer signup
- `/login` customer login
- `/studio` customer page editor
- `/analytics` customer analytics
- `/billing` billing page
- `/support` support ticket form
- `/feedback` feedback board
- `/admin/login` admin login
- `/:slug` public profile page
- `/health` and `/api/health` health checks

## Data and Uploads

- Railway PostgreSQL is used when `DATABASE_URL` is set.
- The app creates the PostgreSQL snapshot table on startup.
- Railway upload/data volume should be mounted to `/data`.
- Local JSON fallback writes to `./data/linkbio.json`.
- Local uploads write to `./data/uploads`.
- `data/` is ignored by Git.

## Railway Deployment

Railway can deploy this app directly from GitHub using Nixpacks.

Recommended production setup:

1. Connect Railway to this GitHub repo.
2. Add a PostgreSQL service.
3. Add a persistent volume mounted at `/data`.
4. Set `www.myurlc.com` as the Railway app domain.
5. Redirect `myurlc.com` to `https://www.myurlc.com`.
6. Add Railway environment variables.
7. Deploy and verify `/health`.

Recommended production variables:

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

Add secret values in Railway only, including `SESSION_SECRET`, `ADMIN_PASSWORD`, SMTP credentials, and Stripe secret keys.

## Legacy Bluehost Frontend

`bluehost-frontend/` is an older PHP frontend for a split Bluehost + Railway deployment. The current recommended setup is Railway-only. See `bluehost-frontend/README.md` if you intentionally need split-host mode.

## Do Not Commit Secrets

Never commit `.env`, database URLs, SMTP passwords, Stripe secret keys, admin passwords, production data exports, or uploaded customer files.

For full context before moving computers, read `HANDOFF.md` and `SETUP_NEW_COMPUTER.md`.
