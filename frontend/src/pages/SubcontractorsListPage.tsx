import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, Search, SlidersHorizontal } from 'lucide-react';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import LoadingOverlay from '@/components/LoadingOverlay';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';
import NewSubcontractorCompanyModal from '@/components/NewSubcontractorCompanyModal';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppInput,
  AppListCreateItem,
  AppPageHeader,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type Company = {
  id: string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  province?: string | null;
  is_active: boolean;
  worker_count?: number;
  created_at?: string | null;
  logo_url?: string | null;
};

type CompaniesResponse = {
  items: Company[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

type SortKey = 'name' | 'city' | 'province' | 'created' | 'workers';

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
};

function convertRulesToParams(rules: FilterRule[]): URLSearchParams {
  const params = new URLSearchParams();
  params.delete('status');
  params.delete('status_not');
  params.delete('city');
  params.delete('city_not');
  params.delete('province');
  params.delete('province_not');

  for (const rule of rules) {
    if (!rule.value || (Array.isArray(rule.value) && (!rule.value[0] || !rule.value[1]))) {
      continue;
    }
    if (typeof rule.value !== 'string') continue;

    switch (rule.field) {
      case 'status':
        if (rule.operator === 'is') params.set('status', rule.value);
        else if (rule.operator === 'is_not') params.set('status_not', rule.value);
        break;
      case 'city':
        if (rule.operator === 'is') params.set('city', rule.value);
        else if (rule.operator === 'is_not') params.set('city_not', rule.value);
        break;
      case 'province':
        if (rule.operator === 'is') params.set('province', rule.value);
        else if (rule.operator === 'is_not') params.set('province_not', rule.value);
        break;
    }
  }

  return params;
}

function convertParamsToRules(params: URLSearchParams): FilterRule[] {
  const rules: FilterRule[] = [];
  let idCounter = 1;

  const status = params.get('status');
  const statusNot = params.get('status_not');
  if (status && status !== 'all') {
    rules.push({ id: `rule-${idCounter++}`, field: 'status', operator: 'is', value: status });
  } else if (statusNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'status', operator: 'is_not', value: statusNot });
  }

  const city = params.get('city');
  const cityNot = params.get('city_not');
  if (city) {
    rules.push({ id: `rule-${idCounter++}`, field: 'city', operator: 'is', value: city });
  } else if (cityNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'city', operator: 'is_not', value: cityNot });
  }

  const province = params.get('province');
  const provinceNot = params.get('province_not');
  if (province) {
    rules.push({ id: `rule-${idCounter++}`, field: 'province', operator: 'is', value: province });
  } else if (provinceNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'province', operator: 'is_not', value: provinceNot });
  }

  return rules;
}

export default function SubcontractorsListPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const queryParam = searchParams.get('q') || '';
  const pageParam = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const [q, setQ] = useState(queryParam);
  const [page, setPage] = useState(pageParam);
  const limit = 10;

  const sortBy = (searchParams.get('sort') as SortKey) || 'name';
  const sortDir = (searchParams.get('dir') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';

  const currentRules = useMemo(() => convertParamsToRules(searchParams), [searchParams]);

  const [hasAnimated, setHasAnimated] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  const hasLoadedDataRef = useRef(false);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    const urlPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    if (urlQ !== q) setQ(urlQ);
    if (urlPage !== page) setPage(urlPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleQChange = (value: string) => {
    setQ(value);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (value) params.set('q', value);
    else params.delete('q');
    params.set('page', '1');
    setSearchParams(params);
  };

  const setListSort = (column: SortKey, direction?: 'asc' | 'desc') => {
    const params = new URLSearchParams(searchParams);
    const nextDir = direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
    params.set('sort', column);
    params.set('dir', nextDir);
    params.set('page', '1');
    setPage(1);
    setSearchParams(params, { replace: true });
  };

  const queryString = useMemo(() => {
    const p = new URLSearchParams(searchParams);
    const qParam = p.get('q');
    const sortParam = (p.get('sort') as string) || 'name';
    const dirParam = p.get('dir') === 'desc' ? 'desc' : 'asc';
    const statusParam = p.get('status');
    p.delete('q');
    p.delete('page');
    p.delete('sort');
    p.delete('dir');
    const filterString = p.toString();
    const finalParams = new URLSearchParams();
    if (qParam) finalParams.set('q', qParam);
    if (filterString) {
      filterString.split('&').forEach((param) => {
        const [key, value] = param.split('=');
        if (key && value) finalParams.set(key, decodeURIComponent(value));
      });
    }
    finalParams.set('page', String(page));
    finalParams.set('limit', String(limit));
    finalParams.set('sort', sortParam);
    finalParams.set('dir', dirParam);
    finalParams.set('status', statusParam && statusParam !== 'all' ? statusParam : 'all');
    return finalParams.toString();
  }, [searchParams, page, limit]);

  const { data: locationsData } = useQuery({
    queryKey: ['subcontractor-company-locations'],
    queryFn: () => api<{ cities: string[]; provinces: string[] }>('GET', '/subcontractors/companies/locations'),
    staleTime: 300_000,
  });

  const allCities = useMemo(() => locationsData?.cities ?? [], [locationsData]);
  const allProvinces = useMemo(() => locationsData?.provinces ?? [], [locationsData]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['subcontractor-companies', queryString],
    queryFn: () => api<CompaniesResponse>('GET', `/subcontractors/companies?${queryString}`),
  });

  const filterFields: FieldConfig[] = useMemo(
    () => [
      {
        id: 'status',
        label: 'Status',
        type: 'select',
        operators: ['is', 'is_not'],
        getOptions: () => [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ],
      },
      {
        id: 'city',
        label: 'City',
        type: 'select_search',
        operators: ['is', 'is_not'],
        getOptions: () => allCities.map((city) => ({ value: city, label: city })),
      },
      {
        id: 'province',
        label: 'Province',
        type: 'select_search',
        operators: ['is', 'is_not'],
        getOptions: () => allProvinces.map((province) => ({ value: province, label: province })),
      },
    ],
    [allCities, allProvinces],
  );

  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = convertRulesToParams(rules);
    if (q) params.set('q', q);
    params.set('page', '1');
    setPage(1);
    setSearchParams(params);
    refetch();
  };

  const hasActiveFilters = currentRules.length > 0;

  const formatRuleValue = (rule: FilterRule): string => {
    if (rule.field === 'status' && typeof rule.value === 'string') {
      return STATUS_LABELS[rule.value] || rule.value;
    }
    if ((rule.field === 'city' || rule.field === 'province') && typeof rule.value === 'string') {
      return rule.value;
    }
    return String(rule.value);
  };

  const getFieldLabel = (fieldId: string): string => {
    const field = filterFields.find((f) => f.id === fieldId);
    return field?.label || fieldId;
  };

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const hasEditPermission =
    (me?.roles || []).includes('admin') || (me?.permissions || []).includes('business:customers:write');

  useEffect(() => {
    if (data) hasLoadedDataRef.current = true;
  }, [data]);

  const isInitialLoading = isLoading && !data && !hasLoadedDataRef.current;

  useEffect(() => {
    if (hasAnimated) {
      const t = setTimeout(() => setAnimationComplete(true), 400);
      return () => clearTimeout(t);
    }
  }, [hasAnimated]);

  useEffect(() => {
    if (!isInitialLoading && !hasAnimated) {
      const t = setTimeout(() => setHasAnimated(true), 50);
      return () => clearTimeout(t);
    }
  }, [isInitialLoading, hasAnimated]);

  const listItems = data?.items ?? [];
  const showEmptyList =
    data != null && listItems.length === 0 && (data.total === 0 || (data.items ?? []).length === 0);

  const listCardAnimClass = animationComplete
    ? undefined
    : uiCx(
        'transition-[opacity,transform] duration-[400ms] ease-out',
        hasAnimated ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98]',
      );

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader
          title="Subcontractors"
          subtitle="Manage third-party companies and their workers"
          icon={<Briefcase className="h-4 w-4" />}
          actions={
            <div className="text-right">
              <div className={uiTypography.overline}>Today</div>
              <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
            </div>
          }
        />

        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
            <div className="min-w-0 flex-1">
              <AppInput
                placeholder="Search by name, contact, email, phone, city, province, address…"
                value={q}
                onChange={(e) => handleQChange(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
                fieldHint="Search\n\nMatches company name, contact, email, phone, city, province, or address."
                aria-label="Search subcontractors"
              />
            </div>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<SlidersHorizontal className="h-4 w-4" />}
              onClick={() => setIsFilterModalOpen(true)}
            >
              Filters
            </AppButton>
            {hasActiveFilters && (
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (q) params.set('q', q);
                  params.set('page', '1');
                  setPage(1);
                  setSearchParams(params);
                  refetch();
                }}
              >
                Clear
              </AppButton>
            )}
          </div>
        </AppCard>

        {hasActiveFilters && (
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap')}>
            {currentRules.map((rule) => (
              <FilterChip
                key={rule.id}
                rule={rule}
                onRemove={() => {
                  const updatedRules = currentRules.filter((r) => r.id !== rule.id);
                  const params = convertRulesToParams(updatedRules);
                  if (q) params.set('q', q);
                  params.set('page', String(page));
                  setSearchParams(params);
                  refetch();
                }}
                getValueLabel={formatRuleValue}
                getFieldLabel={getFieldLabel}
              />
            ))}
          </div>
        )}

        <LoadingOverlay isLoading={isInitialLoading} text="Loading subcontractors…">
          <AppCard
            className={uiCx(uiShadows.card, listCardAnimClass)}
            bodyClassName="!p-0"
            footer={
              data && data.total > 0 ? (
                <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
                  <p className={uiTypography.helper}>
                    Showing {(data.page - 1) * data.limit + 1} to {Math.min(data.page * data.limit, data.total)} of{' '}
                    {data.total} companies
                  </p>
                  <div className={uiCx(uiLayout.actionsRow, 'items-center')}>
                    <AppButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={data.page <= 1 || isFetching}
                      onClick={() => {
                        const newPage = Math.max(1, data.page - 1);
                        setPage(newPage);
                        const params = new URLSearchParams(searchParams);
                        params.set('page', String(newPage));
                        setSearchParams(params);
                      }}
                    >
                      Previous
                    </AppButton>
                    <span className={uiTypography.helper}>
                      Page {data.page} of {data.total_pages}
                    </span>
                    <AppButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={data.page >= data.total_pages || isFetching}
                      onClick={() => {
                        const newPage = Math.min(data.total_pages, data.page + 1);
                        setPage(newPage);
                        const params = new URLSearchParams(searchParams);
                        params.set('page', String(newPage));
                        setSearchParams(params);
                      }}
                    >
                      Next
                    </AppButton>
                  </div>
                </div>
              ) : undefined
            }
          >
            <div className="flex flex-col">
              {showEmptyList ? (
                <div
                  className={uiCx(
                    uiSpacing.cardPadding,
                    uiSpacing.sectionStack,
                    'min-h-[12rem] pb-10',
                  )}
                >
                  {hasEditPermission ? (
                    <AppListCreateItem
                      label="New subcontractor company"
                      layout="row"
                      className="min-w-[800px] w-full"
                      onClick={() => setNewModalOpen(true)}
                    />
                  ) : null}
                  <AppEmptyState
                    title="No subcontractor companies match your criteria."
                    className="border-0 bg-transparent p-0 shadow-none"
                    action={
                      hasEditPermission ? (
                        <AppButton type="button" size="sm" onClick={() => setNewModalOpen(true)}>
                          Create company
                        </AppButton>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <>
                  {hasEditPermission && (
                    <div
                      className={uiCx(
                        uiSpacing.cardPadding,
                        listItems.length === 0 ? 'pb-10' : 'pb-3',
                      )}
                    >
                      <AppListCreateItem
                        label="New subcontractor company"
                        layout="row"
                        className="min-w-[800px] w-full"
                        onClick={() => setNewModalOpen(true)}
                      />
                    </div>
                  )}
                  {listItems.length > 0 ? (
                    <div className="overflow-x-auto">
                      <div
                        className={uiCx(
                          'grid min-w-[800px] w-full grid-cols-[18fr_11fr_11fr_14fr_10fr_6fr_10fr_8fr] items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 sm:gap-3',
                          uiTypography.overline,
                          'normal-case tracking-normal text-gray-700',
                        )}
                        role="row"
                      >
                        <SortHeader label="Company" column="name" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} />
                        <SortHeader label="City" column="city" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} />
                        <SortHeader label="Province" column="province" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} />
                        <span className="min-w-0 text-left text-gray-600">Contact / email</span>
                        <span className="min-w-0 text-left text-gray-600">Phone</span>
                        <SortHeader label="Workers" column="workers" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} />
                        <SortHeader label="Created" column="created" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} />
                        <span className="min-w-0 text-left text-gray-600">Status</span>
                      </div>
                      <div className={uiCx('min-w-[800px] border-t-0', uiBorders.subtle)}>
                        {listItems.map((c) => (
                          <CompanyRow key={c.id} c={c} onOpen={() => nav(`/business/subcontractors/companies/${c.id}`)} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </AppCard>
        </LoadingOverlay>

        <FilterBuilderModal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          onApply={handleApplyFilters}
          initialRules={currentRules}
          fields={filterFields}
          getFieldData={() => null}
        />

        {newModalOpen && (
          <NewSubcontractorCompanyModal
            onClose={() => setNewModalOpen(false)}
            onSuccess={(companyId) => {
              setNewModalOpen(false);
              qc.invalidateQueries({ queryKey: ['subcontractor-companies'] });
              refetch();
              nav(`/business/subcontractors/companies/${encodeURIComponent(companyId)}`);
            }}
          />
        )}
    </div>
  );
}

function SortHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (column: SortKey, direction?: 'asc' | 'desc') => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="flex min-w-0 items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none"
    >
      {label}
      {sortBy === column ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  );
}

function CompanyRow({ c, onOpen }: { c: Company; onOpen: () => void }) {
  const avatarUrl = withFileAccessTokenIfNeeded(c.logo_url) || '/ui/assets/placeholders/customer.png';
  return (
    <div
      role="button"
      tabIndex={0}
      className={uiCx(
        'grid min-h-[52px] w-full cursor-pointer grid-cols-[18fr_11fr_11fr_14fr_10fr_6fr_10fr_8fr] items-center gap-2 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50 sm:gap-3',
      )}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <img
          src={avatarUrl}
          className={uiCx('h-10 w-10 shrink-0 object-cover', uiRadius.control, uiBorders.subtle)}
          alt={c.name || 'Company logo'}
        />
        <div className="flex min-w-0 flex-col justify-center">
          <div className={uiCx(uiTypography.sectionTitle, 'truncate text-xs')}>{c.name}</div>
          {c.contact_name ? (
            <div className={uiCx(uiTypography.helper, 'truncate text-[10px]')}>{c.contact_name}</div>
          ) : null}
        </div>
      </div>
      <div className={uiCx(uiTypography.helper, 'min-w-0 truncate')}>{c.city || '—'}</div>
      <div className={uiCx(uiTypography.helper, 'min-w-0 truncate')}>{c.province || '—'}</div>
      <div className={uiCx(uiTypography.body, 'min-w-0 truncate text-xs')}>{c.email || '—'}</div>
      <div className={uiCx(uiTypography.helper, 'min-w-0 truncate')}>{c.phone || '—'}</div>
      <div className={uiCx(uiTypography.body, 'min-w-0 text-xs')}>{c.worker_count ?? 0}</div>
      <div className={uiCx(uiTypography.helper, 'min-w-0 text-[10px]')}>
        {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
      </div>
      <div className="min-w-0">
        <AppBadge variant={c.is_active ? 'success' : 'warning'} className="normal-case tracking-normal">
          {c.is_active ? 'Active' : 'Inactive'}
        </AppBadge>
      </div>
    </div>
  );
}
