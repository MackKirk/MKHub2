import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { api, withFileAccessToken } from '@/lib/api';
import { putFile } from '@/lib/fileUploadBatch';
import { FilePdfPreviewModal } from '@/components/files/FilePdfPreviewModal';
import { Trash2 } from 'lucide-react';
import { AppButton } from '@/components/ui';

export type SectionInvoiceLink = {
  file_object_id: string;
  name: string;
};

const PURCHASING_CATEGORY = 'purchasing';

type InvoicePreview = { url: string; name: string; fileObjectId?: string };

const SectionInvoicePreviewContext = createContext<((invoice: SectionInvoiceLink) => void) | null>(null);

export function EstimateSectionInvoicePreviewHost({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<InvoicePreview | null>(null);

  const openInvoice = async (invoice: SectionInvoiceLink) => {
    try {
      const r: { preview_url?: string; download_url?: string } = await api(
        'GET',
        withFileAccessToken(`/files/${invoice.file_object_id}/preview`),
      );
      const url = String(r.preview_url || r.download_url || '');
      if (!url) {
        toast.error('Preview not available');
        return;
      }
      setPreview({ url, name: invoice.name, fileObjectId: invoice.file_object_id });
    } catch {
      toast.error('Could not open invoice');
    }
  };

  return (
    <SectionInvoicePreviewContext.Provider value={openInvoice}>
      {children}
      <FilePdfPreviewModal
        open={!!preview}
        url={preview?.url}
        name={preview?.name}
        fileObjectId={preview?.fileObjectId}
        onClose={() => setPreview(null)}
      />
    </SectionInvoicePreviewContext.Provider>
  );
}

function useOpenSectionInvoice() {
  const openInvoice = useContext(SectionInvoicePreviewContext);
  return openInvoice ?? (async () => {
    toast.error('Could not open invoice');
  });
}

export function EstimateSectionInvoiceNames({
  invoices,
  className,
}: {
  invoices: SectionInvoiceLink[];
  className?: string;
}) {
  const openInvoice = useOpenSectionInvoice();
  if (!invoices.length) return null;
  return (
    <div className={className ? `flex min-w-0 flex-col ${className}` : 'flex min-w-0 flex-col'}>
      {invoices.map((invoice) => (
        <button
          key={invoice.file_object_id}
          type="button"
          title={invoice.name}
          className="max-w-full truncate text-left text-sm leading-5 text-brand-red hover:underline"
          onClick={(event) => {
            event.stopPropagation();
            void openInvoice(invoice);
          }}
        >
          {invoice.name}
        </button>
      ))}
    </div>
  );
}

export function normalizeSectionInvoices(raw: unknown): Record<string, SectionInvoiceLink[]> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, SectionInvoiceLink[]> = {};
  for (const [sectionId, items] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(items)) continue;
    const cleaned: SectionInvoiceLink[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const fileId = String((item as { file_object_id?: unknown }).file_object_id || '').trim();
      if (!fileId || seen.has(fileId)) continue;
      seen.add(fileId);
      const name = String((item as { name?: unknown }).name || 'Invoice.pdf').trim() || 'Invoice.pdf';
      cleaned.push({ file_object_id: fileId, name });
    }
    if (cleaned.length) out[sectionId] = cleaned;
  }
  return out;
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

async function uploadPurchasingPdf(
  projectId: string,
  clientId: string | null,
  file: File,
): Promise<SectionInvoiceLink> {
  const contentType = 'application/pdf';
  const up: { upload_url: string; key: string } = await api('POST', '/files/upload', {
    project_id: projectId,
    client_id: clientId,
    employee_id: null,
    category_id: 'project-files',
    original_name: file.name,
    content_type: contentType,
  });
  await putFile(up.upload_url, file, contentType);
  const conf: { id: string } = await api('POST', '/files/confirm', {
    key: up.key,
    size_bytes: file.size,
    checksum_sha256: 'na',
    content_type: contentType,
  });
  const params = new URLSearchParams({
    file_object_id: conf.id,
    category: PURCHASING_CATEGORY,
    original_name: file.name,
  });
  await api('POST', `/projects/${projectId}/files?${params.toString()}`);
  return { file_object_id: String(conf.id), name: file.name };
}

export function EstimateSectionInvoices({
  projectId,
  clientId,
  invoices,
  canAttach,
  onChange,
  onInvoicesAdded,
  onFindProducts,
  showFindProducts = false,
}: {
  projectId: string;
  clientId: string | null;
  invoices: SectionInvoiceLink[];
  canAttach: boolean;
  onChange: (next: SectionInvoiceLink[]) => void;
  onInvoicesAdded?: (added: SectionInvoiceLink[]) => void;
  onFindProducts?: (invoice: SectionInvoiceLink) => void;
  showFindProducts?: boolean;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const openInvoice = useOpenSectionInvoice();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  if (!canAttach && invoices.length === 0) return null;

  const removeInvoice = async (invoice: SectionInvoiceLink) => {
    const ok = await confirm({
      title: 'Remove invoice',
      message: `Remove "${invoice.name}" from this section? The PDF stays in Files, Purchasing.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
    });
    if (ok !== 'confirm') return;
    onChange(invoices.filter((row) => row.file_object_id !== invoice.file_object_id));
  };

  const addFiles = async (list: FileList | null) => {
    const files = Array.from(list || []);
    if (!files.length) return;
    const pdfs = files.filter(isPdf);
    if (pdfs.length !== files.length) {
      toast.error('Only PDF invoices can be attached');
    }
    if (!pdfs.length) return;
    setUploading(true);
    const added: SectionInvoiceLink[] = [];
    try {
      for (const file of pdfs) {
        added.push(await uploadPurchasingPdf(projectId, clientId, file));
      }
      const seen = new Set(invoices.map((invoice) => invoice.file_object_id));
      const next = [...invoices];
      for (const invoice of added) {
        if (seen.has(invoice.file_object_id)) continue;
        seen.add(invoice.file_object_id);
        next.push(invoice);
      }
      onChange(next);
      onInvoicesAdded?.(added);
      await queryClient.invalidateQueries({ queryKey: ['projectFiles', projectId] });
      toast.success(added.length === 1 ? 'Invoice added' : `${added.length} invoices added`);
    } catch {
      if (added.length) {
        onChange([...invoices, ...added]);
        onInvoicesAdded?.(added);
        toast.error('Some invoices could not be uploaded');
      } else {
        toast.error('Could not upload invoice');
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div ref={rootRef} className="relative self-end">
      <AppButton
        type="button"
        variant="primary"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        Invoice{invoices.length > 0 ? ` (${invoices.length})` : ''}
      </AppButton>
      {open ? (
        <div
          className={
            dragOver
              ? 'absolute right-0 top-full z-30 mt-1 w-96 rounded-lg border-2 border-dashed border-brand-red bg-red-50 p-3 shadow-lg'
              : 'absolute right-0 top-full z-30 mt-1 w-96 rounded-lg border border-gray-200 bg-white p-3 shadow-lg'
          }
          onClick={(event) => event.stopPropagation()}
          onDragEnter={(event) => {
            if (!canAttach || uploading) return;
            event.preventDefault();
            event.stopPropagation();
            setDragOver(true);
          }}
          onDragOver={(event) => {
            if (!canAttach || uploading) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDragOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragOver(false);
            if (!canAttach || uploading) return;
            void addFiles(event.dataTransfer.files);
          }}
        >
          <div className="mb-2 text-sm font-semibold text-gray-900">
            Invoices{invoices.length > 0 ? ` (${invoices.length})` : ''}
          </div>
          {invoices.length === 0 ? (
            <p className="mb-2 text-sm text-gray-500">No invoices attached.</p>
          ) : (
            <ul className="mb-2 max-h-56 space-y-1 overflow-y-auto">
              {invoices.map((invoice) => (
                <li key={invoice.file_object_id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-gray-50">
                  <button
                    type="button"
                    title={invoice.name}
                    className="min-w-0 flex-1 truncate text-left text-sm text-brand-red hover:underline"
                    onClick={() => void openInvoice(invoice)}
                  >
                    {invoice.name}
                  </button>
                  {showFindProducts && onFindProducts ? (
                    <AppButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-xs"
                      onClick={() => {
                        setOpen(false);
                        onFindProducts(invoice);
                      }}
                    >
                      Find products
                    </AppButton>
                  ) : null}
                  {canAttach ? (
                    <button
                      type="button"
                      title="Remove"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-red-50 hover:text-red-600"
                          onClick={() => void removeInvoice(invoice)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canAttach ? (
            <div className="border-t border-gray-200 pt-2">
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(event) => void addFiles(event.target.files)}
              />
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                className="w-full"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? 'Uploading…' : 'Add invoice'}
              </AppButton>
              <p className="mt-2 text-xs text-gray-500">
                {dragOver ? 'Drop PDF invoices here.' : 'PDF only. Saved in Files, Purchasing.'}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
