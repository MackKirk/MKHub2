import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import {
  useMemo,
  useState,
  useRef,
  useLayoutEffect,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import QuoteForm from '@/components/QuoteForm';
import ImagePicker from '@/components/ImagePicker';
import { useConfirm } from '@/components/ConfirmProvider';
import { QuoteOutcomeBadge } from '@/components/quotes/QuoteOutcomeBadge';
import { QuoteOutcomeModal } from '@/components/quotes/QuoteOutcomeModal';
import {
  parseQuoteOutcomeStatus,
  QUOTE_LOST_REASON_LABELS,
  type QuoteLostReason,
  type QuoteOutcomeStatus,
} from '@/pages/quotesOutcome';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppPageHeader,
  AppSectionHeader,
  AppUserAvatar,
  appSectionPresetProps,
  uiBorders,
  uiCx,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { getUserDisplayName } from '@/lib/userDisplay';
import {
  formatQuoteValueDisplay,
  getQuoteDocumentType,
  getQuoteValue,
} from '@/pages/quotesListUtils';
import { useNavigateBack } from '@/hooks/useNavigateBack';

/** Hero expand/collapse — same timing as ProjectDetail / CustomerDetail. */
const HERO_PANEL_EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';
const HERO_PANEL_TRANSITION_BASE = 'overflow-hidden';
const CUSTOMER_HERO_EXPANDED_MAX_PX = 320;
const HERO_EXPAND_BASE_MS = 1400;
const HERO_COLLAPSE_MS = 650;
const OPPORTUNITY_HERO_COLLAPSED_PX = 72;
const HERO_EXPAND_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

type Quote = {
  id: string;
  code?: string;
  name?: string;
  client_id?: string;
  estimator_id?: string;
  estimator_name?: string | null;
  estimator_avatar_file_id?: string | null;
  project_division_ids?: string[];
  order_number?: string;
  title?: string;
  data?: any;
  created_at?: string;
  updated_at?: string;
  outcome_status?: string;
  outcome_at?: string | null;
  outcome_set_by_id?: string | null;
  outcome_note?: string | null;
  lost_reason?: string | null;
  outcome_value?: number | null;
};

type ClientFile = {
  id: string;
  file_object_id: string;
  is_image?: boolean;
  content_type?: string;
  category?: string;
  original_name?: string;
  uploaded_at?: string;
};

/** Matches FleetAssetHero Assign / Return action tiles. */
const quoteHeroMarkResultButtonClass =
  'h-24 w-24 sm:h-28 sm:w-28 rounded-xl border-2 border-sky-400 bg-sky-50 text-sky-950 text-sm font-semibold shadow-sm hover:bg-sky-100 active:scale-[0.98] transition flex flex-col items-center justify-center gap-1 px-1 py-2 text-center leading-tight';

const quoteHeroChangeResultButtonClass =
  'h-24 w-24 sm:h-28 sm:w-28 rounded-xl border-2 border-gray-300 bg-gray-50 text-gray-800 text-sm font-semibold shadow-sm hover:bg-gray-100 active:scale-[0.98] transition flex flex-col items-center justify-center gap-1 px-1 py-2 text-center leading-tight';

function HeroField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className={uiTypography.overline}>{label}</span>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function QuoteDetailHero({
  quote,
  client,
  cover,
  documentTitle,
  estimatorUser,
  hasEditPermission,
  isHeroCollapsed,
  onToggleCollapse,
  onChangeCover,
  onEditOutcome,
  onDelete,
}: {
  quote: Quote;
  client?: { display_name?: string; name?: string } | null;
  cover: string;
  documentTitle: string;
  estimatorUser: ReturnType<typeof mapEmployeeToAppUserSelect> | null;
  hasEditPermission: boolean;
  isHeroCollapsed: boolean;
  onToggleCollapse: () => void;
  onChangeCover: () => void;
  onEditOutcome: () => void;
  onDelete: () => void;
}) {
  const heroMeasureRef = useRef<HTMLDivElement>(null);
  const [heroExpandedHeight, setHeroExpandedHeight] = useState(320);

  useLayoutEffect(() => {
    const el = heroMeasureRef.current;
    if (!el) return;
    const measure = () => setHeroExpandedHeight(el.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [quote, client, cover, documentTitle, estimatorUser]);

  const heroExpandMs = useMemo(
    () =>
      Math.min(
        3200,
        Math.round((heroExpandedHeight / CUSTOMER_HERO_EXPANDED_MAX_PX) * HERO_EXPAND_BASE_MS),
      ),
    [heroExpandedHeight],
  );

  const heroExpandedStyle = useMemo((): CSSProperties => {
    return {
      transitionProperty: 'max-height, opacity',
      transitionDuration: isHeroCollapsed ? `${HERO_COLLAPSE_MS}ms` : `${heroExpandMs}ms`,
      transitionTimingFunction: HERO_EXPAND_EASING,
      maxHeight: isHeroCollapsed ? 0 : heroExpandedHeight,
      opacity: isHeroCollapsed ? 0 : 1,
    };
  }, [isHeroCollapsed, heroExpandedHeight, heroExpandMs]);

  const heroCollapsedStyle = useMemo((): CSSProperties => {
    return {
      transitionProperty: 'max-height, opacity',
      transitionDuration: isHeroCollapsed ? `${HERO_EXPAND_BASE_MS}ms` : `${HERO_COLLAPSE_MS}ms`,
      transitionTimingFunction: HERO_EXPAND_EASING,
      maxHeight: isHeroCollapsed ? OPPORTUNITY_HERO_COLLAPSED_PX : 0,
      opacity: isHeroCollapsed ? 1 : 0,
    };
  }, [isHeroCollapsed]);

  const estimatedValue = getQuoteValue(quote);
  const created = (quote.created_at || '').slice(0, 10);
  const updated = (quote.updated_at || '').slice(0, 10);
  const outcomeAt = (quote.outcome_at || '').slice(0, 10);
  const outcomeStatus = parseQuoteOutcomeStatus(quote.outcome_status);
  const resultActionLabel = outcomeStatus === 'pending' ? 'Mark result' : 'Change result';
  const lostReasonLabel = quote.lost_reason
    ? QUOTE_LOST_REASON_LABELS[quote.lost_reason as QuoteLostReason] || quote.lost_reason
    : null;

  return (
    <AppCard className={uiCx('transition-[margin]', HERO_PANEL_EASE)} bodyClassName="relative overflow-hidden p-0">
      {/* Expanded */}
      <div
        className={HERO_PANEL_TRANSITION_BASE}
        style={heroExpandedStyle}
        aria-hidden={isHeroCollapsed}
      >
        <div ref={heroMeasureRef} className="overflow-visible p-2.5">
          <div className="flex items-center gap-5">
            <div className="w-48 shrink-0 overflow-visible">
              <div
                className={uiCx(
                  'group relative h-36 w-48 overflow-hidden',
                  uiRadius.card,
                  uiBorders.subtle,
                )}
              >
                <img src={cover} className="h-full w-full object-cover" alt="" />
                {hasEditPermission && (
                  <button
                    type="button"
                    onClick={onChangeCover}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    Change
                  </button>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1 self-start lg:flex lg:items-center lg:justify-between lg:gap-4">
              <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900">{documentTitle}</h3>
                <QuoteOutcomeBadge status={quote.outcome_status} />
              </div>

              <div className={uiCx('grid grid-cols-3', 'gap-x-2.5 gap-y-1')}>
                <div className="min-w-0 space-y-1">
                  <HeroField label="Code">
                    <div className="text-xs font-semibold text-gray-900">
                      {quote.code || quote.order_number || '—'}
                    </div>
                  </HeroField>
                  <HeroField label="Created">
                    <div className="text-xs font-semibold text-gray-900">{created || '—'}</div>
                  </HeroField>
                  <HeroField label="Updated">
                    <div className="text-xs font-semibold text-gray-900">{updated || '—'}</div>
                  </HeroField>
                </div>

                <div className="min-w-0 space-y-1">
                  <HeroField label="Project Owner / Source">
                    {quote.client_id ? (
                      <Link
                        to={`/customers/${encodeURIComponent(String(quote.client_id))}`}
                        className="block break-words text-xs font-semibold text-brand-red hover:underline"
                      >
                        {client?.display_name || client?.name || 'Open record'}
                      </Link>
                    ) : (
                      <div className="text-xs font-semibold text-gray-400">—</div>
                    )}
                  </HeroField>
                  <HeroField label="Estimated Value">
                    <div className="text-xs font-semibold text-brand-red">
                      {formatQuoteValueDisplay(estimatedValue)}
                    </div>
                  </HeroField>
                  {outcomeAt ? (
                    <HeroField label="Outcome date">
                      <div className="text-xs font-semibold text-gray-900">{outcomeAt}</div>
                    </HeroField>
                  ) : null}
                </div>

                <div className="min-w-0 space-y-1">
                  <HeroField label="Estimator">
                    {estimatorUser ? (
                      <div className="flex items-center gap-2">
                        <AppUserAvatar user={estimatorUser} size="sm" showTooltip />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-gray-900">
                            {getUserDisplayName(estimatorUser)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">—</div>
                    )}
                  </HeroField>
                  {lostReasonLabel ? (
                    <HeroField label="Lost reason">
                      <div className="text-xs font-semibold text-gray-900">{lostReasonLabel}</div>
                    </HeroField>
                  ) : null}
                  {quote.outcome_note ? (
                    <HeroField label="Outcome note">
                      <div className="text-xs text-gray-700 line-clamp-3">{quote.outcome_note}</div>
                    </HeroField>
                  ) : null}
                </div>
              </div>
              </div>

              {hasEditPermission ? (
                <div className="mt-4 flex flex-col items-center gap-1.5 lg:mt-0 lg:shrink-0 lg:self-center">
                  <button
                    type="button"
                    onClick={onEditOutcome}
                    className={
                      outcomeStatus === 'pending'
                        ? quoteHeroMarkResultButtonClass
                        : quoteHeroChangeResultButtonClass
                    }
                  >
                    <span>{resultActionLabel}</span>
                  </button>
                  <AppButton type="button" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onDelete}>
                    Delete quotation
                  </AppButton>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <AppButton
          type="button"
          variant="ghost"
          size="sm"
          className="absolute bottom-2 right-2 z-20 p-1"
          onClick={onToggleCollapse}
          title="Collapse"
          aria-label="Collapse"
        >
          <ChevronUp className="h-3 w-3" />
        </AppButton>
      </div>

      {/* Collapsed */}
      <div
        className={HERO_PANEL_TRANSITION_BASE}
        style={heroCollapsedStyle}
        aria-hidden={!isHeroCollapsed}
      >
        <div className="p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-bold text-gray-900">{documentTitle}</h3>
                <QuoteOutcomeBadge status={quote.outcome_status} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3 pr-8">
              {estimatorUser ? (
                <div className="flex items-center gap-2">
                  <AppUserAvatar user={estimatorUser} size="sm" showTooltip />
                  <div className="text-xs font-semibold text-gray-700">
                    {getUserDisplayName(estimatorUser)}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-400">—</div>
              )}
              {hasEditPermission ? (
                <>
                  <AppButton type="button" variant="secondary" size="sm" onClick={onEditOutcome}>
                    {resultActionLabel}
                  </AppButton>
                  <AppButton type="button" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onDelete}>
                    Delete
                  </AppButton>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <AppButton
          type="button"
          variant="ghost"
          size="sm"
          className="absolute bottom-2 right-2 z-20 p-1"
          onClick={onToggleCollapse}
          title="Expand"
          aria-label="Expand"
        >
          <ChevronDown className="h-3 w-3" />
        </AppButton>
      </div>
    </AppCard>
  );
}

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: quote, isLoading } = useQuery({
    queryKey: ['quote', id],
    queryFn: () => api<Quote>('GET', `/quotes/${id}`),
  });
  const { data: client } = useQuery({
    queryKey: ['client', quote?.client_id],
    queryFn: () =>
      quote?.client_id ? api<any>('GET', `/clients/${quote.client_id}`) : Promise.resolve(null),
    enabled: !!quote?.client_id,
  });
  const { data: clientFiles, refetch: refetchFiles } = useQuery({
    queryKey: ['clientFiles', quote?.client_id],
    queryFn: () =>
      quote?.client_id
        ? api<ClientFile[]>('GET', `/clients/${quote.client_id}/files`)
        : Promise.resolve([]),
    enabled: !!quote?.client_id,
  });
  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees?limit=5000&sort=name'),
  });
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(false);
  const [outcomeModalOpen, setOutcomeModalOpen] = useState(false);

  const isAdmin = (me?.roles || []).includes('admin');
  const permissions = new Set(me?.permissions || []);
  const hasViewPermission = isAdmin || permissions.has('sales:quotations:read');
  const hasEditPermission = isAdmin || permissions.has('sales:quotations:write');

  const estimator = employees?.find((e: any) => String(e.id) === String(quote?.estimator_id));
  const estimatorUser = estimator
    ? mapEmployeeToAppUserSelect(estimator)
    : quote?.estimator_id
      ? mapEmployeeToAppUserSelect({
          id: quote.estimator_id,
          name: quote.estimator_name || undefined,
          profile_photo_file_id: quote.estimator_avatar_file_id || undefined,
        })
      : null;

  const cover = useMemo(() => {
    const files = clientFiles || [];
    const override = files.find((f) => String(f.category || '') === 'quote-cover-derived');
    if (override) return withFileAccessToken(`/files/${override.file_object_id}/thumbnail?w=1000`);

    const customerLogo = files.find((f) => String(f.category || '') === 'client-logo-derived');
    if (customerLogo) return withFileAccessToken(`/files/${customerLogo.file_object_id}/thumbnail?w=1000`);

    return '/ui/assets/placeholders/customer.png';
  }, [clientFiles]);

  const documentTitle = quote ? getQuoteDocumentType(quote) : '—';

  const navigateBackFromQuote = useNavigateBack('/quotes');
  const handlePageBack = () => {
    navigateBackFromQuote();
  };

  const handleDeleteQuote = useCallback(async () => {
    if (!quote?.id) return;
    const label = quote.code || quote.order_number || documentTitle || 'this quotation';
    const result = await confirm({
      title: 'Delete quotation',
      message: `Are you sure you want to delete ${label}? This action cannot be undone.`,
      confirmText: 'Delete',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/quotes/${encodeURIComponent(String(quote.id))}`);
      toast.success('Quotation deleted');
      await queryClient.invalidateQueries({ queryKey: ['quotes'] });
      if (quote.client_id) {
        await queryClient.invalidateQueries({ queryKey: ['clientQuotes', quote.client_id] });
      }
      navigate('/quotes');
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to delete quotation');
    }
  }, [confirm, documentTitle, navigate, queryClient, quote]);

  const pageBackLabel = 'Back';

  if (isLoading) {
    return (
      <main className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <div className={uiCx('h-24 animate-pulse bg-gray-100', uiRadius.card)} />
      </main>
    );
  }

  if (!quote) {
    return (
      <main className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppEmptyState title="Quote not found" className="py-12" />
      </main>
    );
  }

  return (
    <main className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Quote Information"
        subtitle="Quote details and proposal builder."
        icon={<FileText className="h-4 w-4" />}
        onBack={handlePageBack}
        backLabel={pageBackLabel}
      />

      <div className={uiCx('flex flex-col', isHeroCollapsed ? 'gap-1.5' : 'gap-2')}>
        <QuoteDetailHero
          quote={quote}
          client={client}
          cover={cover}
          documentTitle={documentTitle}
          estimatorUser={estimatorUser}
          hasEditPermission={hasEditPermission}
          isHeroCollapsed={isHeroCollapsed}
          onToggleCollapse={() => setIsHeroCollapsed((v) => !v)}
          onChangeCover={() => setPickerOpen(true)}
          onEditOutcome={() => setOutcomeModalOpen(true)}
          onDelete={handleDeleteQuote}
        />

        {hasViewPermission ? (
          <AppCard className="!rounded-2xl" bodyClassName={uiSpacing.cardPadding}>
            <AppSectionHeader
              title="Quotation"
              description="Build your quotation with General Information, Sections, Pricing, Optional Services, and Terms."
              {...appSectionPresetProps('proposal')}
            />
            <div className="mt-4">
              <QuoteForm
                mode="edit"
                clientId={String(quote.client_id || '')}
                initial={quote}
                disabled={!hasEditPermission}
                disableHistoryGuard
              />
            </div>
          </AppCard>
        ) : (
          <AppEmptyState title="You do not have permission to view quotations." className="py-12" />
        )}
      </div>

      <ImagePicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={async (blob) => {
          if (!quote?.client_id) return;
          try {
            const up: any = await api('POST', '/files/upload', {
              client_id: quote.client_id,
              employee_id: null,
              category_id: 'quote-cover-derived',
              original_name: 'quote-cover.jpg',
              content_type: 'image/jpeg',
            });
            await fetch(up.upload_url, {
              method: 'PUT',
              headers: { 'Content-Type': 'image/jpeg', 'x-ms-blob-type': 'BlockBlob' },
              body: blob,
            });
            const conf: any = await api('POST', '/files/confirm', {
              key: up.key,
              size_bytes: blob.size,
              checksum_sha256: 'na',
              content_type: 'image/jpeg',
            });
            await api(
              'POST',
              `/clients/${encodeURIComponent(String(quote.client_id))}/files?file_object_id=${encodeURIComponent(conf.id)}&category=quote-cover-derived&original_name=quote-cover.jpg`,
            );
            toast.success('Cover updated');
            await refetchFiles();
            setPickerOpen(false);
          } catch {
            toast.error('Failed to update cover');
            setPickerOpen(false);
          }
        }}
        targetWidth={1024}
        targetHeight={768}
        clientId={quote?.client_id}
      />

      <QuoteOutcomeModal
        open={outcomeModalOpen}
        quote={quote}
        initialStatus={(quote.outcome_status as QuoteOutcomeStatus) || 'pending'}
        onClose={() => setOutcomeModalOpen(false)}
      />
    </main>
  );
}
