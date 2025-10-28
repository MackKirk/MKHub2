import { useEffect, useMemo, useState } from 'react';

type GeoSelectProps = {
  country: string;
  state: string;
  city: string;
  onChange: (v: { country?: string; state?: string; city?: string }) => void;
  labels?: { country?: string; state?: string; city?: string };
  required?: boolean;
  disabled?: boolean;
};

const API_BASE = 'https://countriesnow.space/api/v0.1';

async function fetchJSON(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error('geo api error');
  return r.json();
}

export default function GeoSelect({ country, state, city, onChange, labels, required, disabled }: GeoSelectProps) {
  const [countries, setCountries] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetchJSON(`${API_BASE}/countries`);
        const arr: string[] = res?.data?.map((c: any) => c?.country).filter(Boolean) ?? [];
        if (alive) setCountries(arr);
      } catch (_e) {
        if (alive) setCountries([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!country) {
      setStates([]);
      setCities([]);
      return;
    }
    setLoadingStates(true);
    (async () => {
      try {
        const res = await fetchJSON(`${API_BASE}/countries/states`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ country }),
        });
        const arr: string[] = res?.data?.states?.map((s: any) => s?.name).filter(Boolean) ?? [];
        if (alive) setStates(arr);
      } catch (_e) {
        if (alive) setStates([]);
      } finally {
        if (alive) setLoadingStates(false);
      }
    })();
  }, [country]);

  useEffect(() => {
    let alive = true;
    if (!country) {
      setCities([]);
      return;
    }
    setLoadingCities(true);
    (async () => {
      try {
        if (state) {
          const res = await fetchJSON(`${API_BASE}/countries/state/cities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country, state }),
          });
          const arr: string[] = res?.data ?? [];
          if (alive) setCities(arr);
        } else {
          // fallback to all cities from country endpoint (if available)
          const res = await fetchJSON(`${API_BASE}/countries`);
          const entry = (res?.data ?? []).find((c: any) => c?.country === country);
          const arr: string[] = entry?.cities ?? [];
          if (alive) setCities(arr);
        }
      } catch (_e) {
        if (alive) setCities([]);
      } finally {
        if (alive) setLoadingCities(false);
      }
    })();
  }, [country, state]);

  const countryLabel = labels?.country ?? 'Country';
  const stateLabel = labels?.state ?? 'Province/State';
  const cityLabel = labels?.city ?? 'City';

  return (
    <div className="grid md:grid-cols-3 gap-3">
      <div>
        <label className="text-xs text-gray-600">{countryLabel}{required ? ' *' : ''}</label>
        <select className="w-full border rounded px-3 py-2" value={country} onChange={(e) => onChange({ country: e.target.value })} disabled={disabled}>
          <option value="">Select...</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-600">{stateLabel}</label>
        <select className="w-full border rounded px-3 py-2" value={state} onChange={(e) => onChange({ state: e.target.value })} disabled={disabled || !country || loadingStates}>
          <option value="">{loadingStates ? 'Loading...' : 'Select...'}</option>
          {states.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-600">{cityLabel}</label>
        <select className="w-full border rounded px-3 py-2" value={city} onChange={(e) => onChange({ city: e.target.value })} disabled={disabled || !country || loadingCities}>
          <option value="">{loadingCities ? 'Loading...' : 'Select...'}</option>
          {cities.map((ct) => (
            <option key={ct} value={ct}>{ct}</option>
          ))}
        </select>
      </div>
    </div>
  );
}



