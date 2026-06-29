import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { userEducationQuickInfo } from '@/lib/formModalQuickInfo';
import { userProfileFieldHint } from '@/lib/userProfileFieldHints';
import {
  AppButton,
  AppDatePicker,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppReadOnlyField,
  uiCx,
  uiLayout,
  uiRadius,
  uiTypography,
} from '@/components/ui';

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

function UserEducationRecordCard({ children }: { children: ReactNode }) {
  return <div className={uiCx('rounded-lg border border-gray-200 bg-white p-4')}>{children}</div>;
}

function UserEducationReadOnlyField({ label, value }: { label: string; value: ReactNode }) {
  return <AppReadOnlyField label={label} value={value} />;
}

export function UserEducationSection({
  userId,
  canEdit,
  showFieldHints,
  embedded,
}: {
  userId: string;
  canEdit: boolean;
  showFieldHints?: boolean;
  embedded?: boolean;
}) {
  const confirm = useConfirm();
  const { data: rows, refetch, isLoading } = useQuery({
    queryKey: ['education', userId],
    queryFn: () => api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/education`),
  });
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [inst, setInst] = useState('');
  const [degree, setDegree] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [eInst, setEInst] = useState('');
  const [eDegree, setEDegree] = useState('');
  const [eStart, setEStart] = useState('');
  const [eEnd, setEEnd] = useState('');
  const [isAddingEducation, setIsAddingEducation] = useState(false);
  const [isUpdatingEducation, setIsUpdatingEducation] = useState(false);

  const resetAddForm = () => {
    setInst('');
    setDegree('');
    setStart('');
    setEnd('');
  };

  const closeAddModal = () => {
    setShowAdd(false);
    resetAddForm();
  };

  const beginEdit = (e: any) => {
    setEditId(e.id);
    setEInst(e.college_institution || '');
    setEDegree(e.degree || '');
    setEStart(e.start_date ? String(e.start_date).slice(0, 10) : '');
    setEEnd(e.end_date ? String(e.end_date).slice(0, 10) : '');
  };

  const closeEditModal = () => {
    setEditId(null);
  };

  const add = async () => {
    if (isAddingEducation) return;
    try {
      if (!inst.trim()) {
        toast.error('Institution required');
        return;
      }
      setIsAddingEducation(true);
      const startDate = start ? `${start.slice(0, 7)}-01` : null;
      const endDate = end ? `${end.slice(0, 7)}-01` : null;
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/education`, {
        college_institution: inst,
        degree,
        start_date: startDate,
        end_date: endDate,
      });
      toast.success('Added');
      closeAddModal();
      await refetch();
    } catch (_e) {
      toast.error('Failed');
    } finally {
      setIsAddingEducation(false);
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
      if (editId === id) setEditId(null);
      await refetch();
    } catch (_e) {
      toast.error('Failed');
    }
  };

  const update = async () => {
    if (!editId || isUpdatingEducation) return;
    try {
      if (!eInst.trim()) {
        toast.error('Institution required');
        return;
      }
      setIsUpdatingEducation(true);
      const startDate = eStart ? `${eStart.slice(0, 7)}-01` : null;
      const endDate = eEnd ? `${eEnd.slice(0, 7)}-01` : null;
      await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/education/${encodeURIComponent(editId)}`, {
        college_institution: eInst,
        degree: eDegree,
        start_date: startDate,
        end_date: endDate,
      });
      toast.success('Updated');
      closeEditModal();
      await refetch();
    } catch (_e) {
      toast.error('Failed');
    } finally {
      setIsUpdatingEducation(false);
    }
  };

  const renderEducationFormFields = (mode: 'create' | 'edit') => {
    const isCreate = mode === 'create';
    return (
      <div className="grid gap-2.5 md:grid-cols-2">
        <AppInput
          label="Institution"
          value={isCreate ? inst : eInst}
          onChange={(e) => (isCreate ? setInst : setEInst)(e.target.value)}
          fieldHint={showFieldHints ? userProfileFieldHint('college_institution') : undefined}
        />
        <AppInput
          label="Degree"
          value={isCreate ? degree : eDegree}
          onChange={(e) => (isCreate ? setDegree : setEDegree)(e.target.value)}
          fieldHint={showFieldHints ? userProfileFieldHint('degree') : undefined}
        />
        <AppDatePicker
          label="Start date"
          value={isCreate ? start : eStart}
          onChange={(e) => (isCreate ? setStart : setEStart)(e.target.value)}
          fieldHint={showFieldHints ? userProfileFieldHint('education_start') : undefined}
        />
        <AppDatePicker
          label="End date"
          value={isCreate ? end : eEnd}
          onChange={(e) => (isCreate ? setEnd : setEEnd)(e.target.value)}
          fieldHint={showFieldHints ? userProfileFieldHint('education_end') : undefined}
        />
      </div>
    );
  };

  const educationDegreeLine = (e: any) => [e.degree, e.major_specialization].filter(Boolean).join(' · ');

  const renderEducationEditCardField = (label: string, value: ReactNode) => (
    <div className="min-w-0 space-y-1">
      <div className={uiTypography.controlLabel}>{label}</div>
      <div className={uiCx(uiTypography.helper, 'truncate font-medium text-gray-900')}>{value}</div>
    </div>
  );

  const renderEducationEditCardFields = (e: any, actions: ReactNode) => (
    <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_auto] items-stretch gap-x-3">
      {renderEducationEditCardField('Institution', e.college_institution || '—')}
      {renderEducationEditCardField('Degree', educationDegreeLine(e) || '—')}
      <div className="min-w-0 space-y-1">
        <div className={uiTypography.controlLabel}>Dates</div>
        <div className={uiCx(uiTypography.helper, 'whitespace-nowrap font-medium text-gray-900')}>
          {formatEducationPeriod(e.start_date, e.end_date)}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 self-stretch pl-1">{actions}</div>
    </div>
  );

  const educationReadOnlyCards = (
    <div className={uiCx('grid gap-3', (rows || []).length > 1 && 'md:grid-cols-2')}>
      {(rows || []).map((e: any) => (
        <UserEducationRecordCard key={e.id}>
          <div className="grid gap-4 md:grid-cols-2">
            <UserEducationReadOnlyField label="Institution" value={e.college_institution || '—'} />
            <UserEducationReadOnlyField label="Degree" value={educationDegreeLine(e) || '—'} />
            <UserEducationReadOnlyField label="Dates" value={formatEducationPeriod(e.start_date, e.end_date)} />
          </div>
        </UserEducationRecordCard>
      ))}
    </div>
  );

  const educationEditCards = (
    <div className="flex flex-col gap-3">
      {(rows || []).map((e: any) => (
        <UserEducationRecordCard key={e.id}>
          {renderEducationEditCardFields(
            e,
            <>
              <AppListRowIconButton preset="edit" label="Edit record" onClick={() => beginEdit(e)} />
              <AppListRowIconButton preset="delete" label="Delete record" onClick={() => del(e.id)} />
            </>,
          )}
        </UserEducationRecordCard>
      ))}
    </div>
  );

  if (!embedded) {
    if (isLoading || !(rows || []).length) return null;
    return educationReadOnlyCards;
  }

  return (
    <div>
      {isLoading ? (
        <div className={uiCx('h-28 animate-pulse rounded-lg bg-gray-100', uiRadius.control)} />
      ) : (
        <div className="flex flex-col gap-3">
          {canEdit ? (
            <AppListCreateItem
              label="Add education"
              layout="row"
              className="w-full"
              onClick={() => setShowAdd(true)}
            />
          ) : null}
          {!(rows || []).length ? (
            <AppEmptyState
              title="No education records yet"
              description='Add schools and degrees using "Add education" above.'
              className="border-0 bg-transparent p-0 py-6 shadow-none"
            />
          ) : (
            educationEditCards
          )}
        </div>
      )}

      <AppFormModal
        open={showAdd}
        onClose={closeAddModal}
        title="Add education"
        description="School, degree, and study dates."
        formWidth="comfortable"
        quickInfo={userEducationQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closeAddModal}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" disabled={isAddingEducation} loading={isAddingEducation} onClick={add}>
              {isAddingEducation ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        {renderEducationFormFields('create')}
      </AppFormModal>

      <AppFormModal
        open={editId !== null}
        onClose={closeEditModal}
        title="Edit education"
        description="School, degree, and study dates."
        formWidth="comfortable"
        quickInfo={userEducationQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closeEditModal}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              disabled={isUpdatingEducation}
              loading={isUpdatingEducation}
              onClick={update}
            >
              {isUpdatingEducation ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        {renderEducationFormFields('edit')}
      </AppFormModal>
    </div>
  );
}
