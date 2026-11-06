import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ApiError, apiForm } from '@/lib/api';

const CUSTOMER_TYPES = [
  { value: 'siding', label: 'Siding / exterior contractor' },
  { value: 'roofing', label: 'Roofing contractor' },
  { value: 'general', label: 'General contractor' },
  { value: 'architect', label: 'Architect / designer' },
  { value: 'homeowner', label: 'Homeowner' },
  { value: 'other', label: 'Other' },
];

export default function Quote() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const prefillName = params.get('name') || '';
  const productId = params.get('product_id') || '';
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);

  const initialNotes = useMemo(() => {
    if (!prefillName) return '';
    return `Interested in: ${prefillName}`;
  }, [prefillName]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const items = prefillName
      ? [
          {
            description: prefillName,
            catalog_product_id: productId || undefined,
            quantity: 1,
          },
        ]
      : [];
    fd.set('items_json', JSON.stringify(items));
    if (files) {
      Array.from(files).forEach((f) => fd.append('files', f));
    }
    setBusy(true);
    try {
      const res = await apiForm<{ submission_code: string; id: string }>('/public/metals/estimates', fd);
      toast.success('Estimate submitted');
      navigate(`/submit-success?code=${encodeURIComponent(res.submission_code)}&kind=estimate`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <section className="bg-metals-ink text-white">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">Free estimate</p>
          <h1 className="mt-3 font-display text-5xl font-extrabold uppercase">Get a free estimate</h1>
          <p className="mt-3 text-white/70">
            Send your sketch or drawings and a few details. We&apos;ll get you a price — often the same day.
          </p>
        </div>
      </section>

      <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-5 px-4 py-10">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Name *</span>
            <input name="contact_name" required className="mt-1 w-full rounded border border-metals-mist bg-white px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Company</span>
            <input name="company_name" className="mt-1 w-full rounded border border-metals-mist bg-white px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Email *</span>
            <input name="contact_email" type="email" required className="mt-1 w-full rounded border border-metals-mist bg-white px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Phone *</span>
            <input name="contact_phone" required className="mt-1 w-full rounded border border-metals-mist bg-white px-3 py-2" />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">What best describes your work? *</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {CUSTOMER_TYPES.map((t) => (
              <label key={t.value} className="flex items-center gap-2 text-sm">
                <input type="radio" name="customer_type" value={t.value} required />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm">
          <span className="font-medium">Project details</span>
          <textarea
            name="notes"
            rows={5}
            defaultValue={initialNotes}
            placeholder="Profiles, quantities, material, colour, timing…"
            className="mt-1 w-full rounded border border-metals-mist bg-white px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">Attach files</span>
          <input
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf"
            className="mt-1 block w-full text-sm"
            onChange={(e) => setFiles(e.target.files)}
          />
          <span className="mt-1 block text-xs text-metals-steel/60">
            Up to 10 files · PDF, JPG, PNG, DWG, DXF · max 25 MB each
          </span>
        </label>

        <button
          type="submit"
          disabled={busy}
          className="rounded bg-metals-accent px-5 py-3 text-sm font-bold uppercase text-white hover:bg-metals-accentDark disabled:opacity-60"
        >
          {busy ? 'Submitting…' : 'Get a free estimate'}
        </button>
        <p className="text-xs text-metals-steel/60">
          Already a customer?{' '}
          <Link to="/login" className="text-metals-accent underline">
            Sign in
          </Link>{' '}
          to track this request in your account.
        </p>
      </form>
    </div>
  );
}
