import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import MkCheckbox from '@/components/MkCheckbox';
import { ApiError, apiForm } from '@/lib/api';

type LineItem = {
  description: string;
  gauge: string;
  colour: string;
  quantity: number;
  catalog_product_id?: string;
};

export default function Orders() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [delivery, setDelivery] = useState<'pickup' | 'delivery'>('pickup');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  const [items, setItems] = useState<LineItem[]>(() => {
    const name = params.get('name');
    const productId = params.get('product_id') || undefined;
    if (name) {
      return [{ description: name, gauge: '', colour: '', quantity: 1, catalog_product_id: productId }];
    }
    return [{ description: '', gauge: '', colour: '', quantity: 1 }];
  });

  const canSubmit = useMemo(
    () => items.some((i) => i.description.trim().length > 0),
    [items],
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) {
      toast.error('Add at least one item');
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set(
      'items_json',
      JSON.stringify(
        items
          .filter((i) => i.description.trim())
          .map((i) => ({
            description: i.description.trim(),
            gauge: i.gauge || undefined,
            colour: i.colour || undefined,
            quantity: i.quantity || 1,
            catalog_product_id: i.catalog_product_id || undefined,
          })),
      ),
    );
    fd.set('delivery_method', delivery);
    if (files) Array.from(files).forEach((f) => fd.append('files', f));
    setBusy(true);
    try {
      const res = await apiForm<{ submission_code: string }>('/public/metals/orders', fd);
      toast.success('Order submitted');
      navigate(`/submit-success?code=${encodeURIComponent(res.submission_code)}&kind=order`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <section className="mk-page-band">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Custom order</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
            Place a custom order
          </h1>
          <p className="mt-3 text-white/70">
            Send items, drawings, and delivery details. New here?{' '}
            <Link to="/quote" className="text-metals-accent underline">
              Get a free estimate
            </Link>{' '}
            first.
          </p>
        </div>
      </section>

      <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium">Name *</span>
            <input name="contact_name" required className="mk-input" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Business name</span>
            <input name="company_name" className="mk-input" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Project / PO</span>
            <input name="project_po" className="mk-input" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Email *</span>
            <input name="contact_email" type="email" required className="mk-input" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Phone *</span>
            <input name="contact_phone" required className="mk-input" />
          </label>
        </div>

        <div>
          <p className="text-sm font-medium">Order status updates</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-6">
            <MkCheckbox
              name="notify_email"
              value="true"
              checked={notifyEmail}
              onChange={setNotifyEmail}
              label="Email"
            />
            <MkCheckbox
              name="notify_sms"
              value="true"
              checked={notifySms}
              onChange={setNotifySms}
              label="Text message (SMS)"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Items</p>
            <button
              type="button"
              className="text-xs font-semibold uppercase text-metals-accent"
              onClick={() =>
                setItems((prev) => [...prev, { description: '', gauge: '', colour: '', quantity: 1 }])
              }
            >
              + Add item
            </button>
          </div>
          <div className="mt-3 space-y-4">
            {items.map((item, idx) => (
              <div key={idx} className="border border-metals-mist bg-white p-4">
                <p className="text-xs font-bold uppercase text-metals-accent">Item {idx + 1}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <label className="text-sm sm:col-span-2">
                    <span className="text-xs text-metals-steel/60">Description</span>
                    <input
                      value={item.description}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, description: v } : it)));
                      }}
                      placeholder="e.g. J-Trim / drip edge"
                      className="mk-input"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-xs text-metals-steel/60">Gauge</span>
                    <input
                      value={item.gauge}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, gauge: v } : it)));
                      }}
                      placeholder="24ga"
                      className="mk-input"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-xs text-metals-steel/60">Colour</span>
                    <input
                      value={item.colour}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, colour: v } : it)));
                      }}
                      placeholder="Charcoal"
                      className="mk-input"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-xs text-metals-steel/60">Qty</span>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => {
                        const v = Number(e.target.value) || 1;
                        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: v } : it)));
                      }}
                      className="mk-input"
                    />
                  </label>
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    className="mt-2 text-xs text-red-600"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Remove item
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium">Delivery</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setDelivery('pickup')}
              className={`rounded-sm px-4 py-2 text-sm font-semibold ${
                delivery === 'pickup' ? 'bg-metals-ink text-white' : 'border border-metals-mist bg-white'
              }`}
            >
              Pick up
            </button>
            <button
              type="button"
              onClick={() => setDelivery('delivery')}
              className={`rounded-sm px-4 py-2 text-sm font-semibold ${
                delivery === 'delivery' ? 'bg-metals-ink text-white' : 'border border-metals-mist bg-white'
              }`}
            >
              Delivery
            </button>
          </div>
          {delivery === 'delivery' && (
            <label className="mt-3 block text-sm">
              <span className="font-medium">Delivery address</span>
              <textarea name="delivery_address" rows={2} className="mk-input" />
            </label>
          )}
        </div>

        <label className="block text-sm">
          <span className="font-medium">Comments</span>
          <textarea
            name="notes"
            rows={3}
            placeholder="Anything the shop should know…"
            className="mk-input"
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
        </label>

        <button
          type="submit"
          disabled={busy || !canSubmit}
          className="mk-btn-primary disabled:opacity-60"
        >
          {busy ? 'Submitting…' : 'Submit order'}
        </button>
      </form>
    </div>
  );
}
