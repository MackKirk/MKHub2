import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
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

export default function CompanyCreditCardsList() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const search = searchParams.get('search') || '';
  const [q, setQ] = useState(search);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', '25');
    if (search.trim()) p.set('search', search.trim());
    return p.toString();
  }, [page, search]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['company-credit-cards', params],
    queryFn: () => api<ListResponse>('GET', `/company-credit-cards?${params}`),
  });

  const applySearch = () => {
    const next = new URLSearchParams(searchParams);
    if (q.trim()) next.set('search', q.trim());
    else next.delete('search');
    next.set('page', '1');
    setSearchParams(next);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Corporate cards</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-xl">
            Inventory of company cards (last four digits and expiry only — do not enter full card numbers). Assign custody to
            employees like other assets.
          </p>
        </div>
        <button
          type="button"
          onClick={() => nav('/company-assets/credit-cards/new')}
          className="shrink-0 px-4 py-2 rounded-lg bg-brand-red text-white font-medium hover:bg-red-800 shadow-sm"
        >
          Add card
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="search"
          placeholder="Search label, last four, issuer…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applySearch()}
          className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button type="button" onClick={applySearch} className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium">
          Search
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
          {(error as Error).message || 'Failed to load cards'}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Label</th>
                <th className="px-4 py-3 font-semibold">Card</th>
                <th className="px-4 py-3 font-semibold">Expires</th>
                <th className="px-4 py-3 font-semibold">Network</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Custody</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No corporate cards yet.
                  </td>
                </tr>
              )}
              {data?.items.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => nav(`/company-assets/credit-cards/${row.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{row.label}</td>
                  <td className="px-4 py-3 text-gray-800">
                    •••• {row.last_four}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${expiryBadgeClass(
                        row.expiry_month,
                        row.expiry_year
                      )}`}
                    >
                      {expiryLabel(row.expiry_month, row.expiry_year)}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-700">{row.network}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        statusColors[row.status] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.assigned_to_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.total_pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set('page', String(page - 1));
              setSearchParams(next);
            }}
            className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600 py-1">
            Page {page} of {data.total_pages}
          </span>
          <button
            type="button"
            disabled={page >= data.total_pages}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set('page', String(page + 1));
              setSearchParams(next);
            }}
            className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
