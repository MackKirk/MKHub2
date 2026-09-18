import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { GRID_CARD_CLASS, GRID_CLASS, PICKER_BODY_HEIGHT_CLASS } from '@/components/DocumentTypePicker';
import { InvitePickerPdfThumb, InvitePickerPreviewFrame } from '@/components/InvitePickerThumbs';
import {
  AppButton,
  AppFormModal,
  AppInput,
  uiCx,
  uiLayout,
  uiTypography,
} from '@/components/ui';
import toast from 'react-hot-toast';

export type OnboardingPackageDoc = {
  id: string;
  name: string;
  display_name?: string | null;
  employee_visible?: boolean;
  package_role?: string | null;
  sort_order?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  documents: OnboardingPackageDoc[];
  isLoading?: boolean;
  /** When already customized, seed with these ids; otherwise seed with all. */
  customized: boolean;
  selectedIds: string[];
  onApply: (ids: string[]) => void;
  disabled?: boolean;
};

function docLabel(d: OnboardingPackageDoc) {
  return ((d.display_name || '').trim() || d.name).trim() || 'Untitled';
}

export default function InviteOnboardingPackagePicker({
  open,
  onClose,
  documents,
  isLoading = false,
  customized,
  selectedIds,
  onApply,
  disabled,
}: Props) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const hiringDocs = useMemo(
    () =>
      documents
        .filter(
          (d) =>
            d.employee_visible !== false &&
            (d.package_role || 'hiring_package').trim().toLowerCase() !== 'additional',
        )
        .sort((a, b) => {
          const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
          if (orderDiff !== 0) return orderDiff;
          return docLabel(a).toLowerCase().localeCompare(docLabel(b).toLowerCase());
        }),
    [documents],
  );

  useEffect(() => {
    if (!open) return;
    setSearchQuery('');
    if (customized && selectedIds.length > 0) {
      const valid = new Set(hiringDocs.map((d) => d.id));
      setDraft(new Set(selectedIds.filter((id) => valid.has(id))));
    } else {
      setDraft(new Set(hiringDocs.map((d) => d.id)));
    }
  }, [open, customized, selectedIds, hiringDocs]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return hiringDocs;
    return hiringDocs.filter((d) => docLabel(d).toLowerCase().includes(q));
  }, [hiringDocs, searchQuery]);

  const toggle = (id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const markAll = () => setDraft(new Set(hiringDocs.map((d) => d.id)));
  const unmarkAll = () => setDraft(new Set());

  const handleApply = () => {
    if (draft.size === 0) {
      toast.error('Select at least one document, or turn off Include onboarding package.');
      return;
    }
    const ids = hiringDocs.filter((d) => draft.has(d.id)).map((d) => d.id);
    onApply(ids);
    onClose();
  };

  const n = draft.size;
  const applyLabel = n === 0 ? 'Apply' : n === 1 ? 'Apply (1)' : `Apply (${n})`;
  const allMarked = hiringDocs.length > 0 && n === hiringDocs.length;
  const noneMarked = n === 0;

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="Customize onboarding package"
      description="Choose which hiring package documents to assign. Apply replaces the default full package with your selection."
      formWidth="wide"
      dialogClassName="!w-[min(100%,44rem)] !max-w-[min(100%,44rem)]"
      scrollBody={false}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-between')}>
          <div className={uiCx(uiLayout.actionsRow)}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled || allMarked || hiringDocs.length === 0}
              onClick={markAll}
            >
              Mark all
            </AppButton>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled || noneMarked}
              onClick={unmarkAll}
            >
              Unmark all
            </AppButton>
          </div>
          <div className={uiCx(uiLayout.actionsRow)}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" disabled={disabled} onClick={handleApply}>
              {applyLabel}
            </AppButton>
          </div>
        </div>
      }
    >
      <div className={uiCx(PICKER_BODY_HEIGHT_CLASS, 'flex flex-col gap-3')}>
        <div className="shrink-0">
          <AppInput
            label="Search"
            placeholder="Search package documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            aria-label="Search package documents"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
          {isLoading ? (
            <p className={uiCx(uiTypography.helper, 'py-8 text-center')}>Loading…</p>
          ) : filtered.length === 0 ? (
            <p className={uiCx(uiTypography.helper, 'py-8 text-center')}>
              {hiringDocs.length === 0
                ? 'No hiring package documents available.'
                : 'No documents match this search.'}
            </p>
          ) : (
            <div className={GRID_CLASS}>
              {filtered.map((d) => {
                const selected = draft.has(d.id);
                const name = docLabel(d);
                const checkbox = (
                  <span
                    className={uiCx(
                      'absolute top-2 right-2 z-10 flex h-5 w-5 items-center justify-center rounded border',
                      selected
                        ? 'border-brand-red bg-brand-red text-white'
                        : 'border-gray-300 bg-white text-transparent',
                    )}
                    aria-hidden
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                );
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => toggle(d.id)}
                    className={uiCx(
                      GRID_CARD_CLASS,
                      selected && 'border-brand-red bg-red-50 ring-2 ring-inset ring-brand-red/40',
                      disabled && 'opacity-60 cursor-not-allowed',
                    )}
                    title={name}
                  >
                    <InvitePickerPreviewFrame checkbox={checkbox}>
                      <InvitePickerPdfThumb docId={d.id} />
                    </InvitePickerPreviewFrame>
                    <div className="px-2 pb-2 pt-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 truncate block leading-tight">{name}</span>
                      <span className="text-[11px] text-gray-500 truncate block leading-tight mt-0.5">PDF</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppFormModal>
  );
}
