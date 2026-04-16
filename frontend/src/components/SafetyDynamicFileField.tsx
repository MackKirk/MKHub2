import { useState, type ReactNode } from 'react';
import { withFileAccessToken } from '@/lib/api';
import type { SafetyFormField } from '@/types/safetyFormTemplate';

function getFileIds(p: Record<string, unknown>, k: string): string[] {
  const v = p[k];
  if (typeof v === 'string' && v) return [v];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const ids = (v as { file_object_ids?: unknown }).file_object_ids;
    if (Array.isArray(ids)) return ids.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

type Props = {
  field: SafetyFormField;
  rowBg: string;
  formPayload: Record<string, unknown>;
  setKey: (key: string, val: unknown) => void;
  disabled: boolean;
  projectId: string;
  uploadFile: (file: File) => Promise<string | null>;
  /** When set, replaces the default `p-4 ${rowBg}` root classes (e.g. add horizontal padding for an overlay control). */
  outerClassName?: string;
  /** Rendered on the same row as the file input (e.g. optional comment control). */
  trailingSlot?: ReactNode;
  /** When true, the field title is not shown (caller renders the question label). */
  hideTitle?: boolean;
};

export default function SafetyDynamicFileField({
  field,
  rowBg,
  formPayload,
  setKey,
  disabled,
  projectId,
  uploadFile,
  outerClassName,
  trailingSlot,
  hideTitle,
}: Props) {
  const k = field.key;
  const ids = getFileIds(formPayload, k);
  const multi =
    field.type === 'image_view'
      ? field.settings?.allowMultipleFiles !== false
      : field.settings?.allowMultipleFiles === true;
  const [busy, setBusy] = useState(false);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || disabled || !projectId) return;
    setBusy(true);
    try {
      const next = multi ? [...ids] : [];
      for (const file of Array.from(files)) {
        const id = await uploadFile(file);
        if (id) next.push(id);
      }
      const defaultMaxWhenMulti = field.type === 'image_view' ? 8 : 12;
      const max = field.settings?.maxFiles ?? (multi ? defaultMaxWhenMulti : 1);
      const trimmed = next.slice(0, max);
      setKey(k, multi ? { file_object_ids: trimmed } : trimmed[0] || '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={outerClassName ?? `p-4 ${rowBg}`}>
      {!hideTitle && <div className="text-sm font-medium text-gray-600 mb-2">{field.label}</div>}
      <div className="flex items-center gap-2 mb-2 flex-wrap rounded-xl border-2 border-gray-200 bg-white px-3 py-2">
          <label className="block text-xs text-gray-600 flex-1 min-w-0 cursor-pointer">
            <input
              type="file"
              disabled={disabled || busy || !projectId}
              accept={field.type === 'image_view' ? 'image/*' : 'application/pdf'}
              multiple={multi}
              className="text-sm max-w-full file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
              onChange={(e) => void addFiles(e.target.files)}
            />
          </label>
          {trailingSlot ? <div className="shrink-0">{trailingSlot}</div> : null}
        </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {ids.map((id) => (
          <div key={id} className="relative">
            {field.type === 'image_view' ? (
              <img
                src={withFileAccessToken(`/files/${encodeURIComponent(id)}/thumbnail?w=240`)}
                alt=""
                className="h-20 w-20 object-cover rounded-xl border-2 border-gray-200"
              />
            ) : (
              <a
                href={withFileAccessToken(`/files/${encodeURIComponent(id)}`)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 underline"
              >
                PDF
              </a>
            )}
            {!disabled && (
              <button
                type="button"
                className="absolute -top-1 -right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs"
                onClick={() => {
                  const n = ids.filter((x) => x !== id);
                  setKey(k, multi ? { file_object_ids: n } : '');
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {!projectId && <p className="text-xs text-amber-700 mt-1">Open from a project to upload files.</p>}
    </div>
  );
}
