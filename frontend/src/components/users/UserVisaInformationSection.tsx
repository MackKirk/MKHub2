import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { userVisaEntryQuickInfo } from '@/lib/formModalQuickInfo';
import { userProfileFieldHint } from '@/lib/userProfileFieldHints';
import {
  AppBadge,
  AppButton,
  AppDatePicker,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppSelect,
  AppTextarea,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

function UserVisaRecordCard({ children }: { children: ReactNode }) {
  return <div className={uiCx('rounded-lg border border-gray-200 bg-white p-4')}>{children}</div>;
}

export function UserVisaInformationSection({
  userId,
  canEdit,
  isRequired = false,
  showFieldHints,
}: {
  userId: string;
  canEdit: boolean;
  isRequired?: boolean;
  showFieldHints?: boolean;
}) {
  const confirm = useConfirm();
  const { data, refetch } = useQuery({
    queryKey: ['employee-visas', userId],
    queryFn: () => api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/visas`),
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

  const visaStatusOptions = [
    { value: 'CURRENT', label: 'CURRENT' },
    { value: 'EXPIRED', label: 'EXPIRED' },
    { value: 'PENDING', label: 'PENDING' },
    { value: 'Active', label: 'Active' },
  ];

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-CA', { dateStyle: 'medium' });
    } catch {
      return dateStr;
    }
  };

  const getDateForInput = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toISOString().split('T')[0];
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

  const resetCreateForm = () => {
    setVisaType('');
    setVisaNumber('');
    setIssuingCountry('');
    setIssuedDate('');
    setExpiryDate('');
    setStatus('Active');
    setNotes('');
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
        status,
        notes,
      });
      toast.success('Visa entry created');
      resetCreateForm();
      setCreateOpen(false);
      await refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create visa entry');
    }
  };

  const handleUpdate = async () => {
    if (!editId) return;
    if (!eVisaType.trim()) {
      toast.error('Visa type is required');
      return;
    }
    try {
      await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/visas/${editId}`, {
        visa_type: eVisaType,
        visa_number: eVisaNumber,
        issuing_country: eIssuingCountry,
        issued_date: eIssuedDate || null,
        expiry_date: eExpiryDate || null,
        status: eStatus,
        notes: eNotes,
      });
      toast.success('Visa entry updated');
      setEditId(null);
      await refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update visa entry');
    }
  };

  const handleDelete = async (visaId: string) => {
    const result = await confirm({
      title: 'Delete visa entry',
      message: 'Remove this visa record from the profile?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/visas/${visaId}`);
      toast.success('Visa entry deleted');
      await refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete visa entry');
    }
  };

  const getEffectiveStatus = (v: any) => {
    if (v.status) return v.status;
    if (v.expiry_date) {
      const expiry = new Date(v.expiry_date);
      return expiry < new Date() ? 'EXPIRED' : 'CURRENT';
    }
    return 'CURRENT';
  };

  const renderStatusBadge = (statusValue: string) => {
    const s = statusValue.toLowerCase();
    if (s.includes('current') || s.includes('active')) return <AppBadge variant="success">{statusValue}</AppBadge>;
    if (s.includes('expired')) return <AppBadge variant="danger">{statusValue}</AppBadge>;
    if (s.includes('pending')) return <AppBadge variant="warning">{statusValue}</AppBadge>;
    return <AppBadge variant="neutral">{statusValue}</AppBadge>;
  };

  const renderVisaFormFields = (mode: 'create' | 'edit') => {
    const isCreate = mode === 'create';
    const hint = (key: string) => (showFieldHints ? userProfileFieldHint(key) : undefined);
    return (
      <div className={uiSpacing.sectionStack}>
        <AppInput
          label="Visa Type *"
          value={isCreate ? visaType : eVisaType}
          onChange={(e) => (isCreate ? setVisaType : setEVisaType)(e.target.value)}
          placeholder="e.g., Work Permit"
          fieldHint={hint('visa_type')}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <AppInput
            label="Visa Number"
            value={isCreate ? visaNumber : eVisaNumber}
            onChange={(e) => (isCreate ? setVisaNumber : setEVisaNumber)(e.target.value)}
            fieldHint={hint('visa_number')}
          />
          <AppInput
            label="Issuing Country"
            value={isCreate ? issuingCountry : eIssuingCountry}
            onChange={(e) => (isCreate ? setIssuingCountry : setEIssuingCountry)(e.target.value)}
            fieldHint={hint('visa_issuing_country')}
          />
          <AppDatePicker
            label="Issued Date"
            value={isCreate ? issuedDate : eIssuedDate}
            onChange={(e) => (isCreate ? setIssuedDate : setEIssuedDate)(e.target.value)}
            fieldHint={hint('visa_issued_date')}
          />
          <AppDatePicker
            label="Expiry Date"
            value={isCreate ? expiryDate : eExpiryDate}
            onChange={(e) => (isCreate ? setExpiryDate : setEExpiryDate)(e.target.value)}
            fieldHint={hint('visa_expiry_date')}
          />
          <AppSelect
            label="Status"
            value={isCreate ? status : eStatus}
            onChange={(e) => (isCreate ? setStatus : setEStatus)(e.target.value)}
            options={visaStatusOptions}
            fieldHint={hint('visa_status')}
          />
        </div>
        <AppTextarea
          label="Notes"
          value={isCreate ? notes : eNotes}
          onChange={(e) => (isCreate ? setNotes : setENotes)(e.target.value)}
          placeholder="e.g., LMIA #9164748, Roofer"
          rows={3}
          fieldHint={hint('visa_notes')}
        />
      </div>
    );
  };

  const rows = data || [];

  const formatVisaPeriod = (issued: string | null, expiry: string | null) => {
    const from = formatDate(issued);
    const to = formatDate(expiry);
    if (from === '—' && to === '—') return '—';
    if (from !== '—' && to !== '—') return `${from} — ${to}`;
    return to !== '—' ? to : from;
  };

  const renderVisaFieldValue = (v: any, includeNotes: boolean) => {
    const country = (v.issuing_country || '').trim();
    const note = (v.notes || '').trim();
    return (
      <div>
        <div className={uiCx(uiTypography.sectionTitle, 'text-sm')}>{v.visa_type || '—'}</div>
        {country ? <div className={uiCx(uiTypography.helper, 'mt-0.5')}>{country}</div> : null}
        {includeNotes && note ? (
          <div className={uiCx(uiTypography.helper, 'mt-0.5 line-clamp-2 text-gray-600')}>{note}</div>
        ) : null}
      </div>
    );
  };

  const renderVisaRecordCardField = (label: string, value: ReactNode) => (
    <div className="min-w-0 space-y-1">
      <div className={uiTypography.controlLabel}>{label}</div>
      <div className={uiCx(uiTypography.helper, 'break-words font-medium text-gray-900')}>{value}</div>
    </div>
  );

  const renderVisaRecordCardFields = (v: any, includeNotes: boolean, actions?: ReactNode) => {
    const effectiveStatus = getEffectiveStatus(v);
    const gridCols = actions
      ? 'grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_auto]'
      : 'grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]';

    return (
      <div className={uiCx('grid items-stretch gap-x-3', gridCols)}>
        {renderVisaRecordCardField('Visa', renderVisaFieldValue(v, includeNotes))}
        {renderVisaRecordCardField('Dates', formatVisaPeriod(v.issued_date, v.expiry_date))}
        {renderVisaRecordCardField('Status', renderStatusBadge(effectiveStatus))}
        {actions ? (
          <div className="flex items-center justify-end gap-1 self-stretch pl-1">{actions}</div>
        ) : null}
      </div>
    );
  };

  const visaEditCards = (
    <div className="flex flex-col gap-3">
      <AppListCreateItem layout="row" label="Add visa entry" onClick={() => setCreateOpen(true)} className="w-full" />
      {rows.map((v: any) => (
        <UserVisaRecordCard key={v.id}>
          {renderVisaRecordCardFields(v, false, (
            <>
              <AppListRowIconButton preset="edit" label="Edit record" onClick={() => beginEdit(v)} />
              <AppListRowIconButton preset="delete" label="Delete record" onClick={() => handleDelete(v.id)} />
            </>
          ))}
        </UserVisaRecordCard>
      ))}
    </div>
  );

  const visaReadOnlyCards = (
    <div className="flex flex-col gap-3">
      {rows.map((v: any) => (
        <UserVisaRecordCard key={v.id}>{renderVisaRecordCardFields(v, true)}</UserVisaRecordCard>
      ))}
    </div>
  );

  return (
    <div>
      <div className={uiTypography.controlLabel}>
        Visa Information
        {isRequired ? <span className="text-red-600"> *</span> : null}
      </div>

      <div className="mt-3">
        {rows.length === 0 ? (
          canEdit ? (
            <div className="flex flex-col gap-3">
              <AppListCreateItem layout="row" label="Add visa entry" onClick={() => setCreateOpen(true)} className="w-full" />
              {isRequired ? <p className={uiCx(uiTypography.helper, 'text-red-600')}>Visa information is required</p> : null}
            </div>
          ) : (
            <div className={uiCx(uiTypography.helper, 'font-medium text-gray-900')}>—</div>
          )
        ) : canEdit ? (
          visaEditCards
        ) : (
          visaReadOnlyCards
        )}
      </div>

      <AppFormModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetCreateForm();
        }}
        title="Add Visa Entry"
        description="Work permit, study permit, or other visa details."
        formWidth="comfortable"
        quickInfo={showFieldHints ? userVisaEntryQuickInfo : undefined}
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
        onClose={() => setEditId(null)}
        title="Edit Visa Entry"
        description="Work permit, study permit, or other visa details."
        formWidth="comfortable"
        quickInfo={showFieldHints ? userVisaEntryQuickInfo : undefined}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setEditId(null)}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleUpdate}>
              Save
            </AppButton>
          </div>
        }
      >
        {renderVisaFormFields('edit')}
      </AppFormModal>
    </div>
  );
}
