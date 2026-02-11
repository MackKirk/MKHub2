import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

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
  apiKey?: string;
}

// Declare Google Maps types for TypeScript
declare global {
  interface Window {
    google: any;
  }
}

// Load Google Places API script
const loadGooglePlacesScript = (apiKey: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Check if script is already loaded
    if (window.google && window.google.maps && window.google.maps.places) {
      resolve();
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Places script')));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Places script'));
    document.head.appendChild(script);
  });
};

export default function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = 'Enter address',
  className = '',
  disabled = false,
  apiKey,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const onAddressSelectRef = useRef(onAddressSelect);
  const onChangeRef = useRef(onChange);
  /** After we set value from a place, ignore the next input onChange so a stray event does not overwrite with typed text */
  const ignoreNextInputChangeRef = useRef(false);
  /** When we just set the input to the selected address, avoid sync effect overwriting with stale value prop */
  const lastSelectedAddressRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Keep refs updated
  useEffect(() => {
    onAddressSelectRef.current = onAddressSelect;
    onChangeRef.current = onChange;
  }, [onAddressSelect, onChange]);

  // Get API key from backend settings
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get API key from prop, environment, or backend settings
  const getApiKey = () => {
    if (apiKey) return apiKey;
    // Try to get from environment variable
    const envKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
    if (envKey) return envKey;
    // Try to get from backend settings
    if (settingsData?.google_places_api_key) {
      return settingsData.google_places_api_key;
    }
    return '';
  };

  const apiKeyValue = getApiKey();

  useEffect(() => {
    if (!apiKeyValue) {
      console.warn('Google Places API key not found. Address autocomplete will not work.');
      return;
    }

    setIsLoading(true);
    loadGooglePlacesScript(apiKeyValue)
      .then(() => {
        setScriptLoaded(true);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error('Failed to load Google Places API:', error);
        setIsLoading(false);
      });
  }, [apiKeyValue]);

  useEffect(() => {
    if (!scriptLoaded || disabled) {
      return;
    }

    if (!window.google || !window.google.maps || !window.google.maps.places) {
      return;
    }

    const inputEl = inputRef.current;
    if (!inputEl) return;

    // Cleanup previous autocomplete if it exists
    if (autocompleteRef.current && window.google && window.google.maps) {
      window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      autocompleteRef.current = null;
    }

    const autocomplete = new window.google.maps.places.Autocomplete(inputEl, {
      types: ['address'],
    });
    autocompleteRef.current = autocomplete;

    // Apply a Place result to state (full address + parsed fields for auto-fill)
    const applyPlaceToState = (place: any) => {
      const displayAddress = (place.formatted_address || (place as any).name || '').trim();
      if (!displayAddress) return;

      let address_line2 = '';
      let city = '';
      let province = '';
      let country = '';
      let postal_code = '';
      const lat = place.geometry?.location?.lat?.();
      const lng = place.geometry?.location?.lng?.();

      if (place.address_components && Array.isArray(place.address_components)) {
        place.address_components.forEach((component: any) => {
          const types = component.types;
          if (types.includes('subpremise')) {
            address_line2 = component.long_name;
          }
          if (types.includes('locality') && !city) {
            city = component.long_name;
          }
          if (types.includes('sublocality') && !city) {
            city = component.long_name;
          }
          if (types.includes('sublocality_level_1') && !city) {
            city = component.long_name;
          }
          if (types.includes('administrative_area_level_1')) {
            province = component.long_name || component.short_name;
          }
          if (types.includes('administrative_area_level_2') && !province) {
            province = component.long_name || component.short_name;
          }
          if (types.includes('country')) {
            country = component.long_name || component.short_name;
          }
          if (types.includes('postal_code')) {
            postal_code = component.long_name;
          }
        });
      }

      if (inputRef.current) {
        inputRef.current.value = displayAddress;
      }
      lastSelectedAddressRef.current = displayAddress;
      ignoreNextInputChangeRef.current = true;
      if (onChangeRef.current) {
        onChangeRef.current(displayAddress);
      }

      const addressData = {
        address_line1: displayAddress,
        address_line2: address_line2 || undefined,
        city: city || undefined,
        province: province || undefined,
        country: country || undefined,
        postal_code: postal_code || undefined,
        lat: lat !== undefined && lat !== null ? lat : undefined,
        lng: lng !== undefined && lng !== null ? lng : undefined,
      };

      if (onAddressSelectRef.current) {
        try {
          onAddressSelectRef.current(addressData);
        } catch (error) {
          console.error('Error calling onAddressSelect:', error);
        }
      }
    };

    const handlePlaceSelect = () => {
      const place = autocomplete.getPlace();
      if (!place || !place.place_id) return;

      const hasFullDetails = place.formatted_address && place.address_components && place.address_components.length > 0;

      if (hasFullDetails) {
        applyPlaceToState(place);
        return;
      }

      // Place is incomplete (common when clicking a suggestion) – fetch full details for address + auto-fill
      const service = new window.google.maps.places.PlacesService(
        document.createElement('div')
      );
      service.getDetails(
        {
          placeId: place.place_id,
          fields: ['address_components', 'formatted_address', 'geometry', 'name'],
        },
        (detailPlace: any, status: string) => {
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !detailPlace) {
            const fallbackAddress = (place.formatted_address || (place as any).name || '').trim();
            if (fallbackAddress && onChangeRef.current) {
              ignoreNextInputChangeRef.current = true;
              onChangeRef.current(fallbackAddress);
              if (onAddressSelectRef.current) {
                onAddressSelectRef.current({ address_line1: fallbackAddress });
              }
            }
            return;
          }
          applyPlaceToState(detailPlace);
        }
      );
    };

    const listener = autocomplete.addListener('place_changed', () => {
      handlePlaceSelect();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setTimeout(() => {
          const place = autocomplete.getPlace();
          if (place && place.place_id) {
            handlePlaceSelect();
          }
        }, 100);
      }
    };

    const handleBlur = () => {
      setTimeout(() => {
        const place = autocomplete.getPlace();
        if (place && place.place_id) {
          handlePlaceSelect();
        }
      }, 300);
    };

    if (inputEl) {
      inputEl.addEventListener('keydown', handleKeyDown);
      inputEl.addEventListener('blur', handleBlur);
    }

    // Cleanup
    return () => {
      if (listener && window.google && window.google.maps) {
        window.google.maps.event.removeListener(listener);
      }
      if (inputEl) {
        inputEl.removeEventListener('keydown', handleKeyDown);
        inputEl.removeEventListener('blur', handleBlur);
      }
      if (autocompleteRef.current && window.google && window.google.maps) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [scriptLoaded, disabled]);

  // Sync value from parent into input only when it's a full address (e.g. after place select or load) or empty – never while user is typing (short value without comma).
  useEffect(() => {
    if (!inputRef.current || !scriptLoaded) return;
    const isFocused = document.activeElement === inputRef.current;
    if (isFocused) return;
    const val = value ?? '';
    const looksLikeFullAddress = val.includes(',');
    const isEmpty = val.trim() === '';
    if (!looksLikeFullAddress && !isEmpty) return;
    if (
      lastSelectedAddressRef.current &&
      inputRef.current.value === lastSelectedAddressRef.current &&
      value !== lastSelectedAddressRef.current
    ) {
      return;
    }
    if (inputRef.current.value !== val) {
      inputRef.current.value = val;
    }
    lastSelectedAddressRef.current = null;
  }, [value, scriptLoaded]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        defaultValue={value ?? ''}
        onChange={(e) => {
          if (ignoreNextInputChangeRef.current) {
            ignoreNextInputChangeRef.current = false;
            return;
          }
          onChange(e.target.value);
        }}
        onInput={(e) => {
          if (ignoreNextInputChangeRef.current) return;
          onChange((e.target as HTMLInputElement).value);
        }}
        placeholder={placeholder}
        className={className}
        disabled={disabled || isLoading}
        autoComplete="off"
      />
      {isLoading && (
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-400">
          Loading...
        </div>
      )}
    </div>
  );
}

