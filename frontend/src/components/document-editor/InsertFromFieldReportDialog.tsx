import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { withFileAccessToken, api } from '@/lib/api';
import {
  AppButton,
  AppEmptyState,
  AppFormModal,
  AppSelect,
  uiCx,
  uiLayout,
  uiTypography,
} from '@/components/ui';
import type { FieldworkPhotoObservation, FieldworkRecord } from '@/types/fieldwork';

type Props = {
  open: boolean;
  projectId: string;
  /** Pre-select this approved record when the dialog opens. */
  preferredRecordId?: string | null;
  onClose: () => void;
  onInsert: (photos: FieldworkPhotoObservation[]) => void;
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

  useEffect(() => {
    if (!open) {
      setRecordId('');
      setSelectedIds([]);
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

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="Insert from Field Report"
      description="Pick an approved report, then choose photos with their descriptions. They are added as normal image + text boxes on the current page."
      size="lg"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton
            type="button"
            size="sm"
            disabled={!selectedPhotos.length}
            onClick={() => {
              onInsert(selectedPhotos);
              onClose();
            }}
          >
            Insert {selectedPhotos.length ? `(${selectedPhotos.length})` : ''}
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

            {recordId ? (
              detailLoading ? (
                <p className={uiTypography.helper}>Loading photos…</p>
              ) : photos.length === 0 ? (
                <p className={uiTypography.helper}>This report has no classified photos yet.</p>
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
                  <ul className="max-h-[min(52vh,420px)] space-y-2 overflow-y-auto pr-1">
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
          </>
        )}
      </div>
    </AppFormModal>
  );
}

export default InsertFromFieldReportDialog;
