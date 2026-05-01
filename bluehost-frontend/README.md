# Bluehost Frontend (Legacy Split Mode)

This folder is kept as a fallback if you temporarily need the old split setup:

- Bluehost serves the public frontend
- Railway runs the app/backend and PostgreSQL

## Status

This is no longer the recommended production setup for `myurlc.com`.

The preferred setup is now:

- `www.myurlc.com` on Railway
- `myurlc.com` redirecting to `https://www.myurlc.com`
- PostgreSQL + `/data` volume on Railway

Use this folder only if you intentionally want the split-host architecture for a transition period.

## What this frontend includes

- `index.php` marketing/home page
- `signup.php` and `login.php` that talk to the Railway API
- `forgot-password.php` and `reset-password.php` for account recovery
- `app.php` customer dashboard shell
- `feedback.php` public feedback board with account-only posting, likes, and comments
- `profile.php` public pages at `https://www.myurlc.com/username`
- `support.php` ticket form
- `robots.txt` and `sitemap.php`
- `.htaccess` rewrite rules for clean URLs

## Before upload

1. Open [config.php](/C:/LinkBio/linkbio-mvp/linkbio-mvp/bluehost-frontend/config.php)
2. Set:

```php
define('MYURLC_PUBLIC_WEB_URL', 'https://www.myurlc.com');
define('MYURLC_API_BASE_URL', 'https://api.myurlc.com');
```

## Upload to Bluehost

1. Upload the contents of this folder to the Bluehost document root for `www.myurlc.com`
2. Keep `.htaccess` in the same root so Apache rewrites `/username`, `/signup`, `/login`, `/forgot-password`, `/reset-password`, `/app`, `/feedback`, and `/support`
3. Make sure `www.myurlc.com` points to Bluehost and the Railway app/API uses a separate host such as:
   - `https://api.myurlc.com`
   - or the default Railway URL while testing

## Railway env vars for split mode

Add these to the Railway app:

```env
PUBLIC_WEB_URL=https://www.myurlc.com
APP_BASE_URL=https://api.myurlc.com
CORS_ALLOWED_ORIGINS=https://www.myurlc.com,https://myurlc.com
SESSION_COOKIE_DOMAIN=myurlc.com
SESSION_COOKIE_NAME=myurlc.sid
SESSION_COOKIE_SAMESITE=lax
```

If you do not have `api.myurlc.com` yet, use your Railway URL for `APP_BASE_URL` and leave `SESSION_COOKIE_DOMAIN` blank until the API subdomain is live.

## Important note

The public page and account shell work cross-host through JSON APIs. The full editor, billing, admin, and analytics pages still remain available on the Railway app so you can move them over in phases if needed.
