import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { parseGooglePlaceResult } from '@/lib/placesFromDetails';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect?: (address: {
    address_line1: string;
    address_line2?: string;
    city?: string;
    province?: string;
    country?: string;
    postal_code?: string;
    lat?: number;
    lng?: number;
  }) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** @deprecated Key is no longer used; autocomplete goes through /integrations/places (server-side key). */
  apiKey?: string;
}

type Prediction = { description?: string; place_id?: string };

export default function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = 'Enter address',
  className = '',
  disabled = false,
}: AddressAutocompleteProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchPredictions = useCallback(async (text: string) => {
    const t = text.trim();
    if (t.length < 2) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const d: { predictions?: Prediction[] } = await api(
        'GET',
        `/integrations/places/autocomplete?q=${encodeURIComponent(t)}&types=address`
      );
      setPredictions(d.predictions || []);
      setOpen(true);
    } catch {
      setPredictions([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectPrediction = useCallback(
    async (p: Prediction) => {
      if (!p.place_id) return;
      setOpen(false);
      setPredictions([]);
      try {
        const d: { result?: Parameters<typeof parseGooglePlaceResult>[0] } = await api(
          'GET',
          `/integrations/places/details?place_id=${encodeURIComponent(p.place_id)}`
        );
        if (!d.result) return;
        const parsed = parseGooglePlaceResult(d.result);
        onChange(parsed.address_line1);
        onAddressSelect?.(parsed);
      } catch {
        const fallback = (p.description || '').trim();
        if (fallback) {
          onChange(fallback);
          onAddressSelect?.({ address_line1: fallback });
        }
      }
    },
    [onChange, onAddressSelect]
  );

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => fetchPredictions(v), 280);
        }}
        placeholder={placeholder}
        className={className}
        disabled={disabled || loading}
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-400">
          …
        </div>
      )}
      {open && predictions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
          {predictions.map((p, i) => (
            <li key={p.place_id || i}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-gray-100"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectPrediction(p)}
              >
                {p.description || p.place_id}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
