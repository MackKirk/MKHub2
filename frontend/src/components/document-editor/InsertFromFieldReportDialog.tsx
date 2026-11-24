import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { withFileAccessToken, api } from '@/lib/api';
import {
  AppButton,
  AppChoiceCards,
  AppEmptyState,
  AppFormModal,
  AppSelect,
  uiCx,
  uiLayout,
  uiTypography,
} from '@/components/ui';
import type { DocumentTypePreset } from '@/components/DocumentTypePicker';
import { previewPagesFromDocumentType, type BackgroundTemplate } from '@/components/DocumentTypePicker';
import {
  countPhotoSlotsOnPage,
  extractFieldReportLayoutPages,
} from '@/lib/fillFieldReportPhotoSlots';
import type { DocumentPage } from '@/types/documentCreator';
import type { FieldworkPhotoObservation, FieldworkRecord } from '@/types/fieldwork';
import { FileStack, ArrowDownToLine, ArrowUpToLine } from 'lucide-react';

export type FieldReportInsertPosition = 'before' | 'after';

export type FieldReportInsertPayload = {
  photos: FieldworkPhotoObservation[];
  insertPosition: FieldReportInsertPosition;
  /** Empty-slot layout pages from a Field Report document type (may be empty → fill existing doc slots). */
  layoutPages: DocumentPage[];
  documentTypeName?: string | null;
};

type Props = {
  open: boolean;
  projectId: string;
  /** Pre-select this approved record when the dialog opens. */
  preferredRecordId?: string | null;
  onClose: () => void;
  onInsert: (payload: FieldReportInsertPayload) => void;
};

function kindLabel(kind: string | null | undefined): string {
  const k = (kind || '').toLowerCase();
  if (k === 'site_assessment') return 'Site Assessment';
  if (k === 'work_report') return 'Work Report';
  return kind || 'Field report';
}

function photoCaption(p: FieldworkPhotoObservation): string {
  const phrase = (p.phrase_text_snapshot || '').trim();
  const notes = (p.extra_notes || '').trim();
  if (phrase && notes) return `${phrase}\n${notes}`;
  return phrase || notes || 'No description';
}

export function InsertFromFieldReportDialog({
  open,
  projectId,
  preferredRecordId,
  onClose,
  onInsert,
}: Props) {
  const [recordId, setRecordId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [insertPosition, setInsertPosition] = useState<FieldReportInsertPosition>('after');

  useEffect(() => {
    if (!open) {
      setRecordId('');
      setSelectedIds([]);
      setDocumentTypeId('');
      setInsertPosition('after');
    }
  }, [open]);

  const {
    data: records = [],
    isLoading: listLoading,
    isError: listError,
  } = useQuery({
    queryKey: ['fieldworkRecords', projectId, 'approved-for-docs'],
    queryFn: () =>
      api<FieldworkRecord[]>(
        'GET',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records?status=approved`
      ),
    enabled: open && !!projectId,
  });

  const {
    data: fieldReportTypes = [],
    isLoading: typesLoading,
  } = useQuery({
    queryKey: ['document-creator-document-types', 'for-field-report'],
    queryFn: () =>
      api<DocumentTypePreset[]>(
        'GET',
        '/document-creator/document-types?for_picker=1&for_field_report=1'
      ),
    enabled: open,
  });

  const { data: backgroundTemplates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<BackgroundTemplate[]>('GET', '/document-creator/templates'),
    enabled: open && fieldReportTypes.length > 0,
  });

  const approved = useMemo(
    () => (Array.isArray(records) ? records.filter((r) => (r.status || '').toLowerCase() === 'approved') : []),
    [records]
  );

  useEffect(() => {
    if (!open) return;
    if (recordId) return;
    const preferred = (preferredRecordId || '').trim();
    if (preferred && approved.some((r) => r.id === preferred)) {
      setRecordId(preferred);
      return;
    }
    if (approved.length === 1) setRecordId(approved[0].id);
  }, [open, approved, recordId, preferredRecordId]);

  useEffect(() => {
    if (!open || documentTypeId) return;
    if (fieldReportTypes.length === 1) setDocumentTypeId(fieldReportTypes[0].id);
  }, [open, fieldReportTypes, documentTypeId]);

  const selectedType = useMemo(
    () => fieldReportTypes.find((t) => t.id === documentTypeId) || null,
    [fieldReportTypes, documentTypeId]
  );

  const layoutPages = useMemo(() => {
    if (!selectedType) return [] as DocumentPage[];
    const pages = previewPagesFromDocumentType(selectedType, backgroundTemplates);
    return extractFieldReportLayoutPages(pages);
  }, [selectedType, backgroundTemplates]);

  const slotsPerInsert = useMemo(
    () => layoutPages.reduce((n, p) => n + countPhotoSlotsOnPage(p), 0),
    [layoutPages]
  );

  const {
    data: detail,
    isLoading: detailLoading,
  } = useQuery({
    queryKey: ['fieldworkRecord', projectId, recordId, 'photos-for-docs'],
    queryFn: () =>
      api<FieldworkRecord>(
        'GET',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}`
      ),
    enabled: open && !!projectId && !!recordId,
  });

  const photos = useMemo(() => {
    const list = Array.isArray(detail?.photos) ? [...detail!.photos!] : [];
    return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [detail?.photos]);

  useEffect(() => {
    setSelectedIds([]);
  }, [recordId]);

  const allSelected = photos.length > 0 && selectedIds.length === photos.length;

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : photos.map((p) => p.id));
  };

  const selectedPhotos = photos.filter((p) => selectedIds.includes(p.id));
  const pagesNeeded =
    slotsPerInsert > 0 && selectedPhotos.length
      ? Math.ceil(selectedPhotos.length / slotsPerInsert)
      : 0;

  const canInsert =
    selectedPhotos.length > 0 &&
    (fieldReportTypes.length === 0 || (Boolean(documentTypeId) && layoutPages.length > 0));

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="Insert from Field Report"
      description="Pick an approved report and a Field Report document template. Extra photos clone more pages of that layout."
      size="lg"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton
            type="button"
            size="sm"
            disabled={!canInsert}
            onClick={() => {
              onInsert({
                photos: selectedPhotos,
                insertPosition,
                layoutPages,
                documentTypeName: selectedType?.name || null,
              });
              onClose();
            }}
          >
            Insert {selectedPhotos.length ? `(${selectedPhotos.length})` : ''}
            {pagesNeeded > 1 ? ` · ${pagesNeeded} pages` : ''}
          </AppButton>
        </div>
      }
    >
      <div className="space-y-4">
        {listLoading ? (
          <p className={uiTypography.helper}>Loading approved reports…</p>
        ) : listError ? (
          <p className="text-sm text-red-700">Could not load field reports for this project.</p>
        ) : approved.length === 0 ? (
          <AppEmptyState
            title="No approved field reports"
            description="Approve a Site Assessment or Work Report first, then insert its photos here."
            className="border-0 bg-transparent p-0 shadow-none"
          />
        ) : (
          <>
            <AppSelect
              label="Approved report"
              value={recordId}
              onChange={(e) => setRecordId(e.target.value)}
              placeholder="Select a report…"
              options={approved.map((r) => ({
                value: r.id,
                label: `${kindLabel(r.kind)}${r.version > 1 ? ` v${r.version}` : ''} · ${
                  r.submitted_at ? r.submitted_at.slice(0, 10) : r.id.slice(0, 8)
                }${Number(r.photo_count || 0) ? ` · ${r.photo_count} photos` : ''}`,
              }))}
            />

            {typesLoading ? (
              <p className={uiTypography.helper}>Loading Field Report templates…</p>
            ) : fieldReportTypes.length === 0 ? (
              <p className="text-sm text-amber-800 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2">
                No document templates are marked <strong>Valid for Field Report</strong> yet. Photos
                will fill empty <code className="text-xs">photo_N</code> slots already on this
                document (or dump onto the page). Mark a template in Document Templates to use a
                dedicated layout.
              </p>
            ) : (
              <>
                <AppSelect
                  label="Field Report template"
                  value={documentTypeId}
                  onChange={(e) => setDocumentTypeId(e.target.value)}
                  placeholder="Select a layout…"
                  options={fieldReportTypes.map((t) => ({
                    value: t.id,
                    label: `${t.name}${
                      t.category ? ` · ${t.category}` : ''
                    }${(() => {
                      const pages = extractFieldReportLayoutPages(
                        previewPagesFromDocumentType(t, backgroundTemplates)
                      );
                      const slots = pages.reduce((n, p) => n + countPhotoSlotsOnPage(p), 0);
                      return slots ? ` · ${slots} slots/page` : '';
                    })()}`,
                  }))}
                />
                {selectedType && layoutPages.length === 0 ? (
                  <p className="text-sm text-red-700">
                    This template has no photo slots. In page layout, set image slots to photo_1…
                    and text slots to caption_1…
                  </p>
                ) : null}
                {slotsPerInsert > 0 && selectedPhotos.length > slotsPerInsert ? (
                  <p className={uiCx(uiTypography.helper)}>
                    {selectedPhotos.length} photos · {slotsPerInsert} slots per insert →{' '}
                    <strong>{pagesNeeded} pages</strong> will be added.
                  </p>
                ) : null}
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-800">Insert pages</p>
                  <AppChoiceCards
                    size="compact"
                    columns={2}
                    value={insertPosition}
                    onChange={setInsertPosition}
                    options={[
                      {
                        value: 'before',
                        title: 'Before current page',
                        icon: ArrowUpToLine,
                      },
                      {
                        value: 'after',
                        title: 'After current page',
                        icon: ArrowDownToLine,
                      },
                    ]}
                  />
                </div>
              </>
            )}

            {recordId ? (
              detailLoading ? (
                <p className={uiTypography.helper}>Loading photos…</p>
              ) : photos.length === 0 ? (
                <p className={uiTypography.helper}>
                  This report has no classified photos yet. On the Field Report, open Images on a
                  field, pick catalog phrase(s), then upload — free-text comments alone are not
                  enough.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-800">
                      Photos ({selectedIds.length}/{photos.length})
                    </p>
                    <button
                      type="button"
                      className="text-sm font-medium text-brand-red hover:underline"
                      onClick={toggleAll}
                    >
                      {allSelected ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <ul className="max-h-[min(40vh,320px)] space-y-2 overflow-y-auto pr-1">
                    {photos.map((p) => {
                      const checked = selectedIds.includes(p.id);
                      const caption = photoCaption(p);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => toggle(p.id)}
                            className={uiCx(
                              'flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition-colors',
                              checked
                                ? 'border-brand-red/40 bg-red-50/60'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                            )}
                          >
                            <img
                              src={withFileAccessToken(
                                `/files/${encodeURIComponent(p.file_object_id)}/thumbnail?w=240`
                              )}
                              alt=""
                              className="h-16 w-20 shrink-0 rounded-lg object-cover border border-gray-200 bg-gray-50"
                              loading="lazy"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-gray-900 whitespace-pre-wrap line-clamp-3">
                                {caption}
                              </span>
                              <span className={uiCx(uiTypography.helper, 'mt-1 block capitalize')}>
                                {(p.entry_type || 'photo').replace(/_/g, ' ')}
                              </span>
                            </span>
                            <span
                              className={uiCx(
                                'mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold',
                                checked
                                  ? 'border-brand-red bg-brand-red text-white'
                                  : 'border-gray-300 bg-white text-transparent'
                              )}
                              aria-hidden
                            >
                              ✓
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )
            ) : null}

            {fieldReportTypes.length > 0 ? (
              <p className={uiCx(uiTypography.helper, 'flex items-start gap-2')}>
                <FileStack className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                <span>
                  Tip: mark templates in Document Templates and assign <code className="text-xs">photo_N</code> /{' '}
                  <code className="text-xs">caption_N</code> on images and text boxes in the page layout editor.
                </span>
              </p>
            ) : null}
          </>
        )}
      </div>
    </AppFormModal>
  );
}

export default InsertFromFieldReportDialog;
