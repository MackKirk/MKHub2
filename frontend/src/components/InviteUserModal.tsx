import { useState } from 'react';
import { api } from '@/lib/api';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import {
  AppButton,
  AppCheckbox,
  AppDatePicker,
  AppFormModal,
  AppInput,
  AppMultiSelect,
  AppSelect,
  AppTextarea,
  AppUserSelect,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type InviteModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type Division = { id: string; label: string; value?: string };

export default function InviteUserModal({ isOpen, onClose }: InviteModalProps) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
    enabled: isOpen,
  });
  const divisions: Division[] = (settings?.divisions || []) as Division[];
  const employmentTypes = (settings?.employment_types || []) as any[];

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
  const [error, setError] = useState('');
  const [divisionTouched, setDivisionTouched] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDivisionTouched(true);

    if (selectedDivisionIds.length === 0) {
      setError('Please select at least one department');
      return;
    }

    setLoading(true);

    try {
      await api('POST', '/auth/invite', {
        email_personal: email,
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
        work_email: workEmail || null,
        work_phone: workPhone || null,
        manager_user_id: managerUserId || null,
        pay_rate: payRate || null,
        pay_type: payType || null,
        employment_type: employmentType || null,
      });

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
      setDivisionTouched(false);

      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to send invite');
    } finally {
      setLoading(false);
    }
  };

  const divisionError =
    divisionTouched && selectedDivisionIds.length === 0 ? 'At least one department is required' : undefined;

  return (
    <AppFormModal
      open={isOpen}
      onClose={onClose}
      size="lg"
      title="Invite New User"
      description="Send an invitation to a new employee"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </AppButton>
          <AppButton type="submit" form="invite-user-form" size="sm" loading={loading} disabled={loading}>
            {loading ? 'Sending...' : 'Send Invite'}
          </AppButton>
        </div>
      }
    >
      <form id="invite-user-form" onSubmit={handleSubmit} className={uiSpacing.sectionStack}>
        {error ? (
          <div className={uiCx(uiRadius.control, 'border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700')}>
            {error}
          </div>
        ) : null}

        <AppInput
          type="email"
          label="Email Address *"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          disabled={loading}
        />

        <AppMultiSelect
          label="Department *"
          value={selectedDivisionIds}
          onChange={(values) => {
            setSelectedDivisionIds(values);
            setDivisionTouched(true);
          }}
          options={divisionOptions}
          placeholder="Select departments..."
          searchable
          disabled={loading}
          error={divisionError}
        />

        <AppInput
          label="Documents to Sign (optional)"
          value={documentIds.join(', ')}
          onChange={(e) =>
            setDocumentIds(
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          placeholder="Comma-separated document IDs"
          helperText="Enter document IDs separated by commas"
          disabled={loading}
        />

        <div className={uiCx('border-t border-gray-100 pt-4', uiSpacing.sectionStack)}>
          <h3 className={uiTypography.sectionTitle}>Job Information</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AppDatePicker
              id="invite-hire-date"
              label="Hire Date (optional)"
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
              disabled={loading}
            />

            <AppInput
              label="Job Title (optional)"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g., Software Engineer"
              disabled={loading}
            />

            <AppInput
              type="email"
              label="Work Email (optional)"
              value={workEmail}
              onChange={(e) => setWorkEmail(e.target.value)}
              placeholder="work@company.com"
              disabled={loading}
            />

            <AppInput
              type="tel"
              label="Work Phone (optional)"
              value={workPhone}
              onChange={(e) => setWorkPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              disabled={loading}
            />

            <AppUserSelect
              mode="single"
              label="Manager (optional)"
              value={managerUserId}
              onChange={setManagerUserId}
              placeholder="Select a manager..."
              disabled={loading}
            />

            {employmentTypes.length > 0 ? (
              <AppSelect
                label="Employment Type (optional)"
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
                options={employmentTypeOptions}
                placeholder="Select type..."
                disabled={loading}
              />
            ) : (
              <AppInput
                label="Employment Type (optional)"
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
                placeholder="e.g., full-time, part-time"
                disabled={loading}
              />
            )}

            <AppInput
              label="Pay Rate (optional)"
              value={payRate}
              onChange={(e) => setPayRate(e.target.value)}
              placeholder="e.g., $50/hour or $100,000/year"
              disabled={loading}
            />

            <AppSelect
              label="Pay Type (optional)"
              value={payType}
              onChange={(e) => setPayType(e.target.value)}
              options={payTypeOptions}
              placeholder="Select type..."
              disabled={loading}
            />
          </div>
        </div>

        <div className={uiCx('border-t border-gray-100 pt-4', uiSpacing.sectionStack)}>
          <h3 className={uiTypography.sectionTitle}>Onboarding Requirements</h3>

          <div className={uiSpacing.sectionStack}>
            <AppCheckbox
              label="This user will need an email account"
              checked={needsEmail}
              onChange={setNeedsEmail}
              disabled={loading}
            />
            <AppCheckbox
              label="This user will need business cards"
              checked={needsBusinessCard}
              onChange={setNeedsBusinessCard}
              disabled={loading}
            />
            <AppCheckbox
              label="This user will need a phone"
              checked={needsPhone}
              onChange={setNeedsPhone}
              disabled={loading}
            />
            <AppCheckbox
              label="This user will receive a vehicle"
              checked={needsVehicle}
              onChange={setNeedsVehicle}
              disabled={loading}
            />
            <AppCheckbox
              label="This user will need equipment or tools"
              checked={needsEquipment}
              onChange={setNeedsEquipment}
              disabled={loading}
            />
            {needsEquipment ? (
              <AppTextarea
                value={equipmentList}
                onChange={(e) => setEquipmentList(e.target.value)}
                placeholder="Please list the equipment/tools needed..."
                rows={3}
                disabled={loading}
              />
            ) : null}
          </div>
        </div>
      </form>
    </AppFormModal>
  );
}
