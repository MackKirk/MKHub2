import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Mail, MapPin, Phone } from 'lucide-react';
import { api, withFileAccessToken } from '@/lib/api';
import { logoutSession } from '@/lib/logoutSession';
import toast from 'react-hot-toast';
import NationalitySelect from '@/components/NationalitySelect';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import PostalCodeAutocomplete from '@/components/PostalCodeAutocomplete';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppCombobox,
  AppControlLabelRow,
  AppDatePicker,
  AppEmptyState,
  AppFileUpload,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppPageHeader,
  AppSectionHeader,
  AppSelect,
  AppTextarea,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type ProfileResp = { user: { username: string; email: string; first_name?: string; last_name?: string }, profile?: any };

const LOGO_SRC = '/ui/assets/login/logo-light.svg';

const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' },
  { value: 'Prefer not to say', label: 'Prefer not to say' },
];

const MARITAL_STATUS_OPTIONS = [
  { value: 'Single', label: 'Single' },
  { value: 'Married', label: 'Married' },
  { value: 'Common-law', label: 'Common-law' },
  { value: 'Divorced', label: 'Divorced' },
  { value: 'Widowed', label: 'Widowed' },
  { value: 'Prefer not to say', label: 'Prefer not to say' },
];

const WORK_ELIGIBILITY_OPTIONS = [
  { value: 'Canadian Citizen', label: 'Canadian Citizen' },
  { value: 'Permanent Resident', label: 'Permanent Resident' },
  { value: 'Temporary Resident (with work authorization)', label: 'Temporary Resident (with work authorization)' },
  { value: 'Other', label: 'Other' },
];

const VISA_STATUS_OPTIONS = [
  { value: 'Active', label: 'Active' },
  { value: 'Expired', label: 'Expired' },
  { value: 'Pending', label: 'Pending' },
];

const ADDRESS_INPUT_CLASS =
  'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400';

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

  const STEP_LABELS: Record<number, string> = {
    1: 'Basic Information',
    2: 'Address',
    3: 'Contact',
    4: 'Education',
    5: 'Legal & Documents',
    6: 'Emergency Contacts',
  };
  
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

  /** Fields required to enter the Hub (must match isOnboardingComplete / AppShell). */
  const HUB_REQUIRED_FIELDS = [
    'gender',
    'date_of_birth',
    'marital_status',
    'nationality',
    'phone',
    'address_line1',
    'city',
    'province',
    'postal_code',
    'country',
    'sin_number',
    'work_eligibility_status',
  ] as const;

  /** Which wizard steps still block "Save and continue to the Hub". */
  const getHubIncompleteSteps = useCallback((): number[] => {
    const steps = new Set<number>();
    const fieldToStep: Record<string, number> = {
      gender: 1,
      date_of_birth: 1,
      marital_status: 1,
      nationality: 1,
      address_line1: 2,
      city: 2,
      province: 2,
      postal_code: 2,
      country: 2,
      phone: 3,
      sin_number: 5,
      work_eligibility_status: 5,
    };
    for (const field of HUB_REQUIRED_FIELDS) {
      const value = String((form as any)[field] || '').trim();
      if (!value) {
        steps.add(fieldToStep[field] ?? 1);
      }
    }
    if (userId) {
      if (emergencyContactsLoading || emergencyContactsData === undefined) {
        steps.add(6);
      } else if (!hasEmergencyContact) {
        steps.add(6);
      }
    }
    return Array.from(steps).sort((a, b) => a - b);
  }, [form, userId, emergencyContactsLoading, emergencyContactsData, hasEmergencyContact]);
  
  // Required fields for each step
  const stepRequiredFields: Record<number, string[]> = {
    1: ['gender', 'date_of_birth', 'marital_status', 'nationality'],
    2: ['address_line1', 'city', 'province', 'postal_code', 'country'],
    3: ['phone'],
    4: [], // Education is optional
    5: ['sin_number', 'work_eligibility_status'], // SIN/SSN and Work Eligibility Status are required
    6: [], // Emergency contacts checked separately
  };
  
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
  
  // Handle next step — always move forward (no per-step validation); save best-effort
  const handleNext = async () => {
    if (currentStep >= totalSteps) return;
    try {
      await saveProfile();
    } catch {
      // Still advance so the user can move freely between steps
    }
    setCurrentStep((s) => Math.min(s + 1, totalSteps));
  };

  const handleSaveAndContinueToHub = async () => {
    const incomplete = getHubIncompleteSteps();
    if (incomplete.length > 0) {
      const detail = incomplete.map((s) => `Step ${s} (${STEP_LABELS[s]})`).join(', ');
      toast.error(
        `Please complete all required fields before continuing to the Hub. Missing information in: ${detail}.`
      );
      return;
    }
    try {
      await saveProfile();
      await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
      await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['emergency-contacts', userId] });
      await queryClient.invalidateQueries({ queryKey: ['me-onboarding-docs'] });
      await queryClient.invalidateQueries({ queryKey: ['me-onboarding-status'] });
      toast.success('Profile saved. Welcome to the Hub.');
      navigate('/home', { replace: true });
    } catch {
      // saveProfile already toasts
    }
  };

  // Handle previous step — save best-effort, always go back when not on step 1
  const handlePrevious = async () => {
    if (currentStep <= 1) return;
    try {
      await saveProfile();
    } catch {
      // User can still go back
    }
    setCurrentStep((s) => Math.max(s - 1, 1));
  };

  const handleJumpToStep = async (step: number) => {
    if (step < 1 || step > totalSteps || step === currentStep || saving) return;
    try {
      await saveProfile();
    } catch {
      // Still jump — same as Next/Previous
    }
    setCurrentStep(step);
  };
  
  const countryOptions = useMemo(
    () => countries.map((c) => ({ value: c.name, label: c.name })),
    [countries],
  );
  const provinceOptions = useMemo(
    () => provinces.map((p) => ({ value: p, label: p })),
    [provinces],
  );
  const cityOptions = useMemo(
    () => cities.map((c) => ({ value: c, label: c })),
    [cities],
  );

  if (meLoading || profileLoading || !userId) {
    return (
      <div className={uiCx('flex min-h-screen items-center justify-center bg-gray-50')}>
        <div className={uiTypography.helper}>Loading...</div>
      </div>
    );
  }

  const stepFooter = (
    <div className={uiCx('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between')}>
      <AppButton type="button" variant="secondary" size="sm" onClick={handlePrevious} disabled={currentStep === 1}>
        Previous
      </AppButton>
      <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
        {currentStep < totalSteps ? (
          <AppButton type="button" size="sm" disabled={saving} loading={saving} onClick={handleNext}>
            {saving ? 'Saving...' : 'Next'}
          </AppButton>
        ) : null}
        <AppButton type="button" variant="secondary" size="sm" disabled={saving} loading={saving} onClick={handleSaveAndContinueToHub}>
          {saving ? 'Saving...' : 'Go to the Hub!'}
        </AppButton>
      </div>
    </div>
  );
  
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <main className={uiCx('mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6', uiSpacing.pageY, uiSpacing.pageStack, 'pb-10')}>
        <AppPageHeader
          title="Profile onboarding"
          subtitle="MK Hub · HR"
          icon={
            <img
              src={LOGO_SRC}
              alt="Company"
              className="h-10 w-auto max-w-[160px] object-contain object-left"
            />
          }
          iconClassName={uiCx('flex h-12 shrink-0 items-center justify-center bg-transparent p-0', uiRadius.control)}
          actions={
            <AppButton type="button" variant="secondary" size="sm" onClick={() => logoutSession(queryClient, navigate)}>
              Logout
            </AppButton>
          }
        />

        <AppCard
          title="Your progress"
          actions={
            <div className="text-right">
              <div className={uiTypography.overline}>Progress</div>
              <div className={uiCx(uiTypography.helper, 'mt-0.5 font-medium text-gray-800')}>
                Step {currentStep} of {totalSteps}
              </div>
            </div>
          }
        >
          <div className="flex w-full gap-1" role="tablist" aria-label="Onboarding steps">
            {Array.from({ length: totalSteps }, (_, i) => {
              const step = i + 1;
              const reached = step <= currentStep;
              const isCurrent = step === currentStep;
              return (
                <button
                  key={step}
                  type="button"
                  role="tab"
                  aria-selected={isCurrent}
                  aria-current={isCurrent ? 'step' : undefined}
                  disabled={saving}
                  onClick={() => handleJumpToStep(step)}
                  title={STEP_LABELS[step]}
                  className={uiCx(
                    'min-h-[10px] flex-1 rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-50',
                    reached ? 'bg-gradient-to-r from-brand-red to-[#ee2b2b]' : 'bg-gray-200',
                    isCurrent ? 'ring-2 ring-brand-red ring-offset-2 ring-offset-white' : 'cursor-pointer hover:brightness-95',
                  )}
                />
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-xs sm:grid-cols-3 md:grid-cols-6">
            {Array.from({ length: totalSteps }, (_, i) => {
              const step = i + 1;
              const isCurrent = step === currentStep;
              return (
                <button
                  key={step}
                  type="button"
                  disabled={saving}
                  onClick={() => handleJumpToStep(step)}
                  className={uiCx(
                    'rounded-md px-1.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    isCurrent ? 'bg-red-50 font-semibold text-brand-red' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <span className="sr-only">Step {step}: </span>
                  {STEP_LABELS[step]}
                </button>
              );
            })}
          </div>
        </AppCard>

        <AppCard footer={stepFooter}>
          {/* Step 1: Basic Information */}
          {currentStep === 1 && (
            <div className={uiSpacing.sectionStack}>
              <AppSectionHeader title="Basic Information" description="Core personal details" />
              <div className="grid gap-4 md:grid-cols-2">
                <AppInput
                  label="First name"
                  value={form.first_name || ''}
                  onChange={(e) => set('first_name', e.target.value)}
                />
                <AppInput
                  label="Last name"
                  value={form.last_name || ''}
                  onChange={(e) => set('last_name', e.target.value)}
                />
                <AppInput
                  label="Middle name"
                  value={form.middle_name || ''}
                  onChange={(e) => set('middle_name', e.target.value)}
                />
                <AppInput
                  label="Preferred name"
                  value={form.prefered_name || ''}
                  onChange={(e) => set('prefered_name', e.target.value)}
                />
                <AppSelect
                  label="Gender *"
                  placeholder="Select..."
                  value={form.gender || ''}
                  onChange={(e) => set('gender', e.target.value)}
                  options={GENDER_OPTIONS}
                />
                <AppSelect
                  label="Marital status *"
                  placeholder="Select..."
                  value={form.marital_status || ''}
                  onChange={(e) => set('marital_status', e.target.value)}
                  options={MARITAL_STATUS_OPTIONS}
                />
                <AppDatePicker
                  label="Date of birth *"
                  value={form.date_of_birth ? String(form.date_of_birth).slice(0, 10) : ''}
                  onChange={(e) => set('date_of_birth', e.target.value)}
                />
                <div className="space-y-1.5">
                  <AppControlLabelRow label="Nationality *" />
                  <NationalitySelect value={form.nationality || ''} onChange={(v) => set('nationality', v)} />
                </div>
              </div>
            </div>
          )}
          
          {/* Step 2: Address */}
          {currentStep === 2 && (
            <div className={uiSpacing.sectionStack}>
              <AppSectionHeader title="Address" description="Home address for contact and records" />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <AppControlLabelRow label="Address line 1 *" />
                  <AddressAutocomplete
                    key="address-line1-onboarding"
                    value={form.address_line1 || ''}
                    onChange={handleAddressChange}
                    onAddressSelect={handleAddressSelect}
                    placeholder="Start typing an address..."
                    className={ADDRESS_INPUT_CLASS}
                  />
                </div>
                <AppInput
                  label="Complement (e.g., Apt, Unit, Basement)"
                  value={form.address_line1_complement || ''}
                  onChange={(e) => set('address_line1_complement', e.target.value)}
                  placeholder="Apt 101, Unit 2, Basement, etc."
                />
                <AppCombobox
                  label="Country *"
                  value={form.country || ''}
                  onChange={handleCountryChange}
                  options={countryOptions}
                  placeholder={loadingStates ? 'Loading...' : 'Search country...'}
                  disabled={loadingStates}
                  leftIcon={null}
                />
                <AppCombobox
                  label="Province/State *"
                  value={form.province || ''}
                  onChange={handleProvinceChange}
                  options={provinceOptions}
                  placeholder={
                    loadingStates ? 'Loading...' : form.country ? 'Search province/state...' : 'Select country first'
                  }
                  disabled={!form.country || loadingStates || loadingCities}
                  leftIcon={null}
                />
                <AppCombobox
                  label="City *"
                  value={form.city || ''}
                  onChange={(v) => set('city', v)}
                  options={cityOptions}
                  placeholder={loadingCities ? 'Loading...' : form.province ? 'Search city...' : 'Select province first'}
                  disabled={!form.country || !form.province || loadingCities}
                  leftIcon={null}
                />
                <div className="space-y-1.5">
                  <AppControlLabelRow label="Postal code *" />
                  <PostalCodeAutocomplete
                    value={form.postal_code || ''}
                    onChange={(value) => set('postal_code', value)}
                    onPostalCodeSelect={handlePostalCodeSelect}
                    placeholder="Enter postal code..."
                    className={ADDRESS_INPUT_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <AppControlLabelRow label="Address line 2" />
                  <AddressAutocomplete
                    value={form.address_line2 || ''}
                    onChange={(value) => set('address_line2', value)}
                    placeholder="Start typing an address..."
                    className={ADDRESS_INPUT_CLASS}
                  />
                </div>
                <AppInput
                  label="Complement (e.g., Apt, Unit, Basement)"
                  value={form.address_line2_complement || ''}
                  onChange={(e) => set('address_line2_complement', e.target.value)}
                  placeholder="Apt 101, Unit 2, Basement, etc."
                />
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className={uiSpacing.sectionStack}>
              <AppSectionHeader title="Contact" description="How we can reach you" />
              <div className="grid gap-4 md:grid-cols-2">
                <AppInput
                  label="Phone 1 *"
                  value={form.phone || ''}
                  onChange={(e) => set('phone', formatPhone(e.target.value))}
                />
                <AppInput
                  label="Phone 2"
                  value={form.mobile_phone || ''}
                  onChange={(e) => set('mobile_phone', formatPhone(e.target.value))}
                />
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
          {currentStep === 6 && userId && <EmergencyContactsStep userId={userId} />}
        </AppCard>
      </main>
    </div>
  );
}

function formatEducationPeriod(start?: string | null, end?: string | null): string {
  const fmt = (d?: string | null) => {
    if (!d) return '';
    try {
      const iso = d.length === 7 ? `${d}-01` : d;
      return new Date(iso).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' });
    } catch {
      return String(d).slice(0, 7);
    }
  };
  const from = fmt(start);
  const to = fmt(end);
  if (from && to) return `${from} — ${to}`;
  if (from) return `${from} — Present`;
  return to || '—';
}

// Education Step Component
function EducationStep({ userId }: { userId: string }) {
  const confirm = useConfirm();
  const { data: rows, refetch, isLoading } = useQuery({
    queryKey: ['education', userId],
    queryFn: () => api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/education`),
  });
  const [showAdd, setShowAdd] = useState(false);
  const [inst, setInst] = useState('');
  const [degree, setDegree] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const resetAddForm = () => {
    setInst('');
    setDegree('');
    setStart('');
    setEnd('');
  };

  const add = async () => {
    if (isSaving) return;
    try {
      if (!inst.trim()) {
        toast.error('Institution required');
        return;
      }
      setIsSaving(true);
      const startDate = start ? `${start.slice(0, 7)}-01` : null;
      const endDate = end ? `${end.slice(0, 7)}-01` : null;
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/education`, {
        college_institution: inst,
        degree,
        start_date: startDate,
        end_date: endDate,
      });
      toast.success('Added');
      setShowAdd(false);
      resetAddForm();
      await refetch();
    } catch (_e) {
      toast.error('Failed');
    } finally {
      setIsSaving(false);
    }
  };

  const del = async (id: string) => {
    const result = await confirm({
      title: 'Delete education record',
      message: 'Remove this school or degree from the profile?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/education/${encodeURIComponent(id)}`);
      toast.success('Deleted');
      await refetch();
    } catch (_e) {
      toast.error('Failed');
    }
  };

  const renderEducationFormFields = () => (
    <div className="grid gap-2.5 md:grid-cols-2">
      <AppInput label="Institution *" value={inst} onChange={(e) => setInst(e.target.value)} />
      <AppInput label="Degree" value={degree} onChange={(e) => setDegree(e.target.value)} />
      <AppDatePicker label="Start date" value={start} onChange={(e) => setStart(e.target.value)} />
      <AppDatePicker label="End date" value={end} onChange={(e) => setEnd(e.target.value)} />
    </div>
  );

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader title="Education" description="Academic history (optional)" />
      {isLoading ? (
        <div className={uiCx('h-28 animate-pulse rounded-lg bg-gray-100', uiRadius.control)} />
      ) : (
        <div className="flex flex-col gap-3">
          <AppListCreateItem label="Add education" layout="row" className="w-full" onClick={() => setShowAdd(true)} />
          {!(rows || []).length ? (
            <AppEmptyState
              title="No education records yet"
              description='Add schools and degrees using "Add education" above.'
              className="border-0 bg-transparent p-0 py-6 shadow-none"
            />
          ) : (
            (rows || []).map((e: any) => (
              <AppCard key={e.id} bodyClassName="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className={uiTypography.sectionTitle}>{e.college_institution || 'Institution'}</div>
                    <div className={uiTypography.helper}>
                      {[e.degree, e.major_specialization].filter(Boolean).join(' · ') || '—'}
                    </div>
                    <div className={uiCx(uiTypography.helper, 'mt-1 text-gray-500')}>
                      {formatEducationPeriod(e.start_date, e.end_date)}
                    </div>
                  </div>
                  <AppListRowIconButton preset="delete" label="Delete record" onClick={() => del(e.id)} />
                </div>
              </AppCard>
            ))
          )}
        </div>
      )}

      <AppFormModal
        open={showAdd}
        onClose={() => {
          setShowAdd(false);
          resetAddForm();
        }}
        title="Add education"
        description="School, degree, and study dates."
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowAdd(false);
                resetAddForm();
              }}
            >
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" disabled={isSaving} loading={isSaving} onClick={add}>
              {isSaving ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        {renderEducationFormFields()}
      </AppFormModal>
    </div>
  );
}

// Legal & Documents Step Component
function LegalDocumentsStep({ userId, form, set, formatSIN }: { userId: string; form: any; set: (k: string, v: any) => void; formatSIN: (v: string) => string }) {
  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader title="Legal & Documents" description="Legal status and identification" />
      <div className="grid gap-4 md:grid-cols-2">
        <AppInput
          label="SIN/SSN *"
          value={form.sin_number || ''}
          onChange={(e) => set('sin_number', formatSIN(e.target.value))}
          maxLength={11}
          placeholder="123-456-789"
        />
        <AppSelect
          label="Work Eligibility Status *"
          placeholder="Select..."
          value={form.work_eligibility_status || ''}
          onChange={(e) => set('work_eligibility_status', e.target.value)}
          options={WORK_ELIGIBILITY_OPTIONS}
        />
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
  
  const resetCreateForm = () => {
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
  };

  const renderContactFormFields = (mode: 'create' | 'edit') => {
    const isCreate = mode === 'create';
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <AppInput
          className="md:col-span-2"
          label="Name *"
          value={isCreate ? name : eName}
          onChange={(e) => (isCreate ? setName : setEName)(e.target.value)}
        />
        <AppInput
          label="Relationship *"
          value={isCreate ? relationship : eRelationship}
          onChange={(e) => (isCreate ? setRelationship : setERelationship)(e.target.value)}
        />
        <AppCheckbox
          label={isFirstContact && isCreate ? 'Primary contact' : 'Set as primary contact'}
          checked={isCreate ? isFirstContact || isPrimary : eIsPrimary}
          onChange={isCreate ? setIsPrimary : setEIsPrimary}
          disabled={isCreate ? isFirstContact : Boolean(data && data.length === 1 && eIsPrimary)}
        />
        <AppInput
          label="Phone *"
          value={isCreate ? mobilePhone : eMobilePhone}
          onChange={(e) => (isCreate ? setMobilePhone : setEMobilePhone)(formatPhone(e.target.value))}
        />
        <AppInput
          label="Work Phone"
          value={isCreate ? workPhone : eWorkPhone}
          onChange={(e) => (isCreate ? setWorkPhone : setEWorkPhone)(formatPhone(e.target.value))}
        />
        <AppInput
          className="md:col-span-2"
          label="Email"
          type="email"
          value={isCreate ? email : eEmail}
          onChange={(e) => (isCreate ? setEmail : setEEmail)(e.target.value)}
        />
        <div className="space-y-1.5 md:col-span-2">
          <AppControlLabelRow label="Address" />
          <AddressAutocomplete
            value={(isCreate ? address : eAddress) || ''}
            onChange={(value) => (isCreate ? setAddress : setEAddress)(value)}
            onAddressSelect={(addr) => {
              if (isCreate) {
                setAddress(addr.address_line1 || '');
                if (addr.city !== undefined) setAddressCity(addr.city);
                if (addr.province !== undefined) setAddressProvince(addr.province);
                if (addr.postal_code !== undefined) setAddressPostalCode(addr.postal_code);
                if (addr.country !== undefined) setAddressCountry(addr.country);
              } else {
                setEAddress(addr.address_line1 || '');
                if (addr.city !== undefined) setEAddressCity(addr.city);
                if (addr.province !== undefined) setEAddressProvince(addr.province);
                if (addr.postal_code !== undefined) setEAddressPostalCode(addr.postal_code);
                if (addr.country !== undefined) setEAddressCountry(addr.country);
              }
            }}
            placeholder="Start typing an address..."
            className={ADDRESS_INPUT_CLASS}
          />
        </div>
      </div>
    );
  };

  const contacts = data || [];

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Emergency Contacts"
        description="People to contact in case of emergency. At least one contact is required."
      />

      {contacts.length === 0 ? (
        <AppCard bodyClassName="border-red-200 bg-red-50">
          <p className={uiCx(uiTypography.helper, 'text-red-700')}>
            <strong>Required:</strong> Please add at least one emergency contact to continue.
          </p>
        </AppCard>
      ) : null}

      <AppListCreateItem label="New Contact" layout="row" className="w-full" onClick={() => setCreateOpen(true)} />

      {contacts.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {contacts.map((c: any) => {
            const phoneEntries = [
              c.mobile_phone ? { label: 'Mobile', value: c.mobile_phone } : null,
              c.work_phone ? { label: 'Work', value: c.work_phone } : null,
            ].filter(Boolean) as { label: string; value: string }[];

            return (
              <AppCard
                key={c.id}
                bodyClassName="p-4"
                className={uiCx('cursor-pointer transition-colors hover:border-gray-300')}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => beginEdit(c)}
                >
                  <div
                    className={uiCx(
                      'flex h-11 w-11 shrink-0 items-center justify-center text-sm font-semibold text-gray-600',
                      uiRadius.control,
                      'bg-gradient-to-br from-gray-100 to-gray-200',
                    )}
                  >
                    {(c.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={uiTypography.sectionTitle}>{c.name || '—'}</span>
                      {c.is_primary ? <AppBadge variant="neutral">Primary</AppBadge> : null}
                    </div>
                    {c.relationship ? <p className={uiCx(uiTypography.helper, 'truncate')}>{c.relationship}</p> : null}
                    <div className={uiCx('mt-1 flex flex-col gap-0.5', uiTypography.helper)}>
                      {c.email ? (
                        <span className="inline-flex min-w-0 items-center gap-1 truncate text-gray-600">
                          <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                          <span className="truncate">{c.email}</span>
                        </span>
                      ) : null}
                      {phoneEntries.map((phone) => (
                        <span key={`${c.id}-${phone.label}`} className="inline-flex min-w-0 items-center gap-1 truncate text-gray-600">
                          <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                          <span className="truncate">
                            {phoneEntries.length > 1 ? `${phone.label}: ` : ''}
                            {phone.value}
                          </span>
                        </span>
                      ))}
                      {c.address ? (
                        <span className="inline-flex min-w-0 items-start gap-1 text-gray-600">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                          <span className="line-clamp-2">{c.address}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
                {!c.is_primary ? (
                  <div className={uiCx(uiLayout.actionsRow, 'mt-3 justify-end border-t border-gray-100 pt-3')}>
                    <AppButton type="button" variant="ghost" size="sm" onClick={() => handleSetPrimary(c.id)}>
                      Set Primary
                    </AppButton>
                    <AppButton type="button" variant="ghost" size="sm" onClick={() => beginEdit(c)}>
                      Edit
                    </AppButton>
                    <AppButton type="button" variant="ghost" size="sm" onClick={() => handleDelete(c.id)}>
                      Delete
                    </AppButton>
                  </div>
                ) : (
                  <div className={uiCx(uiLayout.actionsRow, 'mt-3 justify-end border-t border-gray-100 pt-3')}>
                    <AppButton type="button" variant="ghost" size="sm" onClick={() => beginEdit(c)}>
                      Edit
                    </AppButton>
                    <AppButton type="button" variant="ghost" size="sm" onClick={() => handleDelete(c.id)}>
                      Delete
                    </AppButton>
                  </div>
                )}
              </AppCard>
            );
          })}
        </div>
      ) : (
        <AppEmptyState
          title="No emergency contacts"
          description='Click "New Contact" above to add one.'
          className="border-0 bg-transparent p-0 py-6 shadow-none"
        />
      )}

      <AppFormModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetCreateForm();
        }}
        title="New Emergency Contact"
        description="Add a person to call in an emergency."
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setCreateOpen(false);
                resetCreateForm();
              }}
            >
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleCreate}>
              Create
            </AppButton>
          </div>
        }
      >
        {renderContactFormFields('create')}
      </AppFormModal>

      <AppFormModal
        open={editId !== null}
        onClose={cancelEdit}
        title="Edit Emergency Contact"
        description="Update contact details or mark as primary."
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={cancelEdit}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={() => editId && handleUpdate(editId)}>
              Save
            </AppButton>
          </div>
        }
      >
        {renderContactFormFields('edit')}
      </AppFormModal>
    </div>
  );
}

// Work Eligibility Documents Section — visa & immigration hidden for Canadian citizens
function WorkEligibilityDocumentsSection({ userId, canEdit, workEligibilityStatus }: { userId: string; canEdit: boolean; workEligibilityStatus?: string }) {
  const hideVisaAndImmigration = (workEligibilityStatus || '').trim() === 'Canadian Citizen';
  if (hideVisaAndImmigration) return null;

  return (
    <div className={uiSpacing.sectionStack}>
      <VisaInformationSection userId={userId} canEdit={canEdit} isRequired={false} showInlineForm={false} />
      <ImmigrationStatusDocumentSection userId={userId} canEdit={canEdit} isRequired={false} />
    </div>
  );
}

// PR Card Upload Section (for Canadian Citizen and Permanent Resident)
function PRCardUploadSection({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const [uploading, setUploading] = useState(false);
  const [stagingFile, setStagingFile] = useState<File | null>(null);
  const queryClient = useQueryClient();
  const { data: prCardFile, refetch } = useQuery({
    queryKey: ['pr-card-file', userId],
    queryFn: () => api<any>('GET', `/auth/users/${encodeURIComponent(userId)}/profile`),
  });
  const prCardFileId = prCardFile?.profile?.pr_card_file_id;

  const uploadFile = async (f: File) => {
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
        content_type: f.type || 'application/pdf',
      });
      const put = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': f.type || 'application/pdf', 'x-ms-blob-type': 'BlockBlob' },
        body: f,
      });
      if (!put.ok) throw new Error('upload failed');
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: f.size,
        checksum_sha256: 'na',
        content_type: f.type || 'application/pdf',
      });
      await api('PUT', `/auth/users/${encodeURIComponent(userId)}/profile`, {
        pr_card_file_id: conf.id,
      });
      toast.success('PR Card uploaded successfully');
      setStagingFile(null);
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
      await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to upload PR Card');
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppCard bodyClassName={uiSpacing.sectionStack}>
      <AppSectionHeader title="PR Card (Optional)" />
      {prCardFileId ? (
        <div className={uiCx(uiColors.surfaceSubtle, uiRadius.control, 'flex flex-wrap items-center gap-3 p-3')}>
          <div className="min-w-0 flex-1">
            <div className={uiTypography.sectionTitle}>PR Card Document</div>
            <div className={uiTypography.helper}>Document uploaded</div>
          </div>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => window.open(withFileAccessToken(`/files/${prCardFileId}/download`), '_blank', 'noopener,noreferrer')}
          >
            View
          </AppButton>
          {canEdit ? (
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              className="!text-red-600 hover:!bg-red-50"
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
            >
              Remove
            </AppButton>
          ) : null}
        </div>
      ) : null}
      {canEdit ? (
        <AppFileUpload
          mode="single"
          value={stagingFile}
          onChange={setStagingFile}
          accept="image/*,.pdf"
          label={prCardFileId ? 'Replace document' : 'Upload document'}
          disabled={uploading}
          onFilesSelected={async (files) => {
            const f = files[0];
            if (f) await uploadFile(f);
          }}
        />
      ) : null}
    </AppCard>
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
  const [uploading, setUploading] = useState(false);
  const [stagingFile, setStagingFile] = useState<File | null>(null);
  const queryClient = useQueryClient();
  const { data: permitFile, refetch } = useQuery({
    queryKey: ['permit-file', userId],
    queryFn: () => api<any>('GET', '/auth/me/profile'),
  });
  const permitFileId = permitFile?.profile?.permit_file_id;

  const uploadFile = async (f: File) => {
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
        category_id: 'permit',
        original_name: f.name,
        content_type: f.type || 'application/pdf',
      });

      const put = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': f.type || 'application/pdf', 'x-ms-blob-type': 'BlockBlob' },
        body: f,
      });
      if (!put.ok) {
        throw new Error(`Upload to storage failed: ${put.status} ${put.statusText}`);
      }

      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: f.size,
        checksum_sha256: 'na',
        content_type: f.type || 'application/pdf',
      });

      await api('PUT', '/auth/me/profile', {
        permit_file_id: conf.id,
      });

      try {
        const personalFolderId = await getOrCreatePersonalDocumentsFolder(userId);
        await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, {
          folder_id: personalFolderId,
          title: `Immigration Status Document - ${f.name}`,
          file_id: conf.id,
        });
      } catch (e: any) {
        console.warn('Failed to add document to Personal Documents folder (non-critical):', e);
      }

      toast.success('Immigration Status Document uploaded successfully');
      setStagingFile(null);
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
    }
  };

  return (
    <AppCard bodyClassName={uiSpacing.sectionStack}>
      <AppSectionHeader
        title={
          <>
            Immigration Status Document
            {isRequired ? <span className="text-red-600"> *</span> : null}
          </>
        }
      />
      {permitFileId ? (
        <div className={uiCx(uiColors.surfaceSubtle, uiRadius.control, 'flex flex-wrap items-center gap-3 p-3')}>
          <div className="min-w-0 flex-1">
            <div className={uiTypography.sectionTitle}>Immigration Status Document</div>
            <div className={uiTypography.helper}>Document uploaded</div>
          </div>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => window.open(withFileAccessToken(`/files/${permitFileId}/download`), '_blank', 'noopener,noreferrer')}
          >
            View
          </AppButton>
          {canEdit ? (
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              className="!text-red-600 hover:!bg-red-50"
              onClick={async () => {
                try {
                  await api('PUT', '/auth/me/profile', { permit_file_id: null });
                  toast.success('Immigration Status Document removed');
                  await refetch();
                  await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
                  await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
                } catch (e: any) {
                  toast.error(e?.message || 'Failed to remove Immigration Status Document');
                }
              }}
            >
              Remove
            </AppButton>
          ) : null}
        </div>
      ) : !canEdit ? (
        <div className={uiCx(uiTypography.helper, 'font-medium text-gray-900')}>No permit document uploaded</div>
      ) : null}
      {canEdit ? (
        <>
          <AppFileUpload
            mode="single"
            value={stagingFile}
            onChange={setStagingFile}
            accept="image/*,.pdf"
            label={permitFileId ? 'Replace document' : 'Upload document'}
            disabled={uploading}
            onFilesSelected={async (files) => {
              const f = files[0];
              if (f) await uploadFile(f);
            }}
          />
          {isRequired && !permitFileId ? (
            <p className={uiCx(uiTypography.helper, 'text-red-600')}>Immigration Status Document is required</p>
          ) : null}
        </>
      ) : null}
    </AppCard>
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
  
  const resetCreateForm = () => {
    setVisaType('');
    setVisaNumber('');
    setIssuingCountry('');
    setIssuedDate('');
    setExpiryDate('');
    setStatus('Active');
    setNotes('');
  };

  const renderVisaFormFields = (mode: 'create' | 'edit') => {
    const isCreate = mode === 'create';
    return (
      <div className={uiSpacing.sectionStack}>
        <AppInput
          label="Visa Type *"
          value={isCreate ? visaType : eVisaType}
          onChange={(e) => (isCreate ? setVisaType : setEVisaType)(e.target.value)}
          placeholder="e.g., Work Permit"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <AppInput
            label="Visa Number"
            value={isCreate ? visaNumber : eVisaNumber}
            onChange={(e) => (isCreate ? setVisaNumber : setEVisaNumber)(e.target.value)}
          />
          <AppInput
            label="Issuing Country"
            value={isCreate ? issuingCountry : eIssuingCountry}
            onChange={(e) => (isCreate ? setIssuingCountry : setEIssuingCountry)(e.target.value)}
          />
          <AppDatePicker
            label="Issued Date"
            value={isCreate ? issuedDate : eIssuedDate}
            onChange={(e) => (isCreate ? setIssuedDate : setEIssuedDate)(e.target.value)}
          />
          <AppDatePicker
            label="Expiry Date"
            value={isCreate ? expiryDate : eExpiryDate}
            onChange={(e) => (isCreate ? setExpiryDate : setEExpiryDate)(e.target.value)}
          />
          <AppSelect
            label="Status"
            value={isCreate ? status : eStatus}
            onChange={(e) => (isCreate ? setStatus : setEStatus)(e.target.value)}
            options={VISA_STATUS_OPTIONS}
          />
        </div>
        <AppTextarea
          label="Notes"
          value={isCreate ? notes : eNotes}
          onChange={(e) => (isCreate ? setNotes : setENotes)(e.target.value)}
          rows={3}
        />
      </div>
    );
  };

  const rows = data || [];

  return (
    <AppCard bodyClassName={uiSpacing.sectionStack}>
      <AppSectionHeader
        title={
          <>
            Visa Information
            {isRequired ? <span className="text-red-600"> *</span> : null}
          </>
        }
      />

      {rows.length === 0 ? (
        canEdit ? (
          <div className="flex flex-col gap-3">
            <AppListCreateItem layout="row" label="Add visa entry" onClick={() => setCreateOpen(true)} className="w-full" />
            {isRequired ? <p className={uiCx(uiTypography.helper, 'text-red-600')}>Visa information is required</p> : null}
          </div>
        ) : (
          <div className={uiCx(uiTypography.helper, 'font-medium text-gray-900')}>—</div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {canEdit ? (
            <AppListCreateItem layout="row" label="Add visa entry" onClick={() => setCreateOpen(true)} className="w-full" />
          ) : null}
          {rows.map((v: any) => (
            <AppCard key={v.id} bodyClassName="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className={uiTypography.sectionTitle}>{v.visa_type}</div>
                  <div className={uiTypography.helper}>
                    {[v.visa_number && `#${v.visa_number}`, v.issuing_country].filter(Boolean).join(' · ')}
                  </div>
                  <div className={uiCx(uiTypography.helper, 'mt-1 text-gray-500')}>
                    {v.issued_date ? String(v.issued_date).slice(0, 10) : ''}
                    {v.issued_date && v.expiry_date ? ' — ' : ''}
                    {v.expiry_date ? String(v.expiry_date).slice(0, 10) : ''}
                  </div>
                </div>
                {canEdit ? (
                  <div className={uiCx(uiLayout.actionsRow, 'shrink-0')}>
                    <AppListRowIconButton preset="edit" label="Edit record" onClick={() => beginEdit(v)} />
                    <AppListRowIconButton preset="delete" label="Delete record" onClick={() => handleDelete(v.id)} />
                  </div>
                ) : null}
              </div>
            </AppCard>
          ))}
        </div>
      )}

      <AppFormModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetCreateForm();
        }}
        title="Add Visa Entry"
        description="Work permit, study permit, or other visa details."
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setCreateOpen(false);
                resetCreateForm();
              }}
            >
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleCreate}>
              Create
            </AppButton>
          </div>
        }
      >
        {renderVisaFormFields('create')}
      </AppFormModal>

      <AppFormModal
        open={editId !== null}
        onClose={cancelEdit}
        title="Edit Visa Entry"
        description="Update visa details."
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={cancelEdit}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={() => editId && handleUpdate(editId)}>
              Save
            </AppButton>
          </div>
        }
      >
        {renderVisaFormFields('edit')}
      </AppFormModal>
    </AppCard>
  );
}

