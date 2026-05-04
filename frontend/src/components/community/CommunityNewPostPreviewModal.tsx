import OverlayPortal from '@/components/OverlayPortal';
import { withFileAccessToken } from '@/lib/api';
import { CommunityPostBody } from '@/components/community/CommunityPostBody';

const AREA_LABELS: Record<string, string> = {
  general: 'General',
  projects: 'Projects',
  opportunities: 'Opportunities',
  repairs_maintenance: 'Repairs & Maintenance',
  safety: 'Safety',
  fleet: 'Fleet',
  hr: 'HR',
  payroll: 'Payroll',
  training: 'Training',
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
  priority: string;
  relatedArea: string;
  requiresReadConfirmation: boolean;
  photoFileId: string | null;
  documentFileId: string | null;
  documentFileName?: string | null;
  targetType: 'all' | 'divisions';
  divisionCount: number;
  publishMode: 'now' | 'scheduled' | 'draft';
};

export function CommunityNewPostPreviewModal({
  open,
  onClose,
  title,
  content,
  priority,
  relatedArea,
  requiresReadConfirmation,
  photoFileId,
  documentFileId,
  documentFileName,
  targetType,
  divisionCount,
  publishMode,
}: Props) {
  if (!open) return null;

  const pr = priority || 'normal';
  const isCritical = pr === 'critical';
  const isUrgent = pr === 'urgent' || isCritical;
  const isRequired = requiresReadConfirmation;

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-post-preview-title"
        >
          <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
            <h2 id="new-post-preview-title" className="text-sm font-semibold text-gray-900">
              Feed preview
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 text-lg leading-none"
              aria-label="Close preview"
            >
              ×
            </button>
          </div>
          <div className="overflow-y-auto p-4 text-xs text-gray-500 border-b bg-gray-50">
            {publishMode === 'draft' && <span className="font-medium text-amber-800">Draft — </span>}
            {publishMode === 'scheduled' && <span className="font-medium text-blue-800">Scheduled — </span>}
            {publishMode === 'now' && <span className="font-medium text-gray-700">Publish now — </span>}
            {targetType === 'all' ? 'All employees' : `${divisionCount} division${divisionCount === 1 ? '' : 's'}`}
            {documentFileId ? ' · PDF attached' : ''}
          </div>
          <div className="p-4 overflow-y-auto">
            <div
              className={`border rounded-[12px] p-4 overflow-hidden ${
                isCritical
                  ? 'border-red-700/50 bg-red-100/40 ring-1 ring-red-200'
                  : isUrgent
                    ? 'border-red-300/60 bg-red-50/50'
                    : isRequired
                      ? 'border-orange-300/60 bg-orange-50/50'
                      : 'border-gray-200/50 bg-gray-50/30'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-500 text-sm font-medium">
                  You
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <h4
                      className={`font-bold text-base tracking-tight break-words ${
                        isUrgent ? 'text-red-900' : isRequired ? 'text-orange-900' : 'text-gray-700'
                      }`}
                    >
                      {title.trim() || 'Untitled announcement'}
                    </h4>
                    {(isCritical || isUrgent || isRequired) && (
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${
                          isCritical ? 'bg-red-900 text-white' : isUrgent ? 'bg-red-600 text-white' : 'bg-orange-600 text-white'
                        }`}
                      >
                        {isCritical ? 'CRITICAL' : isUrgent ? 'URGENT' : 'REQUIRED'}
                      </span>
                    )}
                    {relatedArea && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-100">
                        {AREA_LABELS[relatedArea] || relatedArea}
                      </span>
                    )}
                  </div>
                  <div className="text-xs mb-2.5 font-medium text-gray-400">Preview · not published</div>
                  <div className={`text-sm mb-3 leading-relaxed break-words ${isUrgent || isRequired ? 'text-gray-600' : 'text-gray-500'}`}>
                    {content.trim() ? <CommunityPostBody html={content} /> : <span className="text-gray-400">…</span>}
                  </div>
                  {photoFileId && (
                    <img
                      src={withFileAccessToken(`/files/${photoFileId}/thumbnail?w=560`)}
                      alt=""
                      className="rounded-lg border border-gray-200 max-h-48 object-contain mb-3"
                    />
                  )}
                  {documentFileId && (
                    <div className="text-xs text-gray-600 flex items-center gap-2 mb-2">
                      <span className="text-red-600">PDF</span>
                      <span className="truncate">{documentFileName || 'Document'}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <span>🤍 0</span>
                    <span>💬 0</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
