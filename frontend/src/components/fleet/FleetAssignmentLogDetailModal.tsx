import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { withFileAccessToken } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import OverlayPortal from '@/components/OverlayPortal';
import { formatFleetHistoryPerformedBy } from '@/lib/fleetHistoryActor';
import { fleetAssignmentLogDetailQuickInfo } from '@/lib/fleetHistoryQuickInfo';
import {
  AppButton,
  AppFormModal,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export type FleetAssignmentLogRecord = {
  id: string;
  assigned_to_name?: string;
  phone_snapshot?: string;
  address_snapshot?: string;
  department_snapshot?: string;
  assigned_at: string;
  returned_at?: string;
  odometer_out?: number;
  odometer_in?: number;
  hours_out?: number;
  hours_in?: number;
  notes_out?: string;
  notes_in?: string;
  photos_out?: string[];
  photos_in?: string[];
};

type Props = {
  open: boolean;
  assignment: FleetAssignmentLogRecord;
  logType: 'assignment' | 'return';
  performedBy?: string | null;
  onClose: () => void;
};

function assignmentPhotoViewUrls(photoIds: string[] | undefined): string[] {
  if (!photoIds?.length) return [];
  return photoIds.map((id) => withFileAccessToken(`/files/${encodeURIComponent(id)}/thumbnail?w=1600`));
}

function AssignmentImageLightbox({
  urls,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  urls: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrev, onNext]);

  if (!urls.length) return null;

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 p-4 md:p-8"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Image viewer"
      >
        <div className="absolute right-3 top-3 flex items-center gap-2">
          {urls.length > 1 && (
            <span className="rounded bg-white/10 px-2 py-1 text-xs tabular-nums text-white/80">
              {index + 1} / {urls.length}
            </span>
          )}
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            className="border-white/20 bg-white/15 text-white hover:bg-white/25"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            Close
          </AppButton>
        </div>
        {urls.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrev();
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20 md:left-4 md:p-3"
              aria-label="Previous image"
            >
              <svg className="h-5 w-5 md:h-6 md:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNext();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20 md:right-4 md:p-3"
              aria-label="Next image"
            >
              <svg className="h-5 w-5 md:h-6 md:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}
        <button
          type="button"
          className="flex max-h-[calc(100vh-5rem)] max-w-full items-center justify-center outline-none"
          onClick={(e) => e.stopPropagation()}
          aria-label="View image"
        >
          <img
            src={urls[index]}
            alt={`Attachment ${index + 1}`}
            className="max-h-[calc(100vh-5rem)] w-auto max-w-full rounded-lg object-contain shadow-2xl"
          />
        </button>
      </div>
    </OverlayPortal>
  );
}

const EM_DASH = '—';

function ReadOnlyDetailField({ label, value }: { label: string; value: ReactNode }) {
  const display =
    value === null || value === undefined || (typeof value === 'string' && !value.trim())
      ? EM_DASH
      : value;
  return (
    <div className="space-y-1">
      <div className={uiTypography.controlLabel}>{label}</div>
      <div className={uiCx(uiTypography.body, 'break-words font-medium text-gray-900')}>{display}</div>
    </div>
  );
}

export default function FleetAssignmentLogDetailModal({
  open,
  assignment,
  logType,
  performedBy,
  onClose,
}: Props) {
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const showAssign = true;
  const showReturn = !!assignment.returned_at;

  const urlsOut = useMemo(() => assignmentPhotoViewUrls(assignment.photos_out), [assignment.photos_out]);
  const urlsIn = useMemo(() => assignmentPhotoViewUrls(assignment.photos_in), [assignment.photos_in]);
  const hasPhotos = urlsOut.length > 0 || urlsIn.length > 0;
  const modalDescription = hasPhotos
    ? 'Information and photos recorded for this assignment.'
    : 'Information recorded for this assignment.';

  const openLightbox = (urls: string[], index: number) => {
    if (!urls.length) return;
    setLightbox({ urls, index: Math.max(0, Math.min(index, urls.length - 1)) });
  };

  const lightboxPrev = useCallback(() => {
    setLightbox((lb) => {
      if (!lb || lb.urls.length <= 1) return lb;
      const next = lb.index <= 0 ? lb.urls.length - 1 : lb.index - 1;
      return { ...lb, index: next };
    });
  }, []);

  const lightboxNext = useCallback(() => {
    setLightbox((lb) => {
      if (!lb || lb.urls.length <= 1) return lb;
      const next = lb.index >= lb.urls.length - 1 ? 0 : lb.index + 1;
      return { ...lb, index: next };
    });
  }, []);

  return (
    <>
      <AppFormModal
        open={open}
        onClose={onClose}
        formWidth="comfortable"
        quickInfo={fleetAssignmentLogDetailQuickInfo}
        title={logType === 'assignment' ? 'Check-out details' : 'Return details'}
        description={modalDescription}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" size="sm" onClick={onClose}>
              Close
            </AppButton>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <ReadOnlyDetailField
            label="Performed by"
            value={formatFleetHistoryPerformedBy(performedBy)}
          />
          {showAssign && (
            <div className={uiSpacing.sectionStack}>
              {showReturn && logType === 'assignment' && (
                <p className={uiCx(uiTypography.overline, 'text-gray-600')}>Check-out</p>
              )}
              <ReadOnlyDetailField label="Name" value={assignment.assigned_to_name || '—'} />
              <ReadOnlyDetailField label="Phone" value={assignment.phone_snapshot || '—'} />
              <ReadOnlyDetailField label="Address" value={assignment.address_snapshot || '—'} />
              <ReadOnlyDetailField label="Department" value={assignment.department_snapshot || '—'} />
              <ReadOnlyDetailField
                label="Assigned at"
                value={
                  assignment.assigned_at ? formatDateLocal(new Date(assignment.assigned_at)) : '—'
                }
              />
              {assignment.odometer_out != null && (
                <ReadOnlyDetailField
                  label="Odometer out"
                  value={assignment.odometer_out.toLocaleString()}
                />
              )}
              {assignment.hours_out != null && (
                <ReadOnlyDetailField label="Hours out" value={assignment.hours_out} />
              )}
              {assignment.notes_out && (
                <ReadOnlyDetailField
                  label="Notes out"
                  value={<span className="whitespace-pre-wrap">{assignment.notes_out}</span>}
                />
              )}
              {urlsOut.length > 0 && (
                <div className="space-y-1">
                  <div className={uiTypography.controlLabel}>Images out</div>
                  <div className="flex flex-wrap gap-2">
                    {assignment.photos_out!.map((photoId: string, idx: number) => (
                      <button
                        key={photoId + idx}
                        type="button"
                        onClick={() => openLightbox(urlsOut, idx)}
                        className="relative overflow-hidden rounded-lg border border-gray-200 transition-opacity hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-brand-red/40"
                        title="View image"
                      >
                        <img
                          src={withFileAccessToken(`/files/${encodeURIComponent(photoId)}/thumbnail?w=200`)}
                          alt={`Out ${idx + 1}`}
                          className="block h-24 w-24 object-cover"
                        />
                        <span className={uiCx(uiTypography.helper, 'absolute bottom-1 right-1 rounded bg-black/55 px-1 py-0.5 text-white')}>
                          View
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {showReturn && (
            <div className={uiCx(showAssign ? 'border-t border-gray-200 pt-6' : '', uiSpacing.sectionStack)}>
              {showAssign && (
                <p className={uiCx(uiTypography.overline, 'text-gray-600')}>Return</p>
              )}
              <ReadOnlyDetailField
                label="Returned at"
                value={
                  assignment.returned_at ? formatDateLocal(new Date(assignment.returned_at)) : '—'
                }
              />
              {assignment.odometer_in != null && (
                <ReadOnlyDetailField
                  label="Odometer in"
                  value={assignment.odometer_in.toLocaleString()}
                />
              )}
              {assignment.hours_in != null && (
                <ReadOnlyDetailField label="Hours in" value={assignment.hours_in} />
              )}
              {assignment.notes_in && (
                <ReadOnlyDetailField
                  label="Notes in"
                  value={<span className="whitespace-pre-wrap">{assignment.notes_in}</span>}
                />
              )}
              {urlsIn.length > 0 && (
                <div className="space-y-1">
                  <div className={uiTypography.controlLabel}>Images in</div>
                  <div className="flex flex-wrap gap-2">
                    {assignment.photos_in!.map((photoId: string, idx: number) => (
                      <button
                        key={photoId + idx}
                        type="button"
                        onClick={() => openLightbox(urlsIn, idx)}
                        className="relative overflow-hidden rounded-lg border border-gray-200 transition-opacity hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-brand-red/40"
                        title="View image"
                      >
                        <img
                          src={withFileAccessToken(`/files/${encodeURIComponent(photoId)}/thumbnail?w=200`)}
                          alt={`In ${idx + 1}`}
                          className="block h-24 w-24 object-cover"
                        />
                        <span className={uiCx(uiTypography.helper, 'absolute bottom-1 right-1 rounded bg-black/55 px-1 py-0.5 text-white')}>
                          View
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </AppFormModal>
      {lightbox && (
        <AssignmentImageLightbox
          urls={lightbox.urls}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onPrev={lightboxPrev}
          onNext={lightboxNext}
        />
      )}
    </>
  );
}
