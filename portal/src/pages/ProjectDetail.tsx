import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Download, FileText, FolderOpen, HardHat } from 'lucide-react';
import { ApiError, getPortalToken, portalApi } from '@/lib/api';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppPageHeader,
  AppTabs,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/lib/ui';

type Project = {
  id: string;
  code: string;
  name: string;
  status_label?: string | null;
  progress?: number | null;
  date_start?: string | null;
  date_eta?: string | null;
  date_end?: string | null;
  participation: 'owner' | 'awarded';
  membership_client_name?: string | null;
  address?: string | null;
  address_city?: string | null;
  address_province?: string | null;
};

type FileRow = {
  id: string;
  original_name?: string | null;
  category?: string | null;
  uploaded_at?: string | null;
};

type ProposalRow = {
  id: string;
  title?: string | null;
  order_number?: string | null;
  created_at?: string | null;
};

type ProjectTab = 'overview' | 'files' | 'documents';

function fmt(d?: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

async function downloadFile(fileId: string, name?: string | null) {
  const token = getPortalToken();
  const res = await fetch(`/portal/hub/files/${encodeURIComponent(fileId)}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const data = await res.json();
    if (data.download_url) {
      window.open(data.download_url, '_blank');
      return;
    }
  }
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'file';
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [p, setP] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [docs, setDocs] = useState<ProposalRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const tabParam = searchParams.get('tab');
  const tab: ProjectTab =
    tabParam === 'files' || tabParam === 'documents' ? tabParam : 'overview';

  useEffect(() => {
    if (!id) return;
    portalApi<Project>('GET', `/portal/hub/projects/${encodeURIComponent(id)}`)
      .then(setP)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Not found'));
  }, [id]);

  useEffect(() => {
    if (!id || tab !== 'files') return;
    let cancelled = false;
    setFilesLoading(true);
    portalApi<{ items: FileRow[] }>(
      'GET',
      `/portal/hub/files?project_id=${encodeURIComponent(id)}`,
    )
      .then((d) => {
        if (!cancelled) setFiles(d.items || []);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, tab]);

  useEffect(() => {
    if (!id || tab !== 'documents') return;
    let cancelled = false;
    setDocsLoading(true);
    portalApi<{ items: ProposalRow[] }>(
      'GET',
      `/portal/hub/proposals?project_id=${encodeURIComponent(id)}`,
    )
      .then((d) => {
        if (!cancelled) setDocs(d.items || []);
      })
      .catch(() => {
        if (!cancelled) setDocs([]);
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, tab]);

  const tabItems = useMemo(
    () => [
      { key: 'overview', label: 'Overview' },
      { key: 'files', label: 'Files' },
      { key: 'documents', label: 'Documents' },
    ],
    [],
  );

  const setTab = (key: string) => {
    if (key === 'overview') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: key }, { replace: true });
    }
  };

  const progress =
    typeof p?.progress === 'number' ? Math.max(0, Math.min(100, p.progress)) : null;
  const location = p
    ? [p.address, p.address_city, p.address_province].filter(Boolean).join(', ')
    : '';

  if (error) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader
          title="Project"
          onBack={() => navigate('/')}
          backLabel="Back to projects"
          icon={<HardHat className="h-4 w-4" />}
        />
        <AppEmptyState title="Unavailable" description={error} />
      </div>
    );
  }

  if (!p) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader title="Project" icon={<HardHat className="h-4 w-4" />} />
        <AppCard>
          <p className={uiTypography.helper}>Loading…</p>
        </AppCard>
      </div>
    );
  }

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title={p.name}
        subtitle={p.code}
        icon={<HardHat className="h-4 w-4" />}
        onBack={() => navigate('/')}
        backLabel="Back to projects"
        actions={
          <AppBadge variant={p.participation === 'owner' ? 'info' : 'warning'}>
            {p.participation === 'owner' ? 'Owner' : 'Awarded'}
          </AppBadge>
        }
      />

      <AppCard bodyClassName="p-3">
        <AppTabs tabs={tabItems} value={tab} onChange={setTab} />
      </AppCard>

      {tab === 'overview' ? (
        <div className="space-y-4">
          <AppCard title="Status">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className={uiTypography.helper}>Status</div>
                  <div className="mt-0.5 font-semibold text-gray-900">{p.status_label || '—'}</div>
                </div>
                <div>
                  <div className={uiTypography.helper}>Your company</div>
                  <div className="mt-0.5 font-semibold text-gray-900">
                    {p.membership_client_name || '—'}
                  </div>
                </div>
              </div>
              {progress != null ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className={uiTypography.helper}>Progress</span>
                    <span className="text-sm font-semibold text-gray-900">{progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-brand-red transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </AppCard>

          <AppCard title="Schedule">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className={uiTypography.helper}>Start</dt>
                <dd className="mt-0.5 font-semibold text-gray-900">{fmt(p.date_start)}</dd>
              </div>
              <div>
                <dt className={uiTypography.helper}>ETA</dt>
                <dd className="mt-0.5 font-semibold text-gray-900">{fmt(p.date_eta)}</dd>
              </div>
              <div>
                <dt className={uiTypography.helper}>End</dt>
                <dd className="mt-0.5 font-semibold text-gray-900">{fmt(p.date_end)}</dd>
              </div>
            </dl>
          </AppCard>

          <AppCard title="Location">
            <p className="font-semibold text-gray-900">{location || '—'}</p>
          </AppCard>
        </div>
      ) : null}

      {tab === 'files' ? (
        filesLoading ? (
          <AppCard>
            <p className={uiTypography.helper}>Loading files…</p>
          </AppCard>
        ) : files.length === 0 ? (
          <AppEmptyState
            title="No shared files"
            description="No files have been shared for this project yet."
            icon={<FolderOpen className="h-5 w-5" />}
          />
        ) : (
          <AppCard bodyClassName="!p-0">
            <ul className="divide-y divide-gray-100">
              {files.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-gray-900">
                      {f.original_name || 'File'}
                    </div>
                    <div className={uiTypography.helper}>
                      {[f.category, f.uploaded_at ? new Date(f.uploaded_at).toLocaleDateString() : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    leftIcon={<Download className="h-3.5 w-3.5" />}
                    onClick={() => void downloadFile(f.id, f.original_name)}
                  >
                    Download
                  </AppButton>
                </li>
              ))}
            </ul>
          </AppCard>
        )
      ) : null}

      {tab === 'documents' ? (
        docsLoading ? (
          <AppCard>
            <p className={uiTypography.helper}>Loading documents…</p>
          </AppCard>
        ) : docs.length === 0 ? (
          <AppEmptyState
            title="No shared documents"
            description="No proposals have been shared for this project yet."
            icon={<FileText className="h-5 w-5" />}
          />
        ) : (
          <AppCard bodyClassName="!p-0">
            <ul className="divide-y divide-gray-100">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-gray-900">
                      {d.title || d.order_number || 'Proposal'}
                    </div>
                    <div className={uiTypography.helper}>
                      {[
                        d.order_number,
                        d.created_at ? new Date(d.created_at).toLocaleDateString() : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <AppBadge variant="neutral">Proposal</AppBadge>
                </li>
              ))}
            </ul>
          </AppCard>
        )
      ) : null}
    </div>
  );
}
