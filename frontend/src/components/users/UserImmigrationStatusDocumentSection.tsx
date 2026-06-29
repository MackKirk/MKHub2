import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Paperclip, X } from 'lucide-react';
import { api, withFileAccessToken } from '@/lib/api';
import {
  AppButton,
  AppFileUpload,
  uiBorders,
  uiColors,
  uiCx,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

async function getOrCreatePersonalDocumentsFolder(userId: string): Promise<string> {
  const folders: any[] = await api('GET', `/auth/users/${encodeURIComponent(userId)}/folders`);
  const personalFolder = folders.find((f: any) => f.name === 'Personal Documents');
  if (personalFolder) return personalFolder.id;
  const newFolder: any = await api('POST', `/auth/users/${encodeURIComponent(userId)}/folders`, {
    name: 'Personal Documents',
  });
  return newFolder.id;
}

function immigrationFileIdentity(f: File): string {
  return `${f.name}\0${f.size}\0${f.lastModified}`;
}

function StoredFilePreviewCard({
  fileId,
  canEdit,
  onRemove,
  disabled,
}: {
  fileId: string;
  canEdit: boolean;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const { data: previewMeta } = useQuery({
    queryKey: ['stored-file-preview', fileId],
    queryFn: async () => {
      const r: any = await api('GET', withFileAccessToken(`/files/${encodeURIComponent(fileId)}/preview`));
      return {
        previewUrl: String(r.preview_url || ''),
        thumbUrl: withFileAccessToken(`/files/${encodeURIComponent(fileId)}/thumbnail?w=400`),
      };
    },
  });

  const openPreview = () => {
    const url = previewMeta?.previewUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div className={uiCx(uiRadius.card, uiBorders.subtle, 'overflow-hidden', uiColors.surfaceSubtle, 'max-w-sm')}>
        {!imgFailed && previewMeta?.thumbUrl ? (
          <button type="button" className="block w-full" onClick={() => setViewerOpen(true)} disabled={disabled}>
            <img
              src={previewMeta.thumbUrl}
              alt="Immigration status document"
              className="h-32 w-full cursor-pointer object-cover hover:opacity-90"
              onError={() => setImgFailed(true)}
            />
          </button>
        ) : (
          <div className={uiCx('flex h-32 flex-col items-center justify-center gap-2 px-3', uiTypography.helper)}>
            <Paperclip className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
            <span className="font-medium text-gray-800">Document on file</span>
            <AppButton type="button" variant="secondary" size="sm" onClick={openPreview} disabled={disabled || !previewMeta?.previewUrl}>
              View
            </AppButton>
          </div>
        )}
        <div className={uiCx('flex items-center justify-between gap-2 border-t border-gray-100 bg-white', uiSpacing.compactCardPadding)}>
          <span className={uiCx(uiTypography.helper, 'min-w-0 truncate font-medium text-gray-900')}>
            Immigration status document
          </span>
          {canEdit ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              className={uiCx(uiTypography.helper, 'shrink-0 font-medium text-brand-red hover:text-brand-red/80 disabled:opacity-50')}
            >
              Remove
            </button>
          ) : (
            <AppButton type="button" variant="secondary" size="sm" onClick={openPreview} disabled={!previewMeta?.previewUrl}>
              View
            </AppButton>
          )}
        </div>
      </div>
      {viewerOpen && previewMeta?.thumbUrl && !imgFailed ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setViewerOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <img
            src={previewMeta.thumbUrl}
            alt="Immigration status document"
            className="max-h-[90vh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setViewerOpen(false)}
            className={uiCx(
              'absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center bg-white/90 text-gray-800 shadow-lg',
              uiRadius.badge,
            )}
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : null}
    </>
  );
}

export function UserImmigrationStatusDocumentSection({
  userId,
  canEdit,
  isRequired,
  selfProfile,
}: {
  userId: string;
  canEdit: boolean;
  isRequired?: boolean;
  selfProfile?: boolean;
}) {
  const [stagingFiles, setStagingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  const profilePath = selfProfile ? '/auth/me/profile' : `/auth/users/${encodeURIComponent(userId)}/profile`;
  const { data: permitFile, refetch } = useQuery({
    queryKey: ['permit-file', userId, selfProfile ? 'me' : 'user'],
    queryFn: () => api<any>('GET', profilePath),
  });
  const permitFileId = permitFile?.profile?.permit_file_id;

  const uploadFile = async (f: File): Promise<boolean> => {
    const isPDF = f.type === 'application/pdf';
    const isImage = f.type.startsWith('image/');
    if (!isPDF && !isImage) {
      toast.error('Please upload a PDF or image file');
      return false;
    }

    try {
      const up: any = await api('POST', '/files/upload', {
        project_id: null,
        client_id: null,
        employee_id: userId,
        category_id: 'permit',
        original_name: f.name,
        content_type: f.type || 'application/pdf',
      });
      const put = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': f.type || 'application/pdf', 'x-ms-blob-type': 'BlockBlob' },
        body: f,
      });
      if (!put.ok) throw new Error('upload failed');
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: f.size,
        checksum_sha256: 'na',
        content_type: f.type || 'application/pdf',
      });
      await api('PUT', profilePath, { permit_file_id: conf.id });
      try {
        const personalFolderId = await getOrCreatePersonalDocumentsFolder(userId);
        await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, {
          folder_id: personalFolderId,
          title: `Immigration Status Document - ${f.name}`,
          file_id: conf.id,
        });
      } catch (e: any) {
        console.error('Failed to add document to Personal Documents folder:', e);
      }
      toast.success('Immigration Status Document uploaded successfully');
      await refetch();
      if (selfProfile) {
        await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
        await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
      } else {
        await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
      }
      await queryClient.invalidateQueries({ queryKey: ['user-docs', userId] });
      await queryClient.invalidateQueries({ queryKey: ['user-folders', userId] });
      await queryClient.invalidateQueries({ queryKey: ['stored-file-preview', conf.id] });
      return true;
    } catch (e: any) {
      toast.error(e?.message || 'Failed to upload Immigration Status Document');
      return false;
    }
  };

  const handleStagingChange = (next: File[]) => {
    const prevKeys = new Set(stagingFiles.map(immigrationFileIdentity));
    const added = next.filter((f) => !prevKeys.has(immigrationFileIdentity(f)));
    setStagingFiles(next);
    if (!added.length) return;

    void (async () => {
      setUploading(true);
      try {
        for (const f of added) {
          const ok = await uploadFile(f);
          if (ok) {
            setStagingFiles((prev) => prev.filter((x) => immigrationFileIdentity(x) !== immigrationFileIdentity(f)));
          }
        }
      } finally {
        setUploading(false);
      }
    })();
  };

  const removeFile = async () => {
    try {
      await api('PUT', profilePath, { permit_file_id: null });
      toast.success('Immigration Status Document removed');
      await refetch();
      if (selfProfile) {
        await queryClient.invalidateQueries({ queryKey: ['meProfile'] });
        await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
      } else {
        await queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to remove Immigration Status Document');
    }
  };

  return (
    <div>
      <div className={uiTypography.controlLabel}>
        Immigration Status Document
        {isRequired ? <span className="text-red-600"> *</span> : null}
      </div>
      <div className="mt-3 space-y-3">
        {permitFileId ? (
          <StoredFilePreviewCard fileId={permitFileId} canEdit={canEdit} onRemove={removeFile} disabled={uploading} />
        ) : !canEdit ? (
          <div className={uiCx(uiTypography.helper, 'font-medium text-gray-900')}>—</div>
        ) : null}
        {canEdit ? (
          <>
            <AppFileUpload
              mode="multiple"
              value={stagingFiles}
              onChange={handleStagingChange}
              accept="image/*,.pdf"
              label={permitFileId ? 'Add or replace documents' : 'Upload documents'}
              helperText="PDF or images. Select multiple files; each upload updates the primary document."
              disabled={uploading}
            />
            {isRequired && !permitFileId && !stagingFiles.length ? (
              <p className={uiCx(uiTypography.helper, 'text-red-600')}>Immigration Status Document is required</p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
