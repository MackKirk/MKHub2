# Fieldwork deploy & pilot readiness (single production environment)

MKHub has **no Staging / Homologação**. Workflow:

1. Develop locally  
2. Run automated tests locally (against mocks / disposable DB — **not** production)  
3. Deploy the app via Render build  
4. One persistent Postgres: **`db_mkhub`** (production)

Do **not** create additional environments for this pilot.

---

## 1. Schema & code readiness for normal Render deploy

On service start (`AUTO_CREATE_DB=true` in `render.yaml`), startup ensures (idempotent, additive):

| Change | Type | Safe on existing data? |
|--------|------|------------------------|
| `form_custom_lists.domain` | ADD COLUMN default `shared` | Yes |
| `form_templates.definition_version` | ADD COLUMN default `1` | Yes |
| `fieldwork_records` / `fieldwork_photo_observations` / `fieldwork_record_events` | `create_all` if missing | Yes |
| Phrase lists `R&M Observed Conditions` / `R&M Work Performed` | Idempotent empty seed | Yes (no phrase content invented) |

No destructive DROP/DELETE of business data in Fieldwork startup path.

**Deploy itself is operator-triggered** — this document does not run it.

---

## 2. PostgreSQL backup (operator checklist — Dashboard)

Before deploying schema-affecting code, confirm in **Render → Postgres (`db_mkhub`) → Recovery / Backups**:

- [ ] Instance is on a **paid** plan (Free has no managed logical backups / limited recovery)
- [ ] **Point-in-time recovery (PITR)** available (Hobby ≈ 3 days, Pro+ ≈ 7 days)
- [ ] Optional: create/download a **logical backup** export before deploy for longer retention
- [ ] Note the timestamp you would restore to if needed

This agent cannot see the Render billing plan or backup UI without your credentials. **You must tick these boxes in the dashboard.**

---

## 3. Automated tests must not invent production rows

| Suite | Against `db_mkhub`? |
|-------|---------------------|
| Form Engine / Fieldwork unit & mock tests | No — mocks only |
| `test_fieldwork_pr3_integration` | **Refuses** Render/`db_mkhub` unless `ALLOW_FIELDWORK_PROD_DB_TESTS=1`. Prefer `FIELDWORK_INTEGRATION_DATABASE_URL=sqlite:///./var/fieldwork_pr3_test.db` |
| `test_fieldwork_pr6` remote probe | SELECT-only and **opt-in** via `ALLOW_FIELDWORK_PROD_DB_READONLY=1` |

Routine local test runs with `.env` → production URL will **skip** write-capable integration tests.

---

## 4. Safety PDF / signature dependencies

`requirements.txt` pins `reportlab==4.2.2` and `PyPDF2==3.0.1` (used by Docker/Render image). Local unit suites for compliance/builder blocking run without full PDF stack; route-level signature tests need those packages installed locally.

---

## 5. Permissions & templates after deploy

**Permissions** (must exist as `PermissionDefinition` keys):

- `business:rm:projects:fieldwork:read`
- `business:rm:projects:fieldwork:write`
- `business:rm:projects:fieldwork:review`

Upserted by `scripts/seed_business_permissions.py` (run intentionally against production when seeding, or via your usual permissions migration path — **not** by this readiness pass).

After keys exist, assign to technician (write) and office reviewer (review) roles/users in Admin.

**Templates / phrases** (not auto-filled with technical content):

- Startup creates empty Fieldwork phrase catalogs only.
- Active **Site Assessment** and **Work Report** Form Templates must be created/published in admin (`/rm-fieldwork/...`) with department-approved definitions.
- Phrase items must be filled by R&M — do not invent production phrases in code.

---

## 6. Rollback: code vs schema (Render)

### A. Application code rollback

- Render Dashboard → service **Deploys** → pick last good deploy → **Rollback**
- Redeploys the previous **build artifact** (fast)
- Does **not** reverse Postgres DDL
- Does **not** undo disk state
- Autodeploy may re-ship new commits unless disabled temporarily

### B. Schema / data recovery

Code rollback **cannot** remove columns/tables already added. Fieldwork DDL is additive and forward-compatible with older app versions in normal cases, but:

- If you must undo data loss or a bad write: use **PITR** → new DB instance at timestamp → validate → repoint `DATABASE_URL` → retire old instance  
- Or restore a **logical backup** into a new instance (heavier; prefer PITR for recent mistakes)

**Practical order if a deploy goes wrong:** rollback code first; only restore DB if data/schema integrity is compromised.

---

## 7. Pilot procedure under single-env constraint

1. Confirm backup/PITR in Render Dashboard  
2. Ensure fieldwork permission keys seeded + assigned  
3. Publish templates + fill approved phrases in production UI  
4. Deploy Fieldwork code via normal Render deploy (human-triggered)  
5. Run `docs/fieldwork_pilot_checklist.md` with real R&M users on production  
6. Do not run destructive or seed-fiction scripts against `db_mkhub`

---

## Explicit non-actions

- No staging/homologation environment created  
- No automatic deploy from this readiness work  
- No production data mutation from this agent session’s readiness checks  
- No AI features
