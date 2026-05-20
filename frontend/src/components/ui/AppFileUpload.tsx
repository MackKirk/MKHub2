import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Paperclip, X } from 'lucide-react';
import OverlayPortal from '@/components/OverlayPortal';
import { AppControlLabelRow } from './AppControlLabel';
import { AppFieldHint } from './AppFieldHint';
import { uiBorders, uiColors, uiCx, uiRadius, uiSpacing, uiTypography } from './tokens';

const DEFAULT_ACCEPT_FILES = 'image/*,.pdf,.doc,.docx';
const DEFAULT_ACCEPT_IMAGES = 'image/*';

function isValidFile(file: File, accept: string): boolean {
  const accepts = accept.split(',').map((a) => a.trim().toLowerCase());
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  for (const a of accepts) {
    if (a === '*') return true;
    if (a.endsWith('/*')) {
      const prefix = a.slice(0, -1);
      if (type.startsWith(prefix)) return true;
    }
    if (type === a) return true;
    if (a.startsWith('.') && name.endsWith(a)) return true;
  }
  return false;
}

function ImagePreviewOverlay({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Image preview"
      >
        <img
          src={url}
          alt={alt}
          className="max-h-[90vh] max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          onClick={onClose}
          className={uiCx(
            'absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center bg-white/90 text-gray-800 shadow-lg transition-colors hover:bg-white',
            uiRadius.badge,
          )}
          aria-label="Close preview"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </OverlayPortal>
  );
}

type AppFileUploadBaseProps = {
  accept?: string;
  label?: ReactNode;
  fieldHint?: ReactNode;
  helperText?: ReactNode;
  disabled?: boolean;
  className?: string;
  /** Fired with only the newly added file(s) (drop, pick, or paste). Useful for immediate upload flows. */
  onFilesSelected?: (added: File[]) => void | Promise<void>;
};

export type AppFileUploadSingleProps = AppFileUploadBaseProps & {
  mode?: 'single';
  value: File | null;
  onChange: (file: File | null) => void;
};

export type AppFileUploadMultipleProps = AppFileUploadBaseProps & {
  mode: 'multiple';
  value: File[];
  onChange: (files: File[]) => void;
};

export type AppFileUploadProps = AppFileUploadSingleProps | AppFileUploadMultipleProps;

function FilePreviewCard({
  file,
  previewUrl,
  onRemove,
  disabled,
}: {
  file: File;
  previewUrl: string | null;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);

  return (
    <div className={uiCx(uiRadius.card, uiBorders.subtle, 'overflow-hidden', uiColors.surfaceSubtle)}>
      {previewUrl ? (
        <button
          type="button"
          className="block w-full"
          onClick={() => setViewerOpen(true)}
          disabled={disabled}
        >
          <img src={previewUrl} alt={file.name} className="h-32 w-full cursor-pointer object-cover hover:opacity-90" />
        </button>
      ) : (
        <div className={uiCx('flex h-32 items-center justify-center gap-2 px-2', uiTypography.helper)}>
          <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{file.name}</span>
        </div>
      )}
      <div className={uiCx('flex items-center justify-between gap-2 border-t border-gray-100 bg-white', uiSpacing.compactCardPadding)}>
        <span className={uiCx(uiTypography.helper, 'min-w-0 truncate')} title={file.name}>
          {file.name}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className={uiCx(uiTypography.helper, 'shrink-0 font-medium text-brand-red hover:text-brand-red/80 disabled:opacity-50')}
        >
          Remove
        </button>
      </div>
      {viewerOpen && previewUrl ? (
        <ImagePreviewOverlay url={previewUrl} alt={file.name} onClose={() => setViewerOpen(false)} />
      ) : null}
    </div>
  );
}

export function AppFileUpload(props: AppFileUploadProps) {
  const {
    accept = props.mode === 'multiple' ? DEFAULT_ACCEPT_IMAGES : DEFAULT_ACCEPT_FILES,
    label = props.mode === 'multiple'
      ? 'Attachments (optional – multiple allowed)'
      : 'Attachment (optional)',
    fieldHint,
    helperText,
    disabled = false,
    className,
    onFilesSelected,
  } = props;

  const isMultiple = props.mode === 'multiple';
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const files = isMultiple ? props.value : props.value ? [props.value] : [];

  const setFiles = useCallback(
    (next: File[]) => {
      if (isMultiple) {
        (props as AppFileUploadMultipleProps).onChange(next);
      } else {
        (props as AppFileUploadSingleProps).onChange(next[0] ?? null);
      }
    },
    [isMultiple, props],
  );

  const addFiles = useCallback(
    async (incoming: File[]) => {
      if (!incoming.length || disabled) return;
      if (onFilesSelected) {
        await onFilesSelected(incoming);
      }
      if (isMultiple) {
        setFiles([...(props as AppFileUploadMultipleProps).value, ...incoming]);
      } else {
        setFiles([incoming[0]]);
      }
    },
    [disabled, isMultiple, onFilesSelected, props, setFiles],
  );

  const processFileList = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;
      const valid = Array.from(fileList).filter((f) => isValidFile(f, accept));
      if (!valid.length) return;
      void addFiles(isMultiple ? valid : [valid[0]]);
    },
    [accept, addFiles, isMultiple],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (disabled) return;
      processFileList(e.dataTransfer?.files ?? null);
    },
    [disabled, processFileList],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragging(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      if (disabled) return;
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      const toAdd: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f && isValidFile(f, accept)) toAdd.push(f);
        }
      }
      if (toAdd.length) {
        e.preventDefault();
        void addFiles(isMultiple ? toAdd : [toAdd[0]]);
      }
    },
    [accept, addFiles, disabled, isMultiple],
  );

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const previewUrls = useMemo(
    () => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)),
    [files],
  );
  useEffect(() => () => previewUrls.forEach((u) => u && URL.revokeObjectURL(u)), [previewUrls]);

  const removeAt = (index: number) => {
    if (isMultiple) {
      const next = (props as AppFileUploadMultipleProps).value.filter((_, i) => i !== index);
      setFiles(next);
    } else {
      setFiles([]);
    }
  };

  const dropZoneClass = uiCx(
    'w-full cursor-pointer text-center transition-colors',
    uiBorders.createDashed,
    uiRadius.control,
    uiSpacing.cardPadding,
    'py-6',
    disabled && 'cursor-not-allowed opacity-60',
    isDragging ? 'border-brand-red bg-red-50' : 'hover:border-brand-red hover:bg-gray-50',
  );

  return (
    <div className={uiCx('space-y-1.5', className)}>
      {label ? (
        <AppControlLabelRow label={label} fieldHint={fieldHint ? <AppFieldHint hint={fieldHint} /> : undefined} />
      ) : null}

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        className={dropZoneClass}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <p className={uiTypography.body}>
          {isMultiple ? 'Drag files here or click to select' : 'Drag a file here or click to select'}
        </p>
        <p className={uiCx(uiTypography.helper, 'mt-1')}>You can also paste with Ctrl+V</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          multiple={isMultiple}
          disabled={disabled}
          onChange={(e) => processFileList(e.target.files)}
        />
      </div>

      {helperText ? <p className={uiTypography.helper}>{helperText}</p> : null}

      {files.length > 0 && (
        <div className={uiCx('grid grid-cols-2 gap-3 md:grid-cols-3', isMultiple ? '' : 'max-w-sm')}>
          {files.map((file, index) => (
            <FilePreviewCard
              key={`${file.name}-${file.size}-${index}`}
              file={file}
              previewUrl={previewUrls[index]}
              onRemove={() => removeAt(index)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
