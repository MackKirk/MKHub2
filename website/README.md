# Mack Kirk Metals — public website

Customer-facing marketing site for MK Metals: catalog, guest estimate/order, account.

## Dev

Preferred (with hub + portal + API):

```powershell
.\scripts\dev-full.ps1 -Dev
```

Opens [http://localhost:5175/website/](http://localhost:5175/website/) (Vite proxies API to `:8000`).

Standalone:

```bash
cd website
npm install
npm run dev
```

Ensure website tables exist:

```bash
python scripts/run_create_metals_website_tables.py
python scripts/run_create_portal_password_resets.py
python scripts/seed_metals_catalog.py
python scripts/seed_product_metals_permissions.py
```

### Password reset email (local)

Forgot-password emails link to the Metals website. Set in `.env` when using Vite `-Dev`:

```env
METALS_WEBSITE_PUBLIC_URL=http://localhost:5175/website
```

If unset, the API uses `{PUBLIC_BASE_URL}/website`. SMTP (`SMTP_HOST`, `MAIL_FROM`, etc.) must be configured for emails to send; the API still creates a reset token when SMTP is off.

## Build / serve from Hub API

```bash
cd website && npm run build
```

The FastAPI app serves the built SPA at `/website/` when `website/dist` exists.

## Brand assets

- `public/assets/brand/mkm-logo.png` — primary logo (header / hero)
- `public/assets/brand/globe.svg` / `globe.png` — favicon

Optional shop photography (drop in when available; Home uses CSS steel hero until then):

- `public/assets/media/hero.jpg` — full-bleed hero background
- `public/assets/media/shop-01.jpg` — optional secondary shop image
