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
python scripts/seed_metals_catalog.py
python scripts/seed_product_metals_permissions.py
```

## Build / serve from Hub API

```bash
cd website && npm run build
```

The FastAPI app serves the built SPA at `/website/` when `website/dist` exists.
