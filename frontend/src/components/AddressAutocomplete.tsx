import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { parseGooglePlaceResult, type ParsedPlaceAddress } from '@/lib/placesFromDetails';
import { uiBorders, uiCx, uiRadius, uiShadows } from '@/components/ui/tokens';

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
  /**
   * When true, picking a suggestion only updates this input (e.g. Address 2 / complement).
   * Does not call `onAddressSelect` and prefers `address_line2` from the place result.
   */
  lineOnly?: boolean;
  /** @deprecated Key is no longer used; autocomplete goes through /integrations/places (server-side key). */
  apiKey?: string;
}

type Prediction = { description?: string; place_id?: string };

const AUTOCOMPLETE_DEBOUNCE_MS = 200;
const autocompleteCache = new Map<string, Prediction[]>();
const detailsCache = new Map<string, ParsedPlaceAddress>();

function cacheKey(text: string, types: string) {
  return `${types}:${text.trim().toLowerCase()}`;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = 'Enter address',
  className = '',
  disabled = false,
  lineOnly = false,
}: AddressAutocompleteProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const selectingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestGenRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchPredictions = useCallback(async (text: string) => {
    const t = text.trim();
    if (t.length < 2) {
      setPredictions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const key = cacheKey(t, 'address');
    const cached = autocompleteCache.get(key);
    if (cached) {
      setPredictions(cached);
      setOpen(cached.length > 0);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = ++requestGenRef.current;

    setLoading(true);
    try {
      const d: { predictions?: Prediction[] } = await api(
        'GET',
        `/integrations/places/autocomplete?q=${encodeURIComponent(t)}&types=address`,
        undefined,
        undefined,
        controller.signal,
      );
      if (gen !== requestGenRef.current) return;
      const list = d.predictions || [];
      autocompleteCache.set(key, list);
      setPredictions(list);
      setOpen(list.length > 0);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      if (gen !== requestGenRef.current) return;
      setPredictions([]);
      setOpen(false);
    } finally {
      if (gen === requestGenRef.current) setLoading(false);
    }
  }, []);

  const applyParsed = useCallback(
    (parsed: ParsedPlaceAddress) => {
      if (lineOnly) {
        onChange(parsed.address_line2 || parsed.address_line1);
      } else {
        onChange(parsed.address_line1);
        onAddressSelect?.(parsed);
      }
    },
    [lineOnly, onChange, onAddressSelect],
  );

  const selectPrediction = useCallback(
    async (p: Prediction) => {
      if (!p.place_id || selectingRef.current) return;
      selectingRef.current = true;
      setOpen(false);
      setPredictions([]);
      setSelecting(true);

      const placeId = p.place_id;
      const cached = detailsCache.get(placeId);
      if (cached) {
        applyParsed(cached);
        setSelecting(false);
        return;
      }

      try {
        const d: { result?: Parameters<typeof parseGooglePlaceResult>[0] } = await api(
          'GET',
          `/integrations/places/details?place_id=${encodeURIComponent(placeId)}`,
        );
        if (!d.result) return;
        const parsed = parseGooglePlaceResult(d.result);
        detailsCache.set(placeId, parsed);
        applyParsed(parsed);
      } catch {
        const fallback = (p.description || '').trim();
        if (fallback) {
          onChange(fallback);
          if (!lineOnly) {
            onAddressSelect?.({ address_line1: fallback });
          }
        }
      } finally {
        selectingRef.current = false;
        setSelecting(false);
      }
    },
    [applyParsed, lineOnly, onAddressSelect, onChange],
  );

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const busy = loading || selecting;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => fetchPredictions(v), AUTOCOMPLETE_DEBOUNCE_MS);
        }}
        placeholder={placeholder}
        className={className}
        disabled={disabled || selecting}
        aria-busy={busy}
        autoComplete="off"
      />
      {busy && (
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-400">
          …
        </div>
      )}
      {open && predictions.length > 0 && (
        <ul
          className={uiCx(
            'absolute z-[100050] mt-1 max-h-56 w-full overflow-auto bg-white py-1 text-sm',
            uiRadius.dropdownMenu,
            uiBorders.subtle,
            uiShadows.elevated,
          )}
        >
          {predictions.map((p, i) => (
            <li key={p.place_id || i}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-gray-100 disabled:opacity-50"
                disabled={selecting}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void selectPrediction(p);
                }}
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
