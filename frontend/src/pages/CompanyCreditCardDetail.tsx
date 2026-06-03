import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import CompanyCreditCardAssignCustodyModal from '@/components/companyAssets/CompanyCreditCardAssignCustodyModal';
import CompanyCreditCardReturnCustodyModal from '@/components/companyAssets/CompanyCreditCardReturnCustodyModal';
import {
  CompanyCreditCardEditFormFields,
  type CompanyCreditCardEditFormValues,
} from '@/components/companyAssets/CompanyCreditCardEditFormFields';
import {
  CompanyCreditCardHero,
  CompanyCreditCardHeroSkeleton,
} from '@/components/companyAssets/CompanyCreditCardHero';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppPageHeader,
  AppSectionHeader,
  AppTabs,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
  type AppTabItem,
} from '@/components/ui';

type CardDto = {
  id: string;
  label: string;
  network: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  cardholder_name?: string | null;
  issuer?: string | null;
  billing_entity?: string | null;
  status: string;
  notes?: string | null;
};

type AssignmentRow = {
  id: string;
  assigned_to_user_id: string;
  assigned_at: string;
  returned_at?: string | null;
  assigned_to_name?: string | null;
  notes?: string | null;
  is_active: boolean;
};

const DETAIL_FORM_ID = 'company-credit-card-detail-form';

const TAB_ITEMS: AppTabItem[] = [
  { key: 'details', label: 'Details' },
  { key: 'custody', label: 'Custody' },
];

export default function CompanyCreditCardDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'details' | 'custody'>('details');
  const [showAssign, setShowAssign] = useState(false);
  const [showReturn, setShowReturn] = useState(false);

  const [editValues, setEditValues] = useState<CompanyCreditCardEditFormValues>({
    label: '',
    status: 'active',
    network: 'visa',
    last_four: '',
    expiry_month: '1',
    expiry_year: String(new Date().getFullYear()),
    cardholder_name: '',
    issuer: '',
    billing_entity: '',
    notes: '',
  });

  const isValidId = id && id !== 'new';

  const { data: card, isLoading } = useQuery({
    queryKey: ['company-credit-card', id],
    queryFn: () => api<CardDto>('GET', `/company-credit-cards/${id}`),
    enabled: !!isValidId,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['company-credit-card-assignments', id],
    queryFn: () => api<AssignmentRow[]>('GET', `/company-credit-cards/${id}/assignments`),
    enabled: !!isValidId,
  });

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdministrator = !!(me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');

  useEffect(() => {
    if (!card) return;
    setEditValues({
      label: card.label,
      status: card.status,
      network: card.network,
      last_four: card.last_four,
      expiry_month: String(card.expiry_month),
      expiry_year: String(card.expiry_year),
      cardholder_name: card.cardholder_name || '',
      issuer: card.issuer || '',
      billing_entity: card.billing_entity || '',
      notes: card.notes || '',
    });
  }, [card]);

  const activeAssignment = useMemo(() => assignments.find((a) => a.is_active), [assignments]);

  const handleEditChange = (field: keyof CompanyCreditCardEditFormValues, value: string) => {
    setEditValues((prev) => ({ ...prev, [field]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      api('PATCH', `/company-credit-cards/${id}`, {
        label: editValues.label.trim(),
        network: editValues.network,
        last_four: editValues.last_four.trim(),
        expiry_month: parseInt(editValues.expiry_month, 10),
        expiry_year: parseInt(editValues.expiry_year, 10),
        cardholder_name: editValues.cardholder_name.trim() || null,
        issuer: editValues.issuer.trim() || null,
        billing_entity: editValues.billing_entity.trim() || null,
        status: editValues.status,
        notes: editValues.notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['company-credit-card', id] });
      qc.invalidateQueries({ queryKey: ['company-credit-cards'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Save failed'),
  });

  const assignMutation = useMutation({
    mutationFn: (payload: { assigned_to_user_id: string; notes?: string }) =>
      api('POST', `/company-credit-cards/${id}/assign`, payload),
    onSuccess: () => {
      toast.success('Assigned');
      setShowAssign(false);
      qc.invalidateQueries({ queryKey: ['company-credit-card-assignments', id] });
      qc.invalidateQueries({ queryKey: ['company-credit-cards'] });
      qc.invalidateQueries({ queryKey: ['company-credit-card', id] });
    },
    onError: (e: any) => toast.error(e?.message || 'Assign failed'),
  });

  const returnMutation = useMutation({
    mutationFn: (notes?: string) =>
      api('POST', `/company-credit-cards/${id}/return`, {
        notes: notes || undefined,
      }),
    onSuccess: () => {
      toast.success('Return recorded');
      setShowReturn(false);
      qc.invalidateQueries({ queryKey: ['company-credit-card-assignments', id] });
      qc.invalidateQueries({ queryKey: ['company-credit-cards'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Return failed'),
  });

  const markCancelledMutation = useMutation({
    mutationFn: () => api('PATCH', `/company-credit-cards/${id}`, { status: 'cancelled' }),
    onSuccess: () => {
      toast.success('Card marked as cancelled');
      qc.invalidateQueries({ queryKey: ['company-credit-card', id] });
      qc.invalidateQueries({ queryKey: ['company-credit-cards'] });
      setEditValues((prev) => ({ ...prev, status: 'cancelled' }));
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to cancel'),
  });

  const [deletingCard, setDeletingCard] = useState(false);
  const deleteCardMutation = useMutation({
    mutationFn: () => api('DELETE', `/company-credit-cards/${id}`),
    onSuccess: () => {
      toast.success('Card record removed');
      qc.invalidateQueries({ queryKey: ['company-credit-cards'] });
      nav('/company-assets/credit-cards');
    },
    onError: (e: any) => toast.error(e?.message || 'Delete failed'),
  });

  const pageShellClass = uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50');

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const goBack = () => nav('/company-assets/credit-cards');

  const onSave = () => {
    if (!/^\d{4}$/.test(editValues.last_four.trim())) {
      toast.error('Last four must be 4 digits');
      return;
    }
    saveMutation.mutate();
  };

  if (!isValidId) {
    return (
      <div className={pageShellClass}>
        <AppPageHeader
          title="Corporate card"
          onBack={goBack}
          backLabel="Corporate cards"
          icon={<CreditCard className="h-4 w-4" />}
        />
        <AppCard>
          <p className={uiTypography.helper}>Invalid id</p>
        </AppCard>
      </div>
    );
  }

  if (isLoading || !card) {
    return (
      <div className={pageShellClass}>
        <AppPageHeader
          title="Corporate card"
          onBack={goBack}
          backLabel="Corporate cards"
          icon={<CreditCard className="h-4 w-4" />}
          actions={
            <div className="text-right">
              <div className={uiTypography.overline}>Today</div>
              <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
            </div>
          }
        />
        <CompanyCreditCardHeroSkeleton />
        <AppCard>
          <p className={uiCx(uiTypography.helper, 'py-4 text-center')}>Loading…</p>
        </AppCard>
      </div>
    );
  }

  const heroActions = (
    <>
      {card.status === 'active' ? (
        !activeAssignment ? (
          <AppButton
            type="button"
            size="sm"
            onClick={() => {
              setShowAssign(true);
              setTab('custody');
            }}
          >
            Assign custody
          </AppButton>
        ) : (
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setShowReturn(true);
              setTab('custody');
            }}
          >
            Record return
          </AppButton>
        )
      ) : null}
      <AppButton
        type="button"
        variant="danger"
        size="sm"
        disabled={markCancelledMutation.isPending || card.status !== 'active'}
        onClick={() => markCancelledMutation.mutate()}
      >
        Mark cancelled
      </AppButton>
      {isAdministrator ? (
        <AppButton
          type="button"
          variant="danger"
          size="sm"
          disabled={deletingCard || deleteCardMutation.isPending}
          loading={deletingCard || deleteCardMutation.isPending}
          onClick={async () => {
            const choice = await confirm({
              title: 'Delete corporate card',
              message:
                'Permanently remove this card record from MKHub (including custody history)? This cannot be undone.',
              confirmText: 'Delete permanently',
              cancelText: 'Cancel',
            });
            if (choice !== 'confirm') return;
            setDeletingCard(true);
            try {
              await deleteCardMutation.mutateAsync();
            } finally {
              setDeletingCard(false);
            }
          }}
        >
          Delete card
        </AppButton>
      ) : null}
    </>
  );

  const pageHeaderToday = (
    <div className="text-right">
      <div className={uiTypography.overline}>Today</div>
      <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
    </div>
  );

  return (
    <div className={pageShellClass}>
      <AppPageHeader
        title={card.label}
        subtitle="Last four digits & expiry only — assign custody like equipment"
        onBack={goBack}
        backLabel="Corporate cards"
        icon={<CreditCard className="h-4 w-4" />}
        actions={pageHeaderToday}
      />

      <CompanyCreditCardHero card={card} actions={heroActions} />

      <AppTabs tabs={TAB_ITEMS} value={tab} onChange={(k) => setTab(k as 'details' | 'custody')} />

      {tab === 'details' && (
        <AppCard>
          <AppSectionHeader title="Card record" />
          <CompanyCreditCardEditFormFields
            formId={DETAIL_FORM_ID}
            values={editValues}
            disabled={saveMutation.isPending}
            onChange={handleEditChange}
            onSubmit={onSave}
          />
          <div className={uiCx(uiLayout.actionsRow, 'mt-4 justify-end border-t border-gray-100 pt-4')}>
            <AppButton
              type="submit"
              form={DETAIL_FORM_ID}
              size="sm"
              disabled={saveMutation.isPending}
              loading={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save changes'}
            </AppButton>
          </div>
        </AppCard>
      )}

      {tab === 'custody' && (
        <div className={uiSpacing.sectionStack}>
          {activeAssignment ? (
            <AppCard>
              <AppSectionHeader title="Current custody" />
              <p className={uiCx(uiTypography.sectionTitle, 'text-gray-900')}>
                {activeAssignment.assigned_to_name || activeAssignment.assigned_to_user_id}
              </p>
              <p className={uiCx(uiTypography.helper, 'mt-1')}>
                Assigned {new Date(activeAssignment.assigned_at).toLocaleString()}
              </p>
            </AppCard>
          ) : null}

          <AppCard bodyClassName="!p-0">
            <div className={uiSpacing.cardPadding}>
              <AppSectionHeader
                title="Custody history"
                description="Who held the physical card and when it was returned."
              />
            </div>
            {assignments.length === 0 ? (
              <div className={uiCx(uiSpacing.cardPadding, 'border-t border-gray-100 pt-0')}>
                <AppEmptyState
                  title="No assignments yet"
                  description="Use Assign custody when someone receives the card."
                  className="border-0 bg-transparent p-0 shadow-none"
                />
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 border-t border-gray-100">
                {assignments.map((a) => (
                  <li
                    key={a.id}
                    className={uiCx(
                      uiLayout.actionsRow,
                      'flex-wrap items-start justify-between gap-3 px-4 py-4 transition-colors hover:bg-gray-50/80 sm:px-5',
                    )}
                  >
                    <div className="min-w-0">
                      <p className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>
                        {a.assigned_to_name || a.assigned_to_user_id}
                      </p>
                      <p className={uiCx(uiTypography.helper, 'mt-1')}>
                        Out {new Date(a.assigned_at).toLocaleString()}
                        {a.returned_at
                          ? ` · Returned ${new Date(a.returned_at).toLocaleString()}`
                          : ' · Still active'}
                      </p>
                      {a.notes ? (
                        <p className={uiCx(uiTypography.body, 'mt-2 whitespace-pre-wrap text-gray-600')}>{a.notes}</p>
                      ) : null}
                    </div>
                    <AppBadge variant={a.is_active ? 'info' : 'neutral'} className="shrink-0 !normal-case">
                      {a.is_active ? 'Active' : 'Closed'}
                    </AppBadge>
                  </li>
                ))}
              </ul>
            )}
          </AppCard>
        </div>
      )}

      <CompanyCreditCardAssignCustodyModal
        open={showAssign}
        cardLabel={card.label}
        onClose={() => setShowAssign(false)}
        onAssign={(data) => assignMutation.mutate(data)}
        isPending={assignMutation.isPending}
      />

      <CompanyCreditCardReturnCustodyModal
        open={showReturn}
        onClose={() => setShowReturn(false)}
        onConfirm={(notes) => returnMutation.mutate(notes)}
        isPending={returnMutation.isPending}
      />
    </div>
  );
}
