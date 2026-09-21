import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Car, IdCard, Laptop, Mail, Smartphone, Wrench, type LucideProps } from 'lucide-react';
import { api } from '@/lib/api';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { inviteUserFieldHints, inviteUserQuickInfo } from '@/lib/formModalQuickInfo';
import { userProfileFieldHint } from '@/lib/userProfileFieldHints';
import { formatContactPhone } from '@/lib/contactPhoto';
import { getUserPickerLabel } from '@/lib/userDisplay';
import InviteAdditionalDocsPicker, {
  type AdditionalDocRef,
} from '@/components/InviteAdditionalDocsPicker';
import InviteOnboardingPackagePicker from '@/components/InviteOnboardingPackagePicker';
import {
  AppButton,
  AppCheckbox,
  AppDatePicker,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppMultiSelect,
  AppSectionHeader,
  AppSelect,
  AppTextarea,
  AppTooltip,
  AppUserSelect,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type InviteModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type Division = { id: string; label: string; value?: string };

type OnboardingBaseDoc = {
  id: string;
  name: string;
  display_name?: string | null;
  employee_visible?: boolean;
  package_role?: string | null;
  sort_order?: number;
};

type ProjectDivisionNode = {
  id: string;
  label: string;
  subdivisions?: { id: string; label: string }[];
};

const TOTAL_STEPS = 4;

const STEP_LABELS = [
  'Hire basics',
  'Onboarding requirements',
  'Documents to sign',
  'Review & send',
] as const;

const PAY_TYPE_OPTIONS = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'salary', label: 'Salary' },
  { value: 'contract', label: 'Contract' },
];

/** Digits + optional decimal (max 2 places). Strips $, commas, unit text. */
function sanitizePayRateInput(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) {
    s = `${s.slice(0, dot + 1)}${s.slice(dot + 1).replace(/\./g, '')}`;
    const [whole, frac = ''] = s.split('.');
    s = `${whole}.${frac.slice(0, 2)}`;
  }
  if (s.startsWith('.')) s = `0${s}`;
  return s;
}

function normalizePayRateForSave(raw: string): string | null {
  const t = sanitizePayRateInput(raw).trim();
  if (!t || t === '.') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  if (t.includes('.')) {
    return n.toFixed(2).replace(/\.?0+$/, '') || '0';
  }
  return String(Math.trunc(n));
}

function payTypeSuffix(type: string): string {
  if (type === 'salary') return '/ year';
  if (type === 'contract') return '/ contract';
  if (type === 'hourly') return '/ hour';
  return '';
}

function formatPayForReview(rate: string, type: string): string {
  const normalized = normalizePayRateForSave(rate);
  if (!normalized) return '';
  const n = Number(normalized);
  const amount = Number.isFinite(n)
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : `$${normalized}`;
  const suffix = payTypeSuffix(type);
  return suffix ? `${amount} ${suffix}` : amount;
}

function isValidEmail(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Local calendar date as YYYY-MM-DD for AppDatePicker. */
function todayLocalIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className={uiTypography.helper}>{label}</div>
      <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5 break-words')}>{value || '—'}</div>
    </div>
  );
}

type RequirementId = 'email' | 'business_card' | 'phone' | 'computer' | 'vehicle' | 'equipment';

type RequirementOption = {
  id: RequirementId;
  title: string;
  subtitle: string;
  icon: ComponentType<LucideProps>;
  fieldHint: ReactNode;
};

const REQUIREMENT_OPTIONS: RequirementOption[] = [
  {
    id: 'email',
    title: 'Email account',
    subtitle: 'Company email to provision',
    icon: Mail,
    fieldHint: inviteUserFieldHints.needs_email,
  },
  {
    id: 'business_card',
    title: 'Business cards',
    subtitle: 'Order before start date',
    icon: IdCard,
    fieldHint: inviteUserFieldHints.needs_business_card,
  },
  {
    id: 'phone',
    title: 'Phone',
    subtitle: 'Company phone or mobile',
    icon: Smartphone,
    fieldHint: inviteUserFieldHints.needs_phone,
  },
  {
    id: 'computer',
    title: 'Computer/Laptop',
    subtitle: 'Assign a workstation',
    icon: Laptop,
    fieldHint: inviteUserFieldHints.needs_computer,
  },
  {
    id: 'vehicle',
    title: 'Vehicle',
    subtitle: 'Assign a company vehicle',
    icon: Car,
    fieldHint: inviteUserFieldHints.needs_vehicle,
  },
  {
    id: 'equipment',
    title: 'Equipment or tools',
    subtitle: 'Prepare gear for day one',
    icon: Wrench,
    fieldHint: inviteUserFieldHints.needs_equipment,
  },
];

const EMPTY_REQUIREMENT_NOTES: Record<RequirementId, string> = {
  email: '',
  business_card: '',
  phone: '',
  computer: '',
  vehicle: '',
  equipment: '',
};

const REQUIREMENT_NOTE_PLACEHOLDERS: Record<RequirementId, string> = {
  email: 'e.g. preferred alias, mailbox size…',
  business_card: 'e.g. title on card, quantity…',
  phone: 'e.g. iPhone preferred, already has SIM…',
  computer: 'e.g. MacBook Pro 14", docking station…',
  vehicle: 'e.g. wrap color, truck vs van…',
  equipment: 'PPE, tools, keys…',
};

function RequirementCard({
  option,
  selected,
  focused,
  hasNote,
  disabled,
  onSelect,
}: {
  option: RequirementOption;
  selected: boolean;
  focused: boolean;
  hasNote: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const Icon = option.icon;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      aria-current={focused ? 'true' : undefined}
      onClick={onSelect}
      className={uiCx(
        'relative flex flex-col items-start gap-2 rounded-lg border p-2.5 pr-8 text-left transition-colors outline-none focus-visible:outline-none',
        // ring-inset: outer rings get clipped by the modal's overflow-y-auto
        focused
          ? 'border-brand-red bg-red-50 ring-2 ring-inset ring-brand-red'
          : selected
            ? 'border-brand-red bg-red-50 ring-1 ring-inset ring-brand-red/50'
            : 'border-gray-200 bg-white hover:border-brand-red/40 hover:bg-gray-50',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span
        className={uiCx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
          selected ? 'bg-white text-brand-red' : 'bg-gray-100 text-gray-600',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 w-full">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-xs font-semibold text-gray-900">{option.title}</span>
          {option.fieldHint ? <AppFieldHint hint={option.fieldHint} /> : null}
        </span>
        <span className="mt-0.5 block text-[10px] leading-snug text-gray-500">{option.subtitle}</span>
      </span>
      {hasNote ? (
        <span
          className="absolute bottom-2 right-2 h-1.5 w-1.5 rounded-full bg-brand-red"
          title="Has note"
          aria-hidden
        />
      ) : null}
      <span
        className={uiCx(
          'absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded border',
          selected
            ? 'border-brand-red bg-brand-red text-white'
            : 'border-gray-300 bg-white text-transparent',
        )}
        aria-hidden
      >
        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    </button>
  );
}

export default function InviteUserModal({ isOpen, onClose }: InviteModalProps) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
    enabled: isOpen,
  });
  const { data: projectDivisionsTree = [], isLoading: projectDivisionsLoading } = useQuery({
    queryKey: ['project-divisions'],
    queryFn: () => api<ProjectDivisionNode[]>('GET', '/settings/project-divisions'),
    enabled: isOpen,
    staleTime: 300_000,
  });
  const { data: baseDocs = [], isLoading: baseDocsLoading } = useQuery({
    queryKey: ['onb-base-docs'],
    queryFn: () => api<OnboardingBaseDoc[]>('GET', '/onboarding/base-documents'),
    enabled: isOpen,
  });
  const { data: usersOptionsRaw = [] } = useQuery({
    queryKey: ['users-options', { limit: 5000 }],
    queryFn: () => api<any[]>('GET', '/auth/users/options?limit=5000'),
    enabled: isOpen,
    staleTime: 300_000,
  });
  const divisions: Division[] = (settings?.divisions || []) as Division[];

  const supervisorUsers = useMemo(
    () =>
      (usersOptionsRaw || []).map((u: any) => ({
        id: String(u.id),
        name: u.name,
        username: u.username,
        email: u.email,
        first_name: u.first_name,
        last_name: u.last_name,
        preferred_name: u.preferred_name,
        department: u.department,
        division: u.division,
        profile_photo_file_id: u.profile_photo_file_id,
        profile: u.profile,
      })),
    [usersOptionsRaw],
  );

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([]);
  const [selectedProjectDivisionIds, setSelectedProjectDivisionIds] = useState<string[]>([]);
  const [includeOnboardingPackage, setIncludeOnboardingPackage] = useState(true);
  const [customizePackage, setCustomizePackage] = useState(false);
  const [showPackageList, setShowPackageList] = useState(false);
  const [packagePickerOpen, setPackagePickerOpen] = useState(false);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [additionalDocuments, setAdditionalDocuments] = useState<AdditionalDocRef[]>([]);
  const [hireDate, setHireDate] = useState(todayLocalIsoDate);
  const [managerUserId, setManagerUserId] = useState('');
  const [payRate, setPayRate] = useState('');
  const [payType, setPayType] = useState('hourly');
  const [needsEmail, setNeedsEmail] = useState(false);
  const [needsBusinessCard, setNeedsBusinessCard] = useState(false);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [needsComputer, setNeedsComputer] = useState(false);
  const [needsVehicle, setNeedsVehicle] = useState(false);
  const [needsEquipment, setNeedsEquipment] = useState(false);
  const [requirementNotes, setRequirementNotes] =
    useState<Record<RequirementId, string>>(EMPTY_REQUIREMENT_NOTES);
  const [focusedRequirementId, setFocusedRequirementId] = useState<RequirementId | null>(null);
  const [loading, setLoading] = useState(false);

  const requirementSelected: Record<RequirementId, boolean> = {
    email: needsEmail,
    business_card: needsBusinessCard,
    phone: needsPhone,
    computer: needsComputer,
    vehicle: needsVehicle,
    equipment: needsEquipment,
  };

  const setRequirementSelected = (id: RequirementId, value: boolean) => {
    if (id === 'email') setNeedsEmail(value);
    else if (id === 'business_card') setNeedsBusinessCard(value);
    else if (id === 'phone') setNeedsPhone(value);
    else if (id === 'computer') setNeedsComputer(value);
    else if (id === 'vehicle') setNeedsVehicle(value);
    else setNeedsEquipment(value);
  };

  const handleRequirementSelect = (id: RequirementId) => {
    const selected = requirementSelected[id];
    if (!selected) {
      setRequirementSelected(id, true);
      setFocusedRequirementId(id);
      return;
    }
    if (focusedRequirementId !== id) {
      setFocusedRequirementId(id);
      return;
    }
    setRequirementSelected(id, false);
    setRequirementNotes((prev) => ({ ...prev, [id]: '' }));
    const stillOn = REQUIREMENT_OPTIONS.map((o) => o.id).filter(
      (oid) => oid !== id && requirementSelected[oid],
    );
    setFocusedRequirementId(stillOn[0] ?? null);
  };

  const focusedRequirement = REQUIREMENT_OPTIONS.find((o) => o.id === focusedRequirementId) ?? null;

  const divisionOptions = useMemo(
    () =>
      divisions.map((div) => ({
        value: String(div.id),
        label: div.label,
      })),
    [divisions],
  );

  const projectDivisionOptions = useMemo(() => {
    const flat: { value: string; label: string }[] = [];
    for (const div of projectDivisionsTree) {
      flat.push({ value: String(div.id), label: String(div.label) });
      for (const sub of div.subdivisions || []) {
        flat.push({
          value: String(sub.id),
          label: `${div.label} - ${sub.label}`,
        });
      }
    }
    return flat;
  }, [projectDivisionsTree]);

  const activeDocumentOptions = useMemo(
    () =>
      baseDocs
        .filter(
          (d) =>
            d.employee_visible !== false &&
            (d.package_role || 'hiring_package').trim().toLowerCase() !== 'additional',
        )
        .sort((a, b) => {
          const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
          if (orderDiff !== 0) return orderDiff;
          const labelA = ((a.display_name || '').trim() || a.name).toLowerCase();
          const labelB = ((b.display_name || '').trim() || b.name).toLowerCase();
          return labelA.localeCompare(labelB);
        })
        .map((d) => ({
          value: d.id,
          label: (d.display_name || '').trim() || d.name,
        })),
    [baseDocs],
  );

  const canProceedStep1 = useMemo(() => {
    if (!firstName.trim()) return false;
    if (!isValidEmail(email)) return false;
    if (!jobTitle.trim()) return false;
    if (selectedDivisionIds.length === 0) return false;
    if (selectedProjectDivisionIds.length === 0) return false;
    if (!payType.trim()) return false;
    if (!normalizePayRateForSave(payRate)) return false;
    return true;
  }, [firstName, email, jobTitle, selectedDivisionIds, selectedProjectDivisionIds, payType, payRate]);

  const canProceedDocsStep = useMemo(() => {
    if (includeOnboardingPackage && customizePackage && documentIds.length === 0) return false;
    return true;
  }, [includeOnboardingPackage, customizePackage, documentIds]);

  const step1MissingRequired = useMemo(() => {
    const missing: string[] = [];
    if (!firstName.trim()) missing.push('First Name');
    if (!isValidEmail(email)) missing.push('Email Address');
    if (!jobTitle.trim()) missing.push('Job Title');
    if (selectedDivisionIds.length === 0) missing.push('Departments');
    if (selectedProjectDivisionIds.length === 0) missing.push('Project Divisions');
    if (!payType.trim()) missing.push('Pay Type');
    if (!normalizePayRateForSave(payRate)) missing.push('Pay Rate');
    return missing;
  }, [firstName, email, jobTitle, selectedDivisionIds, selectedProjectDivisionIds, payType, payRate]);

  const docsStepMissingRequired = useMemo(() => {
    if (includeOnboardingPackage && customizePackage && documentIds.length === 0) {
      return ['Select at least one package document'];
    }
    return [];
  }, [includeOnboardingPackage, customizePackage, documentIds]);

  const nextDisabledTooltip = useMemo(() => {
    if (step === 1 && step1MissingRequired.length > 0) {
      return `Complete required fields: ${step1MissingRequired.join(', ')}`;
    }
    if (step === 3 && docsStepMissingRequired.length > 0) {
      return docsStepMissingRequired.join(', ');
    }
    return '';
  }, [step, step1MissingRequired, docsStepMissingRequired]);

  const resetForm = () => {
    setStep(1);
    setEmail('');
    setFirstName('');
    setLastName('');
    setPhone('');
    setJobTitle('');
    setSelectedDivisionIds([]);
    setSelectedProjectDivisionIds([]);
    setIncludeOnboardingPackage(true);
    setCustomizePackage(false);
    setShowPackageList(false);
    setPackagePickerOpen(false);
    setDocumentIds([]);
    setAdditionalDocuments([]);
    setHireDate(todayLocalIsoDate());
    setManagerUserId('');
    setPayRate('');
    setPayType('hourly');
    setNeedsEmail(false);
    setNeedsBusinessCard(false);
    setNeedsPhone(false);
    setNeedsComputer(false);
    setNeedsVehicle(false);
    setNeedsEquipment(false);
    setRequirementNotes(EMPTY_REQUIREMENT_NOTES);
    setFocusedRequirementId(null);
  };

  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  const handleNext = () => {
    if (step === 1 && !canProceedStep1) return;
    if (step === 3 && !canProceedDocsStep) return;
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 1));
  };

  const supervisorLabel = useMemo(() => {
    if (!managerUserId) return '';
    const u = supervisorUsers.find((x) => x.id === managerUserId);
    return u ? getUserPickerLabel(u) : '';
  }, [managerUserId, supervisorUsers]);

  const payRateSuffix = payTypeSuffix(payType);

  const departmentLabels = selectedDivisionIds
    .map((id) => divisionOptions.find((o) => o.value === id)?.label || id)
    .join(', ');

  const projectDivisionLabels = selectedProjectDivisionIds
    .map((id) => projectDivisionOptions.find((o) => o.value === id)?.label || id)
    .join(', ');

  const packageReviewLabel = !includeOnboardingPackage
    ? 'None'
    : customizePackage
      ? `Customized (${documentIds
          .map((id) => activeDocumentOptions.find((o) => o.value === id)?.label || id)
          .join(', ')})`
      : `Default (${activeDocumentOptions.length} docs)`;

  const additionalReviewLabel =
    additionalDocuments.length === 0
      ? 'None'
      : additionalDocuments.map((d) => d.name).join(', ');

  const requirementsReviewLabel = useMemo(() => {
    const items: string[] = [];
    const push = (on: boolean, title: string, id: RequirementId) => {
      if (!on) return;
      const note = requirementNotes[id].trim();
      items.push(note ? `${title} (${note})` : title);
    };
    push(needsEmail, 'Email account', 'email');
    push(needsBusinessCard, 'Business cards', 'business_card');
    push(needsPhone, 'Phone', 'phone');
    push(needsComputer, 'Computer/Laptop', 'computer');
    push(needsVehicle, 'Vehicle', 'vehicle');
    push(needsEquipment, 'Equipment or tools', 'equipment');
    return items.length ? items.join(', ') : 'None';
  }, [
    needsEmail,
    needsBusinessCard,
    needsPhone,
    needsComputer,
    needsVehicle,
    needsEquipment,
    requirementNotes,
  ]);

  const handleSendInvite = async () => {
    if (loading) return;

    if (!canProceedStep1) {
      setStep(1);
      return;
    }
    if (!canProceedDocsStep) {
      setStep(3);
      return;
    }

    setLoading(true);

    try {
      await api('POST', '/auth/invite', {
        email_personal: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        job_title: jobTitle.trim(),
        division_ids: selectedDivisionIds,
        project_division_ids: selectedProjectDivisionIds,
        include_onboarding_package: includeOnboardingPackage,
        document_ids: !includeOnboardingPackage
          ? []
          : customizePackage
            ? documentIds
            : null,
        additional_documents: additionalDocuments.map((d) => ({
          source: d.source,
          id: d.id,
          name: d.name,
        })),
        hire_date: hireDate || todayLocalIsoDate(),
        manager_user_id: managerUserId.trim() || null,
        pay_rate: normalizePayRateForSave(payRate),
        pay_type: payType.trim() || 'hourly',
        needs_email: needsEmail,
        needs_business_card: needsBusinessCard,
        needs_phone: needsPhone,
        needs_computer: needsComputer,
        needs_vehicle: needsVehicle,
        needs_equipment: needsEquipment,
        equipment_list: needsEquipment ? requirementNotes.equipment.trim() || null : null,
        requirement_notes: {
          email: needsEmail ? requirementNotes.email.trim() || null : null,
          business_card: needsBusinessCard
            ? requirementNotes.business_card.trim() || null
            : null,
          phone: needsPhone ? requirementNotes.phone.trim() || null : null,
          computer: needsComputer ? requirementNotes.computer.trim() || null : null,
          vehicle: needsVehicle ? requirementNotes.vehicle.trim() || null : null,
          equipment: needsEquipment ? requirementNotes.equipment.trim() || null : null,
        },
      });

      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Invite sent');
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send invite');
    } finally {
      setLoading(false);
    }
  };

  const stepSubtitle = STEP_LABELS[step - 1];

  const stepPillClass = (n: number) =>
    uiCx(
      'rounded-full px-2 py-1 text-[10px] font-medium',
      step === n ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-600',
    );

  const stepIndicators = (
    <div className={uiCx(uiLayout.actionsRow, uiTypography.helper, 'text-[10px] font-medium')}>
      <span className={stepPillClass(1)}>1</span>
      <span className="text-gray-400">→</span>
      <span className={stepPillClass(2)}>2</span>
      <span className="text-gray-400">→</span>
      <span className={stepPillClass(3)}>3</span>
      <span className="text-gray-400">→</span>
      <span className={stepPillClass(4)}>4</span>
    </div>
  );

  const modalFooter = (
    <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
      <span className={uiTypography.helper}>
        Step {step} of {TOTAL_STEPS}
      </span>
      <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
        <AppButton type="button" variant="secondary" size="sm" onClick={handleClose} disabled={loading}>
          Cancel
        </AppButton>
        {step > 1 ? (
          <AppButton type="button" variant="secondary" size="sm" onClick={handleBack} disabled={loading}>
            Back
          </AppButton>
        ) : null}
        {step < TOTAL_STEPS ? (
          <AppTooltip
            content={nextDisabledTooltip}
            wrap
            disabled={
              (step === 1 && canProceedStep1) ||
              (step === 3 && canProceedDocsStep) ||
              (step !== 1 && step !== 3)
            }
            placement="top"
          >
            <AppButton
              type="button"
              size="sm"
              onClick={handleNext}
              disabled={
                loading ||
                (step === 1 && !canProceedStep1) ||
                (step === 3 && !canProceedDocsStep)
              }
            >
              Next
            </AppButton>
          </AppTooltip>
        ) : (
          <AppButton
            type="button"
            size="sm"
            loading={loading}
            disabled={loading || !canProceedStep1 || !canProceedDocsStep}
            onClick={() => void handleSendInvite()}
          >
            {loading ? 'Sending...' : 'Send Invite'}
          </AppButton>
        )}
      </div>
    </div>
  );

  return (
    <AppFormModal
      open={isOpen}
      onClose={handleClose}
      size="lg"
      formWidth="wide"
      title="Invite New User"
      description={stepSubtitle}
      headerExtra={stepIndicators}
      quickInfo={inviteUserQuickInfo}
      footer={modalFooter}
    >
      <div className={uiSpacing.sectionStack}>
        {step === 1 ? (
          <div className={uiSpacing.sectionStack}>
            <AppSectionHeader
              title="Hire basics"
              description="Who you're inviting and how they'll be set up in the Hub."
            />

            <div className={uiLayout.sectionGrid2}>
              <AppInput
                label="First Name *"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                disabled={loading}
                fieldHint={inviteUserFieldHints.first_name}
              />
              <AppInput
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                disabled={loading}
                fieldHint={inviteUserFieldHints.last_name}
              />

              <AppInput
                type="email"
                label="Email Address *"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                disabled={loading}
                fieldHint={inviteUserFieldHints.email_personal}
              />
              <AppInput
                type="tel"
                label="Phone"
                value={phone}
                onChange={(e) => setPhone(formatContactPhone(e.target.value))}
                placeholder="(555) 123-4567"
                disabled={loading}
                fieldHint={inviteUserFieldHints.phone}
              />

              <AppInput
                label="Job Title *"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g., Roofer"
                disabled={loading}
                fieldHint={userProfileFieldHint('job_title')}
              />
              <AppDatePicker
                id="invite-hire-date"
                label="Hire Date"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
                disabled={loading}
                fieldHint={userProfileFieldHint('hire_date')}
              />

              <AppMultiSelect
                label={
                  <>
                    Departments<span className="text-brand-red"> *</span>
                  </>
                }
                value={selectedDivisionIds}
                onChange={setSelectedDivisionIds}
                options={divisionOptions}
                placeholder="Select departments..."
                searchable
                disabled={loading}
                fieldHint={inviteUserFieldHints.departments}
              />
              <AppMultiSelect
                label={
                  <>
                    Project Divisions<span className="text-brand-red"> *</span>
                  </>
                }
                value={selectedProjectDivisionIds}
                onChange={setSelectedProjectDivisionIds}
                options={projectDivisionOptions}
                placeholder={
                  projectDivisionsLoading ? 'Loading project divisions...' : 'Select project divisions...'
                }
                searchable
                disabled={loading || projectDivisionsLoading}
                fieldHint={inviteUserFieldHints.project_divisions}
              />

              <AppUserSelect
                label="Supervisor"
                value={managerUserId}
                onChange={setManagerUserId}
                users={supervisorUsers}
                placeholder="Select supervisor..."
                disabled={loading}
                fieldHint={inviteUserFieldHints.manager_user_id}
              />

              <div className="grid min-w-0 grid-cols-2 gap-3">
                <AppSelect
                  label="Pay Type *"
                  value={payType}
                  onChange={(e) => setPayType(e.target.value)}
                  options={PAY_TYPE_OPTIONS}
                  placeholder="Select type..."
                  disabled={loading}
                  fieldHint={userProfileFieldHint('pay_type')}
                />
                <AppInput
                  label="Pay Rate *"
                  inputMode="decimal"
                  value={payRate}
                  onChange={(e) => setPayRate(sanitizePayRateInput(e.target.value))}
                  placeholder={payType === 'salary' ? '100000' : '50'}
                  disabled={loading}
                  leftIcon={<span className="text-xs font-medium text-gray-500">$</span>}
                  rightIcon={
                    payRateSuffix ? (
                      <span className="pr-1 text-[11px] font-medium whitespace-nowrap text-gray-500">
                        {payRateSuffix}
                      </span>
                    ) : undefined
                  }
                  inputClassName={payRateSuffix ? 'pr-20' : undefined}
                  fieldHint={userProfileFieldHint('pay_rate')}
                />
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className={uiSpacing.sectionStack}>
            <AppSectionHeader
              title="Onboarding requirements"
              description="Tap a card to request that resource. Assignees are configured in Settings → Auto tasks."
            />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {REQUIREMENT_OPTIONS.map((option) => {
                const selected = requirementSelected[option.id];
                return (
                  <RequirementCard
                    key={option.id}
                    option={option}
                    selected={selected}
                    focused={focusedRequirementId === option.id}
                    hasNote={Boolean(requirementNotes[option.id].trim())}
                    disabled={loading}
                    onSelect={() => handleRequirementSelect(option.id)}
                  />
                );
              })}
            </div>
            {focusedRequirement ? (
              <AppTextarea
                label={`Notes for ${focusedRequirement.title} (optional)`}
                value={requirementNotes[focusedRequirement.id]}
                onChange={(e) =>
                  setRequirementNotes((prev) => ({
                    ...prev,
                    [focusedRequirement.id]: e.target.value,
                  }))
                }
                rows={3}
                placeholder={REQUIREMENT_NOTE_PLACEHOLDERS[focusedRequirement.id]}
                disabled={loading}
                fieldHint={
                  focusedRequirement.id === 'equipment'
                    ? inviteUserFieldHints.equipment_list
                    : inviteUserFieldHints.requirement_notes
                }
              />
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className={uiSpacing.sectionStack}>
            <AppSectionHeader
              title="Documents to sign"
              description="Onboarding package for every hire, plus optional contracts and additional docs."
            />

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <AppSectionHeader
                title="Onboarding Package"
                description="Standard hiring documents from Onboarding Admin."
              />
              <div className={uiCx('mt-3', uiSpacing.sectionStack)}>
                <AppCheckbox
                  label="Include onboarding package"
                  checked={includeOnboardingPackage}
                  onChange={(checked) => {
                    setIncludeOnboardingPackage(checked);
                    if (!checked) {
                      setCustomizePackage(false);
                      setDocumentIds([]);
                      setShowPackageList(false);
                      setPackagePickerOpen(false);
                    }
                  }}
                  disabled={loading}
                  fieldHint={inviteUserFieldHints.include_onboarding_package}
                />
                {includeOnboardingPackage ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={uiCx(
                          'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                          customizePackage
                            ? 'bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200/80'
                            : 'bg-gray-100 text-gray-700',
                        )}
                      >
                        {customizePackage ? 'Customized' : 'Default package'}
                      </span>
                      <span className={uiTypography.helper}>
                        {baseDocsLoading
                          ? 'Loading package documents…'
                          : customizePackage
                            ? `${documentIds.length} of ${activeDocumentOptions.length} documents`
                            : `All ${activeDocumentOptions.length} document${activeDocumentOptions.length === 1 ? '' : 's'}`}
                      </span>
                      {!baseDocsLoading && activeDocumentOptions.length > 0 && !customizePackage ? (
                        <button
                          type="button"
                          className="text-sm font-medium text-gray-800 underline-offset-2 hover:underline"
                          onClick={() => setShowPackageList((v) => !v)}
                        >
                          {showPackageList ? 'Hide list' : 'View list'}
                        </button>
                      ) : null}
                    </div>

                    {showPackageList && !customizePackage ? (
                      <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-sm text-gray-700">
                        {activeDocumentOptions.map((d) => (
                          <li key={d.value}>{d.label}</li>
                        ))}
                      </ul>
                    ) : null}

                    {customizePackage ? (
                      <div className="flex flex-wrap gap-2">
                        {documentIds.map((id) => {
                          const label = activeDocumentOptions.find((o) => o.value === id)?.label || id;
                          return (
                            <span
                              key={id}
                              className="inline-flex max-w-full items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-800"
                            >
                              <span className="truncate">{label}</span>
                            </span>
                          );
                        })}
                      </div>
                    ) : null}

                    <div className={uiLayout.actionsRow}>
                      <AppButton
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={loading || baseDocsLoading || activeDocumentOptions.length === 0}
                        onClick={() => setPackagePickerOpen(true)}
                      >
                        Customize
                      </AppButton>
                      {customizePackage ? (
                        <AppButton
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={loading}
                          onClick={() => {
                            setCustomizePackage(false);
                            setDocumentIds([]);
                          }}
                        >
                          Reset to default
                        </AppButton>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p className={uiTypography.helper}>
                    No onboarding package documents will be assigned.
                  </p>
                )}
              </div>
            </div>

            <InviteOnboardingPackagePicker
              open={packagePickerOpen}
              onClose={() => setPackagePickerOpen(false)}
              documents={baseDocs}
              isLoading={baseDocsLoading}
              customized={customizePackage}
              selectedIds={documentIds}
              disabled={loading}
              onApply={(ids) => {
                setCustomizePackage(true);
                setDocumentIds(ids);
                setShowPackageList(false);
              }}
            />

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <AppSectionHeader
                title="Additional documents"
                description="Optional. Contracts and docs for this hire."
              />
              <div className="mt-3">
                <InviteAdditionalDocsPicker
                  value={additionalDocuments}
                  onChange={setAdditionalDocuments}
                  jobTitle={jobTitle}
                  disabled={loading}
                />
              </div>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className={uiSpacing.sectionStack}>
            <AppSectionHeader
              title="Review & send"
              description="Confirm the hire details, then send the invitation email."
            />
            <div className={uiLayout.sectionGrid2}>
              <ReviewRow label="Email" value={email.trim()} />
              <ReviewRow
                label="Name"
                value={`${firstName.trim()} ${lastName.trim()}`.trim()}
              />
              <ReviewRow label="Phone" value={phone.trim()} />
              <ReviewRow label="Job title" value={jobTitle.trim()} />
              <ReviewRow label="Departments" value={departmentLabels} />
              <ReviewRow label="Project divisions" value={projectDivisionLabels} />
              <ReviewRow label="Hire date" value={hireDate} />
              <ReviewRow label="Supervisor" value={supervisorLabel} />
              <ReviewRow label="Pay" value={formatPayForReview(payRate, payType)} />
              <ReviewRow label="Onboarding requirements" value={requirementsReviewLabel} />
              <ReviewRow label="Onboarding package" value={packageReviewLabel} />
              <ReviewRow label="Additional documents" value={additionalReviewLabel} />
            </div>
          </div>
        ) : null}
      </div>
    </AppFormModal>
  );
}
