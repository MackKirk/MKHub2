import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import { expiryBadgeClass, expiryLabel } from '@/lib/companyCreditCardExpiry';

type CardRow = {
  id: string;
  label: string;
  network: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  status: string;
  assigned_to_name?: string | null;
};

type ListResponse = {
  items: CardRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-200 text-gray-700',
  replaced: 'bg-blue-100 text-blue-800',
  lost: 'bg-red-100 text-red-800',
};

const NETWORK_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  other: 'Other',
};

type StatusTab = 'all' | 'active' | 'cancelled' | 'replaced' | 'lost';
type CustodyTab = 'all' | 'assigned' | 'unassigned';
type SortColumn = 'label' | 'expiry' | 'status';

export default function CompanyCreditCardsList() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const statusTab = (searchParams.get('status') || 'all') as StatusTab;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = 25;

  const validSorts: SortColumn[] = ['label', 'expiry', 'status'];
  const rawSort = searchParams.get('sort');
  const sortBy: SortColumn | null =
    rawSort && validSorts.includes(rawSort as SortColumn) ? (rawSort as SortColumn) : null;
  const sortDir = (searchParams.get('dir') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';

  const setListSort = (column: SortColumn) => {
    const params = new URLSearchParams(searchParams);
    const nextDir = sortBy === column && sortDir === 'asc' ? 'desc' : 'asc';
    params.set('sort', column);
    params.set('dir', nextDir);
    params.set('page', '1');
    setSearchParams(params, { replace: true });
  };

  const sortIndicator = (column: SortColumn) =>
    sortBy === column ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const handleStatusTab = (tab: StatusTab) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    if (tab === 'all') params.delete('status');
    else params.set('status', tab);
    setSearchParams(params, { replace: true });
  };

  const handleCustodyTab = (tab: CustodyTab) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    params.delete('custody');
    params.delete('assigned');
    if (tab === 'assigned') {
      params.set('assigned', 'true');
      params.set('custody', 'assigned');
    } else if (tab === 'unassigned') {
      params.set('assigned', 'false');
      params.set('custody', 'unassigned');
    }
    setSearchParams(params, { replace: true });
  };

  const effectiveCustody: CustodyTab = useMemo(() => {
    const a = searchParams.get('assigned');
    if (a === 'true') return 'assigned';
    if (a === 'false') return 'unassigned';
    return 'all';
  }, [searchParams]);

  const paramsString = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(limit));
    if (sortBy) {
      p.set('sort', sortBy);
      p.set('dir', sortDir);
    }
    if (search.trim()) p.set('search', search.trim());
    if (statusTab !== 'all') p.set('status', statusTab);
    if (effectiveCustody === 'assigned') p.set('assigned', 'true');
    if (effectiveCustody === 'unassigned') p.set('assigned', 'false');
    return p.toString();
  }, [page, limit, sortBy, sortDir, search, statusTab, effectiveCustody]); // sort optional → API default created_at desc

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['company-credit-cards', paramsString],
    queryFn: () => api<ListResponse>('GET', `/company-credit-cards?${paramsString}`),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const currentPage = data?.page ?? page;

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      {/* Title bar — same pattern as EquipmentList */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">Corporate cards</div>
            <div className="mt-0.5 text-xs text-gray-500">Last four digits & expiry only — assign custody like equipment</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Today</div>
            <div className="mt-0.5 text-xs font-semibold text-gray-700">{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex gap-1 border-b border-gray-200 px-0 pb-3">
          {(
            [
              ['all', 'All'],
              ['active', 'Active'],
              ['cancelled', 'Cancelled'],
              ['replaced', 'Replaced'],
              ['lost', 'Lost'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => handleStatusTab(id)}
              className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                (id === 'all' && statusTab === 'all') || (id !== 'all' && statusTab === id)
                  ? 'border-brand-red text-brand-red'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mb-3 flex flex-wrap gap-1 border-b border-gray-100 pb-3">
          <span className="mr-2 self-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">Custody</span>
          {(
            [
              ['all', 'All'],
              ['assigned', 'In custody'],
              ['unassigned', 'Unassigned'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => handleCustodyTab(id)}
              className={`-mb-px rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                effectiveCustody === id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search label, last four, cardholder, issuer…"
            value={search}
            onChange={(e) => {
              const next = e.target.value;
              const params = new URLSearchParams(searchParams);
              if (next) params.set('search', next);
              else params.delete('search');
              params.set('page', '1');
              setSearchParams(params, { replace: true });
            }}
            className="w-full rounded-lg border border-gray-200 bg-gray-50/50 py-2 pl-9 pr-3 text-sm text-gray-900 transition-all duration-150 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {(error as Error).message || 'Failed to load cards'}
        </div>
      )}

      {/* List */}
      <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => nav('/company-assets/credit-cards/new')}
          className="flex min-h-[60px] w-full min-w-0 items-center justify-center rounded-t-xl border-2 border-dashed border-gray-300 bg-white p-2.5 text-center transition-all hover:border-brand-red hover:bg-gray-50"
        >
          <span className="mr-2 text-lg text-gray-400">+</span>
          <span className="text-xs font-medium text-gray-700">New corporate card</span>
        </button>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-gray-500">Loading cards…</div>
        ) : items.length > 0 ? (
          <>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-0 border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-[10px] font-semibold text-gray-700">
                    <th className="rounded-tl-lg px-3 py-2 text-left">
                      <button
                        type="button"
                        onClick={() => setListSort('label')}
                        className="flex items-center gap-1 rounded py-0.5 hover:text-gray-900"
                      >
                        Label
                        {sortIndicator('label')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">Card</th>
                    <th className="px-3 py-2 text-left">
                      <button
                        type="button"
                        onClick={() => setListSort('expiry')}
                        className="flex items-center gap-1 rounded py-0.5 hover:text-gray-900"
                      >
                        Expires
                        {sortIndicator('expiry')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">Network</th>
                    <th className="px-3 py-2 text-left">Custody</th>
                    <th className="rounded-tr-lg px-3 py-2 text-left">
                      <button
                        type="button"
                        onClick={() => setListSort('status')}
                        className="flex items-center gap-1 rounded py-0.5 hover:text-gray-900"
                      >
                        Status
                        {sortIndicator('status')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const net = NETWORK_LABEL[row.network?.toLowerCase?.() ?? ''] || row.network;
                    const inCustody = !!row.assigned_to_name;
                    return (
                      <tr
                        key={row.id}
                        className="min-h-[52px] cursor-pointer border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50"
                        onClick={() => nav(`/company-assets/credit-cards/${row.id}`)}
                      >
                          <td className="px-3 py-3 align-top text-sm font-medium text-gray-900">{row.label}</td>
                          <td className="px-3 py-3 align-top font-mono text-xs tracking-wider text-gray-800">•••• {row.last_four}</td>
                          <td className="px-3 py-3 align-top">
                            <span
                              className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${expiryBadgeClass(row.expiry_month, row.expiry_year)}`}
                            >
                              {expiryLabel(row.expiry_month, row.expiry_year)}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-top text-xs text-gray-700">{net}</td>
                          <td className="min-w-0 px-3 py-3 align-top">
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span
                                className={`inline-flex w-fit rounded px-2 py-0.5 text-xs font-medium ${
                                  inCustody ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {inCustody ? 'Assigned' : 'Available'}
                              </span>
                              {inCustody ? (
                                <span className="truncate text-[11px] text-gray-500">{row.assigned_to_name}</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span
                              className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                                statusColors[row.status] || 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {row.status?.replace(/_/g, ' ') || '—'}
                            </span>
                          </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {total > 0 && (
              <div className="flex items-center justify-between border-t border-gray-200 p-4">
                <div className="text-xs text-gray-600">
                  Showing {(currentPage - 1) * limit + 1} to {Math.min(currentPage * limit, total)} of {total} cards
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.set('page', String(Math.max(1, currentPage - 1)));
                      setSearchParams(next);
                    }}
                    disabled={currentPage <= 1 || isFetching}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <div className="text-xs font-medium text-gray-700">
                    Page {currentPage} of {totalPages}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.set('page', String(Math.min(totalPages, currentPage + 1)));
                      setSearchParams(next);
                    }}
                    disabled={currentPage >= totalPages || isFetching}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-8 text-center text-xs text-gray-500">
            No corporate cards found
            {statusTab !== 'all' ? ` (${statusTab})` : ''}
            {effectiveCustody !== 'all' ? ` · ${effectiveCustody}` : ''}
          </div>
        )}
      </div>

    </div>
  );
}
