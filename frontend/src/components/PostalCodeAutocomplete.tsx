import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface PostalCodeAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPostalCodeSelect?: (address: {
    postal_code: string;
    city?: string;
    province?: string;
    country?: string;
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Places script'));
    document.head.appendChild(script);
  });
};

export default function PostalCodeAutocomplete({
  value,
  onChange,
  onPostalCodeSelect,
  placeholder = 'Enter postal code',
  className = '',
  disabled = false,
  apiKey,
}: PostalCodeAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const onPostalCodeSelectRef = useRef(onPostalCodeSelect);
  const onChangeRef = useRef(onChange);
  const lastSelectedValueRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Keep refs updated
  useEffect(() => {
    onPostalCodeSelectRef.current = onPostalCodeSelect;
    onChangeRef.current = onChange;
  }, [onPostalCodeSelect, onChange]);

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
      console.warn('Google Places API key not found. Postal code autocomplete will not work.');
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
    if (!scriptLoaded || !inputRef.current || disabled) {
      return;
    }

    if (!window.google || !window.google.maps || !window.google.maps.places) {
      return;
    }

    // Cleanup previous autocomplete if it exists
    if (autocompleteRef.current && window.google && window.google.maps) {
      window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
    }

    // Initialize autocomplete - we'll use geocode type and filter for postal codes
    // Note: Google Places doesn't have a direct postal_code type, so we use geocode
    // and will filter/format results to show postal codes
    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['geocode'], // Use geocode to get addresses that include postal codes
      fields: ['address_components', 'formatted_address', 'geometry', 'name'],
    });

    autocompleteRef.current = autocomplete;

    // Handle place selection
    const handlePlaceSelect = () => {
      const place = autocomplete.getPlace();
      
      if (!place.address_components) {
        return;
      }

      // Parse address components to extract postal code, city, province, country
      let postal_code = '';
      let city = '';
      let province = '';
      let country = '';

      place.address_components.forEach((component: any) => {
        const types = component.types;

        if (types.includes('postal_code')) {
          postal_code = component.long_name;
        }
        if (types.includes('locality') && !city) {
          city = component.long_name;
        }
        if (types.includes('sublocality') && !city) {
          city = component.long_name;
        }
        if (types.includes('administrative_area_level_1')) {
          province = component.long_name || component.short_name;
        }
        if (types.includes('country')) {
          country = component.long_name || component.short_name;
        }
      });

      // If no postal code found in components, try to extract from formatted_address or name
      if (!postal_code) {
        // Try formatted_address first
        if (place.formatted_address) {
          // Common postal code patterns: Canadian (A1A 1A1), US (12345 or 12345-6789), UK (SW1A 1AA), etc.
          const postalCodeMatch = place.formatted_address.match(/\b([A-Z0-9]{2,}\s?[A-Z0-9]{2,})\b/i);
          if (postalCodeMatch) {
            postal_code = postalCodeMatch[1].toUpperCase();
          }
        }
        // If still not found, try place name (sometimes postal codes are in the name)
        if (!postal_code && place.name) {
          const postalCodeMatch = place.name.match(/\b([A-Z0-9]{2,}\s?[A-Z0-9]{2,})\b/i);
          if (postalCodeMatch) {
            postal_code = postalCodeMatch[1].toUpperCase();
          }
        }
      }

      // Only proceed if we found a postal code
      if (!postal_code) {
        return;
      }

      if (inputRef.current) {
        inputRef.current.value = postal_code;
      }
      lastSelectedValueRef.current = postal_code;

      if (onChangeRef.current) {
        onChangeRef.current(postal_code);
      }

      // Call onPostalCodeSelect callback
      if (onPostalCodeSelectRef.current) {
        const addressData = {
          postal_code,
          city: city || undefined,
          province: province || undefined,
          country: country || undefined,
        };
        
        onPostalCodeSelectRef.current(addressData);
      }
    };

    // Add listener for place selection
    const listener = autocomplete.addListener('place_changed', () => {
      handlePlaceSelect();
    });

    // Also listen for Enter key and blur events as fallback
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
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
      }, 200);
    };

    const inputElement = inputRef.current;
    if (inputElement) {
      inputElement.addEventListener('keydown', handleKeyDown);
      inputElement.addEventListener('blur', handleBlur);
    }

    // Cleanup
    return () => {
      if (listener && window.google && window.google.maps) {
        window.google.maps.event.removeListener(listener);
      }
      if (inputElement) {
        inputElement.removeEventListener('keydown', handleKeyDown);
        inputElement.removeEventListener('blur', handleBlur);
      }
      if (autocompleteRef.current && window.google && window.google.maps) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [scriptLoaded, disabled]);

  // Sync value with input when it changes externally (but let Google control it during typing)
  useEffect(() => {
    if (!inputRef.current || !scriptLoaded) return;
    const isFocused = document.activeElement === inputRef.current;
    if (isFocused) return;
    if (lastSelectedValueRef.current && inputRef.current.value === lastSelectedValueRef.current && value !== lastSelectedValueRef.current) {
      return;
    }
    if (inputRef.current.value !== value) {
      inputRef.current.value = value || '';
    }
    lastSelectedValueRef.current = null;
  }, [value, scriptLoaded]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        defaultValue={value}
        onChange={(e) => {
          // Let Google Places control the input, but also notify parent
          onChange(e.target.value);
        }}
        onInput={(e) => {
          // Also handle input events for better compatibility
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
