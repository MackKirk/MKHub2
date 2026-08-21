import { useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fetchAuthorizedBinary } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import SignatureTemplateEditor, { type SigTemplatePayload } from '@/components/SignatureTemplateEditor';
import PdfSignatureDocumentLibrary from '@/components/PdfSignatureDocumentLibrary';
import { onboardingDocPreferencesQuickInfo } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppCard,
  AppCheckbox,
  AppControlLabelRow,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppMultiSelect,
  AppPageHeader,
  AppSectionHeader,
  AppSelect,
  AppTable,
  AppTabs,
  AppTextarea,
  AppUserSelect,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
  type AppUserSelectUser,
} from '@/components/ui';

type UserPickerRow = { id: string; name?: string | null; username?: string; email?: string };

type BaseDoc = {
  id: string;
  name: string;
  file_id: string;
  default_deadline_days: number;
  sign_placement?: Record<string, number>;
  assignee_type?: string;
  assignee_user_id?: string | null;
  assignee_user_ids?: string[];
  required?: boolean;
  employee_visible?: boolean;
  display_name?: string | null;
  notification_message?: string | null;
  delivery_mode?: string;
  delivery_amount?: number | null;
  delivery_unit?: string | null;
  delivery_direction?: string | null;
  requires_signature?: boolean;
  notification_policy?: Record<string, unknown> | null;
  signing_deadline_days?: number;
  signature_template?: { version: number; fields: unknown[] } | null;
};

type Tab = 'docs' | 'monitor';

function userDisplayName(u: { name?: string | null; username?: string; email?: string }): string {
  return (u.name || '').trim() || u.username || u.email || 'User';
}

function mapUserPickerRow(u: UserPickerRow): AppUserSelectUser {
  return {
    id: u.id,
    name: (u.name || u.email || u.username || '').trim() || undefined,
    username: u.username,
  };
}

const NOTIFICATION_PRESETS = [
  { value: 'soon_after_available', label: 'Soon after document is available' },
  { value: 'placeholder', label: 'Default (notifications not sent yet)' },
];

export default function OnboardingAdmin() {
  const qc = useQueryClient();
  const askConfirm = useConfirm();
  const [tab, setTab] = useState<Tab>('docs');
  const [resendModalOpen, setResendModalOpen] = useState(false);
  const { data: baseDocs = [], refetch: refetchDocs } = useQuery({
    queryKey: ['onb-base-docs'],
    queryFn: () => api<BaseDoc[]>('GET', '/onboarding/base-documents'),
  });
  const { data: onbSettings } = useQuery({
    queryKey: ['onboarding-settings'],
    queryFn: () => api<{ document_delivery_enabled: boolean }>('GET', '/onboarding/settings'),
  });
  const [deliveryTogglePending, setDeliveryTogglePending] = useState(false);
  const { data: userPickerList = [], isLoading: usersPickerLoading } = useQuery({
    queryKey: ['onb-users-picker'],
    queryFn: async () => {
      const limit = 2000;
      let page = 1;
      const out: UserPickerRow[] = [];
      for (;;) {
        const res = await api<{ items: UserPickerRow[]; total_pages: number }>('GET', `/users?page=${page}&limit=${limit}`);
        const items = res?.items ?? [];
        out.push(...items);
        if (!res?.total_pages || page >= res.total_pages) break;
        page += 1;
      }
      return out.sort((a, b) => userDisplayName(a).localeCompare(userDisplayName(b)));
    },
    enabled: tab === 'docs' || resendModalOpen,
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ['onb-assignments'],
    queryFn: () => api<any[]>('GET', '/onboarding/assignments'),
    enabled: tab === 'monitor',
  });

  const [resendDocIds, setResendDocIds] = useState<Set<string>>(() => new Set());
  const [resendSelectedIds, setResendSelectedIds] = useState<Set<string>>(() => new Set());

  const [prefsDoc, setPrefsDoc] = useState<BaseDoc | null>(null);
  const [templateDoc, setTemplateDoc] = useState<BaseDoc | null>(null);
  const [pfAssigneeType, setPfAssigneeType] = useState<'employee' | 'user'>('employee');
  const [pfAssigneeUserIds, setPfAssigneeUserIds] = useState<Set<string>>(() => new Set());
  const [pfRequired, setPfRequired] = useState(true);
  const [pfEmployeeVisible, setPfEmployeeVisible] = useState(true);
  const [pfDisplayName, setPfDisplayName] = useState('');
  const [pfMessage, setPfMessage] = useState('');
  const [pfDelivery, setPfDelivery] = useState<'none' | 'on_hire' | 'custom'>('on_hire');
  const [pfAmt, setPfAmt] = useState(1);
  const [pfUnit, setPfUnit] = useState<'days' | 'weeks' | 'months'>('months');
  const [pfDir, setPfDir] = useState<'before' | 'after'>('after');
  const [pfNotifTiming, setPfNotifTiming] = useState('placeholder');
  const [pfReqSig, setPfReqSig] = useState(true);
  const [pfSigningDays, setPfSigningDays] = useState(7);
  const [pfSaving, setPfSaving] = useState(false);

  useEffect(() => {
    if (!prefsDoc) return;
    setPfAssigneeType((prefsDoc.assignee_type || 'employee').toLowerCase() === 'user' ? 'user' : 'employee');
    const ids =
      prefsDoc.assignee_user_ids && prefsDoc.assignee_user_ids.length > 0
        ? prefsDoc.assignee_user_ids
        : prefsDoc.assignee_user_id
          ? [prefsDoc.assignee_user_id]
          : [];
    setPfAssigneeUserIds(new Set(ids));
    setPfRequired(prefsDoc.required !== false);
    setPfEmployeeVisible(prefsDoc.employee_visible !== false);
    setPfDisplayName(prefsDoc.display_name || '');
    setPfMessage(prefsDoc.notification_message || '');
    const mode = (prefsDoc.delivery_mode || 'on_hire').toLowerCase();
    if (mode === 'none') setPfDelivery('none');
    else if (mode === 'custom') setPfDelivery('custom');
    else setPfDelivery('on_hire');
    setPfAmt(prefsDoc.delivery_amount || 1);
    setPfUnit((prefsDoc.delivery_unit as 'days' | 'weeks' | 'months') || 'months');
    setPfDir((prefsDoc.delivery_direction as 'before' | 'after') || 'after');
    setPfReqSig(prefsDoc.requires_signature !== false);
    const pol = prefsDoc.notification_policy as { timing?: string } | null;
    setPfNotifTiming(pol?.timing || 'placeholder');
    setPfSigningDays(Math.max(1, Number(prefsDoc.signing_deadline_days) || 7));
  }, [prefsDoc]);

  const setTabAndCollapse = (t: Tab) => {
    setPrefsDoc(null);
    setResendModalOpen(false);
    setTab(t);
  };

  const openDocPreferences = (d: BaseDoc) => {
    setPrefsDoc(d);
  };

  const saveDocPreferences = async () => {
    if (!prefsDoc) return;
    if (pfAssigneeType === 'user' && pfAssigneeUserIds.size === 0) {
      toast.error('Select at least one user for this document');
      return;
    }
    const mode = pfDelivery;
    const payload: Record<string, unknown> = {
      assignee_type: pfAssigneeType,
      assignee_user_id: null,
      assignee_user_ids: pfAssigneeType === 'user' ? Array.from(pfAssigneeUserIds) : null,
      required: pfRequired,
      employee_visible: pfEmployeeVisible,
      display_name: pfDisplayName.trim() || null,
      notification_message: pfMessage.trim() || null,
      delivery_mode: mode,
      requires_signature: pfReqSig,
      notification_policy: { timing: pfNotifTiming },
      signing_deadline_days: Math.max(1, pfSigningDays),
    };
    if (mode === 'custom') {
      payload.delivery_amount = pfAmt;
      payload.delivery_unit = pfUnit;
      payload.delivery_direction = pfDir;
    } else {
      payload.delivery_amount = null;
      payload.delivery_unit = null;
      payload.delivery_direction = null;
    }
    setPfSaving(true);
    try {
      await api('PUT', `/onboarding/base-documents/${prefsDoc.id}`, payload);
      toast.success('Saved');
      setPrefsDoc(null);
      refetchDocs();
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setPfSaving(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'docs', label: 'Documents' },
    { id: 'monitor', label: 'Monitoring' },
  ];

  const tabItems = useMemo(() => tabs.map(({ id, label }) => ({ key: id, label })), [tabs]);

  const userPickerUsers = useMemo(() => userPickerList.map(mapUserPickerRow), [userPickerList]);

  const docMultiOptions = useMemo(
    () => baseDocs.map((d) => ({ value: d.id, label: d.name })),
    [baseDocs],
  );

  const documentDeliveryEnabled = onbSettings?.document_delivery_enabled !== false;

  const setDocumentDeliveryEnabled = async (enabled: boolean) => {
    setDeliveryTogglePending(true);
    try {
      await api('PATCH', '/onboarding/settings', { document_delivery_enabled: enabled });
      await qc.invalidateQueries({ queryKey: ['onboarding-settings'] });
      toast.success(
        enabled
          ? 'New hires will receive onboarding documents for signature.'
          : 'Automatic document delivery is off. New hires will not be assigned signing tasks.',
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not update settings');
    } finally {
      setDeliveryTogglePending(false);
    }
  };

  const assignmentTableRows = useMemo(
    () =>
      assignments.map((a) => [
        <span key={`${a.id}-user`} className={uiTypography.sectionTitle}>
          {a.username}
        </span>,
        <span key={`${a.id}-pkg`}>{a.package_name}</span>,
        <span key={`${a.id}-pending`} className="tabular-nums">
          {a.items_pending}
        </span>,
        <span key={`${a.id}-assigned`}>{a.assigned_at?.slice(0, 10)}</span>,
        <div key={`${a.id}-action`} className="text-right">
          <AppButton
            type="button"
            size="sm"
            variant="secondary"
            disabled={Number(a.items_pending ?? 0) < 1}
            onClick={async () => {
              const result = await askConfirm({
                title: 'Cancel pending documents',
                message:
                  'Remove all documents that are waiting for signature (pending or scheduled) for this assignment? Signed documents are not affected.',
                confirmText: 'Cancel pending',
                cancelText: 'Back',
              });
              if (result !== 'confirm') return;
              try {
                const r = await api<{ cancelled: number; assignment_removed: boolean }>(
                  'POST',
                  `/onboarding/assignments/${a.id}/cancel-pending`,
                  {},
                );
                if (r.cancelled === 0) {
                  toast.error('Nothing to cancel');
                } else {
                  toast.success(
                    r.assignment_removed
                      ? `Cancelled ${r.cancelled} item(s); assignment removed (no items left).`
                      : `Cancelled ${r.cancelled} pending item(s).`,
                  );
                }
                void qc.invalidateQueries({ queryKey: ['onb-assignments'] });
                void qc.invalidateQueries({ queryKey: ['me-onboarding-docs'] });
                void qc.invalidateQueries({ queryKey: ['me-onboarding-status'] });
                void qc.invalidateQueries({ queryKey: ['notifications-recent'] });
                void qc.invalidateQueries({ queryKey: ['notifications-all'] });
                void qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Request failed');
              }
            }}
          >
            Cancel pending
          </AppButton>
        </div>,
      ]),
    [assignments, askConfirm, qc],
  );

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="HR Onboarding"
        subtitle="Onboarding documents and registration assignments"
        icon={<ClipboardList className="h-4 w-4" />}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')}>
          <AppTabs tabs={tabItems} value={tab} onChange={(key) => setTabAndCollapse(key as Tab)} />
          <label className={uiCx(uiLayout.actionsRow, 'shrink-0 cursor-pointer select-none gap-2.5')}>
            <span className={uiTypography.body}>Send documents for signature</span>
            <button
              type="button"
              role="switch"
              aria-checked={documentDeliveryEnabled}
              aria-label="Send documents for signature"
              disabled={deliveryTogglePending || onbSettings === undefined}
              onClick={() => setDocumentDeliveryEnabled(!documentDeliveryEnabled)}
              className={uiCx(
                'relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1 disabled:opacity-50',
                documentDeliveryEnabled ? 'border-gray-900 bg-gray-900' : 'border-gray-300 bg-gray-200',
              )}
            >
              <span
                className={uiCx(
                  'pointer-events-none mt-0.5 inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                  documentDeliveryEnabled ? 'ml-0.5 translate-x-5' : 'translate-x-0.5',
                )}
              />
            </button>
          </label>
        </div>
      </AppCard>

      {tab === 'docs' && (
        <div className={uiSpacing.sectionStack}>
          <PdfSignatureDocumentLibrary
            documents={baseDocs}
            fileCategoryId="onboarding-base"
            thumbnailUrl={(id) => `/onboarding/base-documents/${id}/thumbnail`}
            previewUrl={(id) => `/onboarding/base-documents/${id}/preview`}
            sectionTitle="Base documents (PDF)"
            emptyTitle="No base documents yet."
            emptyDescription="Upload PDFs above."
            extraMenuItems={[{ label: 'Preferences', onSelect: openDocPreferences }]}
            deleteConfirmMessage={(doc) =>
              `Delete "${doc.name}"? Pending assignments may block this.`
            }
            onCreate={async (name, fileId) => {
              await api('POST', '/onboarding/base-documents', { name, file_id: fileId });
              await refetchDocs();
            }}
            onDelete={async (doc) => {
              await api('DELETE', `/onboarding/base-documents/${doc.id}`);
              await refetchDocs();
            }}
            onEditTemplate={(doc) => setTemplateDoc(doc)}
          />
        </div>
      )}

      <AppFormModal
        open={!!prefsDoc}
        onClose={() => setPrefsDoc(null)}
        title="Document preferences"
        description={
          prefsDoc ? (
            <>
              <span className="block truncate" title={prefsDoc.name}>
                {prefsDoc.name}
              </span>
              <span className="block">Applied when a new user completes the profile onboarding steps.</span>
            </>
          ) : null
        }
        formWidth="wide"
        dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
        dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
        quickInfo={onboardingDocPreferencesQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setPrefsDoc(null)}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              loading={pfSaving}
              disabled={pfSaving}
              onClick={() => void saveDocPreferences()}
            >
              Save
            </AppButton>
          </div>
        }
      >
        {prefsDoc ? (
          <div className={uiSpacing.sectionStack}>
            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <AppSectionHeader title="Assignment" />
              <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
                <div>
                  <AppControlLabelRow
                    label="Send to"
                    fieldHint={
                      <AppFieldHint hint="Send to\n\nEmployee = the new hire receives this document. Specific users = selected users each get a copy to sign with context about the new hire. After signing, the PDF is always saved in the new hire's HR documents folder (including when a specific user signs)." />
                    }
                  />
                  <fieldset className={uiCx('mt-2', uiSpacing.sectionStack)}>
                    <legend className="sr-only">Send to</legend>
                    <label className={uiCx('flex cursor-pointer items-center gap-2', uiTypography.body)}>
                      <input
                        type="radio"
                        name="pfAssignee"
                        className="text-brand-red focus:ring-brand-red"
                        checked={pfAssigneeType === 'employee'}
                        onChange={() => {
                          setPfAssigneeType('employee');
                          setPfAssigneeUserIds(new Set());
                        }}
                      />
                      Employee (new hire)
                    </label>
                    <label className={uiCx('flex cursor-pointer items-center gap-2', uiTypography.body)}>
                      <input
                        type="radio"
                        name="pfAssignee"
                        className="text-brand-red focus:ring-brand-red"
                        checked={pfAssigneeType === 'user'}
                        onChange={() => setPfAssigneeType('user')}
                      />
                      Specific users
                    </label>
                  </fieldset>
                  {pfAssigneeType === 'user' ? (
                    <div className={uiCx('relative z-[1] mt-3', uiSpacing.sectionStack)}>
                      <AppUserSelect
                        mode="multiple"
                        label="Choose signers"
                        users={userPickerUsers}
                        value={Array.from(pfAssigneeUserIds)}
                        onChange={(ids) => setPfAssigneeUserIds(new Set(ids))}
                        disabled={usersPickerLoading || userPickerList.length === 0}
                        placeholder="Search users to add…"
                        fieldHint="Choose signers\n\nSearch and select one or more users. Each selected user receives a copy to sign; selections appear as chips below the field."
                      />
                      <p className={uiTypography.helper}>
                        {userPickerList.length} user{userPickerList.length === 1 ? '' : 's'} in directory
                      </p>
                      {usersPickerLoading ? <p className={uiTypography.helper}>Loading users…</p> : null}
                      {!usersPickerLoading && userPickerList.length === 0 ? (
                        <p className="text-xs text-amber-800">No users found.</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className={uiCx('grid grid-cols-1 gap-4 border-t border-gray-100 pt-2 sm:grid-cols-2')}>
                  <AppCheckbox
                    label="Required"
                    checked={pfRequired}
                    onChange={setPfRequired}
                    fieldHint="Required\n\nWhen checked, this document must be signed before onboarding can complete (when delivery is enabled)."
                  />
                  <AppCheckbox
                    label="Active"
                    checked={pfEmployeeVisible}
                    onChange={setPfEmployeeVisible}
                    fieldHint="Active\n\nInactive documents are not assigned during onboarding."
                  />
                </div>
              </div>
            </AppCard>

            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <AppSectionHeader title="Signing and deadlines" />
              <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
                <AppInput
                  type="number"
                  min={1}
                  label="Days to sign after available"
                  value={pfSigningDays}
                  onChange={(e) => setPfSigningDays(Math.max(1, +e.target.value || 7))}
                  fieldHint="Days to sign after available\n\nAfter this window with pending required documents, the app may block access until signing is completed."
                />
                <AppCheckbox
                  label="Require e-signature (PDF)"
                  checked={pfReqSig}
                  onChange={setPfReqSig}
                  className="border-t border-gray-100 pt-1"
                  fieldHint="Require e-signature (PDF)\n\nWhen enabled, the signer must apply an e-signature on the PDF."
                />
              </div>
            </AppCard>

            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <AppSectionHeader title="Availability and notifications" />
              <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
                <div>
                  <AppControlLabelRow
                    label="Available for signature"
                    fieldHint={
                      <AppFieldHint hint="Available for signature\n\nControls when the document is assigned: manual only (use Resend), on the hire date, or a custom offset before or after the hire date." />
                    }
                  />
                  <fieldset className={uiCx('mt-2', uiSpacing.sectionStack)}>
                    <legend className="sr-only">Available for signature</legend>
                    <label className={uiCx('flex cursor-pointer items-center gap-2', uiTypography.body)}>
                      <input
                        type="radio"
                        name="pfDel"
                        className="text-brand-red focus:ring-brand-red"
                        checked={pfDelivery === 'none'}
                        onChange={() => setPfDelivery('none')}
                      />
                      Manual only (use Resend)
                    </label>
                    <label className={uiCx('flex cursor-pointer items-center gap-2', uiTypography.body)}>
                      <input
                        type="radio"
                        name="pfDel"
                        className="text-brand-red focus:ring-brand-red"
                        checked={pfDelivery === 'on_hire'}
                        onChange={() => setPfDelivery('on_hire')}
                      />
                      On hire date
                    </label>
                    <label className={uiCx('flex cursor-pointer items-center gap-2', uiTypography.body)}>
                      <input
                        type="radio"
                        name="pfDel"
                        className="text-brand-red focus:ring-brand-red"
                        checked={pfDelivery === 'custom'}
                        onChange={() => setPfDelivery('custom')}
                      />
                      Custom relative to hire date
                    </label>
                  </fieldset>
                  {pfDelivery === 'custom' ? (
                    <div className={uiCx('mt-3 flex flex-wrap items-end gap-2 pl-1')}>
                      <AppInput
                        type="number"
                        min={1}
                        label="Amount"
                        value={pfAmt}
                        onChange={(e) => setPfAmt(+e.target.value || 1)}
                        className="w-20"
                        fieldHint="Amount\n\nNumber of days, weeks, or months relative to the hire date."
                      />
                      <AppSelect
                        label="Unit"
                        value={pfUnit}
                        onChange={(e) => setPfUnit(e.target.value as 'days' | 'weeks' | 'months')}
                        options={[
                          { value: 'days', label: 'Days' },
                          { value: 'weeks', label: 'Weeks' },
                          { value: 'months', label: 'Months' },
                        ]}
                        triggerClassName="min-w-[7rem]"
                        fieldHint="Unit\n\nTime unit for the custom offset from the hire date."
                      />
                      <AppSelect
                        label="Direction"
                        value={pfDir}
                        onChange={(e) => setPfDir(e.target.value as 'before' | 'after')}
                        options={[
                          { value: 'after', label: 'after' },
                          { value: 'before', label: 'before' },
                        ]}
                        triggerClassName="min-w-[6rem]"
                        fieldHint="Direction\n\nWhether the offset is before or after the hire date."
                      />
                      <span className={uiCx(uiTypography.body, 'pb-2')}>hire date</span>
                    </div>
                  ) : null}
                </div>
                <AppSelect
                  label="When to notify"
                  value={pfNotifTiming}
                  onChange={(e) => setPfNotifTiming(e.target.value)}
                  options={NOTIFICATION_PRESETS}
                  fieldHint="When to notify\n\nControls when a notification may be sent after the document becomes available."
                />
              </div>
            </AppCard>

            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <AppSectionHeader title="Display and messaging" />
              <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
                <AppInput
                  label="Display name"
                  value={pfDisplayName}
                  onChange={(e) => setPfDisplayName(e.target.value)}
                  placeholder={prefsDoc.name}
                  fieldHint="Display name\n\nOptional label shown to the employee instead of the uploaded file name."
                />
                <AppTextarea
                  label="Message (notifications)"
                  value={pfMessage}
                  onChange={(e) => setPfMessage(e.target.value)}
                  placeholder="Shown when notifications are enabled"
                  rows={4}
                  fieldHint="Message (notifications)\n\nOptional text included when notifications are sent for this document."
                />
              </div>
            </AppCard>
          </div>
        ) : null}
      </AppFormModal>

      {tab === 'monitor' && (
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <AppSectionHeader
            title="Assignments"
            description="Users with onboarding assignments"
            action={
              <AppButton type="button" size="sm" onClick={() => setResendModalOpen(true)}>
                Resend
              </AppButton>
            }
          />
          <div className="mt-4">
            <AppTable
              columns={['User', 'Package', 'Pending', 'Assigned', 'Actions']}
              rows={assignmentTableRows}
              emptyState="No assignments yet."
              className="border-0 shadow-none [&_td:last-child]:text-right"
            />
          </div>
        </AppCard>
      )}

      <AppFormModal
        open={resendModalOpen}
        onClose={() => setResendModalOpen(false)}
        title="Resend document(s)"
        description="Choose one or more base documents and users. Each document is sent to each selected user."
        footer={
          <>
            <AppButton type="button" variant="secondary" onClick={() => setResendModalOpen(false)}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              onClick={async () => {
                const userIds = Array.from(resendSelectedIds);
                const docIds = Array.from(resendDocIds);
                if (docIds.length === 0 || userIds.length === 0) {
                  toast.error('Select at least one document and one user');
                  return;
                }
                try {
                  let created = 0;
                  for (const docId of docIds) {
                    const r = await api<{ created: number }>('POST', `/onboarding/base-documents/${docId}/resend`, {
                      user_ids: userIds,
                    });
                    created += r.created;
                  }
                  toast.success(`Created ${created} pending item(s)`);
                  setResendSelectedIds(new Set());
                  setResendDocIds(new Set());
                  qc.invalidateQueries({ queryKey: ['onb-assignments'] });
                  qc.invalidateQueries({ queryKey: ['me-onboarding-docs'] });
                  qc.invalidateQueries({ queryKey: ['me-onboarding-status'] });
                  qc.invalidateQueries({ queryKey: ['notifications-recent'] });
                  qc.invalidateQueries({ queryKey: ['notifications-all'] });
                  qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
                } catch (e: any) {
                  toast.error(e?.message || 'Failed');
                }
              }}
            >
              Resend
            </AppButton>
          </>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <AppMultiSelect
            searchable
            label="Base document(s)"
            options={docMultiOptions}
            value={Array.from(resendDocIds)}
            onChange={(ids) => setResendDocIds(new Set(ids))}
            disabled={baseDocs.length === 0}
            placeholder="Search document name…"
            helperText="Signing deadline for resend uses each base document's default (7 days), not the per-package setting."
          />
          <AppUserSelect
            mode="multiple"
            label="Users"
            users={userPickerUsers}
            value={Array.from(resendSelectedIds)}
            onChange={(ids) => setResendSelectedIds(new Set(ids))}
            disabled={usersPickerLoading || userPickerList.length === 0}
            placeholder="Search name, username, email…"
          />
          {usersPickerLoading ? <p className={uiTypography.helper}>Loading users…</p> : null}
          {!usersPickerLoading && userPickerList.length === 0 ? (
            <p className="text-xs text-amber-800">No users found.</p>
          ) : null}
        </div>
      </AppFormModal>

      {templateDoc ? (
        <SignatureTemplateEditor
          docId={templateDoc.id}
          docName={templateDoc.name}
          initialTemplate={templateDoc.signature_template as SigTemplatePayload | null | undefined}
          loadPdf={() => fetchAuthorizedBinary(`/onboarding/base-documents/${templateDoc.id}/preview`)}
          saveTemplate={(payload) => api('PUT', `/onboarding/base-documents/${templateDoc.id}`, payload)}
          onClose={() => setTemplateDoc(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ['onb-base-docs'] });
            toast.success('Signature template saved');
          }}
        />
      ) : null}
    </div>
  );
}
