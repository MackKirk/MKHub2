import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import NationalitySelect from '@/components/NationalitySelect';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import PostalCodeAutocomplete from '@/components/PostalCodeAutocomplete';
import { useConfirm } from '@/components/ConfirmProvider';

type ProfileResp = { user: { username: string; email: string; first_name?: string; last_name?: string }, profile?: any };

// Field component helper
function Field({ label, children, required, invalid }: { label: string; children: any; required?: boolean; invalid?: boolean }) {
  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-600">{label} {required && <span className="text-red-600">*</span>}</label>
      <div className={invalid ? 'ring-2 ring-red-400 rounded-lg p-0.5' : 'p-0'}>
        {children}
      </div>
      {invalid && <div className="text-xs text-red-600">Required</div>}
    </div>
  );
}

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Get current user ID
  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const userId = me?.id ? String(me.id) : '';
  
  // Load profile data
  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['meProfile'],
    queryFn: () => api<ProfileResp>('GET', '/auth/me/profile'),
    enabled: !!userId
  });
  
  // Memoize profile to avoid unnecessary re-renders
  const p = useMemo(() => profileData?.profile || {}, [profileData?.profile]);
  
  // Current step state
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 6;
  
  // Form state
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [formInitialized, setFormInitialized] = useState(false);
  
  // Address dropdowns state
  const [countries, setCountries] = useState<Array<{ name: string }>>([]);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [geoLoaded, setGeoLoaded] = useState(false);
  
  // Initialize form from profile data (only once)
  useEffect(() => {
    if (profileData && !formInitialized) {
      const profile = profileData.profile || {};
      setForm({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        middle_name: profile.middle_name || '',
        prefered_name: profile.prefered_name || '',
        gender: profile.gender || '',
        marital_status: profile.marital_status || '',
        date_of_birth: profile.date_of_birth || '',
        nationality: profile.nationality || '',
        address_line1: profile.address_line1 || '',
        address_line1_complement: profile.address_line1_complement || '',
        address_line2: profile.address_line2 || '',
        address_line2_complement: profile.address_line2_complement || '',
        city: profile.city || '',
        province: profile.province || '',
        postal_code: profile.postal_code || '',
        country: profile.country || '',
        phone: profile.phone || '',
        mobile_phone: profile.mobile_phone || '',
        sin_number: profile.sin_number || '',
        work_eligibility_status: profile.work_eligibility_status || '',
      });
      setFormInitialized(true);
    }
  }, [profileData, formInitialized]);
  
  const set = useCallback((k: string, v: any) => {
    setForm((s: any) => ({ ...s, [k]: v }));
  }, []);
  
  // SIN Number formatting function (NNN-NNN-NNN)
  const formatSIN = (v: string) => {
    const d = String(v || '').replace(/\D+/g, '').slice(0, 9);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  };

  // Phone formatting function
  const formatPhone = (v: string) => {
    const d = String(v || '').replace(/\D+/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return `+${d.slice(0, 1)} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 11)}`;
  };
  
  // Check emergency contacts (needed for validation)
  const { data: emergencyContactsData, isLoading: emergencyContactsLoading } = useQuery({
    queryKey: ['emergency-contacts', userId],
    queryFn: () => api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`),
    enabled: !!userId
  });
  
  const hasEmergencyContact = emergencyContactsData && emergencyContactsData.length > 0;
  
  // Required fields for each step
  const stepRequiredFields: Record<number, string[]> = {
    1: ['gender', 'date_of_birth', 'marital_status', 'nationality'],
    2: ['address_line1', 'city', 'province', 'postal_code', 'country'],
    3: ['phone'],
    4: [], // Education is optional
    5: ['sin_number', 'work_eligibility_status'], // SIN/SSN and Work Eligibility Status are required
    6: [], // Emergency contacts checked separately
  };
  
  // Check if current step is valid
  const isStepValid = useCallback((step: number): boolean => {
    const required = stepRequiredFields[step] || [];
    
    // Check basic required fields
    for (const field of required) {
      if (!String((form as any)[field] || '').trim()) {
        return false;
      }
    }
    
    // Step 6: Check if at least one emergency contact exists
    if (step === 6) {
      return hasEmergencyContact;
    }
    
    return true;
  }, [form, hasEmergencyContact]);
  
  // Find the first step with missing required fields
  const findFirstIncompleteStep = useCallback((formData: any, hasEmergency: boolean): number => {
    for (let step = 1; step <= totalSteps; step++) {
      const required = stepRequiredFields[step] || [];
      
      // Check basic required fields
      let hasMissing = false;
      for (const field of required) {
        if (!String((formData as any)[field] || '').trim()) {
          hasMissing = true;
          break;
        }
      }
      
      // Step 6: Check emergency contacts separately
      if (step === 6) {
        if (!hasEmergency) {
          return step;
        }
      } else if (hasMissing) {
        return step;
      }
    }
    
    // All steps are complete, return the last step
    return totalSteps;
  }, [totalSteps]);
  
  // Initialize currentStep to the first incomplete step when form is initialized (only once)
  const [stepInitialized, setStepInitialized] = useState(false);
  useEffect(() => {
    if (formInitialized && Object.keys(form).length > 0 && !emergencyContactsLoading && !stepInitialized) {
      const firstIncomplete = findFirstIncompleteStep(form, hasEmergencyContact);
      setCurrentStep(firstIncomplete);
      setStepInitialized(true);
    }
  }, [formInitialized, form, emergencyContactsLoading, hasEmergencyContact, findFirstIncompleteStep, stepInitialized]);
  
  // Save profile data (only called when clicking Next or Previous)
  const saveProfile = useCallback(async () => {
    if (!userId) return;
    
    setSaving(true);
    try {
      await api('PUT', '/auth/me/profile', form);
      await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
      await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
      // Reset unsaved changes flag after successful save
      setHasUnsavedChanges(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save');
      throw error; // Re-throw to allow callers to handle the error
    } finally {
      setSaving(false);
    }
  }, [form, userId, queryClient]);
  
  // Address change handler
  const handleAddressChange = useCallback((value: string) => {
    setForm((s: any) => ({ ...s, address_line1: value }));
  }, []);
  
  // Load countries from MKHubGeo
  const loadCountries = useCallback(async () => {
    if (geoLoaded) return;
    
    // Check if geo.js is loaded
    if (typeof window !== 'undefined' && (window as any).MKHubGeo) {
      try {
        const geo = (window as any).MKHubGeo;
        if (geo.data && geo.data.length > 0) {
          setCountries(geo.data);
          setGeoLoaded(true);
        } else {
          // Try to load if data is empty
          await geo.load();
          if (geo.data && geo.data.length > 0) {
            setCountries(geo.data);
            setGeoLoaded(true);
          }
        }
      } catch (error) {
        console.error('Failed to load countries:', error);
        toast.error('Failed to load countries list');
      }
    } else {
      // Wait a bit and try again
      setTimeout(() => {
        if ((window as any).MKHubGeo) {
          loadCountries();
        }
      }, 500);
    }
  }, [geoLoaded]);
  
  // Wait for geo.js to load (it's loaded via script tag in index.html)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check if geo.js is already loaded
    if ((window as any).MKHubGeo) {
      loadCountries();
      return;
    }
    
    // Wait for geo.js to load (check every 100ms for up to 5 seconds)
    let attempts = 0;
    const maxAttempts = 50;
    const checkInterval = setInterval(() => {
      attempts++;
      if ((window as any).MKHubGeo) {
        clearInterval(checkInterval);
        loadCountries();
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.warn('geo.js did not load after 5 seconds');
      }
    }, 100);
    
    return () => clearInterval(checkInterval);
  }, [loadCountries]);
  
  // Load cities for a province (defined first to avoid circular dependency)
  const loadCitiesForProvince = useCallback(async (country: string, province: string, currentCity?: string) => {
    if (!country || !province) {
      setCities([]);
      return;
    }
    
    setLoadingCities(true);
    try {
      if (typeof window !== 'undefined' && (window as any).MKHubGeo) {
        const geo = (window as any).MKHubGeo;
        const cityList = await geo.getCities(country, province);
        setCities(cityList || []);
        
        // Validate if current city exists in new province
        if (currentCity && cityList && cityList.includes(currentCity)) {
          // City is valid, keep it
        } else {
          // City is not valid, clear it
          if (currentCity) {
            setForm((s: any) => ({ ...s, city: '' }));
          }
        }
      } else {
        console.warn('MKHubGeo not available');
        setCities([]);
      }
    } catch (error) {
      console.error('Failed to load cities:', error);
      toast.error('Failed to load cities');
      setCities([]);
    } finally {
      setLoadingCities(false);
    }
  }, []);
  
  // Load provinces for a country
  const loadProvincesForCountry = useCallback(async (country: string, currentProvince?: string, currentCity?: string) => {
    if (!country) {
      setProvinces([]);
      setCities([]);
      return;
    }
    
    setLoadingStates(true);
    try {
      if (typeof window !== 'undefined' && (window as any).MKHubGeo) {
        const geo = (window as any).MKHubGeo;
        const states = await geo.getStates(country);
        setProvinces(states || []);
        
        // Validate if current province exists in new country
        if (currentProvince && states && states.includes(currentProvince)) {
          // Province is valid, load cities for it
          await loadCitiesForProvince(country, currentProvince, currentCity);
        } else {
          // Province is not valid, clear it and city
          if (currentProvince) {
            setForm((s: any) => ({ ...s, province: '', city: '' }));
          }
          setCities([]);
        }
      } else {
        console.warn('MKHubGeo not available');
        setProvinces([]);
      }
    } catch (error) {
      console.error('Failed to load provinces:', error);
      toast.error('Failed to load provinces/states');
      setProvinces([]);
    } finally {
      setLoadingStates(false);
    }
  }, [loadCitiesForProvince]);
  
  // Handle country change
  const handleCountryChange = useCallback((country: string) => {
    setForm((s: any) => {
      const currentProvince = s.province;
      const currentCity = s.city;
      // Use setTimeout to avoid calling async function during state update
      setTimeout(() => {
        loadProvincesForCountry(country, currentProvince, currentCity);
      }, 0);
      return { ...s, country };
    });
  }, [loadProvincesForCountry]);
  
  // Handle province change
  const handleProvinceChange = useCallback((province: string) => {
    setForm((s: any) => {
      const currentCity = s.city;
      const currentCountry = s.country;
      // Use setTimeout to avoid calling async function during state update
      if (currentCountry) {
        setTimeout(() => {
          loadCitiesForProvince(currentCountry, province, currentCity);
        }, 0);
      }
      return { ...s, province };
    });
  }, [loadCitiesForProvince]);
  
  // Handle address select (moved after loadProvincesForCountry and loadCitiesForProvince definitions)
  const handleAddressSelect = useCallback((address: any) => {
    setForm((s: any) => {
      const newForm = {
        ...s,
        address_line1: address.address_line1 || s.address_line1,
        city: address.city !== undefined ? address.city : s.city,
        province: address.province !== undefined ? address.province : s.province,
        postal_code: address.postal_code !== undefined ? address.postal_code : s.postal_code,
        country: address.country !== undefined ? address.country : s.country,
      };
      
      // Use setTimeout to avoid calling async functions during state update
      setTimeout(() => {
        // If country changed, load provinces
        if (address.country !== undefined && address.country !== s.country) {
          loadProvincesForCountry(address.country, newForm.province, newForm.city);
        } else if (address.province !== undefined && address.province !== s.province && newForm.country) {
          // If province changed, load cities
          loadCitiesForProvince(newForm.country, address.province, newForm.city);
        } else if (address.city !== undefined && newForm.country && newForm.province) {
          // If city changed, ensure cities list is loaded
          loadCitiesForProvince(newForm.country, newForm.province, address.city);
        } else if (address.country && !s.country) {
          // If country was just set, load provinces
          loadProvincesForCountry(address.country, newForm.province, newForm.city);
        }
      }, 0);
      
      return newForm;
    });
  }, [loadProvincesForCountry, loadCitiesForProvince]);
  
  // Handle postal code select
  const handlePostalCodeSelect = useCallback((address: any) => {
    setForm((s: any) => {
      const updates: any = { postal_code: address.postal_code || s.postal_code };
      
      // Only update if field is not already filled
      if (address.city && !s.city) updates.city = address.city;
      if (address.province && !s.province) updates.province = address.province;
      if (address.country && !s.country) updates.country = address.country;
      
      const newForm = { ...s, ...updates };
      
      // If country was set, load provinces (use setTimeout to avoid state update during render)
      if (updates.country && updates.country !== s.country) {
        setTimeout(() => {
          loadProvincesForCountry(updates.country, newForm.province, newForm.city);
        }, 0);
      } else if (updates.province && updates.province !== s.province && newForm.country) {
        // If province was set, load cities
        setTimeout(() => {
          loadCitiesForProvince(newForm.country, updates.province, newForm.city);
        }, 0);
      }
      
      return newForm;
    });
  }, [loadProvincesForCountry, loadCitiesForProvince]);
  
  // Load countries on mount and when form is initialized
  useEffect(() => {
    if (formInitialized && currentStep === 2) {
      loadCountries();
      // If country is already set, load provinces
      if (form.country) {
        loadProvincesForCountry(form.country, form.province, form.city);
      }
    }
  }, [formInitialized, currentStep, form.country, form.province, form.city, loadCountries, loadProvincesForCountry]);
  
  // Check if onboarding is complete (memoized to prevent unnecessary recalculations)
  const reqPersonal = useMemo(() => ['gender', 'date_of_birth', 'marital_status', 'nationality', 'phone', 'address_line1', 'city', 'province', 'postal_code', 'country', 'sin_number', 'work_eligibility_status'], []);
  const missingPersonal = useMemo(() => {
    return reqPersonal.filter(k => {
      const value = String((form as any)[k] || '').trim();
      return !value || value.length === 0;
    });
  }, [form, reqPersonal]);
  
  // Only require emergency contacts if userId exists (meaning the query was enabled)
  // If emergency contacts query is still loading, we can't determine completion yet
  const emergencyContactsReady = userId ? (!emergencyContactsLoading && emergencyContactsData !== undefined) : true;
  const isOnboardingComplete = useMemo(() => {
    // Check each required field individually
    for (const field of reqPersonal) {
      const value = String((form as any)[field] || '').trim();
      if (!value || value.length === 0) {
        return false;
      }
    }
    
    // Check emergency contacts
    if (userId) {
      if (!emergencyContactsReady) {
        return false;
      }
      if (!hasEmergencyContact) {
        return false;
      }
    }
    
    return true;
  }, [form, reqPersonal, userId, emergencyContactsReady, hasEmergencyContact]);
  
  // Check if onboarding is complete based on saved server data (not local form state)
  // This prevents redirects during typing
  const isOnboardingCompleteFromServer = useMemo(() => {
    if (!profileData?.profile) return false;
    
    const p = profileData.profile;
    const reqPersonal = ['gender', 'date_of_birth', 'marital_status', 'nationality', 'phone', 'address_line1', 'city', 'province', 'postal_code', 'country', 'sin_number', 'work_eligibility_status'];
    
    // Check each required field from server data
    for (const field of reqPersonal) {
      const value = String((p as any)[field] || '').trim();
      if (!value || value.length === 0) {
        return false;
      }
    }
    
    // Check emergency contacts
    if (userId) {
      if (emergencyContactsLoading) {
        return false; // Still loading, can't determine
      }
      if (!hasEmergencyContact) {
        return false;
      }
    }
    
    return true;
  }, [profileData, userId, emergencyContactsLoading, hasEmergencyContact]);
  
  // Track if user has made any changes to the form (to prevent redirects during editing)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Update hasUnsavedChanges when form changes
  useEffect(() => {
    if (formInitialized && Object.keys(form).length > 0) {
      // Compare form with server data to detect changes
      const serverData = profileData?.profile || {};
      const formChanged = Object.keys(form).some(key => {
        const formValue = String((form as any)[key] || '').trim();
        const serverValue = String((serverData as any)[key] || '').trim();
        return formValue !== serverValue;
      });
      setHasUnsavedChanges(formChanged);
    }
  }, [form, profileData, formInitialized]);
  
  // Redirect to home if onboarding is already complete (based on server data only)
  // Only redirect if all data has finished loading and onboarding is confirmed complete
  useEffect(() => {
    // Don't redirect if we're still loading data
    if (profileLoading || (userId && emergencyContactsLoading)) {
      return;
    }
    
    // Don't redirect if form hasn't been initialized yet
    if (!formInitialized) {
      return;
    }
    
    // Don't redirect if user has unsaved changes (prevents redirect during typing)
    if (hasUnsavedChanges) {
      return;
    }
    
    // Only redirect if onboarding is truly complete based on server data
    // This prevents redirects when user is typing in the form
    if (profileData && isOnboardingCompleteFromServer) {
      navigate('/home', { replace: true });
    }
  }, [isOnboardingCompleteFromServer, profileData, profileLoading, navigate, userId, emergencyContactsLoading, formInitialized, hasUnsavedChanges]);
  
  // Handle next step
  const handleNext = async () => {
    if (!isStepValid(currentStep)) {
      toast.error('Please complete all required fields before continuing');
      return;
    }
    
    // Save before moving to next step
    try {
      await saveProfile();
    } catch (error) {
      // Error already handled in saveProfile
      return;
    }
    
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      // Final step - check if all required fields are complete
      if (!isOnboardingComplete) {
        toast.error('Please complete all required fields to finish onboarding');
        return;
      }
      
      // Onboarding complete!
      toast.success('Onboarding complete! Welcome to MKHub!');
      await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
      await queryClient.invalidateQueries({ queryKey: ['emergency-contacts', userId] });
      navigate('/home', { replace: true });
    }
  };
  
  // Handle previous step
  const handlePrevious = async () => {
    // Save before moving to previous step
    try {
      await saveProfile();
    } catch (error) {
      // Error already handled in saveProfile, but continue anyway
      // User can still go back even if save fails
    }
    
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  if (meLoading || profileLoading || !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Progress Bar */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold">Complete Your Onboarding</h1>
            <div className="text-sm text-gray-600">
              Step {currentStep} of {totalSteps}
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-brand-red to-[#ee2b2b] h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>Basic Information</span>
            <span>Address</span>
            <span>Contact</span>
            <span>Education</span>
            <span>Legal & Documents</span>
            <span>Emergency Contacts</span>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          {/* Step 1: Basic Information */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Basic Information</h2>
                <p className="text-sm text-gray-500">Core personal details</p>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="First name" required invalid={false}>
                  <input
                    type="text"
                    value={form.first_name || ''}
                    onChange={e => set('first_name', e.target.value)}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </Field>
                <Field label="Last name" required invalid={false}>
                  <input
                    type="text"
                    value={form.last_name || ''}
                    onChange={e => set('last_name', e.target.value)}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </Field>
                <Field label="Middle name">
                  <input
                    type="text"
                    value={form.middle_name || ''}
                    onChange={e => set('middle_name', e.target.value)}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </Field>
                <Field label="Preferred name">
                  <input
                    type="text"
                    value={form.prefered_name || ''}
                    onChange={e => set('prefered_name', e.target.value)}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </Field>
                <Field label="Gender" required invalid={!form.gender}>
                  <select
                    value={form.gender || ''}
                    onChange={e => set('gender', e.target.value)}
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    <option value="">Select...</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </Field>
                <Field label="Marital status" required invalid={!form.marital_status}>
                  <select
                    value={form.marital_status || ''}
                    onChange={e => set('marital_status', e.target.value)}
                    className="w-full rounded-lg border px-3 py-2"
                  >
                    <option value="">Select...</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Common-law">Common-law</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </Field>
                <Field label="Date of birth" required invalid={!form.date_of_birth}>
                  <input
                    type="date"
                    value={form.date_of_birth ? String(form.date_of_birth).slice(0, 10) : ''}
                    onChange={e => set('date_of_birth', e.target.value)}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </Field>
                <Field label="Nationality" required invalid={!form.nationality}>
                  <NationalitySelect value={form.nationality || ''} onChange={v => set('nationality', v)} />
                </Field>
              </div>
            </div>
          )}
          
          {/* Step 2: Address */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Address</h2>
                <p className="text-sm text-gray-500">Home address for contact and records</p>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Address line 1" required invalid={!form.address_line1}>
                  <AddressAutocomplete
                    key="address-line1-onboarding"
                    value={form.address_line1 || ''}
                    onChange={handleAddressChange}
                    onAddressSelect={handleAddressSelect}
                    placeholder="Start typing an address..."
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </Field>
                <Field label="Complement (e.g., Apt, Unit, Basement)">
                  <input
                    type="text"
                    value={form.address_line1_complement || ''}
                    onChange={e => set('address_line1_complement', e.target.value)}
                    placeholder="Apt 101, Unit 2, Basement, etc."
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </Field>
                {/* Row 1: Country | Province/State */}
                <Field label="Country" required invalid={!form.country}>
                  <select
                    value={form.country || ''}
                    onChange={e => handleCountryChange(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2"
                    disabled={loadingStates}
                  >
                    <option value="">Select country...</option>
                    {countries.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Province/State" required invalid={!form.province}>
                  <select
                    value={form.province || ''}
                    onChange={e => handleProvinceChange(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2"
                    disabled={!form.country || loadingStates || loadingCities}
                  >
                    <option value="">{loadingStates ? 'Loading...' : form.country ? 'Select province/state...' : 'Select country first'}</option>
                    {provinces.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
                {/* Row 2: City | Postal Code */}
                <Field label="City" required invalid={!form.city}>
                  <select
                    value={form.city || ''}
                    onChange={e => set('city', e.target.value)}
                    className="w-full rounded-lg border px-3 py-2"
                    disabled={!form.country || !form.province || loadingCities}
                  >
                    <option value="">{loadingCities ? 'Loading...' : form.province ? 'Select city...' : 'Select province first'}</option>
                    {cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Postal code" required invalid={!form.postal_code}>
                  <PostalCodeAutocomplete
                    value={form.postal_code || ''}
                    onChange={(value) => set('postal_code', value)}
                    onPostalCodeSelect={handlePostalCodeSelect}
                    placeholder="Enter postal code..."
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </Field>
                <Field label="Address line 2">
                  <AddressAutocomplete
                    value={form.address_line2 || ''}
                    onChange={(value) => set('address_line2', value)}
                    placeholder="Start typing an address..."
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </Field>
                <Field label="Complement (e.g., Apt, Unit, Basement)">
                  <input
                    type="text"
                    value={form.address_line2_complement || ''}
                    onChange={e => set('address_line2_complement', e.target.value)}
                    placeholder="Apt 101, Unit 2, Basement, etc."
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </Field>
              </div>
            </div>
          )}
          
          {/* Step 3: Contact */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Contact</h2>
                <p className="text-sm text-gray-500">How we can reach you</p>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Phone 1" required invalid={!form.phone}>
                  <input
                    type="text"
                    value={form.phone || ''}
                    onChange={e => set('phone', formatPhone(e.target.value))}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </Field>
                <Field label="Phone 2">
                  <input
                    type="text"
                    value={form.mobile_phone || ''}
                    onChange={e => set('mobile_phone', formatPhone(e.target.value))}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </Field>
              </div>
            </div>
          )}
          
          {/* Step 4: Education */}
          {currentStep === 4 && userId && (
            <EducationStep userId={userId} />
          )}
          
          {/* Step 5: Legal & Documents */}
          {currentStep === 5 && userId && (
            <LegalDocumentsStep userId={userId} form={form} set={set} formatSIN={formatSIN} />
          )}
          
          {/* Step 6: Emergency Contacts */}
          {currentStep === 6 && userId && (
            <EmergencyContactsStep userId={userId} />
          )}
          
          {/* Navigation Buttons */}
          <div className="mt-8 pt-6 border-t flex items-center justify-between">
            <button
              onClick={handlePrevious}
              disabled={currentStep === 1}
              className={`px-6 py-2 rounded-lg font-medium ${
                currentStep === 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Previous
            </button>
            <button
              onClick={handleNext}
              disabled={saving}
              className="px-6 py-2 rounded-lg font-medium text-white bg-gradient-to-r from-brand-red to-[#ee2b2b] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : currentStep === totalSteps ? 'Complete Onboarding' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Education Step Component (reused from Profile.tsx)
function EducationStep({ userId }: { userId: string }) {
  const { data: rows, refetch, isLoading } = useQuery({
    queryKey: ['education', userId],
    queryFn: () => api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/education`)
  });
  const [showAdd, setShowAdd] = useState(false);
  const [inst, setInst] = useState('');
  const [degree, setDegree] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  
  const add = async () => {
    try {
      if (!inst.trim()) {
        toast.error('Institution required');
        return;
      }
      // Convert month input (YYYY-MM) to full date (YYYY-MM-01) for API
      const startDate = start ? `${start}-01` : null;
      const endDate = end ? `${end}-01` : null;
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/education`, {
        college_institution: inst,
        degree,
        start_date: startDate,
        end_date: endDate
      });
      toast.success('Added');
      setShowAdd(false);
      setInst('');
      setDegree('');
      setStart('');
      setEnd('');
      await refetch();
    } catch (_e) {
      toast.error('Failed');
    }
  };
  
  const del = async (id: string) => {
    try {
      await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/education/${encodeURIComponent(id)}`);
      await refetch();
    } catch (_e) {
      toast.error('Failed');
    }
  };
  
  const formatDateMonthYear = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${year}-${month}`;
    } catch {
      return dateStr.slice(0, 7); // Fallback to YYYY-MM format
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Education</h2>
        <p className="text-sm text-gray-500">Academic history (optional)</p>
      </div>
      {isLoading ? (
        <div className="text-sm text-gray-600">Loading...</div>
      ) : (rows || []).length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(rows || []).map((e: any) => (
            <div key={e.id} className="border rounded-lg p-4 text-sm">
              <div className="font-medium text-gray-900 mb-1">{e.college_institution || 'Institution'}</div>
              <div className="text-gray-600 mb-1">
                {e.degree || ''} {e.major_specialization ? `· ${e.major_specialization}` : ''}
              </div>
              <div className="text-gray-500 text-xs">
                {formatDateMonthYear(e.start_date)}{(e.start_date || e.end_date) ? ' — ' : ''}{formatDateMonthYear(e.end_date)}
              </div>
              <div className="mt-3 pt-3 border-t">
                <button
                  onClick={() => del(e.id)}
                  className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-600">No education records. Click "Add education" to add one.</div>
      )}
      <div className="mt-3">
        {!showAdd ? (
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-lg bg-brand-red text-white font-medium hover:opacity-90"
          >
            Add education
          </button>
        ) : (
          <div className="grid md:grid-cols-2 gap-3 p-4 border rounded-lg bg-gray-50">
            <div>
              <div className="text-xs text-gray-600 mb-1">Institution *</div>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={inst}
                onChange={e => setInst(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Degree</div>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={degree}
                onChange={e => setDegree(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Start date</div>
              <input
                type="month"
                className="w-full rounded-lg border px-3 py-2"
                value={start}
                onChange={e => setStart(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">End date</div>
              <input
                type="month"
                className="w-full rounded-lg border px-3 py-2"
                value={end}
                onChange={e => setEnd(e.target.value)}
              />
            </div>
            <div className="md:col-span-2 text-right">
              <button
                onClick={() => setShowAdd(false)}
                className="px-3 py-2 rounded border mr-2 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={add}
                className="px-3 py-2 rounded bg-brand-red text-white hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Legal & Documents Step Component
function LegalDocumentsStep({ userId, form, set, formatSIN }: { userId: string; form: any; set: (k: string, v: any) => void; formatSIN: (v: string) => string }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Legal & Documents</h2>
        <p className="text-sm text-gray-500">Legal status and identification</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm text-gray-600">
            SIN/SSN <span className="text-red-600">*</span>
          </label>
          <div className={!form.sin_number ? 'ring-2 ring-red-400 rounded-lg p-0.5' : 'p-0'}>
            <input
              value={form.sin_number || ''}
              onChange={e => set('sin_number', formatSIN(e.target.value))}
              maxLength={11}
              placeholder="123-456-789"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          {!form.sin_number && <div className="text-xs text-red-600">Required</div>}
        </div>
        <div className="space-y-2">
          <label className="text-sm text-gray-600">
            Work Eligibility Status <span className="text-red-600">*</span>
          </label>
          <div className={!form.work_eligibility_status ? 'ring-2 ring-red-400 rounded-lg p-0.5' : 'p-0'}>
            <select
              value={form.work_eligibility_status || ''}
              onChange={e => set('work_eligibility_status', e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="">Select...</option>
              <option value="Canadian Citizen">Canadian Citizen</option>
              <option value="Permanent Resident">Permanent Resident</option>
              <option value="Temporary Resident (with work authorization)">Temporary Resident (with work authorization)</option>
              <option value="Other">Other</option>
            </select>
          </div>
          {!form.work_eligibility_status && <div className="text-xs text-red-600">Required</div>}
        </div>
      </div>
      <WorkEligibilityDocumentsSection 
        userId={userId} 
        canEdit={true} 
        workEligibilityStatus={form.work_eligibility_status}
      />
    </div>
  );
}

// Emergency Contacts Step Component (reused from Profile.tsx)
function EmergencyContactsStep({ userId }: { userId: string }) {
  const { data, refetch } = useQuery({
    queryKey: ['emergency-contacts', userId],
    queryFn: () => api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`)
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [workPhone, setWorkPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [addressCountry, setAddressCountry] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [eName, setEName] = useState('');
  const [eRelationship, setERelationship] = useState('');
  const [eMobilePhone, setEMobilePhone] = useState('');
  const [eWorkPhone, setEWorkPhone] = useState('');
  const [eEmail, setEEmail] = useState('');
  const [eAddress, setEAddress] = useState('');
  const [eAddressCity, setEAddressCity] = useState('');
  const [eAddressProvince, setEAddressProvince] = useState('');
  const [eAddressPostalCode, setEAddressPostalCode] = useState('');
  const [eAddressCountry, setEAddressCountry] = useState('');
  const [eIsPrimary, setEIsPrimary] = useState(false);
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  
  const isFirstContact = !data || data.length === 0;
  
  const formatPhone = (v: string) => {
    const d = String(v || '').replace(/\D+/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return `+${d.slice(0, 1)} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 11)}`;
  };
  
  const beginEdit = (c: any) => {
    setEditId(c.id);
    setEName(c.name || '');
    setERelationship(c.relationship || '');
    setEMobilePhone(c.mobile_phone || '');
    setEWorkPhone(c.work_phone || '');
    setEEmail(c.email || '');
    setEAddress(c.address || '');
    setEAddressCity(c.address_city || '');
    setEAddressProvince(c.address_province || '');
    setEAddressPostalCode(c.address_postal_code || '');
    setEAddressCountry(c.address_country || '');
    setEIsPrimary(c.is_primary || false);
  };
  
  const cancelEdit = () => {
    setEditId(null);
  };
  
  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!relationship.trim()) {
      toast.error('Relationship is required');
      return;
    }
    if (!mobilePhone.trim()) {
      toast.error('Mobile Phone is required');
      return;
    }
    
    try {
      const willBePrimary = isFirstContact || isPrimary;
      
      if (willBePrimary && data && data.length > 0) {
        const primaryContact = data.find((c: any) => c.is_primary);
        if (primaryContact) {
          await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${primaryContact.id}`, {
            is_primary: false
          });
        }
      }
      
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`, {
        name,
        relationship,
        mobile_phone: mobilePhone,
        work_phone: workPhone,
        email,
        address,
        address_city: addressCity,
        address_province: addressProvince,
        address_postal_code: addressPostalCode,
        address_country: addressCountry,
        is_primary: willBePrimary
      });
      toast.success('Emergency contact created');
      setName('');
      setRelationship('');
      setMobilePhone('');
      setWorkPhone('');
      setEmail('');
      setAddress('');
      setAddressCity('');
      setAddressProvince('');
      setAddressPostalCode('');
      setAddressCountry('');
      setIsPrimary(false);
      setCreateOpen(false);
      refetch();
      await queryClient.invalidateQueries({ queryKey: ['emergency-contacts'] });
      await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create contact');
    }
  };
  
  const handleUpdate = async (contactId: string) => {
    if (!eName.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!eRelationship.trim()) {
      toast.error('Relationship is required');
      return;
    }
    if (!eMobilePhone.trim()) {
      toast.error('Mobile Phone is required');
      return;
    }
    
    try {
      if (eIsPrimary && data && data.length > 0) {
        const primaryContact = data.find((c: any) => c.is_primary && c.id !== contactId);
        if (primaryContact) {
          await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${primaryContact.id}`, {
            is_primary: false
          });
        }
      }
      
      await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${contactId}`, {
        name: eName,
        relationship: eRelationship,
        mobile_phone: eMobilePhone,
        work_phone: eWorkPhone,
        email: eEmail,
        address: eAddress,
        address_city: eAddressCity,
        address_province: eAddressProvince,
        address_postal_code: eAddressPostalCode,
        address_country: eAddressCountry,
        is_primary: eIsPrimary
      });
      toast.success('Emergency contact updated');
      setEditId(null);
      refetch();
      await queryClient.invalidateQueries({ queryKey: ['emergency-contacts'] });
      await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update contact');
    }
  };
  
  const handleDelete = async (contactId: string) => {
    const result = await confirm({
      title: 'Delete emergency contact',
      message: 'Are you sure you want to delete this emergency contact? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${contactId}`);
      toast.success('Emergency contact deleted');
      refetch();
      await queryClient.invalidateQueries({ queryKey: ['emergency-contacts'] });
      await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete contact');
    }
  };
  
  const handleSetPrimary = async (contactId: string) => {
    try {
      if (data && data.length > 0) {
        const primaryContact = data.find((c: any) => c.is_primary && c.id !== contactId);
        if (primaryContact) {
          await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${primaryContact.id}`, {
            is_primary: false
          });
        }
      }
      
      await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${contactId}`, {
        is_primary: true
      });
      toast.success('Primary contact updated');
      refetch();
      await queryClient.invalidateQueries({ queryKey: ['emergency-contacts'] });
      await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update contact');
    }
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Emergency Contacts</h2>
        <p className="text-sm text-gray-500">
          People to contact in case of emergency. At least one contact is required.
        </p>
      </div>
      
      {(!data || data.length === 0) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-sm text-red-700">
            <strong>Required:</strong> Please add at least one emergency contact to continue.
          </div>
        </div>
      )}
      
      <div className="mb-4 flex items-center justify-between">
        <div></div>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold hover:opacity-90"
        >
          New Contact
        </button>
      </div>
      
      <div className="grid md:grid-cols-2 gap-4">
        {(data || []).map((c: any) => (
          <div key={c.id} className="rounded-xl border bg-white overflow-hidden flex">
            <div className="w-28 bg-gray-100 flex items-center justify-center">
              <div className="w-20 h-20 rounded bg-gray-200 grid place-items-center text-lg font-bold text-gray-600">
                {(c.name || '?').slice(0, 2).toUpperCase()}
              </div>
            </div>
            <div className="flex-1 p-3 text-sm">
              {editId === c.id ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Edit contact</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600">Name *</label>
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={eName}
                        onChange={e => setEName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Relationship *</label>
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={eRelationship}
                        onChange={e => setERelationship(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600">Primary</label>
                      <input
                        type="checkbox"
                        checked={eIsPrimary}
                        onChange={e => setEIsPrimary(e.target.checked)}
                        disabled={data && data.length === 1 && eIsPrimary}
                        className="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Phone *</label>
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={eMobilePhone}
                        onChange={e => setEMobilePhone(formatPhone(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Work Phone</label>
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={eWorkPhone}
                        onChange={e => setEWorkPhone(formatPhone(e.target.value))}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600">Email</label>
                      <input
                        className="border rounded px-2 py-1 w-full"
                        type="email"
                        value={eEmail}
                        onChange={e => setEEmail(e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600">Address</label>
                      <AddressAutocomplete
                        value={eAddress || ''}
                        onChange={(value) => setEAddress(value)}
                        onAddressSelect={(address) => {
                          setEAddress(address.address_line1 || '');
                          if (address.city !== undefined) setEAddressCity(address.city);
                          if (address.province !== undefined) setEAddressProvince(address.province);
                          if (address.postal_code !== undefined) setEAddressPostalCode(address.postal_code);
                          if (address.country !== undefined) setEAddressCountry(address.country);
                        }}
                        placeholder="Start typing an address..."
                        className="w-full rounded border px-2 py-1"
                      />
                    </div>
                  </div>
                  <div className="text-right space-x-2">
                    <button
                      onClick={cancelEdit}
                      className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleUpdate(c.id)}
                      className="px-2 py-1 rounded bg-brand-red text-white hover:opacity-90"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{c.name}</div>
                    <div className="flex items-center gap-2">
                      {c.is_primary && (
                        <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 rounded-full px-2">
                          Primary
                        </span>
                      )}
                      {!c.is_primary && (
                        <button
                          onClick={() => handleSetPrimary(c.id)}
                          className="px-2 py-1 rounded bg-gray-100 text-xs hover:bg-gray-200"
                        >
                          Set Primary
                        </button>
                      )}
                      <button
                        onClick={() => beginEdit(c)}
                        className="px-2 py-1 rounded bg-gray-100 text-xs hover:bg-gray-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="px-2 py-1 rounded bg-gray-100 text-xs hover:bg-gray-200"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {c.relationship && <div className="text-gray-600 text-xs mt-1">{c.relationship}</div>}
                  <div className="mt-2 space-y-1">
                    {c.mobile_phone && (
                      <div>
                        <div className="text-[11px] uppercase text-gray-500">Mobile</div>
                        <div className="text-gray-700">{c.mobile_phone}</div>
                      </div>
                    )}
                    {c.work_phone && (
                      <div>
                        <div className="text-[11px] uppercase text-gray-500">Work</div>
                        <div className="text-gray-700">{c.work_phone}</div>
                      </div>
                    )}
                    {c.email && (
                      <div>
                        <div className="text-[11px] uppercase text-gray-500">Email</div>
                        <div className="text-gray-700">{c.email}</div>
                      </div>
                    )}
                    {c.address && (
                      <div>
                        <div className="text-[11px] uppercase text-gray-500">Address</div>
                        <div className="text-gray-700">{c.address}</div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {(!data || !data.length) && (
          <div className="text-sm text-gray-600 col-span-2 py-8 text-center">
            No emergency contacts. Click "New Contact" to add one.
          </div>
        )}
      </div>
      
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[800px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">New Emergency Contact</div>
              <button
                onClick={() => {
                  setCreateOpen(false);
                  setName('');
                  setRelationship('');
                  setMobilePhone('');
                  setWorkPhone('');
                  setEmail('');
                  setAddress('');
                  setAddressCity('');
                  setAddressProvince('');
                  setAddressPostalCode('');
                  setAddressCountry('');
                  setIsPrimary(false);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
              >
                ×
              </button>
            </div>
            <div className="p-4 grid md:grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Name *</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Relationship *</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={relationship}
                  onChange={e => setRelationship(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Primary</label>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={isFirstContact || isPrimary}
                    onChange={e => setIsPrimary(e.target.checked)}
                    disabled={isFirstContact}
                    className="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-xs text-gray-600">
                    {isFirstContact ? 'Primary contact' : 'Set as primary contact'}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">Phone *</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={mobilePhone}
                  onChange={e => setMobilePhone(formatPhone(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Work Phone</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={workPhone}
                  onChange={e => setWorkPhone(formatPhone(e.target.value))}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Email</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Address</label>
                <AddressAutocomplete
                  value={address || ''}
                  onChange={(value) => setAddress(value)}
                  onAddressSelect={(address) => {
                    setAddress(address.address_line1 || '');
                    if (address.city !== undefined) setAddressCity(address.city);
                    if (address.province !== undefined) setAddressProvince(address.province);
                    if (address.postal_code !== undefined) setAddressPostalCode(address.postal_code);
                    if (address.country !== undefined) setAddressCountry(address.country);
                  }}
                  placeholder="Start typing an address..."
                  className="w-full rounded border px-3 py-2"
                />
              </div>
              <div className="col-span-2 text-right">
                <button
                  onClick={handleCreate}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold hover:opacity-90"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Work Eligibility Documents Section - always shows Visa Information and Immigration Status Document
function WorkEligibilityDocumentsSection({ userId, canEdit, workEligibilityStatus }: { userId: string; canEdit: boolean; workEligibilityStatus?: string }) {
  // Always show both sections regardless of status
  return (
    <div className="space-y-4">
      <VisaInformationSection userId={userId} canEdit={canEdit} isRequired={false} showInlineForm={false} />
      <ImmigrationStatusDocumentSection userId={userId} canEdit={canEdit} isRequired={false} />
    </div>
  );
}

// PR Card Upload Section (for Canadian Citizen and Permanent Resident)
function PRCardUploadSection({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  const { data: prCardFile, refetch } = useQuery({
    queryKey: ['pr-card-file', userId],
    queryFn: () => api<any>('GET', `/auth/users/${encodeURIComponent(userId)}/profile`),
  });
  const prCardFileId = prCardFile?.profile?.pr_card_file_id;

  const handleUpload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    
    // Validate file type
    const isPDF = f.type === 'application/pdf';
    const isImage = f.type.startsWith('image/');
    if (!isPDF && !isImage) {
      toast.error('Please upload a PDF or image file');
      return;
    }

    setUploading(true);
    try {
      const up: any = await api('POST', '/files/upload', {
        project_id: null,
        client_id: null,
        employee_id: userId,
        category_id: 'pr-card',
        original_name: f.name,
        content_type: f.type || 'application/pdf'
      });
      const put = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': f.type || 'application/pdf', 'x-ms-blob-type': 'BlockBlob' },
        body: f
      });
      if (!put.ok) throw new Error('upload failed');
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: f.size,
        checksum_sha256: 'na',
        content_type: f.type || 'application/pdf'
      });
      await api('PUT', `/auth/users/${encodeURIComponent(userId)}/profile`, {
        pr_card_file_id: conf.id
      });
      toast.success('PR Card uploaded successfully');
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
      await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to upload PR Card');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
          </svg>
        </div>
        <h5 className="font-semibold text-amber-900">PR Card (Optional)</h5>
      </div>
      {prCardFileId ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">PR Card Document</div>
              <div className="text-xs text-gray-500">Document uploaded</div>
            </div>
            <a
              href={`/files/${prCardFileId}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50"
            >
              View
            </a>
            {canEdit && (
              <button
                onClick={async () => {
                  try {
                    await api('PUT', `/auth/users/${encodeURIComponent(userId)}/profile`, { pr_card_file_id: null });
                    toast.success('PR Card removed');
                    await refetch();
                    await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
                    await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
                  } catch (e: any) {
                    toast.error(e?.message || 'Failed to remove PR Card');
                  }
                }}
                className="px-3 py-1.5 rounded border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50"
              >
                Remove
              </button>
            )}
          </div>
          {canEdit && (
            <div>
              <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleUpload} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 rounded border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Replace Document'}
              </button>
            </div>
          )}
        </div>
      ) : (
        canEdit && (
          <div>
            <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleUpload} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 rounded border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        )
      )}
    </div>
  );
}

// Helper function to get or create "Personal Documents" folder
// In onboarding, userId is always the current user, so we can use /auth/me/profile endpoints
async function getOrCreatePersonalDocumentsFolder(userId: string): Promise<string> {
  try {
    // Get all folders - use /auth/users/{userId}/folders which allows self-access
    const folders: any[] = await api('GET', `/auth/users/${encodeURIComponent(userId)}/folders`);
    // Find "Personal Documents" folder
    const personalFolder = folders.find((f: any) => f.name === 'Personal Documents');
    if (personalFolder) {
      return personalFolder.id;
    }
    // Create if doesn't exist - use /auth/users/{userId}/folders which allows self-access
    const newFolder: any = await api('POST', `/auth/users/${encodeURIComponent(userId)}/folders`, {
      name: 'Personal Documents'
    });
    return newFolder.id;
  } catch (e: any) {
    console.error('Failed to get or create Personal Documents folder:', e);
    // Don't throw - let the caller handle it gracefully
    throw e;
  }
}

// Immigration Status Document Upload Section (optional)
function ImmigrationStatusDocumentSection({ userId, canEdit, isRequired }: { userId: string; canEdit: boolean; isRequired?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  // In onboarding, userId is always the current user, so use /auth/me/profile (no permission required)
  const { data: permitFile, refetch } = useQuery({
    queryKey: ['permit-file', userId],
    queryFn: () => api<any>('GET', '/auth/me/profile'),
  });
  const permitFileId = permitFile?.profile?.permit_file_id;

  const handleUpload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    
    // Validate file type
    const isPDF = f.type === 'application/pdf';
    const isImage = f.type.startsWith('image/');
    if (!isPDF && !isImage) {
      toast.error('Please upload a PDF or image file');
      return;
    }

    setUploading(true);
    try {
      // Step 1: Get upload URL
      const up: any = await api('POST', '/files/upload', {
        project_id: null,
        client_id: null,
        employee_id: userId,
        category_id: 'permit',
        original_name: f.name,
        content_type: f.type || 'application/pdf'
      });
      
      // Step 2: Upload file to storage
      const put = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': f.type || 'application/pdf', 'x-ms-blob-type': 'BlockBlob' },
        body: f
      });
      if (!put.ok) {
        throw new Error(`Upload to storage failed: ${put.status} ${put.statusText}`);
      }
      
      // Step 3: Confirm upload
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: f.size,
        checksum_sha256: 'na',
        content_type: f.type || 'application/pdf'
      });
      
      // Step 4: Save to profile - in onboarding, userId is always the current user, so use /auth/me/profile (no permission required)
      await api('PUT', '/auth/me/profile', {
        permit_file_id: conf.id
      });
      
      // Step 5: Also add to Personal Documents folder (optional - don't fail if this fails)
      try {
        const personalFolderId = await getOrCreatePersonalDocumentsFolder(userId);
        await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, {
          folder_id: personalFolderId,
          title: `Immigration Status Document - ${f.name}`,
          file_id: conf.id
        });
      } catch (e: any) {
        console.warn('Failed to add document to Personal Documents folder (non-critical):', e);
        // Don't fail the whole upload if folder creation fails - the file is already saved to profile
        // This is a nice-to-have feature, not critical for the upload
      }
      
      toast.success('Immigration Status Document uploaded successfully');
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
      await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['user-docs', userId] });
      await queryClient.invalidateQueries({ queryKey: ['user-folders', userId] });
    } catch (e: any) {
      console.error('Upload error:', e);
      const errorMessage = e?.message || e?.toString() || 'Failed to upload Immigration Status Document';
      toast.error(errorMessage);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
          </svg>
        </div>
        <h5 className="font-semibold text-amber-900">Immigration Status Document {isRequired && <span className="text-red-600">*</span>}</h5>
      </div>
      <div className="text-xs text-gray-500 mb-3">Examples: Work Permit, Study Permit, PGWP, PR Card...</div>
      {permitFileId ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">Immigration Status Document</div>
              <div className="text-xs text-gray-500">Document uploaded</div>
            </div>
            <a
              href={`/files/${permitFileId}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50"
            >
              View
            </a>
            {canEdit && (
              <button
                onClick={async () => {
                  try {
                    // In onboarding, userId is always the current user, so use /auth/me/profile
                    await api('PUT', '/auth/me/profile', { permit_file_id: null });
                    toast.success('Immigration Status Document removed');
                    await refetch();
                    await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
                    await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
                  } catch (e: any) {
                    toast.error(e?.message || 'Failed to remove Immigration Status Document');
                  }
                }}
                className="px-3 py-1.5 rounded border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50"
              >
                Remove
              </button>
            )}
          </div>
          {canEdit && (
            <div>
              <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleUpload} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 rounded border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Replace Document'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div>
          {canEdit ? (
            <>
              <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleUpload} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 rounded border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload Document'}
              </button>
              {isRequired && !permitFileId && (
                <div className="text-xs text-red-600 mt-1">Immigration Status Document is required</div>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-600">No permit document uploaded</div>
          )}
        </div>
      )}
    </div>
  );
}

// Visa Information Section (reused from Profile.tsx but simplified for wizard)
function VisaInformationSection({ userId, canEdit, isRequired = false, showInlineForm = false }: { userId: string; canEdit: boolean; isRequired?: boolean; showInlineForm?: boolean }) {
  const { data, refetch } = useQuery({
    queryKey: ['employee-visas', userId],
    queryFn: () => api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/visas`)
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [visaType, setVisaType] = useState('');
  const [visaNumber, setVisaNumber] = useState('');
  const [issuingCountry, setIssuingCountry] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [status, setStatus] = useState('Active');
  const [notes, setNotes] = useState('');
  const [eVisaType, setEVisaType] = useState('');
  const [eVisaNumber, setEVisaNumber] = useState('');
  const [eIssuingCountry, setEIssuingCountry] = useState('');
  const [eIssuedDate, setEIssuedDate] = useState('');
  const [eExpiryDate, setEExpiryDate] = useState('');
  const [eStatus, setEStatus] = useState('Active');
  const [eNotes, setENotes] = useState('');
  const confirm = useConfirm();
  
  const getDateForInput = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };
  
  const beginEdit = (v: any) => {
    setEditId(v.id);
    setEVisaType(v.visa_type || '');
    setEVisaNumber(v.visa_number || '');
    setEIssuingCountry(v.issuing_country || '');
    setEIssuedDate(getDateForInput(v.issued_date));
    setEExpiryDate(getDateForInput(v.expiry_date));
    setEStatus(v.status || 'Active');
    setENotes(v.notes || '');
  };
  
  const cancelEdit = () => {
    setEditId(null);
  };
  
  const handleCreate = async () => {
    if (!visaType.trim()) {
      toast.error('Visa type is required');
      return;
    }
    try {
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/visas`, {
        visa_type: visaType,
        visa_number: visaNumber,
        issuing_country: issuingCountry,
        issued_date: issuedDate || null,
        expiry_date: expiryDate || null,
        status: status,
        notes: notes
      });
      toast.success('Visa entry created');
      setVisaType('');
      setVisaNumber('');
      setIssuingCountry('');
      setIssuedDate('');
      setExpiryDate('');
      setStatus('Active');
      setNotes('');
      setCreateOpen(false);
      await refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create visa entry');
    }
  };
  
  const handleUpdate = async (visaId: string) => {
    if (!eVisaType.trim()) {
      toast.error('Visa type is required');
      return;
    }
    try {
      await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/visas/${visaId}`, {
        visa_type: eVisaType,
        visa_number: eVisaNumber,
        issuing_country: eIssuingCountry,
        issued_date: eIssuedDate || null,
        expiry_date: eExpiryDate || null,
        status: eStatus,
        notes: eNotes
      });
      toast.success('Visa entry updated');
      setEditId(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update visa entry');
    }
  };
  
  const handleDelete = async (visaId: string) => {
    const ok = await confirm({ title: 'Delete visa', message: 'Are you sure you want to delete this visa entry?' });
    if (!ok) return;
    try {
      await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/visas/${visaId}`);
      toast.success('Visa entry deleted');
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete visa entry');
    }
  };
  
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
            </svg>
          </div>
          <h5 className="font-semibold text-amber-900">Visa Information {isRequired && <span className="text-red-600">*</span>}</h5>
        </div>
        {canEdit && !showInlineForm && (
          <button
            onClick={() => setCreateOpen(true)}
            className="px-3 py-1.5 rounded border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50"
          >
            Add Entry
          </button>
        )}
      </div>
      
      {data && data.length > 0 ? (
        <div className="space-y-2">
          {data.map((v: any) => {
            const isEditing = editId === v.id;
            return isEditing ? (
              <div key={v.id} className="border rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600">Visa Type *</label>
                    <input
                      className="border rounded px-2 py-1 w-full text-sm"
                      value={eVisaType}
                      onChange={e => setEVisaType(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Visa Number</label>
                    <input
                      className="border rounded px-2 py-1 w-full text-sm"
                      value={eVisaNumber}
                      onChange={e => setEVisaNumber(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Issuing Country</label>
                    <input
                      className="border rounded px-2 py-1 w-full text-sm"
                      value={eIssuingCountry}
                      onChange={e => setEIssuingCountry(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Status</label>
                    <select
                      className="border rounded px-2 py-1 w-full text-sm"
                      value={eStatus}
                      onChange={e => setEStatus(e.target.value)}
                    >
                      <option value="Active">Active</option>
                      <option value="Expired">Expired</option>
                      <option value="Pending">Pending</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Issued Date</label>
                    <input
                      type="date"
                      className="border rounded px-2 py-1 w-full text-sm"
                      value={eIssuedDate}
                      onChange={e => setEIssuedDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Expiry Date</label>
                    <input
                      type="date"
                      className="border rounded px-2 py-1 w-full text-sm"
                      value={eExpiryDate}
                      onChange={e => setEExpiryDate(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-600">Notes</label>
                    <textarea
                      className="border rounded px-2 py-1 w-full text-sm"
                      value={eNotes}
                      onChange={e => setENotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
                <div className="text-right space-x-2">
                  <button onClick={cancelEdit} className="px-2 py-1 rounded bg-gray-100 text-xs hover:bg-gray-200">
                    Cancel
                  </button>
                  <button
                    onClick={() => handleUpdate(v.id)}
                    className="px-2 py-1 rounded bg-amber-600 text-white text-xs hover:opacity-90"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div key={v.id} className="border rounded-lg p-3 flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium">{v.visa_type}</div>
                  <div className="text-sm text-gray-600">
                    {v.visa_number && `#${v.visa_number}`} {v.issuing_country && `· ${v.issuing_country}`}
                  </div>
                  <div className="text-xs text-gray-500">
                    {v.issued_date ? String(v.issued_date).slice(0, 10) : ''}
                    {v.issued_date && v.expiry_date ? ' — ' : ''}
                    {v.expiry_date ? String(v.expiry_date).slice(0, 10) : ''}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => beginEdit(v)}
                      className="px-2 py-1 rounded bg-gray-100 text-xs hover:bg-gray-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(v.id)}
                      className="px-2 py-1 rounded bg-gray-100 text-xs hover:bg-gray-200"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-gray-600 py-4 text-center">
          {isRequired ? 'Visa information is required' : 'No visa information. This is optional.'}
        </div>
      )}
      
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">Add Visa Entry</div>
              <button
                onClick={() => {
                  setCreateOpen(false);
                  setVisaType('');
                  setVisaNumber('');
                  setIssuingCountry('');
                  setIssuedDate('');
                  setExpiryDate('');
                  setStatus('Active');
                  setNotes('');
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
              >
                ×
              </button>
            </div>
            <div className="p-4 grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">Visa Type *</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={visaType}
                  onChange={e => setVisaType(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Visa Number</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={visaNumber}
                  onChange={e => setVisaNumber(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Issuing Country</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={issuingCountry}
                  onChange={e => setIssuingCountry(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Status</label>
                <select
                  className="border rounded px-3 py-2 w-full"
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                >
                  <option value="Active">Active</option>
                  <option value="Expired">Expired</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">Issued Date</label>
                <input
                  type="date"
                  className="border rounded px-3 py-2 w-full"
                  value={issuedDate}
                  onChange={e => setIssuedDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Expiry Date</label>
                <input
                  type="date"
                  className="border rounded px-3 py-2 w-full"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Notes</label>
                <textarea
                  className="border rounded px-3 py-2 w-full"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="col-span-2 text-right">
                <button
                  onClick={handleCreate}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold hover:opacity-90"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

