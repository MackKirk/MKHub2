import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import PageHeaderBar from '@/components/PageHeaderBar';
import { useConfirm } from '@/components/ConfirmProvider';
import { formatDateLocal } from '@/lib/dateUtils';

type TemplateRow = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  status: string;
  version_label: string;
  created_at?: string | null;
  updated_at?: string | null;
};

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function DuplicateIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

type SortCol = 'name' | 'created_at' | 'updated_at';

export default function FormTemplatesPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');

  const sortBy = (searchParams.get('sort') as SortCol) || 'name';
  const sortDir = searchParams.get('dir') === 'desc' ? 'desc' : 'asc';

  const setListSort = (column: SortCol, direction?: 'asc' | 'desc') => {
    const params = new URLSearchParams(searchParams);
    const nextDir = direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
    params.set('sort', column);
    params.set('dir', nextDir);
    setSearchParams(params, { replace: true });
  };

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['formTemplates', sortBy, sortDir],
    queryFn: () =>
      api<TemplateRow[]>(
        'GET',
        `/form-templates?sort=${encodeURIComponent(sortBy)}&sort_dir=${encodeURIComponent(sortDir)}`
      ),
  });

  const filteredRows = useMemo(() => {
    const s = searchQuery.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const name = (r.name || '').toLowerCase();
      const cat = (r.category || '').toLowerCase();
      const desc = (r.description || '').toLowerCase();
      const ver = (r.version_label || '').toLowerCase();
      return name.includes(s) || cat.includes(s) || desc.includes(s) || ver.includes(s);
    });
  }, [rows, searchQuery]);

  const createMut = useMutation({
    mutationFn: () =>
      api<{ id: string }>('POST', '/form-templates', {
        name: 'New form template',
        category: 'inspection',
        status: 'active',
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['formTemplates'] });
      toast.success('Template created');
      nav(`/safety/form-templates/${encodeURIComponent(r.id)}`);
    },
    onError: () => toast.error('Could not create template'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>('DELETE', `/form-templates/${encodeURIComponent(id)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['formTemplates'] });
      toast.success('Template deleted');
    },
    onError: () => toast.error('Could not delete template'),
  });

  const duplicateMut = useMutation({
    mutationFn: (id: string) => api<{ id: string }>('POST', `/form-templates/${encodeURIComponent(id)}/duplicate`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['formTemplates'] });
      toast.success('Template duplicated');
      nav(`/safety/form-templates/${encodeURIComponent(r.id)}`);
    },
    onError: () => toast.error('Could not duplicate template'),
  });

  const askDeleteTemplate = async (r: TemplateRow) => {
    const label = r.name.trim() || 'Untitled template';
    const res = await confirm({
      title: 'Delete template?',
      message: `Delete "${label}"? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (res !== 'confirm') return;
    deleteMut.mutate(r.id);
  };

  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      return formatDateLocal(new Date(iso));
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-4 min-w-0 pb-16">
      <PageHeaderBar
        title="Form Templates"
        subtitle="Build reusable safety forms. Save in the editor updates what users see when starting inspections."
      />

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <label className="sr-only" htmlFor="form-templates-search">
                Search templates
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </span>
                <input
                  id="form-templates-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, category, version, or description…"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="p-2 border-b border-gray-100">
              <button
                type="button"
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
                className="w-full px-4 py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
              >
                {createMut.isPending ? 'Creating…' : '+ New template'}
              </button>
            </div>
            {rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No templates yet.</div>
            ) : filteredRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No matching templates.</div>
            ) : (
              <div className="flex flex-col gap-0 overflow-x-auto">
                <div
                  className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] gap-2 sm:gap-3 items-center px-4 py-2 bg-gray-50 border-b border-gray-200 min-w-[720px] text-[10px] font-semibold text-gray-700"
                  aria-hidden
                >
                  <button
                    type="button"
                    onClick={() => setListSort('name')}
                    className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none"
                    title="Sort by name"
                  >
                    Name
                    {sortBy === 'name' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                  <span className="min-w-0">Version</span>
                  <button
                    type="button"
                    onClick={() => setListSort('created_at')}
                    className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none"
                    title="Sort by created date"
                  >
                    Created
                    {sortBy === 'created_at' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setListSort('updated_at')}
                    className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none"
                    title="Sort by last update"
                  >
                    Last update
                    {sortBy === 'updated_at' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                  <span className="text-center">Status</span>
                  <span className="w-24 text-right pr-1">Actions</span>
                </div>
                <ul className="divide-y divide-gray-100 min-w-[720px]">
                  {filteredRows.map((r) => (
                    <li
                      key={r.id}
                      className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] gap-2 sm:gap-3 items-center px-4 py-3 hover:bg-gray-50/80"
                    >
                      <Link
                        to={`/safety/form-templates/${encodeURIComponent(r.id)}`}
                        className="min-w-0 font-medium text-sm text-gray-900 truncate hover:text-brand-red hover:underline"
                      >
                        {r.name}
                      </Link>
                      <div className="min-w-0 text-xs text-gray-600 truncate" title={r.version_label || ''}>
                        {(r.version_label || '').trim() || '—'}
                      </div>
                      <div className="text-xs text-gray-600 whitespace-nowrap">{fmtDate(r.created_at)}</div>
                      <div className="text-xs text-gray-600 whitespace-nowrap">{fmtDate(r.updated_at)}</div>
                      <div className="flex justify-center">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            r.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-end gap-1 w-24">
                        <button
                          type="button"
                          aria-label={`Duplicate template ${r.name.trim() || 'Untitled'}`}
                          title="Duplicate"
                          disabled={duplicateMut.isPending}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            duplicateMut.mutate(r.id);
                          }}
                          className="shrink-0 h-9 w-9 inline-flex items-center justify-center text-gray-400 hover:text-brand-red rounded-lg bg-transparent border-0 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25 disabled:opacity-50"
                        >
                          <DuplicateIcon className="w-[1.125rem] h-[1.125rem]" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete template ${r.name.trim() || 'Untitled'}`}
                          title="Delete"
                          disabled={deleteMut.isPending}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void askDeleteTemplate(r);
                          }}
                          className="shrink-0 h-9 w-9 inline-flex items-center justify-center text-gray-400 hover:text-red-600 rounded-lg bg-transparent border-0 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25 disabled:opacity-50"
                        >
                          <TrashIcon className="w-[1.125rem] h-[1.125rem]" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
