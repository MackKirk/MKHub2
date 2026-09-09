import { useCallback, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { api, withFileAccessToken } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import type { FleetComplianceRecord } from '@/components/fleet/FleetComplianceModal';
import {
  FileImagePreviewModal,
  FileOfficePreviewModal,
  FilePdfPreviewModal,
  useFileImageGallery,
} from '@/components/files';
import {
  AppButton,
  AppFormModal,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const EM_DASH = '—';

type Props = {
  open: boolean;
  record: FleetComplianceRecord;
  canEdit?: boolean;
  onClose: () => void;
  onEdit: (record: FleetComplianceRecord) => void;
};

type PreviewDoc = { url: string; name: string };

function formatComplianceDate(value?: string | null): string {
  if (!value?.trim()) return EM_DASH;
  return formatDateLocal(new Date(value.slice(0, 10)));
}

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

function guessPreviewKindFromUrl(url: string): 'image' | 'pdf' | 'office' | 'other' {
  try {
    const path = decodeURIComponent(new URL(url).pathname).toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|heic|heif|tiff?)$/i.test(path)) return 'image';
    if (/\.pdf$/i.test(path)) return 'pdf';
    if (/\.(xlsx?|xls|csv|docx?|doc|pptx?)$/i.test(path)) return 'office';
  } catch {
    /* ignore */
  }
  return 'other';
}

function AttachmentThumb({
  fileId,
  onOpen,
  onImageDetect,
}: {
  fileId: string;
  onOpen: (fileId: string) => void;
  onImageDetect: (fileId: string, isImage: boolean) => void;
}) {
  const [showImage, setShowImage] = useState(true);

  return (
    <button
      type="button"
      onClick={() => onOpen(fileId)}
      className="relative block h-20 w-20 shrink-0 rounded-lg border border-gray-200 transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-red/40 focus:ring-offset-2"
      title="View attachment"
    >
      <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
        {showImage ? (
          <img
            src={withFileAccessToken(`/files/${encodeURIComponent(fileId)}/thumbnail?w=120`)}
            alt=""
            className="h-full w-full object-cover"
            onLoad={() => onImageDetect(fileId, true)}
            onError={() => {
              setShowImage(false);
              onImageDetect(fileId, false);
            }}
          />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center bg-gray-100 p-1 text-center text-[10px] font-medium text-gray-600">
            Doc
          </span>
        )}
        <span
          className={uiCx(
            uiTypography.helper,
            'absolute bottom-1 right-1 rounded bg-black/55 px-1 py-0.5 text-white',
          )}
        >
          View
        </span>
      </span>
    </button>
  );
}

export default function FleetComplianceDetailModal({
  open,
  record,
  canEdit = false,
  onClose,
  onEdit,
}: Props) {
  const documentIds = (record.documents ?? []).map(String).filter(Boolean);
  const imageGallery = useFileImageGallery();
  const [previewPdf, setPreviewPdf] = useState<PreviewDoc | null>(null);
  const [previewOffice, setPreviewOffice] = useState<PreviewDoc | null>(null);
  const [imageFileIds, setImageFileIds] = useState<Record<string, boolean>>({});
  const [openingId, setOpeningId] = useState<string | null>(null);

  const handleImageDetect = useCallback((fileId: string, isImage: boolean) => {
    setImageFileIds((prev) => (prev[fileId] === isImage ? prev : { ...prev, [fileId]: isImage }));
  }, []);

  const handleOpenAttachment = async (fileId: string) => {
    if (openingId) return;
    setOpeningId(fileId);
    try {
      if (imageFileIds[fileId] === true) {
        const imageIds = documentIds.filter((id) => imageFileIds[id] === true);
        await imageGallery.openImage(
          fileId,
          imageIds,
          () => true,
          (id) => id,
          () => 'Attachment',
        );
        return;
      }

      const r = await api<{ preview_url?: string; download_url?: string }>(
        'GET',
        withFileAccessToken(`/files/${encodeURIComponent(fileId)}/preview`),
      );
      const url = String(r.preview_url || r.download_url || '');
      if (!url) {
        toast.error('Preview not available');
        return;
      }

      const kind = guessPreviewKindFromUrl(url);
      const name = 'Attachment';

      if (kind === 'image') {
        await imageGallery.openImage(
          fileId,
          [fileId],
          () => true,
          (id) => id,
          () => name,
        );
        return;
      }
      if (kind === 'office') {
        setPreviewOffice({ url, name });
        return;
      }
      // PDFs and unknown non-image docs (certs are usually PDF)
      setPreviewPdf({ url, name });
    } catch {
      toast.error('Preview not available');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <>
      <AppFormModal
        open={open}
        onClose={onClose}
        formWidth="wide"
        title="Compliance record"
        description={`${record.record_type} certification details for this asset.`}
        quickInfo={
          <>
            <p>Review certification details, expiry, and attached files.</p>
            <p>Use Edit to change fields or manage attachments.</p>
          </>
        }
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </AppButton>
            {canEdit ? (
              <AppButton
                type="button"
                size="sm"
                onClick={() => {
                  onEdit(record);
                  onClose();
                }}
              >
                Edit
              </AppButton>
            ) : null}
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <div className={uiLayout.sectionGrid2}>
            <ReadOnlyDetailField label="Record type" value={record.record_type} />
            <ReadOnlyDetailField label="Equipment make / model" value={record.equipment_make_model} />
            <ReadOnlyDetailField label="Facility" value={record.facility} />
            <ReadOnlyDetailField label="Serial number" value={record.serial_number} />
            <ReadOnlyDetailField label="Completed by" value={record.completed_by} />
            <ReadOnlyDetailField
              label="Annual inspection date"
              value={formatComplianceDate(record.annual_inspection_date)}
            />
            <ReadOnlyDetailField label="Equipment classification" value={record.equipment_classification} />
            <ReadOnlyDetailField label="Expiry date" value={formatComplianceDate(record.expiry_date)} />
          </div>
          <ReadOnlyDetailField label="File reference number" value={record.file_reference_number} />
          <div className="space-y-1">
            <div className={uiTypography.controlLabel}>Attachments</div>
            {documentIds.length === 0 ? (
              <div className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>{EM_DASH}</div>
            ) : (
              <div className="flex flex-wrap gap-2 p-1 pt-0.5">
                {documentIds.map((fid) => (
                  <AttachmentThumb
                    key={fid}
                    fileId={fid}
                    onOpen={(id) => void handleOpenAttachment(id)}
                    onImageDetect={handleImageDetect}
                  />
                ))}
              </div>
            )}
          </div>
          <ReadOnlyDetailField
            label="Notes"
            value={
              record.notes?.trim() ? (
                <span className="whitespace-pre-wrap font-normal text-gray-700">{record.notes}</span>
              ) : (
                EM_DASH
              )
            }
          />
        </div>
      </AppFormModal>

      <FileImagePreviewModal
        open={imageGallery.open}
        items={imageGallery.items}
        index={imageGallery.index}
        loading={imageGallery.loading}
        onClose={imageGallery.close}
        onPrev={imageGallery.goPrev}
        onNext={imageGallery.goNext}
      />
      <FilePdfPreviewModal
        open={!!previewPdf}
        url={previewPdf?.url}
        name={previewPdf?.name}
        onClose={() => setPreviewPdf(null)}
      />
      <FileOfficePreviewModal
        open={!!previewOffice}
        url={previewOffice?.url}
        name={previewOffice?.name}
        onClose={() => setPreviewOffice(null)}
      />
    </>
  );
}
