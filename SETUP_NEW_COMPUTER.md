# Setup on a New Computer

Use these steps to continue development without losing project context.

## 1. Install Git

Windows:

```powershell
winget install --id Git.Git -e
```

macOS:

```bash
brew install git
```

Confirm:

```bash
git --version
```

## 2. Install Node.js

Install Node.js 20 or newer. Node 22 LTS or newer is fine.

Windows:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

macOS:

```bash
brew install node
```

Confirm:

```bash
node --version
npm --version
```

## 3. Install an Editor

VS Code is recommended:

```powershell
winget install --id Microsoft.VisualStudioCode -e
```

Any preferred editor is fine.

## 4. Clone the GitHub Repo

```bash
git clone https://github.com/wms365com-dev/LinkBio.git
cd LinkBio
```

If the repo contents are nested differently after cloning, enter the folder that contains `package.json`.

Confirm:

```bash
git remote -v
git status --short --branch
```

## 5. Copy Environment Values Manually

Create `.env` from the example:

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Fill `.env` manually using values from the old computer, Railway, Stripe, and SMTP provider. Do not paste secret values into GitHub, docs, chat, or committed files.

At minimum for local development:

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
TRIAL_DAYS=7
PLAN_ACCESS_DAYS=30
FOUNDING_MEMBER_LIMIT=500
REFERRAL_BONUS_MONTHS_MAX=12
PAGE_REVISION_LIMIT=25
```

Use fresh strong values for `SESSION_SECRET` and `ADMIN_PASSWORD`.

## 6. Install Dependencies

```bash
npm install
```

## 7. Run Checks

```bash
npm run check
```

## 8. Run the App Locally

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## 9. Test Main Workflows

- Open `/health`.
- Open `/`.
- Create a test account at `/signup`.
- Log in at `/login`.
- Open `/studio`.
- Save and publish a test page.
- Visit the public profile URL.
- Submit a public lead.
- Open `/analytics`.
- Submit a support ticket at `/support`.
- Open `/feedback`.
- Log in to `/admin/login`.
- Confirm the admin dashboard shows the test user, page, lead, support ticket, and feedback.
- Test Stripe Checkout only with Stripe test keys.
- Test forgot-password only after SMTP variables are configured.

## 10. Push Changes to GitHub

Before committing:

```bash
git status --short
```

Make sure `.env`, `data/`, `node_modules/`, logs, and cache files are not staged.

Commit and push:

```bash
git add README.md HANDOFF.md SETUP_NEW_COMPUTER.md .env.example .gitignore
git commit -m "Prepare project handoff docs"
git push origin main
```

For future code work, use focused commits with descriptive messages.

## 11. Confirm Railway Redeploys Correctly

1. Open the Railway project.
2. Confirm it is connected to `https://github.com/wms365com-dev/LinkBio.git`.
3. Confirm it deploys from `main`.
4. Confirm PostgreSQL is attached.
5. Confirm a persistent volume is mounted at `/data`.
6. Confirm required environment variables are set.
7. Trigger or wait for deploy after pushing to GitHub.
8. Check the deployment logs.
9. Visit `/health` on the production domain.
10. Smoke test signup, login, studio, public profile, and admin login.

## Do Not Commit Secrets

Never commit `.env`, database URLs, SMTP passwords, Stripe secret keys, admin passwords, production data exports, uploaded customer files, or Railway/Stripe/GitHub tokens.
