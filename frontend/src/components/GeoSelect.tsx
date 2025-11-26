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
  const [countriesLoaded, setCountriesLoaded] = useState(false);

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
    // Wait for countries to load first
    if (!countriesLoaded) return;
    
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
  }, [country, countriesLoaded]);

  useEffect(() => {
    let alive = true;
    if (!country) {
      setCities([]);
      return;
    }
    // Wait for states to load first if we have a state
    if (state && loadingStates) return;
    
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
  }, [country, state, loadingStates]);

  const countryLabel = labels?.country ?? 'Country';
  const stateLabel = labels?.state ?? 'Province/State';
  const cityLabel = labels?.city ?? 'City';

  // Ensure existing values are in the lists (for pre-selection)
  const allCountries = useMemo(() => {
    const existing = country && !countries.includes(country) ? [country] : [];
    return [...countries, ...existing];
  }, [countries, country]);
  
  const allStates = useMemo(() => {
    const existing = state && !states.includes(state) ? [state] : [];
    return [...states, ...existing];
  }, [states, state]);
  
  const allCities = useMemo(() => {
    const existing = city && !cities.includes(city) ? [city] : [];
    return [...cities, ...existing];
  }, [cities, city]);

  return (
    <div className="grid md:grid-cols-3 gap-3">
      <div>
        <label className="text-xs text-gray-600">{countryLabel}{required ? ' *' : ''}</label>
        <select className="w-full border rounded px-3 py-2" value={country || ''} onChange={(e) => onChange({ country: e.target.value })} disabled={disabled || !countriesLoaded}>
          <option value="">{countriesLoaded ? 'Select...' : 'Loading...'}</option>
          {allCountries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-600">{stateLabel}</label>
        <select className="w-full border rounded px-3 py-2" value={state || ''} onChange={(e) => onChange({ state: e.target.value })} disabled={disabled || !country || loadingStates}>
          <option value="">{loadingStates ? 'Loading...' : 'Select...'}</option>
          {allStates.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-600">{cityLabel}</label>
        <select className="w-full border rounded px-3 py-2" value={city || ''} onChange={(e) => onChange({ city: e.target.value })} disabled={disabled || !country || loadingCities}>
          <option value="">{loadingCities ? 'Loading...' : 'Select...'}</option>
          {allCities.map((ct) => (
            <option key={ct} value={ct}>{ct}</option>
          ))}
        </select>
      </div>
    </div>
  );
}



