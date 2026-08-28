import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { buildDocumentCreatePayload } from '@/lib/documentCreateScope';
import { ChooseDocumentTypeModal, type DocumentCreationSelection } from '@/components/ChooseDocumentTypeModal';
import { DocumentPagePreviewThumbnails } from '@/components/DocumentPagePreviewThumbnails';
import DocumentEditor, { type DocumentEditorHandle } from '@/components/DocumentEditor';
import { ExpandIcon, CompressIcon } from '@/components/document-editor/documentEditorIcons';
import { getOverlayRoot } from '@/lib/overlayRoot';
import type { DocumentPage } from '@/types/documentCreator';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppListRowIconButton,
  AppSectionHeader,
  appSectionPresetProps,
  uiBorders,
  uiColors,
  uiCx,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type Template = { id: string; name?: string; background_file_id?: string };

type BuilderDocument = {
  id: string;
  title: string;
  subject_user_id?: string | null;
  page_count?: number;
  pages?: DocumentPage[] | unknown[];
  created_at?: string;
  updated_at?: string | null;
};

function formatDate(s: string | undefined | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString(undefined, { dateStyle: 'short' });
  } catch {
    return '—';
  }
}

const INLINE_EDITOR_MIN_HEIGHT_PX = 560;
const INLINE_EDITOR_MAIN_PADDING_RECLAIM_PX = 88;

function findAppMainScrollParent(el: HTMLElement | null): HTMLElement | null {
  const main = el?.closest('main');
  if (!main) return null;
  return main.querySelector<HTMLElement>(':scope > div.overflow-auto');
}

function measureInlineEditorMaxHeightPx(el: HTMLElement | null): number {
  const scrollParent = findAppMainScrollParent(el);
  if (scrollParent) {
    const scrollRect = scrollParent.getBoundingClientRect();
    const fromScrollport = scrollParent.clientHeight + INLINE_EDITOR_MAIN_PADDING_RECLAIM_PX;
    const fromViewport = window.innerHeight - scrollRect.top;
    return Math.max(
      INLINE_EDITOR_MIN_HEIGHT_PX,
      Math.floor(Math.max(fromScrollport, fromViewport)),
    );
  }
  return Math.max(INLINE_EDITOR_MIN_HEIGHT_PX, Math.floor(window.innerHeight - 56));
}

function useInlineDocumentEditorHeight(enabled: boolean) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [heightPx, setHeightPx] = useState(INLINE_EDITOR_MIN_HEIGHT_PX);

  const measure = useCallback(() => {
    setHeightPx(measureInlineEditorMaxHeightPx(shellRef.current));
  }, []);

  useLayoutEffect(() => {
    if (!enabled) return;

    measure();
    const scrollParent = findAppMainScrollParent(shellRef.current);

    window.addEventListener('resize', measure);

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (scrollParent) ro?.observe(scrollParent);

    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [enabled, measure]);

  return { shellRef, heightPx };
}

type UserDocumentBuilderTabProps = {
  userId: string;
  canEdit?: boolean;
};

export default function UserDocumentBuilderTab({ userId, canEdit = true }: UserDocumentBuilderTabProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const documentEditorRef = useRef<DocumentEditorHandle>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalDocumentId, setModalDocumentId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showChooseTypeModal, setShowChooseTypeModal] = useState(false);
  const [promptRenameOnOpen, setPromptRenameOnOpen] = useState(false);

  const listQueryKey = ['document-creator-documents', 'subject', userId] as const;

  const docFromUrl = searchParams.get('doc');
  const renameFromUrl = searchParams.get('rename');
  useEffect(() => {
    if (!docFromUrl) return;
    setModalDocumentId(docFromUrl);
    setShowModal(true);
    if (renameFromUrl === '1') setPromptRenameOnOpen(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('doc');
        next.delete('rename');
        return next;
      },
      { replace: true },
    );
  }, [docFromUrl, renameFromUrl, setSearchParams]);

  const inlineEditorOpen = !!(showModal && modalDocumentId && !isExpanded);
  const { shellRef: inlineEditorShellRef, heightPx: inlineEditorHeightPx } =
    useInlineDocumentEditorHeight(inlineEditorOpen);

  const portalHostRef = useRef<HTMLDivElement | null>(null);
  if (portalHostRef.current === null && typeof document !== 'undefined') {
    portalHostRef.current = document.createElement('div');
  }
  const inlineAnchorRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const host = portalHostRef.current;
    if (!host || !(showModal && modalDocumentId)) return;
    const target = isExpanded ? getOverlayRoot() : inlineAnchorRef.current;
    if (target && host.parentNode !== target) {
      target.appendChild(host);
    }
    return () => {
      host.parentNode?.removeChild(host);
    };
  }, [isExpanded, showModal, modalDocumentId]);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      api<BuilderDocument[]>(
        'GET',
        `/document-creator/documents?subject_user_id=${encodeURIComponent(userId)}`,
      ),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<Template[]>('GET', '/document-creator/templates'),
  });

  const handleCreateNew = async (selection: DocumentCreationSelection) => {
    setIsCreating(true);
    try {
      const payload = buildDocumentCreatePayload(selection, { kind: 'user', userId });
      const created = await api<BuilderDocument>('POST', '/document-creator/documents', payload);
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      setModalDocumentId(created.id);
      setPromptRenameOnOpen(true);
      setShowModal(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create document.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleExportPdf = async (doc: BuilderDocument) => {
    setExportingId(doc.id);
    try {
      const token = getToken();
      const r = await fetch(`/document-creator/documents/${doc.id}/export-pdf`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error(r.statusText || 'Export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.title || 'document'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to export PDF.');
    } finally {
      setExportingId(null);
    }
  };

  const prefetchDocument = useCallback(
    (docId: string) => {
      void queryClient.prefetchQuery({
        queryKey: ['document-creator-doc', docId],
        queryFn: () => api<BuilderDocument>('GET', `/document-creator/documents/${docId}`),
        staleTime: 30_000,
      });
    },
    [queryClient],
  );

  const handleEdit = (doc: BuilderDocument) => {
    prefetchDocument(doc.id);
    setModalDocumentId(doc.id);
    setShowModal(true);
  };

  const handleDelete = async (doc: BuilderDocument) => {
    const ok = await confirm({
      title: 'Delete document',
      message: `Delete "${doc.title || 'Untitled document'}"? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (ok !== 'confirm') return;
    try {
      await api('DELETE', `/document-creator/documents/${doc.id}`);
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      toast.success('Document deleted.');
      if (modalDocumentId === doc.id) {
        setShowModal(false);
        setModalDocumentId(null);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete document.');
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setPromptRenameOnOpen(false);
    setModalDocumentId(null);
    setIsExpanded(false);
    queryClient.invalidateQueries({ queryKey: listQueryKey });
  };

  const createDocumentAction = canEdit ? (
    <AppButton
      type="button"
      size="sm"
      onClick={() => setShowChooseTypeModal(true)}
      disabled={isCreating}
      loading={isCreating}
    >
      Create new document
    </AppButton>
  ) : null;

  const renderDocumentRow = (doc: BuilderDocument) => (
    <li
      key={doc.id}
      className={uiCx(
        uiRadius.card,
        uiBorders.subtle,
        uiColors.surface,
        'flex flex-wrap items-center gap-3 p-3 transition-colors hover:border-gray-300',
      )}
      onMouseEnter={() => prefetchDocument(doc.id)}
      onFocusCapture={() => prefetchDocument(doc.id)}
    >
      <button
        type="button"
        onClick={() => handleEdit(doc)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 focus-visible:ring-offset-1"
      >
        <DocumentPagePreviewThumbnails
          pages={(Array.isArray(doc.pages) ? doc.pages : []) as DocumentPage[]}
          templates={templates}
          maxPages={4}
        />
        <div className="min-w-0 flex-1">
          <div className={uiCx(uiTypography.sectionTitle, 'truncate')}>
            {doc.title || 'Untitled document'}
          </div>
          <div className={uiTypography.helper}>Updated {formatDate(doc.updated_at ?? doc.created_at)}</div>
        </div>
      </button>
      <div className="flex flex-shrink-0 items-center gap-2">
        <AppButton type="button" variant="secondary" size="sm" onClick={() => handleEdit(doc)}>
          {canEdit ? 'Edit' : 'View'}
        </AppButton>
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => handleExportPdf(doc)}
          disabled={exportingId === doc.id}
          loading={exportingId === doc.id}
        >
          {exportingId === doc.id ? 'Exporting...' : 'Export PDF'}
        </AppButton>
        {canEdit ? (
          <AppListRowIconButton preset="delete" label="Delete" onClick={() => handleDelete(doc)} />
        ) : null}
      </div>
    </li>
  );

  const documentsBody = isLoading ? (
    <p className={uiCx(uiTypography.helper, 'py-6')}>Loading...</p>
  ) : documents.length === 0 ? (
    <AppEmptyState
      className="border-0 shadow-none"
      title="No documents yet."
      description="Create a document for this employee — autofill uses their profile."
      action={createDocumentAction ?? undefined}
    />
  ) : (
    <ul className={uiSpacing.sectionStack}>{documents.map(renderDocumentRow)}</ul>
  );

  const chooseTypeModal = (
    <ChooseDocumentTypeModal
      open={showChooseTypeModal}
      onClose={() => setShowChooseTypeModal(false)}
      designSystem
      subjectUserId={userId}
      onSelect={(selection) => {
        setShowChooseTypeModal(false);
        void handleCreateNew(selection);
      }}
    />
  );

  if (showModal && modalDocumentId) {
    const expandButton = (
      <AppButton
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(true)}
        title="Expand to full screen"
        className="!px-2"
      >
        <ExpandIcon className="h-5 w-5" />
      </AppButton>
    );

    const compressButton = (
      <AppButton
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(false)}
        title="Exit full screen"
        className="!px-2"
      >
        <CompressIcon className="h-5 w-5" />
      </AppButton>
    );

    const inlineEditorShellClass = uiCx(
      '!rounded-2xl',
      uiBorders.subtle,
      uiColors.surface,
      'z-0 flex min-h-0 flex-col overflow-hidden overscroll-contain',
    );
    const expandedShellClass = 'fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-white';

    const editorShell = (
      <div
        ref={inlineEditorShellRef}
        className={isExpanded ? expandedShellClass : inlineEditorShellClass}
        style={isExpanded ? undefined : { height: inlineEditorHeightPx }}
      >
        <DocumentEditor
          ref={documentEditorRef}
          documentId={modalDocumentId}
          subjectUserId={userId}
          onClose={handleCloseModal}
          readOnly={!canEdit}
          promptRenameOnOpen={promptRenameOnOpen}
          closeSlotBelow={isExpanded ? compressButton : expandButton}
          stickyToolbar={!isExpanded}
          enableSendForSignature={canEdit}
        />
      </div>
    );
    return (
      <>
        <div ref={inlineAnchorRef} className="w-full" />
        {portalHostRef.current ? createPortal(editorShell, portalHostRef.current) : null}
        {chooseTypeModal}
      </>
    );
  }

  return (
    <>
      <AppCard className="!rounded-2xl" bodyClassName={uiSpacing.cardPadding}>
        <AppSectionHeader
          title="Document Builder"
          description="Create and edit documents for this employee. Profile fields autofill employee tokens; changes auto-save while you edit."
          {...appSectionPresetProps('documents')}
          action={createDocumentAction}
        />
        <div className="mt-4">{documentsBody}</div>
      </AppCard>
      {chooseTypeModal}
    </>
  );
}
