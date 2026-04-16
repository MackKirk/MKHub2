import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import PageHeaderBar from '@/components/PageHeaderBar';
import { useConfirm } from '@/components/ConfirmProvider';

type TemplateRow = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  status: string;
  published_version_id?: string | null;
  published_version_number?: number | null;
};

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

export default function FormTemplatesPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['formTemplates'],
    queryFn: () => api<TemplateRow[]>('GET', '/form-templates'),
  });

  const filteredRows = useMemo(() => {
    const s = searchQuery.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const name = (r.name || '').toLowerCase();
      const cat = (r.category || '').toLowerCase();
      const desc = (r.description || '').toLowerCase();
      return name.includes(s) || cat.includes(s) || desc.includes(s);
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

  return (
    <div className="space-y-4 min-w-0 pb-16">
      <PageHeaderBar
        title="Form Templates"
        subtitle="Build reusable safety forms. Publish a version before scheduling or starting inspections."
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
                  placeholder="Search by name, category, or description…"
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
              <ul className="divide-y divide-gray-100">
                {filteredRows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50">
                    <Link
                      to={`/safety/form-templates/${encodeURIComponent(r.id)}`}
                      className="flex flex-1 min-w-0 items-center gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">{r.name}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {r.category}
                          {r.published_version_number != null
                            ? ` · v${r.published_version_number} published`
                            : ' · no published version'}
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          r.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {r.status}
                      </span>
                      <button
                        type="button"
                        aria-label={`Delete template ${r.name.trim() || 'Untitled'}`}
                        title="Delete template"
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
            )}
          </>
        )}
      </div>
    </div>
  );
}
