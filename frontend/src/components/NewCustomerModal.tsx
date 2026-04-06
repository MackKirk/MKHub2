import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { useConfirm } from '@/components/ConfirmProvider';
import ImagePicker from '@/components/ImagePicker';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import OverlayPortal from '@/components/OverlayPortal';
import { Link } from 'react-router-dom';

const DUPLICATE_STOP_WORDS = new Set(['the', 'and', 'for', 'ltd', 'inc', 'llc', 'corp', 'co', 'lp', 'llp', 'plc', 'sa', 'bv', 'nv', 'of', 'to', 'in']);

function tokenizeNameText(s: string): string[] {
  return (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter(
    (t) => t.length >= 2 && !DUPLICATE_STOP_WORDS.has(t)
  );
}

/** Fetch clients via search and keep those sharing at least one significant word with display/legal names. */
async function findSimilarExistingClients(displayName: string, legalName: string): Promise<
  { id: string; display_name?: string; name?: string; legal_name?: string; city?: string; client_status?: string }[]
> {
  const displayT = String(displayName || '').trim();
  const legalT = String(legalName || '').trim();
  const inputTokens = [...new Set([...tokenizeNameText(displayT), ...tokenizeNameText(legalT)])];
  const merged = new Map<
    string,
    { id: string; display_name?: string; name?: string; legal_name?: string; city?: string; client_status?: string }
  >();

  const runQuery = async (q: string) => {
    const params = new URLSearchParams();
    params.set('q', q);
    params.set('limit', '100');
    params.set('page', '1');
    const res = await api<any>('GET', `/clients?${params.toString()}`);
    const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
    for (const c of items) {
      if (c?.id) merged.set(String(c.id), c);
    }
  };

  if (inputTokens.length === 0) {
    if (displayT.length >= 2) await runQuery(displayT.slice(0, 120));
    else if (legalT.length >= 2) await runQuery(legalT.slice(0, 120));
  } else {
    const queries = inputTokens.slice(0, 10);
    await Promise.all(queries.map((t) => runQuery(t)));
  }

  const tokensForMatch = inputTokens.length > 0 ? inputTokens : tokenizeNameText(`${displayT} ${legalT}`);
  if (tokensForMatch.length === 0) return [];

  return Array.from(merged.values()).filter((c) => {
    const blob = `${c.display_name || ''} ${c.name || ''} ${c.legal_name || ''}`.toLowerCase();
    const clientTokens = tokenizeNameText(blob);
    return tokensForMatch.some((t) => clientTokens.includes(t) || blob.includes(t));
  });
}

type NewCustomerModalProps = {
  onClose: () => void;
  onSuccess: (customerId: string) => void;
};

export default function NewCustomerModal({ onClose, onSuccess }: NewCustomerModalProps) {
  const confirm = useConfirm();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api<any>('GET', '/settings') });
  const types = (settings?.client_types || []) as any[];
  const { data: employees } = useQuery({ queryKey: ['employees'], queryFn: () => api<any[]>('GET', '/employees') });
  const leadSources = (settings?.lead_sources || []) as any[];
  const [form, setForm] = useState<any>({
    display_name: '', legal_name: '', name: '', client_status: 'Active', client_type: 'Customer',
    phone: '', address_line1: '', address_line2: '', city: '', province: 'British Columbia', country: 'Canada', postal_code: '',
    lead_source: '', estimator_id: '', description: ''
  });
  useEffect(() => { setForm((s: any) => ({ ...s, name: s.display_name })); }, [form.display_name]);
  // Validate both required fields: display_name and legal_name
  const canSubmit = useMemo(() => {
    return String(form.display_name || '').trim().length > 1 && String(form.legal_name || '').trim().length > 0;
  }, [form.display_name, form.legal_name]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cRole, setCRole] = useState('');
  const [cDept, setCDept] = useState('');
  const [cPrimary, setCPrimary] = useState<'true' | 'false'>('false');
  const [cPhotoBlob, setCPhotoBlob] = useState<Blob | null>(null);
  const [cPhotoPreview, setCPhotoPreview] = useState<string>('');
  const [cPickerOpen, setCPickerOpen] = useState(false);
  const [step, setStep] = useState<number>(1);
  const [isCreating, setIsCreating] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<
    { id: string; display_name?: string; name?: string; legal_name?: string; city?: string; client_status?: string }[] | null
  >(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  const goNextFromStep1 = async () => {
    if (!String(form.display_name || '').trim()) {
      toast.error('Display name is required');
      return;
    }
    if (!String(form.legal_name || '').trim()) {
      toast.error('Legal name is required');
      return;
    }
    setDuplicateMatches(null);
    setCheckingDuplicates(true);
    try {
      const matches = await findSimilarExistingClients(form.display_name, form.legal_name);
      if (matches.length > 0) {
        setDuplicateMatches(matches);
        return;
      }
      setStep(2);
    } catch (_e) {
      toast.error('Could not check for similar customers. Try again.');
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const continuePastDuplicates = () => {
    setDuplicateMatches(null);
    setStep(2);
  };

  const goToContactsStep = () => setStep(3);

  const prev = () => {
    setStep((s) => {
      const nextS = Math.max(1, s - 1);
      if (nextS === 1) setDuplicateMatches(null);
      return nextS;
    });
  };

  // Geo data for address fields
  const [countries, setCountries] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [countriesLoaded, setCountriesLoaded] = useState(false);

  const API_BASE = 'https://countriesnow.space/api/v0.1';
  async function fetchJSON(url: string, opts?: RequestInit) {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error('geo api error');
    return r.json();
  }

  // Load countries
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetchJSON(`${API_BASE}/countries`);
        const arr: string[] = res?.data?.map((c: any) => c?.country).filter(Boolean) ?? [];
        if (alive) {
          setCountries(arr);
          setCountriesLoaded(true);
        }
      } catch (_e) {
        if (alive) {
          setCountries([]);
          setCountriesLoaded(true);
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load states when country changes
  useEffect(() => {
    let alive = true;
    if (!form.country) {
      setStates([]);
      setCities([]);
      return;
    }
    if (!countriesLoaded) return;
    setLoadingStates(true);
    (async () => {
      try {
        const res = await fetchJSON(`${API_BASE}/countries/states`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ country: form.country }),
        });
        const arr: string[] = res?.data?.states?.map((s: any) => s?.name).filter(Boolean) ?? [];
        if (alive) setStates(arr);
      } catch (_e) {
        if (alive) setStates([]);
      } finally {
        if (alive) setLoadingStates(false);
      }
    })();
    return () => { alive = false; };
  }, [form.country, countriesLoaded]);

  // Load cities when state changes
  useEffect(() => {
    let alive = true;
    if (!form.country) {
      setCities([]);
      return;
    }
    if (form.province && loadingStates) return;
    setLoadingCities(true);
    (async () => {
      try {
        if (form.province) {
          const res = await fetchJSON(`${API_BASE}/countries/state/cities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country: form.country, state: form.province }),
          });
          const arr: string[] = res?.data ?? [];
          if (alive) setCities(arr);
        } else {
          const res = await fetchJSON(`${API_BASE}/countries`);
          const entry = (res?.data ?? []).find((c: any) => c?.country === form.country);
          const arr: string[] = entry?.cities ?? [];
          if (alive) setCities(arr);
        }
      } catch (_e) {
        if (alive) setCities([]);
      } finally {
        if (alive) setLoadingCities(false);
      }
    })();
    return () => { alive = false; };
  }, [form.country, form.province, loadingStates]);

  const allCountries = useMemo(() => {
    const existing = form.country && !countries.includes(form.country) ? [form.country] : [];
    return [...countries, ...existing];
  }, [countries, form.country]);

  const allStates = useMemo(() => {
    const existing = form.province && !states.includes(form.province) ? [form.province] : [];
    return [...states, ...existing];
  }, [states, form.province]);

  const allCities = useMemo(() => {
    const existing = form.city && !cities.includes(form.city) ? [form.city] : [];
    return [...cities, ...existing];
  }, [cities, form.city]);

  const formatPhone = (v: string) => {
    const d = String(v || '').replace(/\D+/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return `+${d.slice(0, 1)} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 11)}`;
  };

  useEffect(() => {
    if (!contactModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setContactModalOpen(false); setCPhotoBlob(null); setCPhotoPreview(''); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contactModalOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !contactModalOpen && !cPickerOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contactModalOpen, cPickerOpen, onClose]);

  // Prevent body scroll when modal is open (same as New Opportunity)
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const resetForm = () => {
    setForm({
      display_name: '', legal_name: '', name: '', client_status: 'Active', client_type: 'Customer',
      phone: '', address_line1: '', address_line2: '', city: '', province: 'British Columbia', country: 'Canada', postal_code: '',
      lead_source: '', estimator_id: '', description: ''
    });
    setContacts([]);
    setStep(1);
    setDuplicateMatches(null);
    setCheckingDuplicates(false);
  };

  const stepSubtitle =
    step === 1 ? 'Display and legal name' : step === 2 ? 'Company and address' : 'Contacts';

  return (
    <OverlayPortal><div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4">
      <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl">
        {/* Title bar - same style as New Opportunity (ProjectNew) */}
        <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                title="Close"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div>
                <div className="text-sm font-semibold text-gray-900">New Customer</div>
                <div className="text-xs text-gray-500 mt-0.5">{stepSubtitle}</div>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-medium text-gray-500 flex-wrap justify-end">
              <span className={step === 1 ? 'px-2 py-1 rounded-full bg-gray-900 text-white' : 'px-2 py-1 rounded-full bg-gray-200 text-gray-600'}>1</span>
              <span className="text-gray-400">→</span>
              <span className={step === 2 ? 'px-2 py-1 rounded-full bg-gray-900 text-white' : 'px-2 py-1 rounded-full bg-gray-200 text-gray-600'}>2</span>
              <span className="text-gray-400">→</span>
              <span className={step === 3 ? 'px-2 py-1 rounded-full bg-gray-900 text-white' : 'px-2 py-1 rounded-full bg-gray-200 text-gray-600'}>3</span>
            </div>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          <div className="rounded-xl border bg-white p-4">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2"><h4 className="text-sm font-semibold text-gray-900">Company name</h4></div>
                <div className="text-[10px] text-gray-500 mt-0.5 mb-3">Display name and legal name. We check for similar customers before the next step.</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="md:col-span-2"><label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Display name <span className="text-red-600">*</span></label><input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.display_name} onChange={e => setForm((s: any) => ({ ...s, display_name: e.target.value }))} autoComplete="organization" /></div>
                  <div className="md:col-span-2"><label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Legal name <span className="text-red-600">*</span></label><input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.legal_name} onChange={e => setForm((s: any) => ({ ...s, legal_name: e.target.value }))} /></div>
                </div>
              </div>
              {duplicateMatches && duplicateMatches.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
                  <div className="text-sm font-semibold text-amber-900">Similar customers already in the system</div>
                  <p className="text-xs text-amber-950/90">At least one existing customer matches a word in the display or legal name. Review the list below. You can go back to change the name, or continue if this is a different company.</p>
                  <ul className="max-h-48 overflow-y-auto space-y-2 text-sm border border-amber-200/80 rounded-md bg-white p-2">
                    {duplicateMatches.map((c) => (
                      <li key={c.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-1.5 border-b border-amber-100 last:border-0">
                        <div>
                          <div className="font-medium text-gray-900">{c.display_name || c.name || '—'}</div>
                          <div className="text-xs text-gray-600">{c.legal_name ? <span>Legal: {c.legal_name}</span> : null}{c.legal_name && c.city ? ' · ' : ''}{c.city ? <span>{c.city}</span> : null}{c.client_status ? <span className="text-gray-500"> · {c.client_status}</span> : null}</div>
                        </div>
                        <Link to={`/customers/${encodeURIComponent(c.id)}`} target="_blank" rel="noreferrer" className="text-xs text-brand-red hover:underline shrink-0">View customer</Link>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={() => setDuplicateMatches(null)} className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-800 border border-amber-400/80 bg-white hover:bg-amber-100/80">Cancel</button>
                    <button type="button" onClick={continuePastDuplicates} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-red text-white hover:bg-[#aa1212]">Continue anyway</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2"><h4 className="text-sm font-semibold text-gray-900">Company</h4></div>
                <div className="text-[10px] text-gray-500 mt-0.5 mb-2">Core company identity details.</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Type</label>
                    <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.client_type} onChange={e => setForm((s: any) => ({ ...s, client_type: e.target.value }))}>
                      {sortByLabel(types, (t: any) => (t.label || '').toString()).map((t: any) => <option key={t.label} value={t.label}>{t.label}</option>)}
                    </select>
                  </div>
                  <div><label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Phone</label><input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.phone} onChange={e => setForm((s: any) => ({ ...s, phone: formatPhone(e.target.value) }))} /></div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Lead source</label>
                    <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.lead_source || ''} onChange={e => setForm((s: any) => ({ ...s, lead_source: e.target.value }))}>
                      <option value="">Select...</option>
                      {sortByLabel(leadSources, (ls: any) => (ls?.label ?? ls?.name ?? String(ls)).toString()).map((ls: any) => { const val = ls?.value ?? ls?.id ?? ls?.label ?? ls?.name ?? String(ls); const label = ls?.label ?? ls?.name ?? String(ls); return <option key={String(val)} value={String(val)}>{label}</option>; })}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Estimator</label>
                    <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.estimator_id || ''} onChange={e => setForm((s: any) => ({ ...s, estimator_id: e.target.value || null }))}>
                      <option value="">Select...</option>
                      {sortByLabel(employees || [], (emp: any) => (emp.name || emp.username || '').toString()).map((emp: any) => <option key={emp.id} value={emp.id}>{emp.name || emp.username}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2"><h4 className="text-sm font-semibold text-gray-900">Address</h4></div>
                <div className="text-[10px] text-gray-500 mt-0.5 mb-2">Primary mailing and location address.</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Address line 1</label>
                    <AddressAutocomplete
                      value={form.address_line1}
                      onChange={(value) => setForm((s: any) => ({ ...s, address_line1: value }))}
                      onAddressSelect={(address) => {
                        setForm((s: any) => ({
                          ...s,
                          address_line1: address.address_line1 || s.address_line1,
                          address_line2: address.address_line2 !== undefined ? address.address_line2 : s.address_line2,
                          city: address.city !== undefined ? address.city : s.city,
                          province: address.province !== undefined ? address.province : s.province,
                          country: address.country !== undefined ? address.country : s.country,
                          postal_code: address.postal_code !== undefined ? address.postal_code : s.postal_code,
                        }));
                      }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Address line 2</label>
                    <AddressAutocomplete
                      value={form.address_line2}
                      onChange={(value) => setForm((s: any) => ({ ...s, address_line2: value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Country</label>
                    <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.country || ''} onChange={(e) => setForm((s: any) => ({ ...s, country: e.target.value }))} disabled={!countriesLoaded}>
                      <option value="">{countriesLoaded ? 'Select...' : 'Loading...'}</option>
                      {allCountries.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Province/State</label>
                    <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.province || ''} onChange={(e) => setForm((s: any) => ({ ...s, province: e.target.value }))} disabled={!form.country || loadingStates}>
                      <option value="">{loadingStates ? 'Loading...' : 'Select...'}</option>
                      {allStates.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">City</label>
                    <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.city || ''} onChange={(e) => setForm((s: any) => ({ ...s, city: e.target.value }))} disabled={!form.country || loadingCities}>
                      <option value="">{loadingCities ? 'Loading...' : 'Select...'}</option>
                      {allCities.map((ct) => (
                        <option key={ct} value={ct}>{ct}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Postal code</label>
                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.postal_code} onChange={e => setForm((s: any) => ({ ...s, postal_code: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Contacts</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">Add one or more contacts now (optional)</div>
                </div>
                <button onClick={() => setContactModalOpen(true)} className="px-3 py-1.5 rounded bg-brand-red text-white">Add Contact</button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {(contacts || []).map((c, i) => (
                  <div key={i} className="rounded border p-3 text-sm flex items-start gap-3">
                    {c.photo_preview ? (
                      <img src={c.photo_preview} className="w-16 h-16 object-cover rounded border" alt={c.name || 'Contact'} />
                    ) : (
                      <div className="w-16 h-16 rounded bg-gray-200 grid place-items-center text-lg font-bold text-gray-600 flex-shrink-0">{(c.name || '?').slice(0, 2).toUpperCase()}</div>
                    )}
                    <div className="flex-1">
                      <div className="font-semibold flex items-center gap-2">{c.name || '(No name)'} {c.is_primary && <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 rounded-full px-2">Primary</span>}</div>
                      <div className="text-gray-600">{c.role_title || ''} {c.department ? `· ${c.department}` : ''}</div>
                      <div className="text-gray-700 mt-1">{[c.email, c.phone].filter(Boolean).join(' · ') || '-'}</div>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="space-x-2">
                        {!c.is_primary && <button onClick={() => {
                          setContacts(arr => arr.map((x, idx) => ({ ...x, is_primary: idx === i })));
                        }} className="px-2 py-1 rounded bg-gray-100">Set Primary</button>}
                        <button onClick={() => setContacts(arr => arr.filter((_, idx) => idx !== i))} className="px-2 py-1 rounded bg-gray-100">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
                {(!contacts || !contacts.length) && <div className="text-sm text-gray-600">No contacts added yet.</div>}
              </div>
            </div>
          )}
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-between gap-3 rounded-b-xl">
          <div className="text-xs text-gray-500">{step === 1 ? 'Step 1 of 3' : step === 2 ? 'Step 2 of 3' : 'Step 3 of 3'}</div>
          <div className="flex items-center gap-2">
          <button onClick={async () => {
            const ok = await confirm({ title: 'Cancel', message: 'Discard this customer draft and close?' });
            if (!ok) return;
            resetForm();
            onClose();
          }} className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50">Cancel</button>
            {step > 1 && <button className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50" onClick={prev}>Back</button>}
            {step === 1 && (
              <button
                type="button"
                disabled={!canSubmit || checkingDuplicates || !!(duplicateMatches && duplicateMatches.length > 0)}
                onClick={() => void goNextFromStep1()}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-red text-white hover:bg-[#aa1212] disabled:opacity-50"
              >
                {checkingDuplicates ? 'Checking…' : 'Next'}
              </button>
            )}
            {step === 2 && (
              <button type="button" onClick={goToContactsStep} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-red text-white hover:bg-[#aa1212]">Next</button>
            )}
            {step === 3 && (
              <button onClick={async () => {
                if (!canSubmit || isCreating) { toast.error('Missing required fields'); return; }
                if (!contacts.length) {
                  const ok = await confirm({ title: 'No contacts added', message: 'It is recommended to add at least one contact. Continue without contacts?' });
                  if (!ok) return;
                }
                try {
                  setIsCreating(true);
                  // Ensure name is always a non-empty string
                  const nameValue = (form.display_name || form.name || '').trim();
                  if (!nameValue) {
                    toast.error('Display name is required');
                    setIsCreating(false);
                    return;
                  }
                  const payload: any = {
                    ...form,
                    name: nameValue,
                    display_name: form.display_name || nameValue,
                    client_type: form.client_type || 'Customer',
                    client_status: 'Active',
                  };
                  const fieldsToRemove = [
                    'email', 'phone', 'payment_terms_id',
                    'tax_number', 'billing_email', 'po_required', 'use_diff_billing',
                    'billing_address_line1', 'billing_address_line2', 'billing_city', 'billing_province',
                    'billing_postal_code', 'billing_country',
                  ];
                  fieldsToRemove.forEach((field) => {
                    delete payload[field];
                  });

                  // Remove empty strings and convert to null for optional fields
                  // Also handle UUID fields that might be empty strings
                  Object.keys(payload).forEach(key => {
                    if (payload[key] === '') {
                      payload[key] = null;
                    }
                    // Handle UUID fields - if empty string or invalid, set to null
                    if (key === 'estimator_id') {
                      if (!payload[key] || payload[key] === '') {
                        payload[key] = null;
                      }
                    }
                  });
                  const created: any = await api('POST', '/clients', payload);
                  if (!created?.id) { toast.error('Create failed'); setIsCreating(false); return; }
                  if (contacts.length) {
                    for (const c of contacts) {
                      try {
                        const contactPayload: any = { name: c.name || 'Contact', email: c.email || null, phone: c.phone || null, role_title: c.role_title || null, department: c.department || null, is_primary: !!c.is_primary };
                        const contactCreated: any = await api('POST', `/clients/${encodeURIComponent(created.id)}/contacts`, contactPayload);
                        // Upload photo if it exists
                        if (c.photo_blob && contactCreated?.id) {
                          try {
                            const up: any = await api('POST', '/files/upload', { project_id: null, client_id: created.id, employee_id: null, category_id: 'contact-photo', original_name: `contact-${contactCreated.id}.jpg`, content_type: 'image/jpeg' });
                            await fetch(up.upload_url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'x-ms-blob-type': 'BlockBlob' }, body: c.photo_blob });
                            const conf: any = await api('POST', '/files/confirm', { key: up.key, size_bytes: c.photo_blob.size, checksum_sha256: 'na', content_type: 'image/jpeg' });
                            await api('POST', `/clients/${encodeURIComponent(created.id)}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent('contact-photo-' + contactCreated.id)}&original_name=${encodeURIComponent('contact-' + contactCreated.id + '.jpg')}`);
                          } catch (_e) { console.error('Failed to upload contact photo', _e); }
                        }
                      } catch (_e) { console.error('Failed to create contact', _e); }
                    }
                  }
                  toast.success('Customer created');
                  resetForm();
                  onSuccess(created.id);
                } catch (_e: any) {
                  const errorMsg = _e?.message || _e?.detail || 'Failed to create customer';
                  toast.error(errorMsg);
                  console.error('Create customer error:', _e);
                  setIsCreating(false);
                }
              }} disabled={isCreating} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-red text-white hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed">
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            )}
          </div>
        </div>
      </div>
      {contactModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="w-[800px] max-w-[95vw] bg-white rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex-shrink-0 px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">New Contact</div>
              <button onClick={() => { setContactModalOpen(false); setCPhotoBlob(null); setCPhotoPreview(''); }} className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100" title="Close">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid md:grid-cols-5 gap-3 items-start">
              <div className="md:col-span-2">
                <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Contact Photo</div>
                <button onClick={() => setCPickerOpen(true)} className="w-full h-40 border rounded grid place-items-center bg-gray-50 relative overflow-hidden">
                  {cPhotoPreview ? (
                    <img src={cPhotoPreview} className="w-full h-full object-cover" alt="Contact preview" />
                  ) : (
                    <div className="text-gray-400">Select Photo</div>
                  )}
                </button>
              </div>
              <div className="md:col-span-3 grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Name</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm col-span-2" value={cName} onChange={e => setCName(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Role/Title</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={cRole} onChange={e => setCRole(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Department</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={cDept} onChange={e => setCDept(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Email</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={cEmail} onChange={e => setCEmail(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Phone</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={cPhone} onChange={e => setCPhone(formatPhone(e.target.value))} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Primary</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={cPrimary} onChange={e => setCPrimary(e.target.value as any)}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
                <div className="col-span-2 text-right">
                  <button onClick={() => {
                    const norm: any = { name: cName, email: cEmail, phone: cPhone, role_title: cRole, department: cDept, is_primary: cPrimary === 'true' };
                    if (cPhotoBlob) {
                      norm.photo_blob = cPhotoBlob;
                      norm.photo_preview = cPhotoPreview;
                    }
                    setContacts(arr => {
                      let updated = [...arr];
                      if (norm.is_primary) { updated = updated.map(x => ({ ...x, is_primary: false })); }
                      updated.push(norm);
                      return updated;
                    });
                    setCName(''); setCEmail(''); setCPhone(''); setCRole(''); setCDept(''); setCPrimary('false'); setCPhotoBlob(null); setCPhotoPreview(''); setContactModalOpen(false);
                  }} className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold">Add</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {cPickerOpen && (
        <ImagePicker isOpen={true} onClose={() => setCPickerOpen(false)} clientId={''} targetWidth={400} targetHeight={400} allowEdit={true} onConfirm={async (blob) => {
          try {
            setCPhotoBlob(blob);
            setCPhotoPreview(URL.createObjectURL(blob));
          } catch (_e) { toast.error('Failed to process image'); }
          finally { setCPickerOpen(false); }
        }} />
      )}
    </div></OverlayPortal>
  );
}

