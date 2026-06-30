import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import EditProjectBillingModal from '@/components/EditProjectBillingModal';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppHeroEditButton,
  AppReadOnlyField,
  AppSectionHeader,
  appSectionPresetProps,
  uiCx,
  uiLayout,
  uiTypography,
} from '@/components/ui';

export type ProjectBillingProject = {
  id?: string;
  client_id?: string | null;
  name?: string | null;
  purchase_order_number?: string | null;
  billing_contact?: string | null;
  invoice_to?: string | null;
  billing_email?: string | null;
  po_required?: boolean | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_country?: string | null;
  billing_province?: string | null;
  billing_city?: string | null;
  billing_postal_code?: string | null;
  billing_differs_from_customer?: boolean;
  invoice_blocked_reason?: string | null;
};

type Props = {
  projectId: string;
  project: ProjectBillingProject | null | undefined;
  canEdit: boolean;
  designSystem?: boolean;
  onSaved?: () => void;
};

export default function ProjectBillingSection({
  projectId,
  project,
  canEdit,
  designSystem = false,
  onSaved,
}: Props) {
  const confirm = useConfirm();
  const [editOpen, setEditOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [display, setDisplay] = useState<ProjectBillingProject>({});

  const hydrateFromProject = useCallback((p: ProjectBillingProject) => {
    setDisplay({
      purchase_order_number: p.purchase_order_number ?? null,
      invoice_to: p.invoice_to ?? null,
      billing_contact: p.billing_contact ?? null,
      billing_email: p.billing_email ?? null,
      po_required: p.po_required ?? false,
      billing_address_line1: p.billing_address_line1 ?? null,
      billing_address_line2: p.billing_address_line2 ?? null,
      billing_country: p.billing_country ?? null,
      billing_province: p.billing_province ?? null,
      billing_city: p.billing_city ?? null,
      billing_postal_code: p.billing_postal_code ?? null,
      billing_differs_from_customer: p.billing_differs_from_customer ?? false,
      invoice_blocked_reason: p.invoice_blocked_reason ?? null,
      client_id: p.client_id ?? null,
      name: p.name ?? null,
    });
  }, []);

  useEffect(() => {
    if (project) hydrateFromProject(project);
  }, [project, hydrateFromProject]);

  const handleSync = async () => {
    if (!canEdit || isSyncing || !display.client_id) return;
    const ok = await confirm({
      title: 'Sync with Customer',
      message:
        'This will replace the current project billing information with the latest Customer billing information. Continue?',
      confirmText: 'Continue',
      cancelText: 'Cancel',
    });
    if (ok !== 'confirm') return;
    try {
      setIsSyncing(true);
      const data = await api<Record<string, unknown>>(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/billing/sync-from-client`,
      );
      hydrateFromProject({
        ...display,
        purchase_order_number: (data.purchase_order_number as string) ?? display.purchase_order_number,
        invoice_to: (data.invoice_to as string) ?? null,
        billing_contact: (data.billing_contact as string) ?? null,
        billing_email: (data.billing_email as string) ?? null,
        po_required: Boolean(data.po_required),
        billing_address_line1: (data.billing_address_line1 as string) ?? null,
        billing_address_line2: (data.billing_address_line2 as string) ?? null,
        billing_country: (data.billing_country as string) ?? null,
        billing_province: (data.billing_province as string) ?? null,
        billing_city: (data.billing_city as string) ?? null,
        billing_postal_code: (data.billing_postal_code as string) ?? null,
        billing_differs_from_customer: false,
        invoice_blocked_reason: (data.invoice_blocked_reason as string) ?? null,
      });
      toast.success('Billing synced from Customer');
      onSaved?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const headerActions = (
    <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-center gap-2')}>
      {canEdit && display.client_id ? (
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
          loading={isSyncing}
        >
          Sync with Customer
        </AppButton>
      ) : null}
      {canEdit ? (
        <AppHeroEditButton onClick={() => setEditOpen(true)} title="Edit Billing Information" />
      ) : null}
    </div>
  );

  const body = (
    <div className="space-y-4">
      <p className={uiTypography.helper}>
        This information was copied from the Customer when this project was created.
      </p>

      {display.billing_differs_from_customer ? (
        <AppBadge variant="warning">Billing Information differs from Customer</AppBadge>
      ) : null}

      {display.invoice_blocked_reason ? (
        <div className={uiCx('rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900')}>
          {display.invoice_blocked_reason}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <AppReadOnlyField label="PO Required" value={display.po_required ? 'Yes' : 'No'} />
        <AppReadOnlyField label="PO Number" value={display.purchase_order_number} />
      </div>

      <div className="border-t border-gray-100 pt-4">
        <div className="mb-3 text-sm font-semibold text-gray-900">Billing Contact</div>
        <div className="grid gap-4 md:grid-cols-2">
          <AppReadOnlyField label="Invoice To" value={display.invoice_to} />
          <AppReadOnlyField label="Billing Contact" value={display.billing_contact} />
          <AppReadOnlyField label="Billing Email" value={display.billing_email} />
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <div className="mb-3 text-sm font-semibold text-gray-900">Billing Address</div>
        <div className="grid gap-4 md:grid-cols-2">
          <AppReadOnlyField label="Billing Address" value={display.billing_address_line1} className="md:col-span-2" />
          <AppReadOnlyField label="Billing Country" value={display.billing_country} />
          <AppReadOnlyField label="Billing Province/State" value={display.billing_province} />
          <AppReadOnlyField label="Billing City" value={display.billing_city} />
          <AppReadOnlyField label="Billing Postal Code" value={display.billing_postal_code} />
        </div>
      </div>
    </div>
  );

  const modal = (
    <EditProjectBillingModal
      open={editOpen}
      projectId={projectId}
      project={display}
      projectName={display.name ?? project?.name}
      onClose={() => setEditOpen(false)}
      onSaved={onSaved}
    />
  );

  if (designSystem) {
    return (
      <>
        <AppCard className="mt-6">
          <AppSectionHeader
            title="Billing Information"
            description="Preferences used for invoices and payments."
            {...appSectionPresetProps('billing')}
            action={headerActions}
          />
          <div className="mt-4">{body}</div>
        </AppCard>
        {modal}
      </>
    );
  }

  return (
    <>
      <div className="mt-6 rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Billing Information</div>
          {headerActions}
        </div>
        <div className="p-3">{body}</div>
      </div>
      {modal}
    </>
  );
}
