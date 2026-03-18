import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type BaseDoc = {
  id: string;
  name: string;
  file_id: string;
  default_deadline_days: number;
  sign_placement?: Record<string, number>;
};
type Pkg = { id: string; name: string; description?: string; active: boolean };
type PkgItem = { id: string; base_document_id: string; required: boolean; employee_visible: boolean; sort_order: number };
type Trigger = { id: string; condition_type: string; condition_value: Record<string, unknown>; sort_order: number };

export default function OnboardingAdmin() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'docs' | 'packages' | 'items' | 'triggers' | 'monitor' | 'resend'>('docs');
  const { data: baseDocs = [], refetch: refetchDocs } = useQuery({
    queryKey: ['onb-base-docs'],
    queryFn: () => api<BaseDoc[]>('GET', '/onboarding/base-documents'),
  });
  const { data: packages = [], refetch: refetchPkgs } = useQuery({
    queryKey: ['onb-packages'],
    queryFn: () => api<Pkg[]>('GET', '/onboarding/packages'),
  });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api<any>('GET', '/settings') });
  const divisions = (settings?.divisions || []) as { id: string; label: string }[];

  const [selPkg, setSelPkg] = useState<string>('');
  const { data: pkgItems = [], refetch: refetchItems } = useQuery({
    queryKey: ['onb-pkg-items', selPkg],
    queryFn: () => api<PkgItem[]>('GET', `/onboarding/packages/${selPkg}/items`),
    enabled: !!selPkg,
  });
  const { data: triggers = [], refetch: refetchTriggers } = useQuery({
    queryKey: ['onb-triggers', selPkg],
    queryFn: () => api<Trigger[]>('GET', `/onboarding/packages/${selPkg}/triggers`),
    enabled: !!selPkg,
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ['onb-assignments'],
    queryFn: () => api<any[]>('GET', '/onboarding/assignments'),
    enabled: tab === 'monitor',
  });

  const [newDocName, setNewDocName] = useState('');
  const [newDeadline, setNewDeadline] = useState(7);
  const [uploading, setUploading] = useState(false);
  const [newPkgName, setNewPkgName] = useState('');
  const [addItemDocId, setAddItemDocId] = useState('');
  const [trigType, setTrigType] = useState<'all' | 'division'>('all');
  const [trigDivs, setTrigDivs] = useState<string[]>([]);
  const [resendDocId, setResendDocId] = useState('');
  const [resendUserIds, setResendUserIds] = useState('');

  const uploadBasePdf = async (file: File) => {
    if (!newDocName.trim()) {
      toast.error('Enter document name first');
      return;
    }
    setUploading(true);
    try {
      const type = file.type || 'application/pdf';
      const up = await api<any>('POST', '/files/upload', {
        original_name: file.name,
        content_type: type,
        employee_id: null,
        project_id: null,
        client_id: null,
        category_id: 'onboarding-base',
      });
      await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': type, 'x-ms-blob-type': 'BlockBlob' },
        body: file,
      });
      const conf = await api<any>('POST', '/files/confirm', {
        key: up.key,
        size_bytes: file.size,
        checksum_sha256: 'na',
        content_type: type,
      });
      await api('POST', '/onboarding/base-documents', {
        name: newDocName.trim(),
        file_id: conf.id,
        default_deadline_days: newDeadline,
      });
      toast.success('Base document created');
      setNewDocName('');
      refetchDocs();
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">HR Onboarding</h1>
      <p className="text-gray-600 text-sm mb-6">Manage documents, packages, and triggers. New hires get assignments on registration.</p>

      <div className="flex flex-wrap gap-2 mb-8 border-b pb-4">
        {(['docs', 'packages', 'items', 'triggers', 'monitor', 'resend'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            {t === 'docs'
              ? 'Documents'
              : t === 'packages'
                ? 'Packages'
                : t === 'items'
                  ? 'Package items'
                  : t === 'triggers'
                    ? 'Triggers'
                    : t === 'monitor'
                      ? 'Monitoring'
                      : 'Resend'}
          </button>
        ))}
      </div>

      {tab === 'docs' && (
        <div className="space-y-6">
          <div className="bg-white border rounded-xl p-6">
            <h2 className="font-semibold mb-4">Add base document (PDF)</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600">Name</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 mt-1"
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  placeholder="e.g. Code of Conduct"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Deadline (days)</label>
                <input
                  type="number"
                  className="w-full border rounded-lg px-3 py-2 mt-1"
                  value={newDeadline}
                  min={1}
                  onChange={(e) => setNewDeadline(+e.target.value || 7)}
                />
              </div>
            </div>
            <label className="mt-4 inline-block">
              <span className="px-4 py-2 rounded-lg bg-brand-red text-white cursor-pointer inline-block">
                {uploading ? 'Uploading…' : 'Choose PDF'}
              </span>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadBasePdf(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <ul className="divide-y border rounded-xl bg-white">
            {baseDocs.map((d) => (
              <li key={d.id} className="p-4 flex justify-between items-center">
                <div>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-gray-500">
                    {d.default_deadline_days} days · {d.id.slice(0, 8)}…
                  </div>
                </div>
                <button
                  type="button"
                  className="text-red-600 text-sm"
                  onClick={async () => {
                    if (!confirm('Delete this base document?')) return;
                    try {
                      await api('DELETE', `/onboarding/base-documents/${d.id}`);
                      refetchDocs();
                    } catch (e: any) {
                      toast.error(e?.message || 'Delete failed');
                    }
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'packages' && (
        <div className="space-y-6">
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2"
              placeholder="Package name"
              value={newPkgName}
              onChange={(e) => setNewPkgName(e.target.value)}
            />
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-gray-900 text-white"
              onClick={async () => {
                try {
                  await api('POST', '/onboarding/packages', { name: newPkgName || 'New package', active: true });
                  setNewPkgName('');
                  refetchPkgs();
                } catch (e: any) {
                  toast.error(e?.message || 'Failed');
                }
              }}
            >
              Add
            </button>
          </div>
          <ul className="border rounded-xl divide-y bg-white">
            {packages.map((p) => (
              <li key={p.id} className="p-4 flex justify-between items-center">
                <div>
                  <span className="font-medium">{p.name}</span>
                  {!p.active && <span className="ml-2 text-xs text-gray-400">inactive</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-sm text-blue-600"
                    onClick={() => {
                      setSelPkg(p.id);
                      setTab('items');
                    }}
                  >
                    Items
                  </button>
                  <button
                    type="button"
                    className="text-sm text-blue-600"
                    onClick={() => {
                      setSelPkg(p.id);
                      setTab('triggers');
                    }}
                  >
                    Triggers
                  </button>
                  <button
                    type="button"
                    className="text-sm text-gray-500"
                    onClick={async () => {
                      try {
                        await api('PUT', `/onboarding/packages/${p.id}`, { active: !p.active });
                        refetchPkgs();
                      } catch (_) {}
                    }}
                  >
                    {p.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    className="text-sm text-red-600"
                    onClick={async () => {
                      if (!confirm('Delete package and triggers/items?')) return;
                      try {
                        await api('DELETE', `/onboarding/packages/${p.id}`);
                        refetchPkgs();
                      } catch (e: any) {
                        toast.error(e?.message || 'Failed');
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'items' && (
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-600">Package</label>
            <select
              className="w-full border rounded-lg px-3 py-2 mt-1"
              value={selPkg}
              onChange={(e) => setSelPkg(e.target.value)}
            >
              <option value="">Select…</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {selPkg && (
            <>
              <div className="flex gap-2">
                <select
                  className="flex-1 border rounded-lg px-3 py-2"
                  value={addItemDocId}
                  onChange={(e) => setAddItemDocId(e.target.value)}
                >
                  <option value="">Base document…</option>
                  {baseDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-gray-900 text-white"
                  onClick={async () => {
                    if (!addItemDocId) return;
                    try {
                      await api('POST', `/onboarding/packages/${selPkg}/items`, {
                        base_document_id: addItemDocId,
                        required: true,
                        employee_visible: true,
                      });
                      setAddItemDocId('');
                      refetchItems();
                    } catch (e: any) {
                      toast.error(e?.message || 'Failed');
                    }
                  }}
                >
                  Add item
                </button>
              </div>
              <ul className="border rounded-xl divide-y">
                {pkgItems.map((it) => (
                  <li key={it.id} className="p-3 flex justify-between text-sm">
                    <span>{baseDocs.find((b) => b.id === it.base_document_id)?.name || it.base_document_id}</span>
                    <button
                      type="button"
                      className="text-red-600"
                      onClick={async () => {
                        await api('DELETE', `/onboarding/package-items/${it.id}`);
                        refetchItems();
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === 'triggers' && (
        <div className="space-y-4">
          <select
            className="w-full border rounded-lg px-3 py-2"
            value={selPkg}
            onChange={(e) => setSelPkg(e.target.value)}
          >
            <option value="">Package…</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {selPkg && (
            <>
              <div className="bg-gray-50 p-4 rounded-xl space-y-3">
                <div>
                  <label className="text-sm font-medium">Condition</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 mt-1"
                    value={trigType}
                    onChange={(e) => setTrigType(e.target.value as 'all' | 'division')}
                  >
                    <option value="all">All new hires</option>
                    <option value="division">Specific division(s)</option>
                  </select>
                </div>
                {trigType === 'division' && (
                  <div className="flex flex-wrap gap-2">
                    {divisions.map((d) => (
                      <label key={d.id} className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={trigDivs.includes(String(d.id))}
                          onChange={(e) => {
                            const id = String(d.id);
                            setTrigDivs((prev) => (e.target.checked ? [...prev, id] : prev.filter((x) => x !== id)));
                          }}
                        />
                        {d.label}
                      </label>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-gray-900 text-white"
                  onClick={async () => {
                    try {
                      const cv =
                        trigType === 'all'
                          ? {}
                          : {
                              division_ids: trigDivs,
                            };
                      await api('POST', `/onboarding/packages/${selPkg}/triggers`, {
                        condition_type: trigType,
                        condition_value: cv,
                      });
                      refetchTriggers();
                      toast.success('Trigger added');
                    } catch (e: any) {
                      toast.error(e?.message || 'Failed');
                    }
                  }}
                >
                  Add trigger
                </button>
              </div>
              <ul className="border rounded-xl divide-y">
                {triggers.map((t) => (
                  <li key={t.id} className="p-3 flex justify-between text-sm">
                    <span>
                      {t.condition_type}
                      {t.condition_type === 'division' && t.condition_value?.division_ids
                        ? ` · ${(t.condition_value.division_ids as string[]).length} division(s)`
                        : ''}
                    </span>
                    <button
                      type="button"
                      className="text-red-600"
                      onClick={async () => {
                        await api('DELETE', `/onboarding/triggers/${t.id}`);
                        refetchTriggers();
                      }}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === 'monitor' && (
        <div className="overflow-x-auto border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">User</th>
                <th className="text-left p-3">Package</th>
                <th className="text-left p-3">Pending</th>
                <th className="text-left p-3">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-3">{a.username}</td>
                  <td className="p-3">{a.package_name}</td>
                  <td className="p-3">{a.items_pending}</td>
                  <td className="p-3 text-gray-500">{a.assigned_at?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'resend' && (
        <div className="bg-white border rounded-xl p-6 space-y-4 max-w-xl">
          <p className="text-sm text-gray-600">Create a new pending assignment for users (comma-separated user UUIDs).</p>
          <div>
            <label className="text-sm">Base document</label>
            <select
              className="w-full border rounded-lg px-3 py-2 mt-1"
              value={resendDocId}
              onChange={(e) => setResendDocId(e.target.value)}
            >
              <option value="">Select…</option>
              {baseDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm">User IDs (comma-separated)</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 mt-1 font-mono text-xs"
              rows={4}
              placeholder="uuid, uuid, …"
              value={resendUserIds}
              onChange={(e) => setResendUserIds(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-brand-red text-white"
            onClick={async () => {
              const ids = resendUserIds
                .split(/[\s,]+/)
                .map((s) => s.trim())
                .filter(Boolean);
              if (!resendDocId || !ids.length) {
                toast.error('Document and user IDs required');
                return;
              }
              try {
                const r = await api<{ created: number }>('POST', `/onboarding/base-documents/${resendDocId}/resend`, {
                  user_ids: ids,
                });
                toast.success(`Created ${r.created} pending item(s)`);
                setResendUserIds('');
                qc.invalidateQueries({ queryKey: ['onb-assignments'] });
              } catch (e: any) {
                toast.error(e?.message || 'Failed');
              }
            }}
          >
            Resend
          </button>
        </div>
      )}
    </div>
  );
}
