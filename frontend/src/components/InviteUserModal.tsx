import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { inviteUserFieldHints, inviteUserQuickInfo } from '@/lib/formModalQuickInfo';
import { userProfileFieldHint } from '@/lib/userProfileFieldHints';
import {
  AppButton,
  AppCheckbox,
  AppDatePicker,
  AppFormModal,
  AppInput,
  AppMultiSelect,
  AppSectionHeader,
  AppSelect,
  AppTextarea,
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
  sort_order?: number;
};

const TOTAL_STEPS = 3;

const STEP_LABELS = ['Basic information', 'Job information', 'Onboarding requirements'] as const;

function isValidEmail(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function InviteUserModal({ isOpen, onClose }: InviteModalProps) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
    enabled: isOpen,
  });
  const { data: baseDocs = [], isLoading: baseDocsLoading } = useQuery({
    queryKey: ['onb-base-docs'],
    queryFn: () => api<OnboardingBaseDoc[]>('GET', '/onboarding/base-documents'),
    enabled: isOpen,
  });
  const divisions: Division[] = (settings?.divisions || []) as Division[];
  const employmentTypes = (settings?.employment_types || []) as any[];

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([]);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [needsEmail, setNeedsEmail] = useState(false);
  const [needsBusinessCard, setNeedsBusinessCard] = useState(false);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [needsVehicle, setNeedsVehicle] = useState(false);
  const [needsEquipment, setNeedsEquipment] = useState(false);
  const [equipmentList, setEquipmentList] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [workPhone, setWorkPhone] = useState('');
  const [managerUserId, setManagerUserId] = useState('');
  const [payRate, setPayRate] = useState('');
  const [payType, setPayType] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [loading, setLoading] = useState(false);

  const divisionOptions = divisions.map((div) => ({
    value: String(div.id),
    label: div.label,
  }));

  const payTypeOptions = [
    { value: 'hourly', label: 'Hourly' },
    { value: 'salary', label: 'Salary' },
    { value: 'contract', label: 'Contract' },
  ];

  const employmentTypeOptions = employmentTypes.map((et: any) => ({
    value: et.label,
    label: et.label,
  }));

  const activeDocumentOptions = useMemo(
    () =>
      baseDocs
        .filter((d) => d.employee_visible !== false)
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
    if (!isValidEmail(email)) return false;
    if (selectedDivisionIds.length === 0) return false;
    return true;
  }, [email, selectedDivisionIds]);

  const resetForm = () => {
    setStep(1);
    setEmail('');
    setSelectedDivisionIds([]);
    setDocumentIds([]);
    setNeedsEmail(false);
    setNeedsBusinessCard(false);
    setNeedsPhone(false);
    setNeedsVehicle(false);
    setNeedsEquipment(false);
    setEquipmentList('');
    setHireDate('');
    setJobTitle('');
    setWorkEmail('');
    setWorkPhone('');
    setManagerUserId('');
    setPayRate('');
    setPayType('');
    setEmploymentType('');
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
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSendInvite = async () => {
    if (loading) return;

    if (!canProceedStep1) {
      setStep(1);
      return;
    }

    const trimmedWorkEmail = workEmail.trim();
    if (trimmedWorkEmail && !isValidEmail(trimmedWorkEmail)) {
      toast.error('Work email must be a valid email address');
      setStep(2);
      return;
    }

    setLoading(true);

    try {
      await api('POST', '/auth/invite', {
        email_personal: email.trim(),
        division_ids: selectedDivisionIds.length > 0 ? selectedDivisionIds : null,
        document_ids: documentIds.length > 0 ? documentIds : null,
        needs_email: needsEmail,
        needs_business_card: needsBusinessCard,
        needs_phone: needsPhone,
        needs_vehicle: needsVehicle,
        needs_equipment: needsEquipment,
        equipment_list: needsEquipment && equipmentList ? equipmentList : null,
        hire_date: hireDate || null,
        job_title: jobTitle || null,
        work_email: trimmedWorkEmail || null,
        work_phone: workPhone || null,
        manager_user_id: managerUserId || null,
        pay_rate: payRate || null,
        pay_type: payType || null,
        employment_type: employmentType || null,
      });

      queryClient.invalidateQueries({ queryKey: ['users'] });
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
          <AppButton
            type="button"
            size="sm"
            onClick={handleNext}
            disabled={loading || (step === 1 && !canProceedStep1)}
          >
            Next
          </AppButton>
        ) : (
          <AppButton
            type="button"
            size="sm"
            loading={loading}
            disabled={loading}
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
              title="Basic Information"
              description="Personal email, department assignment, and documents to sign."
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

            <AppMultiSelect
              label={
                <>
                  Department<span className="text-brand-red"> *</span>
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
              label="Documents to Sign (optional)"
              value={documentIds}
              onChange={setDocumentIds}
              options={activeDocumentOptions}
              placeholder={baseDocsLoading ? 'Loading documents...' : 'Select documents...'}
              searchable
              disabled={loading || baseDocsLoading}
              fieldHint={inviteUserFieldHints.documents_to_sign}
              helperText={
                baseDocsLoading
                  ? undefined
                  : activeDocumentOptions.length === 0
                    ? 'No active onboarding documents. Add or activate documents in Onboarding Admin.'
                    : 'Only active documents from Onboarding Admin are listed.'
              }
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div className={uiSpacing.sectionStack}>
            <AppSectionHeader
              title="Job Information"
              description="Role, reporting, and compensation details (all optional)."
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AppDatePicker
                id="invite-hire-date"
                label="Hire Date (optional)"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
                disabled={loading}
                fieldHint={userProfileFieldHint('hire_date')}
              />

              <AppInput
                label="Job Title (optional)"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g., Software Engineer"
                disabled={loading}
                fieldHint={userProfileFieldHint('job_title')}
              />

              <AppInput
                type="email"
                label="Work Email (optional)"
                value={workEmail}
                onChange={(e) => setWorkEmail(e.target.value)}
                placeholder="work@company.com"
                disabled={loading}
                fieldHint={userProfileFieldHint('work_email')}
              />

              <AppInput
                type="tel"
                label="Work Phone (optional)"
                value={workPhone}
                onChange={(e) => setWorkPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                disabled={loading}
                fieldHint={userProfileFieldHint('work_phone')}
              />

              <AppUserSelect
                mode="single"
                label="Manager (optional)"
                value={managerUserId}
                onChange={setManagerUserId}
                placeholder="Select a manager..."
                disabled={loading}
                fieldHint={userProfileFieldHint('manager_user_id')}
              />

              {employmentTypes.length > 0 ? (
                <AppSelect
                  label="Employment Type (optional)"
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  options={employmentTypeOptions}
                  placeholder="Select type..."
                  disabled={loading}
                  fieldHint={userProfileFieldHint('employment_type')}
                />
              ) : (
                <AppInput
                  label="Employment Type (optional)"
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  placeholder="e.g., full-time, part-time"
                  disabled={loading}
                  fieldHint={userProfileFieldHint('employment_type')}
                />
              )}

              <AppInput
                label="Pay Rate (optional)"
                value={payRate}
                onChange={(e) => setPayRate(e.target.value)}
                placeholder="e.g., $50/hour or $100,000/year"
                disabled={loading}
                fieldHint={userProfileFieldHint('pay_rate')}
              />

              <AppSelect
                label="Pay Type (optional)"
                value={payType}
                onChange={(e) => setPayType(e.target.value)}
                options={payTypeOptions}
                placeholder="Select type..."
                disabled={loading}
                fieldHint={userProfileFieldHint('pay_type')}
              />
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className={uiSpacing.sectionStack}>
            <AppSectionHeader
              title="Onboarding Requirements"
              description="Equipment and resources this employee will need."
            />

            <div className={uiSpacing.sectionStack}>
              <AppCheckbox
                label="This user will need an email account"
                checked={needsEmail}
                onChange={setNeedsEmail}
                disabled={loading}
                fieldHint={inviteUserFieldHints.needs_email}
              />
              <AppCheckbox
                label="This user will need business cards"
                checked={needsBusinessCard}
                onChange={setNeedsBusinessCard}
                disabled={loading}
                fieldHint={inviteUserFieldHints.needs_business_card}
              />
              <AppCheckbox
                label="This user will need a phone"
                checked={needsPhone}
                onChange={setNeedsPhone}
                disabled={loading}
                fieldHint={inviteUserFieldHints.needs_phone}
              />
              <AppCheckbox
                label="This user will receive a vehicle"
                checked={needsVehicle}
                onChange={setNeedsVehicle}
                disabled={loading}
                fieldHint={inviteUserFieldHints.needs_vehicle}
              />
              <AppCheckbox
                label="This user will need equipment or tools"
                checked={needsEquipment}
                onChange={setNeedsEquipment}
                disabled={loading}
                fieldHint={inviteUserFieldHints.needs_equipment}
              />
              {needsEquipment ? (
                <AppTextarea
                  label="Equipment list (optional)"
                  value={equipmentList}
                  onChange={(e) => setEquipmentList(e.target.value)}
                  placeholder="Please list the equipment/tools needed..."
                  rows={3}
                  disabled={loading}
                  fieldHint={inviteUserFieldHints.equipment_list}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </AppFormModal>
  );
}
