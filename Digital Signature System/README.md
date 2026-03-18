# Digital Signature System (deprecated standalone)

Signing logic has been integrated into MK Hub:

- `app/services/onboarding_sign.py` — PDF overlay + certificate page
- `app/routes/onboarding.py` — onboarding documents API
- `frontend/src/pages/OnboardingDocuments.tsx` — user signing UI

You may delete this folder entirely (including `Backend/venv` if present).
