import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FolderKanban, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import LoadingOverlay from '@/components/LoadingOverlay';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppInput,
  AppPageHeader,
  AppSelect,
  uiCx,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { getAppListSortIndicator, useAppListSort } from '@/components/ui/useAppListSort';
import { useNavigateBack } from '@/hooks/useNavigateBack';
import { api } from '@/lib/api';
import { PROJECT_DIVISIONS_QUERY_KEY } from '@/lib/businessLine';
import { listPageSizeSelectOptions, parseListPageLimit } from '@/lib/listPagination';
import {
  PROJECT_LIST_GRID_CLASS,
  PROJECT_LIST_MIN_WIDTH,
  ProjectListItem,
} from '@/pages/Projects';

type WarrantyReviewResponse = {
  items: Parameters<typeof ProjectListItem>[0]['project'][];
  total: number;
  page: number;
  limit: number;
};

type ProjectListSort = 'project' | 'address' | 'start' | 'eta' | 'admin' | 'value' | 'status' | 'divisions';
const PROJECT_LIST_SORTS: ProjectListSort[] = ['project', 'address', 'start', 'eta', 'admin', 'value', 'status', 'divisions'];

export default function WarrantyReview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigateBack = useNavigateBack('/rm-business');
  const queryParam = searchParams.get('q') || '';
  const [q, setQ] = useState(queryParam);
  const [debouncedQ, setDebouncedQ] = useState(queryParam);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const currentQ = params.get('q') || '';
    if (debouncedQ === currentQ) return;
    if (debouncedQ) params.set('q', debouncedQ);
    else params.delete('q');
    params.set('page', '1');
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    if (urlQ !== q) setQ(urlQ);
    if (urlQ !== debouncedQ) setDebouncedQ(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { sortBy, sortDir, setSort: setListSort } = useAppListSort<ProjectListSort>({
    searchParams,
    setSearchParams,
    defaultSort: 'project',
    validSorts: PROJECT_LIST_SORTS,
  });

  const page = Number(searchParams.get('page') || '1') || 1;
  const limit = parseListPageLimit(searchParams.get('limit'));
  const qs = useMemo(() => {
    const params = new URLSearchParams();
    const search = searchParams.get('q');
    if (search) params.set('q', search);
    params.set('page', String(page));
    params.set('limit', String(limit));
    const sort = searchParams.get('sort');
    const dir = searchParams.get('dir');
    if (sort) params.set('sort', sort);
    if (dir) params.set('dir', dir);
    return `?${params.toString()}`;
  }, [searchParams, page, limit]);

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['warranty-review', qs],
    queryFn: () => api<WarrantyReviewResponse>('GET', `/projects/rm/warranty-review${qs}`),
    placeholderData: keepPreviousData,
  });
  const { data: projectDivisions } = useQuery({
    queryKey: PROJECT_DIVISIONS_QUERY_KEY,
    queryFn: () => api<any[]>('GET', '/settings/project-divisions'),
    staleTime: 300_000,
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
    staleTime: 300_000,
  });

  const items = data?.items || [];
  const totalCount = data?.total ?? items.length;
  const currentPage = data?.page ?? page;
  const limitPage = data?.limit ?? limit;
  const totalPages = Math.max(1, Math.ceil(totalCount / limitPage));
  const projectStatuses = settings?.project_statuses || [];
  const listPageSizeOptions = useMemo(() => listPageSizeSelectOptions(), []);
  const isInitialLoading = isLoading && !data;

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Warranty Review"
        subtitle="Finished Production projects"
        onBack={navigateBack}
        backLabel="Back"
        icon={<FolderKanban className="h-4 w-4" />}
      />
      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <AppInput
          placeholder="Search by project name, code, or client name..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          aria-label="Search finished projects"
        />
      </AppCard>
      <LoadingOverlay isLoading={isInitialLoading} text="Loading projects...">
        <AppCard className={uiShadows.card} bodyClassName={uiSpacing.cardPadding}>
          <div className={uiCx('flex flex-col gap-2 overflow-x-auto', isFetching && items.length > 0 ? 'opacity-60 pointer-events-none' : undefined)}>
            <div
              className={uiCx(
                'grid items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 sm:gap-3 lg:gap-4',
                PROJECT_LIST_MIN_WIDTH,
                PROJECT_LIST_GRID_CLASS,
                uiTypography.overline,
                'normal-case tracking-normal text-gray-700',
              )}
              role="row"
            >
              <button type="button" onClick={() => setListSort('project')} className="min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none" title="Sort by project name">Project{getAppListSortIndicator(sortBy, 'project', sortDir)}</button>
              <button type="button" onClick={() => setListSort('address')} className="min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none" title="Sort by address">Address{getAppListSortIndicator(sortBy, 'address', sortDir)}</button>
              <button type="button" onClick={() => setListSort('start')} className="min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none" title="Sort by start date">Start{getAppListSortIndicator(sortBy, 'start', sortDir)}</button>
              <button type="button" onClick={() => setListSort('eta')} className="min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none" title="Sort by End Date">End Date{getAppListSortIndicator(sortBy, 'eta', sortDir)}</button>
              <button type="button" onClick={() => setListSort('admin')} className="min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none" title="Sort by project admin">Project Admin{getAppListSortIndicator(sortBy, 'admin', sortDir)}</button>
              <button type="button" onClick={() => setListSort('value')} className="min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none" title="Sort by value">Value{getAppListSortIndicator(sortBy, 'value', sortDir)}</button>
              <button type="button" onClick={() => setListSort('status')} className="min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none" title="Sort by status">Status{getAppListSortIndicator(sortBy, 'status', sortDir)}</button>
              <button type="button" onClick={() => setListSort('divisions')} className="min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none" title="Sort by divisions">Divisions{getAppListSortIndicator(sortBy, 'divisions', sortDir)}</button>
            </div>
            {items.map((project) => (
              <ProjectListItem
                key={project.id}
                project={project}
                projectDivisions={projectDivisions}
                projectStatuses={projectStatuses}
                projectBasePath="/projects"
                detailQuery="from=warranty-review"
              />
            ))}
          </div>
          {!isInitialLoading && isError && items.length === 0 && (
            <AppEmptyState
              className="py-8"
              title="Could not load projects"
              description={(error as Error)?.message || 'Something went wrong while loading projects. Try again.'}
            />
          )}
          {!isInitialLoading && !isError && items.length === 0 && (
            <AppEmptyState
              className="py-8"
              title="No finished projects"
              description="No Finished Production projects match this search."
            />
          )}
          {!isInitialLoading && totalCount > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
              <p className={uiTypography.helper}>
                Page {currentPage} of {totalPages} ({totalCount} total)
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className={uiTypography.helper}>Rows per page</span>
                  <AppSelect
                    size="sm"
                    value={String(limit)}
                    onChange={(e) => {
                      const params = new URLSearchParams(searchParams);
                      params.set('limit', e.target.value);
                      params.set('page', '1');
                      setSearchParams(params);
                    }}
                    options={listPageSizeOptions}
                    sortOptions={false}
                    className="w-20"
                  />
                </div>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => {
                    const params = new URLSearchParams(searchParams);
                    params.set('page', String(Math.max(1, currentPage - 1)));
                    setSearchParams(params);
                  }}
                >
                  Previous
                </AppButton>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => {
                    const params = new URLSearchParams(searchParams);
                    params.set('page', String(Math.min(totalPages, currentPage + 1)));
                    setSearchParams(params);
                  }}
                >
                  Next
                </AppButton>
              </div>
            </div>
          )}
        </AppCard>
      </LoadingOverlay>
    </div>
  );
}
