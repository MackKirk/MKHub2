import { useEffect, useRef, useState } from 'react';
import { Eye, MoreHorizontal } from 'lucide-react';
import { DocumentPagePreviewThumbnails } from '@/components/DocumentPagePreviewThumbnails';
import type { DocumentPage } from '@/types/documentCreator';
import {
  AppBadge,
  uiBorders,
  uiColors,
  uiCx,
  uiDropdown,
  uiRadius,
  uiTypography,
} from '@/components/ui';
import {
  scopeMetaLabel,
  signatureBadgeVariant,
  updatedByLine,
  type DocumentHubSummary,
} from '@/lib/documentHubListUtils';

type Template = { id: string; name?: string; background_file_id?: string };

type DocumentBuilderHubRowProps = {
  doc: DocumentHubSummary;
  templates: Template[];
  canEditHub: boolean;
  exporting?: boolean;
  onPrefetch: (docId: string) => void;
  onPreview: (doc: DocumentHubSummary) => void;
  onEdit: (doc: DocumentHubSummary) => void;
  onRename: (doc: DocumentHubSummary) => void;
  onExport: (doc: DocumentHubSummary) => void;
  onDelete: (doc: DocumentHubSummary) => void;
};

export default function DocumentBuilderHubRow({
  doc,
  templates,
  canEditHub,
  exporting = false,
  onPrefetch,
  onPreview,
  onEdit,
  onRename,
  onExport,
  onDelete,
}: DocumentBuilderHubRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const canEdit = canEditHub && (doc.can_edit ?? true);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const badgeLabel = doc.signature_label || 'DRAFT';

  const iconActionClass =
    'rounded p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 focus-visible:ring-offset-1 disabled:opacity-50';

  return (
    <li
      className={uiCx(
        uiRadius.card,
        uiBorders.subtle,
        uiColors.surface,
        'flex flex-wrap items-center gap-3 p-4 transition-colors hover:border-gray-300',
      )}
      onMouseEnter={() => onPrefetch(doc.id)}
      onFocusCapture={() => onPrefetch(doc.id)}
    >
      <button
        type="button"
        onClick={() => onEdit(doc)}
        className="flex min-w-0 flex-1 items-center gap-4 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 focus-visible:ring-offset-1"
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
          <div className={uiCx(uiTypography.helper, 'truncate')}>{scopeMetaLabel(doc)}</div>
          <div className={uiCx(uiTypography.helper, 'truncate text-gray-400')}>{updatedByLine(doc)}</div>
        </div>
      </button>

      <div className="flex shrink-0 flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <AppBadge variant={signatureBadgeVariant(doc.signature_status)}>{badgeLabel}</AppBadge>

        <button
          type="button"
          className={iconActionClass}
          aria-label="Preview"
          onClick={() => onPreview(doc)}
        >
          <Eye className="h-5 w-5" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className={iconActionClass}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            aria-label="More options"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreHorizontal className="h-6 w-6" strokeWidth={2.25} />
          </button>
          {menuOpen ? (
            <div
              className={uiCx(uiDropdown.menu, 'absolute right-0 top-full z-20 mt-1 min-w-[11rem] py-1')}
              role="menu"
            >
              {canEdit ? (
                <button
                  type="button"
                  role="menuitem"
                  className={uiDropdown.option}
                  onClick={() => {
                    setMenuOpen(false);
                    onRename(doc);
                  }}
                >
                  Rename
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className={uiDropdown.option}
                disabled={exporting}
                onClick={() => {
                  setMenuOpen(false);
                  onExport(doc);
                }}
              >
                {exporting ? 'Exporting…' : 'Export PDF'}
              </button>
              {canEdit ? (
                <button
                  type="button"
                  role="menuitem"
                  className={uiCx(uiDropdown.option, 'text-red-700 hover:bg-red-50')}
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(doc);
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
