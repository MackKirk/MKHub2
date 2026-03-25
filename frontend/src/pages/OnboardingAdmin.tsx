import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import OverlayPortal from '@/components/OverlayPortal';
import SignatureTemplateEditor from '@/components/SignatureTemplateEditor';

type UserPickerRow = { id: string; name?: string | null; username?: string; email?: string };

type BaseDoc = {
  id: string;
  name: string;
  file_id: string;
  default_deadline_days: number;
  sign_placement?: Record<string, number>;
  assignee_type?: string;
  assignee_user_id?: string | null;
  assignee_user_ids?: string[];
  required?: boolean;
  employee_visible?: boolean;
  display_name?: string | null;
  notification_message?: string | null;
  delivery_mode?: string;
  delivery_amount?: number | null;
  delivery_unit?: string | null;
  delivery_direction?: string | null;
  requires_signature?: boolean;
  notification_policy?: Record<string, unknown> | null;
  signing_deadline_days?: number;
  signature_template?: { version: number; fields: unknown[] } | null;
};

type Tab = 'docs' | 'monitor';

const INPUT_FIELD_CLASS =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all duration-150';

function userDisplayName(u: { name?: string | null; username?: string; email?: string }): string {
  return (u.name || '').trim() || u.username || u.email || 'User';
}

function ResendUserPicker({
  users,
  selectedIds,
  onToggle,
  onAddIds,
  onRemoveIds,
  onClearAll,
  disabled,
}: {
  users: UserPickerRow[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onAddIds: (ids: string[]) => void;
  onRemoveIds: (ids: string[]) => void;
  onClearAll: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = userDisplayName(u).toLowerCase();
      const un = (u.username || '').toLowerCase();
      const em = (u.email || '').toLowerCase();
      return name.includes(q) || un.includes(q) || em.includes(q) || u.id.toLowerCase().includes(q);
    });
  }, [users, search]);

  const updatePanelPosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el || !open) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const margin = 8;
    const maxH = Math.min(384, Math.max(120, window.innerHeight - r.bottom - gap - margin));
    setPanelPos({
      top: r.bottom + gap,
      left: r.left,
      width: r.width,
      maxH,
    });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const allFilteredInSelection =
    filtered.length > 0 && filtered.every((u) => selectedIds.has(u.id));

  const panel =
    open &&
    panelPos &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={panelRef}
        className="fixed z-[10050] rounded-lg border border-gray-200 bg-white shadow-xl flex flex-col overflow-hidden"
        style={{
          top: panelPos.top,
          left: panelPos.left,
          width: panelPos.width,
          maxHeight: panelPos.maxH,
        }}
      >
        <div className="p-2 border-b border-gray-100 space-y-2 flex-shrink-0">
          <input
            type="search"
            autoFocus
            placeholder="Search name, username, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 hover:bg-amber-100 disabled:opacity-40"
              disabled={filtered.length === 0}
              onClick={() => {
                const ids = filtered.map((u) => u.id);
                if (allFilteredInSelection) onRemoveIds(ids);
                else onAddIds(ids);
              }}
            >
              {allFilteredInSelection ? 'Deselect' : 'Select'} all{search.trim() ? ' (filtered)' : ''}
            </button>
            <button
              type="button"
              className="text-[11px] font-medium text-gray-700 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-40"
              disabled={selectedIds.size === 0}
              onClick={onClearAll}
            >
              Clear selection
            </button>
          </div>
        </div>
        <div className="overflow-y-auto min-h-0 flex-1 p-1">
          {filtered.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-gray-500">No users match.</div>
          ) : (
            filtered.map((u) => {
              const checked = selectedIds.has(u.id);
              return (
                <label
                  key={u.id}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 cursor-pointer text-left"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-gray-300"
                    checked={checked}
                    onChange={() => onToggle(u.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-gray-900 truncate">{userDisplayName(u)}</span>
                    <span className="block text-[10px] text-gray-500 truncate">
                      {u.username || '—'}
                      {u.email ? ` · ${u.email}` : ''}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div className="px-2 py-1.5 border-t border-gray-100 text-[10px] text-gray-500 flex-shrink-0">
          Showing {filtered.length} of {users.length}
        </div>
      </div>,
      document.body
    );

  return (
    <div className="relative" ref={anchorRef}>
      <button
        type="button"
        disabled={disabled || users.length === 0}
        onClick={() => setOpen((o) => !o)}
        className={`${INPUT_FIELD_CLASS} w-full text-left flex items-center justify-between gap-2`}
      >
        <span className="truncate">
          {selectedIds.size === 0
            ? 'Select users…'
            : `${selectedIds.size} user${selectedIds.size === 1 ? '' : 's'} selected`}
        </span>
        <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {panel}
    </div>
  );
}

function ResendDocPicker({
  docs,
  selectedIds,
  onToggle,
  onAddIds,
  onRemoveIds,
  onClearAll,
  disabled,
}: {
  docs: BaseDoc[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onAddIds: (ids: string[]) => void;
  onRemoveIds: (ids: string[]) => void;
  onClearAll: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => {
      const name = (d.name || '').toLowerCase();
      return name.includes(q) || d.id.toLowerCase().includes(q);
    });
  }, [docs, search]);

  const updatePanelPosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el || !open) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const margin = 8;
    const maxH = Math.min(384, Math.max(120, window.innerHeight - r.bottom - gap - margin));
    setPanelPos({
      top: r.bottom + gap,
      left: r.left,
      width: r.width,
      maxH,
    });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const allFilteredInSelection =
    filtered.length > 0 && filtered.every((d) => selectedIds.has(d.id));

  const panel =
    open &&
    panelPos &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={panelRef}
        className="fixed z-[10050] rounded-lg border border-gray-200 bg-white shadow-xl flex flex-col overflow-hidden"
        style={{
          top: panelPos.top,
          left: panelPos.left,
          width: panelPos.width,
          maxHeight: panelPos.maxH,
        }}
      >
        <div className="p-2 border-b border-gray-100 space-y-2 flex-shrink-0">
          <input
            type="search"
            autoFocus
            placeholder="Search document name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 hover:bg-amber-100 disabled:opacity-40"
              disabled={filtered.length === 0}
              onClick={() => {
                const ids = filtered.map((d) => d.id);
                if (allFilteredInSelection) onRemoveIds(ids);
                else onAddIds(ids);
              }}
            >
              {allFilteredInSelection ? 'Deselect' : 'Select'} all{search.trim() ? ' (filtered)' : ''}
            </button>
            <button
              type="button"
              className="text-[11px] font-medium text-gray-700 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-40"
              disabled={selectedIds.size === 0}
              onClick={onClearAll}
            >
              Clear selection
            </button>
          </div>
        </div>
        <div className="overflow-y-auto min-h-0 flex-1 p-1">
          {filtered.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-gray-500">No documents match.</div>
          ) : (
            filtered.map((d) => {
              const checked = selectedIds.has(d.id);
              return (
                <label
                  key={d.id}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 cursor-pointer text-left"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-gray-300"
                    checked={checked}
                    onChange={() => onToggle(d.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-gray-900 truncate">{d.name}</span>
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div className="px-2 py-1.5 border-t border-gray-100 text-[10px] text-gray-500 flex-shrink-0">
          Showing {filtered.length} of {docs.length}
        </div>
      </div>,
      document.body
    );

  return (
    <div className="relative" ref={anchorRef}>
      <button
        type="button"
        disabled={disabled || docs.length === 0}
        onClick={() => setOpen((o) => !o)}
        className={`${INPUT_FIELD_CLASS} w-full text-left flex items-center justify-between gap-2`}
      >
        <span className="truncate">
          {selectedIds.size === 0
            ? 'Select base documents…'
            : `${selectedIds.size} document${selectedIds.size === 1 ? '' : 's'} selected`}
        </span>
        <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {panel}
    </div>
  );
}

function displayNameFromPdfFile(file: File): string {
  const base = file.name.replace(/\.pdf$/i, '').trim();
  return base.replace(/[_]+/g, ' ').replace(/-/g, ' ').trim() || 'Document';
}

/** Only real PDF uploads: .pdf + MIME + %PDF header */
function isPdfFileCandidate(f: File): boolean {
  const name = f.name.trim().toLowerCase();
  if (!name.endsWith('.pdf')) return false;
  const ct = (f.type || '').toLowerCase();
  if (ct === 'application/pdf') return true;
  if (ct === '' || ct === 'application/octet-stream') return true;
  return false;
}

async function fileStartsWithPdfMagic(file: File): Promise<boolean> {
  try {
    const buf = await file.slice(0, 5).arrayBuffer();
    return new TextDecoder().decode(buf).startsWith('%PDF');
  } catch {
    return false;
  }
}

/** Same PDF badge as Project / Opportunities Files tab (ProjectDetail iconFor pdf) */
function PdfFileBadge({ className = '' }: { className?: string }) {
  return (
    <div
      className={`w-8 h-10 rounded-lg bg-red-500 text-white flex items-center justify-center text-[10px] font-extrabold select-none flex-shrink-0 ${className}`}
      aria-hidden
    >
      PDF
    </div>
  );
}

/** First-page PNG from API (Bearer); fallback to PDF badge */
function BaseDocPageThumb({ docId, w = 260 }: { docId: string; w?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading');
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const t = getToken();
        const r = await fetch(`/onboarding/base-documents/${docId}/thumbnail?w=${w}`, {
          headers: { Authorization: `Bearer ${t || ''}` },
        });
        if (cancelled) return;
        if (!r.ok) {
          setState('err');
          return;
        }
        const blob = await r.blob();
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setState('ok');
      } catch {
        if (!cancelled) setState('err');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [docId, w]);
  if (state === 'loading') {
    return (
      <div className="w-full h-full min-h-[6rem] flex items-center justify-center bg-gray-100 rounded-md">
        <div className="h-8 w-16 bg-gray-200/80 rounded animate-pulse" />
      </div>
    );
  }
  if (state === 'err' || !url) {
    return (
      <div className="w-full h-full min-h-[6rem] flex items-center justify-center bg-gray-50 rounded-md">
        <PdfFileBadge className="w-7 h-10 text-[9px]" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="w-full h-full min-h-[6rem] max-h-[7.5rem] object-contain object-top bg-white"
      draggable={false}
    />
  );
}

const NOTIFICATION_PRESETS = [
  { value: 'soon_after_available', label: 'Soon after document is available' },
  { value: 'placeholder', label: 'Default (notifications not sent yet)' },
];

const PREFS_SECTION_TITLE = 'text-[10px] font-medium text-gray-500 uppercase tracking-wide';

export default function OnboardingAdmin() {
  const qc = useQueryClient();
  const askConfirm = useConfirm();
  const [tab, setTab] = useState<Tab>('docs');
  const [resendModalOpen, setResendModalOpen] = useState(false);
  const { data: baseDocs = [], refetch: refetchDocs, isFetched: baseDocsFetched } = useQuery({
    queryKey: ['onb-base-docs'],
    queryFn: () => api<BaseDoc[]>('GET', '/onboarding/base-documents'),
  });
  const { data: onbSettings } = useQuery({
    queryKey: ['onboarding-settings'],
    queryFn: () => api<{ document_delivery_enabled: boolean }>('GET', '/onboarding/settings'),
  });
  const [deliveryTogglePending, setDeliveryTogglePending] = useState(false);
  const { data: userPickerList = [], isLoading: usersPickerLoading } = useQuery({
    queryKey: ['onb-users-picker'],
    queryFn: async () => {
      const limit = 2000;
      let page = 1;
      const out: UserPickerRow[] = [];
      for (;;) {
        const res = await api<{ items: UserPickerRow[]; total_pages: number }>('GET', `/users?page=${page}&limit=${limit}`);
        const items = res?.items ?? [];
        out.push(...items);
        if (!res?.total_pages || page >= res.total_pages) break;
        page += 1;
      }
      return out.sort((a, b) => userDisplayName(a).localeCompare(userDisplayName(b)));
    },
    enabled: tab === 'docs' || resendModalOpen,
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ['onb-assignments'],
    queryFn: () => api<any[]>('GET', '/onboarding/assignments'),
    enabled: tab === 'monitor',
  });

  /** Same entry + hover pattern as BusinessDashboard cards */
  const [docCardsEntered, setDocCardsEntered] = useState(false);
  const [docCardsAnimComplete, setDocCardsAnimComplete] = useState(false);
  useEffect(() => {
    if (tab !== 'docs') {
      setDocCardsEntered(false);
      setDocCardsAnimComplete(false);
      return;
    }
    if (!baseDocsFetched) return;
    setDocCardsEntered(false);
    setDocCardsAnimComplete(false);
    const t = setTimeout(() => setDocCardsEntered(true), 80);
    return () => clearTimeout(t);
  }, [tab, baseDocsFetched]);
  useEffect(() => {
    if (tab !== 'docs' || !docCardsEntered) return;
    if (baseDocs.length === 0) {
      setDocCardsAnimComplete(true);
      return;
    }
    const ms = Math.min(2500, 520 + baseDocs.length * 70);
    const timer = setTimeout(() => setDocCardsAnimComplete(true), ms);
    return () => clearTimeout(timer);
  }, [tab, docCardsEntered, baseDocs.length]);

  const [uploading, setUploading] = useState(false);
  const [docsDragActive, setDocsDragActive] = useState(false);
  const docsFileInputRef = useRef<HTMLInputElement>(null);
  const docsDragDepth = useRef(0);
  const [baseDocPreview, setBaseDocPreview] = useState<{ url: string; name: string } | null>(null);
  const [baseDocPreviewLoading, setBaseDocPreviewLoading] = useState(false);
  const baseDocPreviewUrlRef = useRef<string | null>(null);
  const baseDocPreviewAbortRef = useRef<AbortController | null>(null);

  const closeBaseDocPreview = () => {
    baseDocPreviewAbortRef.current?.abort();
    baseDocPreviewAbortRef.current = null;
    if (baseDocPreviewUrlRef.current) {
      URL.revokeObjectURL(baseDocPreviewUrlRef.current);
      baseDocPreviewUrlRef.current = null;
    }
    setBaseDocPreview(null);
    setBaseDocPreviewLoading(false);
  };

  useEffect(() => {
    return () => {
      if (baseDocPreviewUrlRef.current) {
        URL.revokeObjectURL(baseDocPreviewUrlRef.current);
        baseDocPreviewUrlRef.current = null;
      }
    };
  }, []);
  const [resendDocIds, setResendDocIds] = useState<Set<string>>(() => new Set());
  const [resendSelectedIds, setResendSelectedIds] = useState<Set<string>>(() => new Set());

  const [prefsDoc, setPrefsDoc] = useState<BaseDoc | null>(null);
  useEffect(() => {
    if (!prefsDoc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPrefsDoc(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prefsDoc]);
  useEffect(() => {
    if (!resendModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setResendModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resendModalOpen]);
  const [docMenuOpenId, setDocMenuOpenId] = useState<string | null>(null);
  const [docMenuAnchor, setDocMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const docMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const docMenuMenuRef = useRef<HTMLDivElement | null>(null);
  const [templateDoc, setTemplateDoc] = useState<BaseDoc | null>(null);
  const [pfAssigneeType, setPfAssigneeType] = useState<'employee' | 'user'>('employee');
  const [pfAssigneeUserIds, setPfAssigneeUserIds] = useState<Set<string>>(() => new Set());
  const [pfRequired, setPfRequired] = useState(true);
  const [pfEmployeeVisible, setPfEmployeeVisible] = useState(true);
  const [pfDisplayName, setPfDisplayName] = useState('');
  const [pfMessage, setPfMessage] = useState('');
  const [pfDelivery, setPfDelivery] = useState<'none' | 'on_hire' | 'custom'>('on_hire');
  const [pfAmt, setPfAmt] = useState(1);
  const [pfUnit, setPfUnit] = useState<'days' | 'weeks' | 'months'>('months');
  const [pfDir, setPfDir] = useState<'before' | 'after'>('after');
  const [pfNotifTiming, setPfNotifTiming] = useState('placeholder');
  const [pfReqSig, setPfReqSig] = useState(true);
  const [pfSigningDays, setPfSigningDays] = useState(7);
  const [pfSaving, setPfSaving] = useState(false);

  useEffect(() => {
    if (!prefsDoc) return;
    setPfAssigneeType((prefsDoc.assignee_type || 'employee').toLowerCase() === 'user' ? 'user' : 'employee');
    const ids =
      prefsDoc.assignee_user_ids && prefsDoc.assignee_user_ids.length > 0
        ? prefsDoc.assignee_user_ids
        : prefsDoc.assignee_user_id
          ? [prefsDoc.assignee_user_id]
          : [];
    setPfAssigneeUserIds(new Set(ids));
    setPfRequired(prefsDoc.required !== false);
    setPfEmployeeVisible(prefsDoc.employee_visible !== false);
    setPfDisplayName(prefsDoc.display_name || '');
    setPfMessage(prefsDoc.notification_message || '');
    const mode = (prefsDoc.delivery_mode || 'on_hire').toLowerCase();
    if (mode === 'none') setPfDelivery('none');
    else if (mode === 'custom') setPfDelivery('custom');
    else setPfDelivery('on_hire');
    setPfAmt(prefsDoc.delivery_amount || 1);
    setPfUnit((prefsDoc.delivery_unit as 'days' | 'weeks' | 'months') || 'months');
    setPfDir((prefsDoc.delivery_direction as 'before' | 'after') || 'after');
    setPfReqSig(prefsDoc.requires_signature !== false);
    const pol = prefsDoc.notification_policy as { timing?: string } | null;
    setPfNotifTiming(pol?.timing || 'placeholder');
    setPfSigningDays(Math.max(1, Number(prefsDoc.signing_deadline_days) || 7));
  }, [prefsDoc]);

  const clearAssigneeUsers = () => setPfAssigneeUserIds(new Set());

  const setTabAndCollapse = (t: Tab) => {
    if (t !== 'docs') closeBaseDocPreview();
    setDocMenuOpenId(null);
    setDocMenuAnchor(null);
    setPrefsDoc(null);
    setResendModalOpen(false);
    setTab(t);
  };

  useEffect(() => {
    if (!docMenuOpenId) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (docMenuButtonRef.current?.contains(target) || docMenuMenuRef.current?.contains(target)) return;
      setDocMenuOpenId(null);
      setDocMenuAnchor(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDocMenuOpenId(null);
        setDocMenuAnchor(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [docMenuOpenId]);

  const openDocPreferences = (d: BaseDoc) => {
    setPrefsDoc(d);
    setDocMenuOpenId(null);
  };

  const saveDocPreferences = async () => {
    if (!prefsDoc) return;
    if (pfAssigneeType === 'user' && pfAssigneeUserIds.size === 0) {
      toast.error('Select at least one user for this document');
      return;
    }
    const mode = pfDelivery;
    const payload: Record<string, unknown> = {
      assignee_type: pfAssigneeType,
      assignee_user_id: null,
      assignee_user_ids: pfAssigneeType === 'user' ? Array.from(pfAssigneeUserIds) : null,
      required: pfRequired,
      employee_visible: pfEmployeeVisible,
      display_name: pfDisplayName.trim() || null,
      notification_message: pfMessage.trim() || null,
      delivery_mode: mode,
      requires_signature: pfReqSig,
      notification_policy: { timing: pfNotifTiming },
      signing_deadline_days: Math.max(1, pfSigningDays),
    };
    if (mode === 'custom') {
      payload.delivery_amount = pfAmt;
      payload.delivery_unit = pfUnit;
      payload.delivery_direction = pfDir;
    } else {
      payload.delivery_amount = null;
      payload.delivery_unit = null;
      payload.delivery_direction = null;
    }
    setPfSaving(true);
    try {
      await api('PUT', `/onboarding/base-documents/${prefsDoc.id}`, payload);
      toast.success('Saved');
      setPrefsDoc(null);
      refetchDocs();
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setPfSaving(false);
    }
  };

  const uploadOneBasePdf = async (file: File, docName: string) => {
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
      name: docName,
      file_id: conf.id,
    });
  };

  const processPdfFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const rejected = files.filter((f) => !isPdfFileCandidate(f));
    const candidates = files.filter((f) => isPdfFileCandidate(f));

    if (candidates.length === 0) {
      toast.error(
        rejected.length > 1
          ? 'Only PDF files (.pdf) are accepted.'
          : `Only PDF files are accepted — "${rejected[0]?.name || 'file'}" is not a PDF.`
      );
      return;
    }
    if (rejected.length > 0) {
      toast(`${rejected.length} non-PDF file(s) ignored — only .pdf is accepted.`, { icon: 'ℹ️' });
    }

    const pdfs: File[] = [];
    for (const file of candidates) {
      if (await fileStartsWithPdfMagic(file)) pdfs.push(file);
      else toast.error(`"${file.name}" is not a valid PDF file.`);
    }
    if (pdfs.length === 0) return;

    setUploading(true);
    let ok = 0;
    for (const file of pdfs) {
      try {
        await uploadOneBasePdf(file, displayNameFromPdfFile(file));
        ok++;
      } catch (e: any) {
        toast.error(`${file.name}: ${e?.message || 'failed'}`);
      }
    }
    setUploading(false);
    await refetchDocs();
    if (ok > 0) toast.success(`${ok} document(s) added`);
  };

  const openBaseDocPreview = async (docId: string, name: string) => {
    baseDocPreviewAbortRef.current?.abort();
    if (baseDocPreviewUrlRef.current) {
      URL.revokeObjectURL(baseDocPreviewUrlRef.current);
      baseDocPreviewUrlRef.current = null;
    }
    setBaseDocPreview(null);
    const ac = new AbortController();
    baseDocPreviewAbortRef.current = ac;
    const t = getToken();
    setBaseDocPreviewLoading(true);
    try {
      const r = await fetch(`/onboarding/base-documents/${docId}/preview`, {
        headers: { Authorization: `Bearer ${t || ''}` },
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || r.statusText);
      }
      const blob = await r.blob();
      if (ac.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      if (baseDocPreviewUrlRef.current) URL.revokeObjectURL(baseDocPreviewUrlRef.current);
      baseDocPreviewUrlRef.current = url;
      setBaseDocPreview({ url, name });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      toast.error(e?.message || 'Could not open PDF');
    } finally {
      if (!ac.signal.aborted) setBaseDocPreviewLoading(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'docs', label: 'Documents' },
    { id: 'monitor', label: 'Monitoring' },
  ];

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-CA', {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    []
  );

  const inputFleet = INPUT_FIELD_CLASS;

  const docMenuDoc = docMenuOpenId ? baseDocs.find((x) => x.id === docMenuOpenId) : null;

  const documentDeliveryEnabled = onbSettings?.document_delivery_enabled !== false;

  const setDocumentDeliveryEnabled = async (enabled: boolean) => {
    setDeliveryTogglePending(true);
    try {
      await api('PATCH', '/onboarding/settings', { document_delivery_enabled: enabled });
      await qc.invalidateQueries({ queryKey: ['onboarding-settings'] });
      toast.success(
        enabled
          ? 'New hires will receive onboarding documents for signature.'
          : 'Automatic document delivery is off. New hires will not be assigned signing tasks.',
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not update settings');
    } finally {
      setDeliveryTogglePending(false);
    }
  };

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      {docMenuDoc &&
        docMenuAnchor &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={docMenuMenuRef}
            className="fixed rounded-lg border border-gray-200 bg-white shadow-lg py-1 min-w-[13rem] z-[9999] text-left"
            style={{ top: docMenuAnchor.top, right: docMenuAnchor.right }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="w-full text-left px-3 py-2 text-xs text-gray-800 hover:bg-gray-50"
              onClick={() => {
                setDocMenuOpenId(null);
                setDocMenuAnchor(null);
                openDocPreferences(docMenuDoc);
              }}
            >
              Preferences
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full text-left px-3 py-2 text-xs text-gray-800 hover:bg-gray-50"
              onClick={() => {
                setDocMenuOpenId(null);
                setDocMenuAnchor(null);
                setTemplateDoc(docMenuDoc);
              }}
            >
              Edit Signature Template
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button
              type="button"
              role="menuitem"
              className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50"
              onClick={async () => {
                setDocMenuOpenId(null);
                setDocMenuAnchor(null);
                const result = await askConfirm({
                  title: 'Delete document',
                  message: `Delete "${docMenuDoc.name}"? Pending assignments may block this.`,
                  confirmText: 'Delete',
                  cancelText: 'Cancel',
                });
                if (result !== 'confirm') return;
                try {
                  await api('DELETE', `/onboarding/base-documents/${docMenuDoc.id}`);
                  refetchDocs();
                } catch (err: any) {
                  toast.error((err as any)?.message || 'Delete failed');
                }
              }}
            >
              Delete
            </button>
          </div>,
          document.body
        )}
      {/* Title bar — same pattern as Fleet Assets */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div>
              <div className="text-sm font-semibold text-gray-900">HR Onboarding</div>
              <div className="text-xs text-gray-500 mt-0.5">Onboarding documents and registration assignments</div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* Tabs — Fleet-style underline + document delivery toggle */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="flex gap-1 px-0 pt-0 pb-3 flex-wrap flex-1 min-w-0">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTabAndCollapse(id)}
                className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
                  tab === id ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none shrink-0 sm:pb-3">
            <span className="text-xs text-gray-700">Send documents for signature</span>
            <button
              type="button"
              role="switch"
              aria-checked={documentDeliveryEnabled}
              disabled={deliveryTogglePending || onbSettings === undefined}
              onClick={() => setDocumentDeliveryEnabled(!documentDeliveryEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1 disabled:opacity-50 ${
                documentDeliveryEnabled ? 'bg-gray-900 border-gray-900' : 'bg-gray-200 border-gray-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                  documentDeliveryEnabled ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      {tab === 'docs' && (
        <div
          className="space-y-4"
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            docsDragDepth.current += 1;
            setDocsDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            docsDragDepth.current -= 1;
            if (docsDragDepth.current <= 0) {
              docsDragDepth.current = 0;
              setDocsDragActive(false);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const items = [...(e.dataTransfer?.items || [])].filter((i) => i.kind === 'file');
            const allClearlyNonPdf =
              items.length > 0 &&
              items.every((i) => {
                const t = (i.type || '').toLowerCase();
                return t !== '' && t !== 'application/pdf' && t !== 'application/octet-stream';
              });
            e.dataTransfer.dropEffect = allClearlyNonPdf ? 'none' : 'copy';
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            docsDragDepth.current = 0;
            setDocsDragActive(false);
            if (uploading) return;
            const files = e.dataTransfer.files;
            if (files?.length) void processPdfFiles(files);
          }}
        >
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Base documents (PDF)</div>
            <button
              type="button"
              disabled={uploading}
              onClick={() => docsFileInputRef.current?.click()}
              className={`w-full rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                docsDragActive ? 'border-brand-red bg-red-50/40' : 'border-gray-300 bg-gray-50/30 hover:border-gray-400'
              }`}
            >
              <p className="text-sm font-medium text-gray-800">
                {uploading ? 'Uploading…' : 'Drag Documents here or click to choose'}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Drag-and-drop your document here or choose files from your computer.
              </p>
            </button>
            <input
              ref={docsFileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const fl = e.target.files;
                if (fl?.length) void processPdfFiles(fl);
                e.target.value = '';
              }}
            />
          </div>

          {baseDocs.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-xs text-gray-500">
              No base documents yet. Upload PDFs above.
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-10 gap-2.5">
              {baseDocs.map((d, idx) => (
                <div
                  key={d.id}
                  className="group relative rounded-xl border border-gray-200 bg-white px-2 py-4 pt-3 min-w-0 min-h-[132px] flex flex-col transition-all duration-200 ease-out hover:border-gray-300 hover:-translate-y-0.5"
                  style={
                    docCardsAnimComplete
                      ? undefined
                      : {
                          opacity: docCardsEntered ? 1 : 0,
                          transform: docCardsEntered ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                          transition: `opacity 400ms ease-out ${idx * 60}ms, transform 400ms ease-out ${idx * 60}ms`,
                        }
                  }
                >
                  <div className="absolute top-1 right-1 z-50 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <div className="relative">
                      <button
                        type="button"
                        className="p-1 rounded-md text-gray-500 hover:text-brand-red hover:bg-red-50"
                        title="Document actions"
                        aria-haspopup="menu"
                        aria-expanded={docMenuOpenId === d.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          const btn = e.currentTarget as HTMLButtonElement;
                          if (docMenuOpenId === d.id) {
                            setDocMenuOpenId(null);
                            setDocMenuAnchor(null);
                          } else {
                            docMenuButtonRef.current = btn;
                            const rect = btn.getBoundingClientRect();
                            setDocMenuAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                            setDocMenuOpenId(d.id);
                          }
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                          />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => !uploading && void openBaseDocPreview(d.id, d.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!uploading) void openBaseDocPreview(d.id, d.name);
                      }
                    }}
                    className="flex flex-col items-stretch text-center cursor-pointer rounded-lg flex-1 min-h-0 gap-1.5 outline-none focus:outline-none active:outline-none"
                  >
                    <div className="w-full rounded-md overflow-hidden bg-white">
                      <BaseDocPageThumb docId={d.id} w={280} />
                    </div>
                    <div className="text-[11px] font-semibold text-gray-900 line-clamp-2 w-full leading-snug px-0.5 pt-0.5" title={d.name}>
                      {d.name}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {prefsDoc && (
        <OverlayPortal>
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
          onClick={() => setPrefsDoc(null)}
        >
          <div
            className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setPrefsDoc(null)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center flex-shrink-0"
                    title="Close"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">Document preferences</div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate" title={prefsDoc.name}>
                      {prefsDoc.name}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">Applied when a new user completes the profile onboarding steps.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-4 min-h-0">
              <div className="rounded-xl border border-gray-200 bg-white overflow-x-visible overflow-y-visible shadow-sm">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h4 className={PREFS_SECTION_TITLE}>Assignment</h4>
                </div>
                <div className="p-4 space-y-4 text-sm">
                  <div>
                    <label className={`block ${PREFS_SECTION_TITLE} mb-1`}>Send to</label>
                    <p className="text-xs text-gray-500 mb-3">
                      <strong>Employee</strong> = the new hire receives this document. <strong>Specific users</strong> = selected users each get
                      a copy to sign with context about the new hire. After signing, the PDF is always saved in the new hire&apos;s HR documents
                      folder (including when a specific user signs).
                    </p>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="pfAssignee"
                          checked={pfAssigneeType === 'employee'}
                          onChange={() => {
                            setPfAssigneeType('employee');
                            setPfAssigneeUserIds(new Set());
                          }}
                        />
                        Employee (new hire)
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" name="pfAssignee" checked={pfAssigneeType === 'user'} onChange={() => setPfAssigneeType('user')} />
                        Specific users
                      </label>
                    </div>
                    {pfAssigneeType === 'user' && (
                      <div className="mt-3 space-y-3 relative z-[1]">
                        <div>
                          <label className={`block ${PREFS_SECTION_TITLE} mb-1`}>Choose signers</label>
                          <p className="text-[11px] text-gray-500 mb-2">
                            Open the dropdown to search and select users. Selections appear below.
                          </p>
                          <ResendUserPicker
                            users={userPickerList}
                            selectedIds={pfAssigneeUserIds}
                            disabled={usersPickerLoading || userPickerList.length === 0}
                            onToggle={(id) => {
                              setPfAssigneeUserIds((prev) => {
                                const n = new Set(prev);
                                if (n.has(id)) n.delete(id);
                                else n.add(id);
                                return n;
                              });
                            }}
                            onAddIds={(ids) => {
                              setPfAssigneeUserIds((prev) => {
                                const n = new Set(prev);
                                ids.forEach((i) => n.add(i));
                                return n;
                              });
                            }}
                            onRemoveIds={(ids) => {
                              setPfAssigneeUserIds((prev) => {
                                const n = new Set(prev);
                                ids.forEach((i) => n.delete(i));
                                return n;
                              });
                            }}
                            onClearAll={clearAssigneeUsers}
                          />
                        </div>
                        <div>
                          <div className={`${PREFS_SECTION_TITLE} mb-1.5`}>Selected</div>
                          {pfAssigneeUserIds.size === 0 ? (
                            <p className="text-xs text-gray-500">No users selected yet.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from(pfAssigneeUserIds).map((id) => {
                                const u = userPickerList.find((x) => x.id === id);
                                const label = u ? userDisplayName(u) : `User ${id.slice(0, 8)}…`;
                                return (
                                  <span
                                    key={id}
                                    className="inline-flex items-center gap-0.5 max-w-full rounded-full border border-gray-200 bg-gray-50 pl-2.5 pr-1 py-0.5 text-[11px] text-gray-800"
                                  >
                                    <span className="truncate max-w-[14rem]" title={u?.email || label}>
                                      {label}
                                    </span>
                                    <button
                                      type="button"
                                      className="shrink-0 rounded-full p-0.5 leading-none text-gray-500 hover:bg-gray-200/80 hover:text-gray-900"
                                      aria-label={`Remove ${label}`}
                                      onClick={() => {
                                        setPfAssigneeUserIds((prev) => {
                                          const n = new Set(prev);
                                          n.delete(id);
                                          return n;
                                        });
                                      }}
                                    >
                                      ×
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500">
                          {userPickerList.length} user{userPickerList.length === 1 ? '' : 's'} in directory
                        </p>
                        {usersPickerLoading && <p className="text-xs text-gray-500">Loading users…</p>}
                        {!usersPickerLoading && userPickerList.length === 0 && (
                          <p className="text-xs text-amber-800">No users found.</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={pfRequired} onChange={(e) => setPfRequired(e.target.checked)} />
                      Required
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={pfEmployeeVisible} onChange={(e) => setPfEmployeeVisible(e.target.checked)} />
                        Active
                      </span>
                      <span className="text-[10px] text-gray-500 leading-snug pl-5">
                        Inactive documents are not assigned during onboarding.
                      </span>
                    </label>
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-b border-gray-200 bg-gray-50/50">
                  <h4 className={PREFS_SECTION_TITLE}>Signing & deadlines</h4>
                </div>
                <div className="p-4 space-y-4 text-sm">
                  <div>
                    <label className={`block ${PREFS_SECTION_TITLE} mb-1`}>Days to sign after available</label>
                    <input
                      type="number"
                      min={1}
                      className={inputFleet}
                      value={pfSigningDays}
                      onChange={(e) => setPfSigningDays(Math.max(1, +e.target.value || 7))}
                    />
                    <p className="text-xs text-gray-500 mt-1.5">
                      After this window with pending required documents, the app may block access until signing is completed.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 pt-1 border-t border-gray-100">
                    <input type="checkbox" checked={pfReqSig} onChange={(e) => setPfReqSig(e.target.checked)} />
                    Require e-signature (PDF)
                  </label>
                </div>

                <div className="px-4 py-3 border-t border-b border-gray-200 bg-gray-50/50">
                  <h4 className={PREFS_SECTION_TITLE}>Availability & notifications</h4>
                </div>
                <div className="p-4 space-y-4 text-sm">
                  <div>
                    <div className={`${PREFS_SECTION_TITLE} mb-2`}>Available for signature</div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input type="radio" name="pfDel" checked={pfDelivery === 'none'} onChange={() => setPfDelivery('none')} />
                        Manual only (use Resend)
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" name="pfDel" checked={pfDelivery === 'on_hire'} onChange={() => setPfDelivery('on_hire')} />
                        On hire date
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" name="pfDel" checked={pfDelivery === 'custom'} onChange={() => setPfDelivery('custom')} />
                        Custom relative to hire date
                      </label>
                    </div>
                    {pfDelivery === 'custom' && (
                      <div className="flex flex-wrap items-center gap-2 mt-3 pl-1">
                        <input
                          type="number"
                          min={1}
                          className={`${inputFleet} w-20`}
                          value={pfAmt}
                          onChange={(e) => setPfAmt(+e.target.value || 1)}
                        />
                        <select
                          className={`${inputFleet} w-auto min-w-[7rem]`}
                          value={pfUnit}
                          onChange={(e) => setPfUnit(e.target.value as 'days' | 'weeks' | 'months')}
                        >
                          <option value="days">Days</option>
                          <option value="weeks">Weeks</option>
                          <option value="months">Months</option>
                        </select>
                        <select
                          className={`${inputFleet} w-auto min-w-[6rem]`}
                          value={pfDir}
                          onChange={(e) => setPfDir(e.target.value as 'before' | 'after')}
                        >
                          <option value="after">after</option>
                          <option value="before">before</option>
                        </select>
                        <span className="text-gray-600 text-sm">hire date</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={`block ${PREFS_SECTION_TITLE} mb-1`}>When to notify</label>
                    <select className={inputFleet} value={pfNotifTiming} onChange={(e) => setPfNotifTiming(e.target.value)}>
                      {NOTIFICATION_PRESETS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-gray-200 bg-gray-50/50">
                  <h4 className={PREFS_SECTION_TITLE}>Display & messaging</h4>
                </div>
                <div className="p-4 space-y-4 text-sm">
                  <div>
                    <label className={`block ${PREFS_SECTION_TITLE} mb-1`}>Display name</label>
                    <input
                      className={inputFleet}
                      value={pfDisplayName}
                      onChange={(e) => setPfDisplayName(e.target.value)}
                      placeholder={prefsDoc.name}
                    />
                  </div>
                  <div>
                    <label className={`block ${PREFS_SECTION_TITLE} mb-1`}>Message (notifications)</label>
                    <textarea
                      className={`${inputFleet} min-h-[80px]`}
                      value={pfMessage}
                      onChange={(e) => setPfMessage(e.target.value)}
                      placeholder="Shown when notifications are enabled"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
              <button
                type="button"
                onClick={() => setPrefsDoc(null)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pfSaving}
                onClick={() => saveDocPreferences()}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pfSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
        </OverlayPortal>
      )}

      {tab === 'monitor' && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden min-w-0">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Assignments</div>
              <div className="text-xs text-gray-500 mt-0.5">Users with onboarding assignments</div>
            </div>
            <button
              type="button"
              onClick={() => setResendModalOpen(true)}
              className="shrink-0 px-3 py-2 text-xs font-medium text-white bg-brand-red rounded-lg hover:opacity-90"
            >
              Resend
            </button>
          </div>
          <div className="overflow-x-auto min-w-0">
            <table className="w-full min-w-0 border-collapse text-sm">
              <thead>
                <tr className="text-[10px] font-semibold text-gray-700 bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Package</th>
                  <th className="px-3 py-2 text-left">Pending</th>
                  <th className="px-3 py-2 text-left">Assigned</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-xs text-gray-500">
                      No assignments yet.
                    </td>
                  </tr>
                ) : (
                  assignments.map((a) => (
                    <tr key={a.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                      <td className="px-3 py-3 text-xs font-medium text-gray-900">{a.username}</td>
                      <td className="px-3 py-3 text-xs text-gray-600">{a.package_name}</td>
                      <td className="px-3 py-3 text-xs text-gray-600 tabular-nums">{a.items_pending}</td>
                      <td className="px-3 py-3 text-xs text-gray-500">{a.assigned_at?.slice(0, 10)}</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          disabled={Number(a.items_pending ?? 0) < 1}
                          onClick={async () => {
                            const result = await askConfirm({
                              title: 'Cancel pending documents',
                              message:
                                'Remove all documents that are waiting for signature (pending or scheduled) for this assignment? Signed documents are not affected.',
                              confirmText: 'Cancel pending',
                              cancelText: 'Back',
                            });
                            if (result !== 'confirm') return;
                            try {
                              const r = await api<{ cancelled: number; assignment_removed: boolean }>(
                                'POST',
                                `/onboarding/assignments/${a.id}/cancel-pending`,
                                {},
                              );
                              if (r.cancelled === 0) {
                                toast.error('Nothing to cancel');
                              } else {
                                toast.success(
                                  r.assignment_removed
                                    ? `Cancelled ${r.cancelled} item(s); assignment removed (no items left).`
                                    : `Cancelled ${r.cancelled} pending item(s).`,
                                );
                              }
                              void qc.invalidateQueries({ queryKey: ['onb-assignments'] });
                              void qc.invalidateQueries({ queryKey: ['me-onboarding-docs'] });
                              void qc.invalidateQueries({ queryKey: ['me-onboarding-status'] });
                              void qc.invalidateQueries({ queryKey: ['notifications-recent'] });
                              void qc.invalidateQueries({ queryKey: ['notifications-all'] });
                              void qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
                            } catch (e: unknown) {
                              toast.error(e instanceof Error ? e.message : 'Request failed');
                            }
                          }}
                          className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Cancel pending
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {resendModalOpen && (
        <OverlayPortal>
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setResendModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Resend document(s)</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Choose one or more base documents and users. Each document is sent to each selected user (multi-select,
                  search, select all on both lists).
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResendModalOpen(false)}
                className="text-lg font-bold text-gray-400 hover:text-gray-700 w-8 h-8 shrink-0 rounded-lg hover:bg-gray-100"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Base document(s)
                </label>
                <ResendDocPicker
                  docs={baseDocs}
                  selectedIds={resendDocIds}
                  disabled={baseDocs.length === 0}
                  onToggle={(id) => {
                    setResendDocIds((prev) => {
                      const n = new Set(prev);
                      if (n.has(id)) n.delete(id);
                      else n.add(id);
                      return n;
                    });
                  }}
                  onAddIds={(ids) => {
                    setResendDocIds((prev) => {
                      const n = new Set(prev);
                      ids.forEach((i) => n.add(i));
                      return n;
                    });
                  }}
                  onRemoveIds={(ids) => {
                    setResendDocIds((prev) => {
                      const n = new Set(prev);
                      ids.forEach((i) => n.delete(i));
                      return n;
                    });
                  }}
                  onClearAll={() => setResendDocIds(new Set())}
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Signing deadline for resend uses each base document&apos;s default (7 days), not the per-package setting.
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Users</label>
                <ResendUserPicker
                  users={userPickerList}
                  selectedIds={resendSelectedIds}
                  disabled={usersPickerLoading || userPickerList.length === 0}
                  onToggle={(id) => {
                    setResendSelectedIds((prev) => {
                      const n = new Set(prev);
                      if (n.has(id)) n.delete(id);
                      else n.add(id);
                      return n;
                    });
                  }}
                  onAddIds={(ids) => {
                    setResendSelectedIds((prev) => {
                      const n = new Set(prev);
                      ids.forEach((i) => n.add(i));
                      return n;
                    });
                  }}
                  onRemoveIds={(ids) => {
                    setResendSelectedIds((prev) => {
                      const n = new Set(prev);
                      ids.forEach((i) => n.delete(i));
                      return n;
                    });
                  }}
                  onClearAll={() => setResendSelectedIds(new Set())}
                />
                {usersPickerLoading && <p className="text-xs text-gray-500 mt-1.5">Loading users…</p>}
                {!usersPickerLoading && userPickerList.length === 0 && (
                  <p className="text-xs text-amber-800 mt-1.5">No users found.</p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                  onClick={() => setResendModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-2 text-xs font-medium text-white bg-brand-red rounded-lg hover:opacity-90"
                  onClick={async () => {
                    const userIds = Array.from(resendSelectedIds);
                    const docIds = Array.from(resendDocIds);
                    if (docIds.length === 0 || userIds.length === 0) {
                      toast.error('Select at least one document and one user');
                      return;
                    }
                    try {
                      let created = 0;
                      for (const docId of docIds) {
                        const r = await api<{ created: number }>('POST', `/onboarding/base-documents/${docId}/resend`, {
                          user_ids: userIds,
                        });
                        created += r.created;
                      }
                      toast.success(`Created ${created} pending item(s)`);
                      setResendSelectedIds(new Set());
                      setResendDocIds(new Set());
                      qc.invalidateQueries({ queryKey: ['onb-assignments'] });
                      qc.invalidateQueries({ queryKey: ['me-onboarding-docs'] });
                      qc.invalidateQueries({ queryKey: ['me-onboarding-status'] });
                      qc.invalidateQueries({ queryKey: ['notifications-recent'] });
                      qc.invalidateQueries({ queryKey: ['notifications-all'] });
                      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
                    } catch (e: any) {
                      toast.error(e?.message || 'Failed');
                    }
                  }}
                >
                  Resend
                </button>
              </div>
            </div>
          </div>
        </div>
        </OverlayPortal>
      )}

      {baseDocPreviewLoading && !baseDocPreview && (
        <OverlayPortal>
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[55] pointer-events-none">
          <div className="rounded-lg bg-white px-4 py-3 text-sm text-gray-700 shadow-lg">Loading PDF…</div>
        </div>
        </OverlayPortal>
      )}

      {baseDocPreview && (
        <OverlayPortal>
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[55] p-4"
          onClick={closeBaseDocPreview}
        >
          <div
            className="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold truncate pr-2">{baseDocPreview.name}</h3>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={baseDocPreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                  title="Open in new tab"
                >
                  🔗
                </a>
                <button
                  type="button"
                  onClick={closeBaseDocPreview}
                  className="text-lg font-bold text-gray-400 hover:text-gray-600 w-6 h-6"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              <iframe
                src={baseDocPreview.url}
                className="w-full h-full border-0 min-h-[70vh]"
                title={baseDocPreview.name}
              />
            </div>
          </div>
        </div>
        </OverlayPortal>
      )}

      {templateDoc && (
        <SignatureTemplateEditor
          docId={templateDoc.id}
          docName={templateDoc.name}
          initialTemplate={
            templateDoc.signature_template as Parameters<typeof SignatureTemplateEditor>[0]['initialTemplate']
          }
          onClose={() => setTemplateDoc(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ['onb-base-docs'] });
            toast.success('Signature template saved');
          }}
        />
      )}
    </div>
  );
}
