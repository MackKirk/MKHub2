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

    // Initialize autocomplete
    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      fields: ['address_components', 'formatted_address', 'geometry'],
    });

    autocompleteRef.current = autocomplete;

    // Handle place selection
    const handlePlaceSelect = () => {
      const place = autocomplete.getPlace();
      
      console.log('Place selected:', place);
      
      if (!place.address_components || !place.geometry) {
        console.warn('Place missing address_components or geometry');
        return;
      }

      // Parse address components
      let address_line1 = '';
      let address_line2 = '';
      let city = '';
      let province = '';
      let country = '';
      let postal_code = '';
      const lat = place.geometry.location?.lat();
      const lng = place.geometry.location?.lng();

      console.log('Address components:', place.address_components);

      // Parse address components
      place.address_components.forEach((component: any) => {
        const types = component.types;
        console.log('Component:', component.long_name, 'Types:', types);

        if (types.includes('street_number')) {
          address_line1 = (address_line1 + component.long_name + ' ').trim();
        }
        if (types.includes('route')) {
          address_line1 = (address_line1 + ' ' + component.long_name).trim();
        }
        if (types.includes('subpremise')) {
          address_line2 = component.long_name;
        }
        // Try multiple locality types
        if (types.includes('locality') && !city) {
          city = component.long_name;
        }
        if (types.includes('sublocality') && !city) {
          city = component.long_name;
        }
        if (types.includes('sublocality_level_1') && !city) {
          city = component.long_name;
        }
        // Try multiple administrative area types
        if (types.includes('administrative_area_level_1')) {
          province = component.short_name || component.long_name;
        }
        if (types.includes('administrative_area_level_2') && !province) {
          province = component.short_name || component.long_name;
        }
        if (types.includes('country')) {
          country = component.short_name || component.long_name;
        }
        if (types.includes('postal_code')) {
          postal_code = component.long_name;
        }
      });

      // Update input value with street address (line 1)
      // If we don't have a parsed street address, use formatted_address
      const addressLine1Value = address_line1.trim() || place.formatted_address?.split(',')[0]?.trim() || place.formatted_address || '';
      
      console.log('Parsed address:', {
        address_line1: addressLine1Value,
        address_line2,
        city,
        province,
        country,
        postal_code,
        lat,
        lng,
      });
      
      // Update the input field using ref to avoid stale closure
      if (onChangeRef.current) {
        onChangeRef.current(addressLine1Value);
      }

      // Call onAddressSelect callback with parsed address using ref to avoid stale closure
      // Always call this, even if some fields are empty, so the parent can update all fields
      const addressData = {
        address_line1: addressLine1Value,
        address_line2: address_line2 || undefined,
        city: city || undefined,
        province: province || undefined,
        country: country || undefined,
        postal_code: postal_code || undefined,
        lat: lat || undefined,
        lng: lng || undefined,
      };
      
      console.log('Calling onAddressSelect with:', addressData);
      console.log('onAddressSelectRef.current:', onAddressSelectRef.current);
      
      if (onAddressSelectRef.current) {
        try {
          onAddressSelectRef.current(addressData);
          console.log('onAddressSelect called successfully');
        } catch (error) {
          console.error('Error calling onAddressSelect:', error);
        }
      } else {
        console.warn('onAddressSelect callback not provided');
      }
    };

    // Add listener for place selection
    const listener = autocomplete.addListener('place_changed', () => {
      console.log('place_changed event fired');
      handlePlaceSelect();
    });
    console.log('Added place_changed listener');

    // Also listen for Enter key and blur events as fallback
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        console.log('Enter key pressed, checking for place...');
        setTimeout(() => {
          const place = autocomplete.getPlace();
          if (place && place.place_id) {
            console.log('Place found on Enter key:', place);
            handlePlaceSelect();
          }
        }, 100);
      }
    };

    const handleBlur = () => {
      console.log('Input blurred, checking for place...');
      setTimeout(() => {
        const place = autocomplete.getPlace();
        if (place && place.place_id) {
          console.log('Place found on blur:', place);
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

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
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

