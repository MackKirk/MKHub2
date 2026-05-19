import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import LoadingOverlay from '@/components/LoadingOverlay';
import NewSubcontractorCompanyModal from '@/components/NewSubcontractorCompanyModal';

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
type StatusFilter = 'all' | 'active' | 'inactive';

export default function SubcontractorsListPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [newModalOpen, setNewModalOpen] = useState(false);

  const queryParam = searchParams.get('q') || '';
  const pageParam = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const [q, setQ] = useState(queryParam);
  const [page, setPage] = useState(pageParam);
  const limit = 10;

  const sortBy = (searchParams.get('sort') as SortKey) || 'name';
  const sortDir = (searchParams.get('dir') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';
  const statusFilter = (searchParams.get('status') as StatusFilter) || 'all';

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

  const setStatusFilter = (next: StatusFilter) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('status');
    else params.set('status', next);
    params.set('page', '1');
    setPage(1);
    setSearchParams(params);
  };

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(limit));
    const qv = searchParams.get('q');
    if (qv) p.set('q', qv);
    p.set('sort', (searchParams.get('sort') as string) || 'name');
    p.set('dir', searchParams.get('dir') === 'desc' ? 'desc' : 'asc');
    const st = (searchParams.get('status') as StatusFilter) || 'all';
    p.set('status', st);
    return p.toString();
  }, [searchParams, page, limit]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['subcontractor-companies', queryString],
    queryFn: () => api<CompaniesResponse>('GET', `/subcontractors/companies?${queryString}`),
  });

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
  const statusChipLabel =
    statusFilter === 'active' ? 'Active only' : statusFilter === 'inactive' ? 'Inactive only' : null;

  return (
    <div>
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div>
              <div className="text-sm font-semibold text-gray-900">Subcontractors</div>
              <div className="text-xs text-gray-500 mt-0.5">Manage third-party companies and their workers</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="relative">
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 pl-9 text-sm bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all duration-150"
                placeholder="Search by name, contact, email, phone, city, province, address…"
                value={q}
                onChange={(e) => handleQChange(e.target.value)}
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-gray-600 whitespace-nowrap flex items-center gap-1.5">
              <span className="hidden sm:inline">Status</span>
              <select
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-700 bg-white"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            {statusChipLabel && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="px-2 py-1 rounded-full text-[10px] font-medium border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
              >
                {statusChipLabel} ×
              </button>
            )}
          </div>
        </div>
      </div>

      <LoadingOverlay isLoading={isInitialLoading} text="Loading subcontractors…">
        <div
          className="rounded-xl border border-gray-200 bg-white overflow-hidden"
          style={
            animationComplete
              ? {}
              : {
                  opacity: hasAnimated ? 1 : 0,
                  transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                  transition: 'opacity 400ms ease-out, transform 400ms ease-out',
                }
          }
        >
          <div className="flex flex-col gap-2 overflow-x-auto">
            {hasEditPermission && (
              <button
                type="button"
                onClick={() => setNewModalOpen(true)}
                className="border-2 border-dashed border-gray-300 rounded-lg p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center min-h-[52px] min-w-[800px]"
              >
                <div className="text-lg text-gray-400 mr-2">+</div>
                <div className="font-medium text-xs text-gray-700">New subcontractor company</div>
              </button>
            )}
            {listItems.length > 0 && (
              <>
                <div
                  className="grid grid-cols-[18fr_11fr_11fr_14fr_10fr_6fr_10fr_8fr] gap-2 sm:gap-3 items-center px-4 py-2 w-full text-[10px] font-semibold text-gray-700 bg-gray-50 border-b border-gray-200 rounded-t-lg min-w-[800px]"
                  role="row"
                >
                  <button
                    type="button"
                    onClick={() => setListSort('name')}
                    className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5"
                  >
                    Company{sortBy === 'name' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setListSort('city')}
                    className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5"
                  >
                    City{sortBy === 'city' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setListSort('province')}
                    className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5"
                  >
                    Province{sortBy === 'province' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                  <span className="min-w-0 text-left text-gray-600">Contact / email</span>
                  <span className="min-w-0 text-left text-gray-600">Phone</span>
                  <button
                    type="button"
                    onClick={() => setListSort('workers')}
                    className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5"
                  >
                    Workers{sortBy === 'workers' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setListSort('created')}
                    className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5"
                  >
                    Created{sortBy === 'created' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                  <span className="min-w-0 text-left text-gray-600">Status</span>
                </div>
                <div className="rounded-b-lg border border-t-0 border-gray-200 overflow-hidden min-w-[800px]">
                  {listItems.map((c) => (
                    <CompanyRow key={c.id} c={c} onOpen={() => nav(`/business/subcontractors/companies/${c.id}`)} />
                  ))}
                </div>
              </>
            )}
          </div>

          {data && data.total > 0 && (
            <div className="p-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-xs text-gray-600">
                Showing {(data.page - 1) * data.limit + 1} to {Math.min(data.page * data.limit, data.total)} of {data.total} companies
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const newPage = Math.max(1, data.page - 1);
                    setPage(newPage);
                    const params = new URLSearchParams(searchParams);
                    params.set('page', String(newPage));
                    setSearchParams(params);
                  }}
                  disabled={data.page <= 1 || isFetching}
                  className="rounded-lg px-3 py-2 border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <div className="text-xs text-gray-700 font-medium">
                  Page {data.page} of {data.total_pages}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newPage = Math.min(data.total_pages, data.page + 1);
                    setPage(newPage);
                    const params = new URLSearchParams(searchParams);
                    params.set('page', String(newPage));
                    setSearchParams(params);
                  }}
                  disabled={data.page >= data.total_pages || isFetching}
                  className="rounded-lg px-3 py-2 border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {data && data.total === 0 && (
            <div className="p-10 text-center space-y-3">
              <div className="text-sm text-gray-600">No subcontractor companies match your criteria.</div>
              {hasEditPermission && (
                <button
                  type="button"
                  onClick={() => setNewModalOpen(true)}
                  className="inline-flex px-4 py-2 rounded-lg text-xs font-medium bg-[#7f1010] text-white hover:opacity-95"
                >
                  Create company
                </button>
              )}
            </div>
          )}
        </div>
      </LoadingOverlay>

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

function CompanyRow({ c, onOpen }: { c: Company; onOpen: () => void }) {
  const avatarUrl = withFileAccessTokenIfNeeded(c.logo_url) || '/ui/assets/placeholders/customer.png';
  return (
    <div
      className="grid grid-cols-[18fr_11fr_11fr_14fr_10fr_6fr_10fr_8fr] gap-2 sm:gap-3 items-center px-4 py-3 w-full hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 min-h-[52px] text-left bg-white"
      onClick={onOpen}
    >
      <div className="min-w-0 flex items-center gap-3">
        <img
          src={avatarUrl}
          className="w-10 h-10 rounded-lg border border-gray-200 object-cover flex-shrink-0"
          alt={c.name || 'Company logo'}
        />
        <div className="min-w-0 flex flex-col justify-center">
          <div className="text-xs font-semibold text-gray-900 truncate">{c.name}</div>
          {c.contact_name && <div className="text-[10px] text-gray-500 truncate">{c.contact_name}</div>}
        </div>
      </div>
      <div className="min-w-0 text-xs text-gray-600 truncate">{c.city || '—'}</div>
      <div className="min-w-0 text-xs text-gray-600 truncate">{c.province || '—'}</div>
      <div className="min-w-0">
        <div className="text-xs text-gray-700 truncate">{c.email || '—'}</div>
      </div>
      <div className="min-w-0 text-xs text-gray-600 truncate">{c.phone || '—'}</div>
      <div className="min-w-0 text-xs text-gray-700">{c.worker_count ?? 0}</div>
      <div className="min-w-0 text-[10px] text-gray-600">
        {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
      </div>
      <div className="min-w-0">
        <span
          className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-medium ${
            c.is_active ? 'border-green-200 text-green-800 bg-green-50' : 'border-amber-200 text-amber-800 bg-amber-50'
          }`}
        >
          {c.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
    </div>
  );
}
