import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, getToken } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppFileUpload,
  AppFormModal,
  AppModal,
  AppSectionHeader,
  AppTooltip,
  uiCx,
  uiDropdown,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export type PdfSignatureLibraryDoc = {
  id: string;
  name: string;
  signature_template?: { version: number; fields: unknown[] } | null;
  /** Optional short badge under the name (e.g. Hiring / Additional). */
  badge?: string | null;
  /** Color tone for the badge. Defaults from badge text when omitted. */
  badgeVariant?: 'hiring' | 'additional' | 'neutral';
};

export type PdfSignatureCreateMeta = {
  package_role?: 'hiring_package' | 'additional';
};

export type PdfSignatureLibraryMenuItem<T extends PdfSignatureLibraryDoc = PdfSignatureLibraryDoc> = {
  label: string;
  onSelect: (doc: T) => void;
};

function displayNameFromPdfFile(file: File): string {
  const base = file.name.replace(/\.pdf$/i, '').trim();
  return base.replace(/[_]+/g, ' ').replace(/-/g, ' ').trim() || 'Document';
}

const MENU_VIEWPORT_PAD_PX = 8;
const MENU_GAP_PX = 4;
const MENU_MIN_WIDTH_PX = 208; // min-w-[13rem]

function clampMenuPosition(anchor: DOMRect, menuWidth = MENU_MIN_WIDTH_PX, menuHeight = 0): { top: number; left: number } {
  const maxLeft = Math.max(MENU_VIEWPORT_PAD_PX, window.innerWidth - menuWidth - MENU_VIEWPORT_PAD_PX);
  let left = anchor.right - menuWidth;
  if (left < MENU_VIEWPORT_PAD_PX) left = MENU_VIEWPORT_PAD_PX;
  left = Math.min(left, maxLeft);

  let top = anchor.bottom + MENU_GAP_PX;
  if (menuHeight > 0 && top + menuHeight > window.innerHeight - MENU_VIEWPORT_PAD_PX) {
    top = Math.max(MENU_VIEWPORT_PAD_PX, anchor.top - menuHeight - MENU_GAP_PX);
  }
  return { top, left };
}

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

function PageThumb({ url, w = 260 }: { url: string; w?: number }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading');
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const t = getToken();
        const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}w=${w}`, {
          headers: { Authorization: `Bearer ${t || ''}` },
        });
        if (cancelled) return;
        if (!r.ok) {
          setState('err');
          return;
        }
        const blob = await r.blob();
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setState('ok');
      } catch {
        if (!cancelled) setState('err');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, w]);
  if (state === 'loading') {
    return (
      <div className="w-full h-full min-h-[6rem] flex items-center justify-center bg-gray-100 rounded-md">
        <div className="h-8 w-16 bg-gray-200/80 rounded animate-pulse" />
      </div>
    );
  }
  if (state === 'err' || !blobUrl) {
    return (
      <div className="w-full h-full min-h-[6rem] flex items-center justify-center bg-gray-50 rounded-md">
        <PdfFileBadge className="w-7 h-10 text-[9px]" />
      </div>
    );
  }
  return (
    <img
      src={blobUrl}
      alt=""
      className="w-full h-full min-h-[6rem] max-h-[7.5rem] object-contain object-top bg-white"
      draggable={false}
    />
  );
}

type Props<T extends PdfSignatureLibraryDoc> = {
  documents: T[];
  fileCategoryId: string;
  thumbnailUrl: (docId: string) => string;
  previewUrl: (docId: string) => string;
  onCreate: (name: string, fileId: string, meta?: PdfSignatureCreateMeta) => Promise<void>;
  onDelete: (doc: T) => Promise<void>;
  onEditTemplate: (doc: T) => void;
  extraMenuItems?: PdfSignatureLibraryMenuItem<T>[];
  readOnly?: boolean;
  sectionTitle?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  deleteConfirmMessage?: (doc: T) => string;
  /** When true, ask Hiring vs Additional for each PDF before creating the document. */
  promptPackageRoleOnCreate?: boolean;
};

export default function PdfSignatureDocumentLibrary<T extends PdfSignatureLibraryDoc>({
  documents,
  fileCategoryId,
  thumbnailUrl,
  previewUrl,
  onCreate,
  onDelete,
  onEditTemplate,
  extraMenuItems,
  readOnly = false,
  sectionTitle = 'Documents (PDF)',
  emptyTitle = 'No documents yet.',
  emptyDescription = 'Upload PDFs above.',
  deleteConfirmMessage,
  promptPackageRoleOnCreate = false,
}: Props<T>) {
  const askConfirm = useConfirm();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingRole, setPendingRole] = useState<'hiring_package' | 'additional'>('hiring_package');
  const [pendingIndex, setPendingIndex] = useState(0);
  const [pendingCreated, setPendingCreated] = useState(0);

  const closePreview = () => {
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
    setPreviewLoading(false);
  };

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!menuOpenId) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuButtonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setMenuOpenId(null);
      setMenuAnchor(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpenId(null);
        setMenuAnchor(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpenId]);

  useLayoutEffect(() => {
    if (!menuOpenId || !menuRef.current || !menuButtonRef.current) return;
    const btn = menuButtonRef.current.getBoundingClientRect();
    const menu = menuRef.current;
    const next = clampMenuPosition(btn, menu.offsetWidth, menu.offsetHeight);
    setMenuAnchor((prev) => (prev && prev.top === next.top && prev.left === next.left ? prev : next));
  }, [menuOpenId]);

  const uploadOnePdf = async (
    file: File,
    docName: string,
    meta?: PdfSignatureCreateMeta,
  ) => {
    const type = file.type || 'application/pdf';
    const up = await api<{ upload_url: string; key: string }>('POST', '/files/upload', {
      original_name: file.name,
      content_type: type,
      employee_id: null,
      project_id: null,
      client_id: null,
      category_id: fileCategoryId,
    });
    await fetch(up.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': type, 'x-ms-blob-type': 'BlockBlob' },
      body: file,
    });
    const conf = await api<{ id: string }>('POST', '/files/confirm', {
      key: up.key,
      size_bytes: file.size,
      checksum_sha256: 'na',
      content_type: type,
    });
    await onCreate(docName, conf.id, meta);
  };

  const finishPendingQueue = (created: number) => {
    setPendingFiles([]);
    setPendingIndex(0);
    setPendingCreated(0);
    setPendingRole('hiring_package');
    setUploading(false);
    if (created > 0) toast.success(`${created} document(s) added`);
  };

  const advancePending = (createdSoFar: number) => {
    const next = pendingIndex + 1;
    if (next >= pendingFiles.length) {
      finishPendingQueue(createdSoFar);
      return;
    }
    setPendingIndex(next);
    setPendingRole('hiring_package');
    setPendingCreated(createdSoFar);
  };

  const confirmPendingRole = async () => {
    const file = pendingFiles[pendingIndex];
    if (!file || uploading) return;
    setUploading(true);
    try {
      await uploadOnePdf(file, displayNameFromPdfFile(file), { package_role: pendingRole });
      advancePending(pendingCreated + 1);
    } catch (e: unknown) {
      toast.error(`${file.name}: ${e instanceof Error ? e.message : 'failed'}`);
      advancePending(pendingCreated);
    } finally {
      setUploading(false);
    }
  };

  const skipPendingFile = () => {
    if (uploading) return;
    advancePending(pendingCreated);
  };

  const cancelPendingQueue = () => {
    if (uploading) return;
    const created = pendingCreated;
    finishPendingQueue(created);
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
          : `Only PDF files are accepted — "${rejected[0]?.name || 'file'}" is not a PDF.`,
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

    if (promptPackageRoleOnCreate) {
      setPendingFiles(pdfs);
      setPendingIndex(0);
      setPendingCreated(0);
      setPendingRole('hiring_package');
      return;
    }

    setUploading(true);
    let ok = 0;
    for (const file of pdfs) {
      try {
        await uploadOnePdf(file, displayNameFromPdfFile(file));
        ok++;
      } catch (e: unknown) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : 'failed'}`);
      }
    }
    setUploading(false);
    if (ok > 0) toast.success(`${ok} document(s) added`);
  };

  const pendingFile = pendingFiles[pendingIndex] ?? null;
  const pendingOpen = Boolean(pendingFile);

  const openPreview = async (docId: string, name: string) => {
    previewAbortRef.current?.abort();
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
    const ac = new AbortController();
    previewAbortRef.current = ac;
    const t = getToken();
    setPreviewLoading(true);
    try {
      const r = await fetch(previewUrl(docId), {
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
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreview({ url, name });
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      toast.error(e instanceof Error ? e.message : 'Could not open PDF');
    } finally {
      if (!ac.signal.aborted) setPreviewLoading(false);
    }
  };

  const menuDoc = !readOnly && menuOpenId ? documents.find((x) => x.id === menuOpenId) : null;

  return (
    <>
      <AppFormModal
        open={pendingOpen}
        onClose={() => {
          if (!uploading) cancelPendingQueue();
        }}
        title="Choose package role"
        description={
          pendingFile ? (
            <>
              <span className="block truncate font-medium text-gray-900" title={pendingFile.name}>
                {displayNameFromPdfFile(pendingFile)}
              </span>
              <span className="block">
                File {pendingIndex + 1} of {pendingFiles.length}. Choose where this document belongs before
                uploading.
              </span>
            </>
          ) : null
        }
        size="md"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-between')}>
            <AppButton type="button" variant="secondary" size="sm" disabled={uploading} onClick={cancelPendingQueue}>
              Cancel remaining
            </AppButton>
            <div className={uiCx(uiLayout.actionsRow)}>
              <AppButton type="button" variant="secondary" size="sm" disabled={uploading} onClick={skipPendingFile}>
                Skip
              </AppButton>
              <AppButton
                type="button"
                size="sm"
                loading={uploading}
                disabled={uploading}
                onClick={() => void confirmPendingRole()}
              >
                Add document
              </AppButton>
            </div>
          </div>
        }
      >
        <fieldset className={uiSpacing.sectionStack}>
          <legend className="sr-only">Package role</legend>
          <label className={uiCx('flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-3', pendingRole === 'hiring_package' && 'border-brand-red bg-red-50/50')}>
            <input
              type="radio"
              name="pending-package-role"
              className="mt-1 text-brand-red focus:ring-brand-red"
              checked={pendingRole === 'hiring_package'}
              disabled={uploading}
              onChange={() => setPendingRole('hiring_package')}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Hiring package</span>
              <span className={uiTypography.helper}>Included in the default invite onboarding package.</span>
            </span>
          </label>
          <label className={uiCx('flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-3', pendingRole === 'additional' && 'border-brand-red bg-red-50/50')}>
            <input
              type="radio"
              name="pending-package-role"
              className="mt-1 text-brand-red focus:ring-brand-red"
              checked={pendingRole === 'additional'}
              disabled={uploading}
              onChange={() => setPendingRole('additional')}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Additional documents</span>
              <span className={uiTypography.helper}>Optional extras selected on invite Step 2.</span>
            </span>
          </label>
        </fieldset>
      </AppFormModal>

      {menuDoc &&
        menuAnchor &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className={uiCx(uiDropdown.menu, 'min-w-[13rem] py-1 z-[9999]')}
            style={{ top: menuAnchor.top, left: menuAnchor.left }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            {(extraMenuItems || []).map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={uiDropdown.option}
                onClick={() => {
                  setMenuOpenId(null);
                  setMenuAnchor(null);
                  item.onSelect(menuDoc);
                }}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              className={uiDropdown.option}
              onClick={() => {
                setMenuOpenId(null);
                setMenuAnchor(null);
                onEditTemplate(menuDoc);
              }}
            >
              Edit Signature Template
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button
              type="button"
              role="menuitem"
              className={uiCx(uiDropdown.option, 'text-red-600 hover:bg-red-50')}
              onClick={async () => {
                setMenuOpenId(null);
                setMenuAnchor(null);
                const result = await askConfirm({
                  title: 'Delete document',
                  message: deleteConfirmMessage
                    ? deleteConfirmMessage(menuDoc)
                    : `Delete "${menuDoc.name}"?`,
                  confirmText: 'Delete',
                  cancelText: 'Cancel',
                });
                if (result !== 'confirm') return;
                try {
                  await onDelete(menuDoc);
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : 'Delete failed');
                }
              }}
            >
              Delete
            </button>
          </div>,
          document.body,
        )}

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <AppSectionHeader title={sectionTitle} />
        <div className="mt-4">
          <AppFileUpload
            mode="multiple"
            accept=".pdf,application/pdf"
            label=""
            value={[]}
            onChange={() => undefined}
            disabled={uploading || readOnly || pendingOpen}
            onFilesSelected={(files) => processPdfFiles(files)}
            helperText={
              readOnly
                ? 'View only.'
                : pendingOpen
                  ? 'Finish choosing package role for the selected file(s)…'
                  : uploading
                    ? 'Uploading…'
                    : 'Drag-and-drop your document here or choose files from your computer.'
            }
          />
        </div>
      </AppCard>

      {documents.length === 0 ? (
        <AppEmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-10">
          {documents.map((d) => (
            <div
              key={d.id}
              className={uiCx(
                'group relative flex min-h-[132px] min-w-0 flex-col px-2 py-4 pt-3 transition-all duration-200 ease-out hover:-translate-y-0.5',
                uiRadius.card,
                'border border-gray-200 bg-white hover:border-gray-300',
              )}
            >
              {!readOnly ? (
                <div className="absolute right-1 top-1 z-50 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <AppTooltip content="Document actions">
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto min-h-0 p-1"
                      aria-haspopup="menu"
                      aria-expanded={menuOpenId === d.id}
                      aria-label="Document actions"
                      onClick={(e) => {
                        e.stopPropagation();
                        const btn = e.currentTarget as HTMLButtonElement;
                        if (menuOpenId === d.id) {
                          setMenuOpenId(null);
                          setMenuAnchor(null);
                        } else {
                          menuButtonRef.current = btn;
                          const rect = btn.getBoundingClientRect();
                          setMenuAnchor(clampMenuPosition(rect));
                          setMenuOpenId(d.id);
                        }
                      }}
                    >
                      <Settings className="h-3.5 w-3.5" aria-hidden />
                    </AppButton>
                  </AppTooltip>
                </div>
              ) : null}
              <div
                role="button"
                tabIndex={0}
                onClick={() => !uploading && void openPreview(d.id, d.name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!uploading) void openPreview(d.id, d.name);
                  }
                }}
                className="flex min-h-0 flex-1 cursor-pointer flex-col items-stretch gap-1.5 rounded-lg text-center outline-none"
              >
                <div className={uiCx('w-full overflow-hidden bg-white', uiRadius.control)}>
                  <PageThumb url={thumbnailUrl(d.id)} w={280} />
                </div>
                <div className={uiCx(uiTypography.controlLabel, 'line-clamp-2 w-full px-0.5 pt-0.5 font-semibold text-gray-900')}>
                  {d.name}
                </div>
                {d.badge ? (
                  <span
                    className={uiCx(
                      'mx-auto mt-0.5 inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                      (() => {
                        const variant =
                          d.badgeVariant ||
                          (d.badge.toLowerCase() === 'additional'
                            ? 'additional'
                            : d.badge.toLowerCase() === 'hiring'
                              ? 'hiring'
                              : 'neutral');
                        if (variant === 'hiring') return 'bg-red-100 text-red-800 ring-1 ring-inset ring-red-200/80';
                        if (variant === 'additional') return 'bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200/80';
                        return 'bg-gray-100 text-gray-600';
                      })(),
                    )}
                  >
                    {d.badge}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <AppModal
        open={previewLoading && !preview}
        onClose={() => undefined}
        title="Loading PDF…"
        size="sm"
        overlayClassName="pointer-events-none"
      >
        <p className={uiTypography.body}>Please wait while the document loads.</p>
      </AppModal>

      <AppModal
        open={!!preview}
        onClose={closePreview}
        title={preview?.name}
        size="lg"
        dialogClassName="!max-w-[95vw] !h-[95vh]"
        bodyClassName="!p-0 flex min-h-0 flex-1 flex-col"
        bodyFill
        headerActions={
          preview ? (
            <AppTooltip content="Open in new tab">
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label="Open in new tab"
                onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="h-4 w-4" />
              </AppButton>
            </AppTooltip>
          ) : null
        }
      >
        {preview ? (
          <iframe src={preview.url} className="min-h-[70vh] w-full flex-1 border-0" title={preview.name} />
        ) : null}
      </AppModal>
    </>
  );
}
