import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, withFileAccessToken } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppFileUpload,
  AppFormModal,
  AppInput,
  AppListRowIconButton,
  AppModal,
  AppSectionHeader,
  AppSelect,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  appSectionPresetProps,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const WO_FILE_CATEGORIES = [
  { id: 'all', label: 'All Files' },
  { id: 'orcamentos', label: 'Quotes' },
  { id: 'photos', label: 'Photos' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'outros', label: 'Other' },
] as const;

const FILES_GRID_COLS = 'grid-cols-[56px_minmax(0,1fr)_5.5rem_7rem_auto]';

type WorkOrderFileItem = {
  id: string;
  file_object_id: string;
  category: string;
  original_name: string | null;
  uploaded_at: string | null;
  content_type: string | null;
  is_image: boolean;
  is_legacy?: boolean;
};

type Props = {
  workOrderId: string;
};

export function WorkOrderFilesTab({ workOrderId }: Props) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [uploadCategory, setUploadCategory] = useState<string>('outros');
  const [isDragging, setIsDragging] = useState(false);
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<
    Array<{
      id: string;
      file: File;
      progress: number;
      status: 'pending' | 'uploading' | 'success' | 'error';
      error?: string;
    }>
  >([]);
  const [sortBy, setSortBy] = useState<'uploaded_at' | 'name' | 'type'>('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ url: string; name: string } | null>(null);
  const [previewExcel, setPreviewExcel] = useState<{ url: string; name: string } | null>(null);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['workOrderFiles', workOrderId],
    queryFn: () => api<WorkOrderFileItem[]>('GET', `/fleet/work-orders/${workOrderId}/files`),
    enabled: !!workOrderId,
  });

  const filesByCategory = useMemo(() => {
    const grouped: Record<string, WorkOrderFileItem[]> = { all: [] };
    WO_FILE_CATEGORIES.forEach((c) => {
      if (c.id !== 'all') grouped[c.id] = [];
    });
    files.forEach((f) => {
      const cat = f.category || 'outros';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(f);
      grouped.all.push(f);
    });
    return grouped;
  }, [files]);

  const getFileTypeLabel = (f: WorkOrderFileItem): string => {
    const name = String(f.original_name || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type || '').toLowerCase();
    if (f.is_image || ct.startsWith('image/')) return 'Image';
    if (ct.includes('pdf') || ext === 'pdf') return 'PDF';
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return 'Excel';
    if (['doc', 'docx'].includes(ext) || ct.includes('word')) return 'Word';
    return ext.toUpperCase() || 'File';
  };

  const currentFiles = useMemo(() => {
    let list = filesByCategory[selectedCategory] || [];
    const q = fileSearchQuery.trim().toLowerCase();
    if (q) list = list.filter((f) => (f.original_name || f.file_object_id || '').toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      if (sortBy === 'uploaded_at') {
        aVal = a.uploaded_at || '';
        bVal = b.uploaded_at || '';
      } else if (sortBy === 'name') {
        aVal = (a.original_name || a.file_object_id || '').toLowerCase();
        bVal = (b.original_name || b.file_object_id || '').toLowerCase();
      } else {
        aVal = getFileTypeLabel(a).toLowerCase();
        bVal = getFileTypeLabel(b).toLowerCase();
      }
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filesByCategory, selectedCategory, fileSearchQuery, sortBy, sortOrder]);

  const handleSort = (column: 'uploaded_at' | 'name' | 'type') => {
    if (sortBy === column) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const iconFor = (f: WorkOrderFileItem) => {
    const name = String(f.original_name || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type || '').toLowerCase();
    const is = (x: string) => ct.includes(x) || ext === x;
    if (is('pdf')) return { label: 'PDF', color: 'bg-red-500' };
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet'))
      return { label: 'XLS', color: 'bg-green-600' };
    if (['doc', 'docx'].includes(ext) || ct.includes('word')) return { label: 'DOC', color: 'bg-blue-600' };
    if (f.is_image || ct.startsWith('image/')) return { label: 'IMG', color: 'bg-purple-500' };
    return { label: (ext || 'FILE').toUpperCase().slice(0, 4), color: 'bg-gray-600' };
  };

  const getFileType = (f: WorkOrderFileItem): 'image' | 'pdf' | 'excel' | 'other' => {
    const name = String(f.original_name || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type || '').toLowerCase();
    const is = (x: string) => ct.includes(x) || ext === x;
    if (f.is_image || ct.startsWith('image/')) return 'image';
    if (is('pdf')) return 'pdf';
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return 'excel';
    return 'other';
  };

  const handleFilePreview = async (f: WorkOrderFileItem) => {
    const fileType = getFileType(f);
    const name = f.original_name || f.file_object_id || 'File';
    try {
      const r: any = await api('GET', withFileAccessToken(`/files/${f.file_object_id}/preview`));
      const url = String(r.preview_url || r.download_url || '');
      if (!url) {
        toast.error('Preview not available');
        return;
      }
      if (fileType === 'image') setPreviewImage({ url, name });
      else if (fileType === 'pdf') setPreviewPdf({ url, name });
      else if (fileType === 'excel') setPreviewExcel({ url, name });
      else window.open(url, '_blank');
    } catch {
      toast.error('Preview not available');
    }
  };

  const uploadFileToBlob = async (file: File): Promise<string> => {
    const type = file.type || 'application/octet-stream';
    const up: any = await api('POST', '/files/upload', {
      original_name: file.name,
      content_type: type,
      employee_id: null,
      project_id: null,
      client_id: null,
      category_id: 'work-order-files',
    });
    await fetch(up.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': type, 'x-ms-blob-type': 'BlockBlob' },
      body: file,
    });
    const conf: any = await api('POST', '/files/confirm', {
      key: up.key,
      size_bytes: file.size,
      checksum_sha256: 'na',
      content_type: type,
    });
    return conf.id;
  };

  const uploadMultiple = async (fileList: File[], targetCategory?: string) => {
    const category =
      targetCategory !== undefined ? targetCategory : selectedCategory === 'all' ? uploadCategory : selectedCategory;
    const newQueue = Array.from(fileList).map((file, idx) => ({
      id: `${Date.now()}-${idx}`,
      file,
      progress: 0,
      status: 'pending' as const,
    }));
    setUploadQueue((prev) => [...prev, ...newQueue]);

    for (const item of newQueue) {
      try {
        setUploadQueue((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'uploading' } : u)));
        const fileObjectId = await uploadFileToBlob(item.file);
        const params = new URLSearchParams({ file_object_id: fileObjectId, category });
        params.set('original_name', item.file.name);
        await api('POST', `/fleet/work-orders/${workOrderId}/files?${params}`);
        setUploadQueue((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'success', progress: 100 } : u)));
      } catch (e: any) {
        setUploadQueue((prev) =>
          prev.map((u) => (u.id === item.id ? { ...u, status: 'error', error: e?.message || 'Upload failed' } : u)),
        );
      }
    }
    queryClient.invalidateQueries({ queryKey: ['workOrderFiles', workOrderId] });
    queryClient.invalidateQueries({ queryKey: ['workOrderActivity', workOrderId] });
    setTimeout(() => setUploadQueue((prev) => prev.filter((u) => !newQueue.find((nq) => nq.id === u.id))), 2000);
  };

  const deleteMutation = useMutation({
    mutationFn: async (item: WorkOrderFileItem) => {
      if (item.is_legacy && item.id.startsWith('legacy-')) {
        return api(
          'DELETE',
          `/fleet/work-orders/${workOrderId}/files/legacy/${item.file_object_id}?category=${encodeURIComponent(item.category)}`,
        );
      }
      return api('DELETE', `/fleet/work-orders/${workOrderId}/files/${item.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrderFiles', workOrderId] });
      queryClient.invalidateQueries({ queryKey: ['workOrderActivity', workOrderId] });
      toast.success('File removed');
    },
    onError: () => toast.error('Failed to remove file'),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ fileId, category }: { fileId: string; category: string }) => {
      return api('PUT', `/fleet/work-orders/${workOrderId}/files/${fileId}?category=${encodeURIComponent(category)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrderFiles', workOrderId] });
      toast.success('File moved');
    },
    onError: () => toast.error('Failed to move file'),
  });

  const handleMoveFile = (item: WorkOrderFileItem, newCategory: string) => {
    if (item.is_legacy) {
      toast.error('Legacy files cannot be moved. Remove and re-upload into the desired category.');
      return;
    }
    updateCategoryMutation.mutate({ fileId: item.id, category: newCategory });
  };

  const handleDeleteFile = async (f: WorkOrderFileItem) => {
    const ok = await confirm({
      title: 'Remove file',
      message: 'Remove this file?',
    });
    if (ok) deleteMutation.mutate(f);
  };

  const fetchDownloadUrl = async (fid: string) => {
    try {
      const r: any = await api('GET', withFileAccessToken(`/files/${fid}/download`));
      return String(r.download_url || '');
    } catch {
      toast.error('Download link unavailable');
      return '';
    }
  };

  const onDropRight = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      const category = selectedCategory === 'all' ? uploadCategory : selectedCategory;
      await uploadMultiple(Array.from(e.dataTransfer.files), category);
      return;
    }
    if (draggedFileId && selectedCategory !== 'all') {
      const item = files.find((f) => f.id === draggedFileId);
      if (item) handleMoveFile(item, selectedCategory);
      setDraggedFileId(null);
    }
  };

  const onDropCategory = async (e: React.DragEvent, categoryId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      await uploadMultiple(Array.from(e.dataTransfer.files), categoryId);
      return;
    }
    if (draggedFileId && categoryId !== 'all') {
      const item = files.find((f) => f.id === draggedFileId);
      if (item) handleMoveFile(item, categoryId);
      setDraggedFileId(null);
    }
  };

  const uploadCategoryOptions = WO_FILE_CATEGORIES.filter((c) => c.id !== 'all').map((c) => ({
    value: c.id,
    label: c.label,
  }));

  const selectedCategoryLabel = WO_FILE_CATEGORIES.find((c) => c.id === selectedCategory)?.label ?? selectedCategory;

  return (
    <>
      <div className={uiSpacing.sectionStack}>
        <AppCard className="min-w-0" bodyClassName="!p-0">
          <div className={uiSpacing.cardPadding}>
            <AppSectionHeader
              title="Files"
              description="Quotes, photos, invoices, and other attachments for this work order."
              {...appSectionPresetProps('files')}
              action={
                <AppButton type="button" size="sm" onClick={() => setShowUpload(true)}>
                  Upload file
                </AppButton>
              }
            />
          </div>

          {isLoading ? (
            <div className={uiCx(uiTypography.helper, 'border-t border-gray-100 px-4 py-8 text-center')}>
              Loading files…
            </div>
          ) : (
            <div className={uiCx('border-t', uiBorders.subtle)}>
              <div className="flex min-h-[400px] min-w-0">
                <aside
                  className={uiCx(
                    'flex w-64 shrink-0 flex-col border-r',
                    uiBorders.subtle,
                    uiColors.surfaceSubtle,
                  )}
                >
                  <div className={uiCx('border-b px-3 py-2.5', uiBorders.subtle)}>
                    <p className={uiTypography.overline}>File categories</p>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {WO_FILE_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDragging(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          setIsDragging(false);
                        }}
                        onDrop={(e) => cat.id !== 'all' && onDropCategory(e, cat.id)}
                        className={uiCx(
                          'w-full border-b text-left transition-colors',
                          uiBorders.subtle,
                          uiTypography.helper,
                          'px-3 py-2 hover:bg-white',
                          selectedCategory === cat.id &&
                            'border-l-4 border-l-brand-red bg-white font-semibold text-gray-900',
                          isDragging && cat.id !== 'all' && 'bg-blue-50',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="truncate">{cat.label}</span>
                          <span className={uiCx(uiTypography.helper, 'ml-auto shrink-0 text-gray-500')}>
                            ({filesByCategory[cat.id]?.length ?? 0})
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </aside>

                <div
                  className={uiCx(
                    'min-w-0 flex-1 overflow-y-auto p-4',
                    isDragging && 'border-2 border-dashed border-blue-400 bg-blue-50/50',
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={onDropRight}
                >
                  <div className={uiCx(uiLayout.actionsRow, 'mb-3 flex-wrap items-center justify-between gap-3')}>
                    <div className={uiCx(uiLayout.actionsRow, 'min-w-0 flex-1 flex-wrap gap-3')}>
                      <div className="max-w-sm min-w-0 flex-1">
                        <AppInput
                          value={fileSearchQuery}
                          onChange={(e) => setFileSearchQuery(e.target.value)}
                          placeholder="Search by file name..."
                          leftIcon={<Search className="h-4 w-4" />}
                          aria-label="Search files"
                        />
                      </div>
                      <p className={uiCx(uiTypography.helper, 'shrink-0 font-semibold text-gray-800')}>
                        {selectedCategoryLabel}
                        <span className="ml-1 font-normal text-gray-500">({currentFiles.length})</span>
                      </p>
                    </div>
                    {selectedCategory === 'all' && (
                      <AppSelect
                        value={uploadCategory}
                        onChange={(e) => setUploadCategory(e.target.value)}
                        options={uploadCategoryOptions}
                        aria-label="Upload category"
                      />
                    )}
                  </div>

                  {currentFiles.length > 0 ? (
                    <AppSortableEntityList layout="flat" className={uiCx(uiRadius.card, uiBorders.subtle, 'overflow-hidden')}>
                      <AppSortableEntityListHeader variant="flat" gridCols={FILES_GRID_COLS} minWidth="min-w-0">
                        <div className="min-w-0" aria-hidden />
                        <AppSortableEntityListSortColumn
                          label="Name"
                          column="name"
                          sortBy={sortBy}
                          sortDir={sortOrder}
                          onSort={handleSort}
                        />
                        <AppSortableEntityListSortColumn
                          label="Type"
                          column="type"
                          sortBy={sortBy}
                          sortDir={sortOrder}
                          onSort={handleSort}
                        />
                        <AppSortableEntityListSortColumn
                          label="Upload date"
                          column="uploaded_at"
                          sortBy={sortBy}
                          sortDir={sortOrder}
                          onSort={handleSort}
                        />
                        <div className="min-w-0 w-24" aria-hidden />
                      </AppSortableEntityListHeader>
                      <AppSortableEntityListFlatBody gridCols={FILES_GRID_COLS} minWidth="min-w-0">
                        {currentFiles.map((f) => {
                          const icon = iconFor(f);
                          const isImg = f.is_image || String(f.content_type || '').startsWith('image/');
                          const name = f.original_name || f.file_object_id || 'File';
                          return (
                            <AppSortableEntityListRow
                              key={f.id}
                              as="div"
                              variant="flat"
                              gridCols={FILES_GRID_COLS}
                              minWidth="min-w-0"
                              className="cursor-move"
                              draggable
                              onDragStart={() => setDraggedFileId(f.id)}
                              onDragEnd={() => setDraggedFileId(null)}
                            >
                              <div className="flex justify-center">
                                {isImg ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleFilePreview(f)}
                                    className={uiCx(
                                      'block h-10 w-10 overflow-hidden ring-offset-2 hover:ring-2 hover:ring-brand-red/40 focus:outline-none focus:ring-2 focus:ring-brand-red',
                                      uiRadius.control,
                                      uiColors.surfaceSubtle,
                                    )}
                                  >
                                    <img
                                      src={withFileAccessToken(`/files/${f.file_object_id}/thumbnail?w=64`)}
                                      alt={name}
                                      className="h-full w-full object-cover"
                                    />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void handleFilePreview(f)}
                                    className={uiCx(
                                      'flex h-10 w-8 items-center justify-center text-[10px] font-extrabold text-white hover:opacity-90',
                                      uiRadius.control,
                                      icon.color,
                                    )}
                                  >
                                    {icon.label}
                                  </button>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleFilePreview(f)}
                                className={uiCx(
                                  'min-w-0 truncate text-left text-sm font-bold text-gray-900 hover:text-brand-red hover:underline',
                                )}
                              >
                                {name}
                              </button>
                              <span className={uiCx(uiTypography.helper, 'text-gray-600')}>{getFileTypeLabel(f)}</span>
                              <span className={uiCx(uiTypography.helper, 'text-gray-600')}>
                                {f.uploaded_at ? new Date(f.uploaded_at).toLocaleDateString() : '—'}
                              </span>
                              <div className="flex w-24 shrink-0 items-center justify-end gap-1.5">
                                <AppListRowIconButton
                                  icon="⬇️"
                                  label="Download"
                                  onClick={async () => {
                                    const url = await fetchDownloadUrl(f.file_object_id);
                                    if (url) window.open(url, '_blank');
                                  }}
                                />
                                <AppListRowIconButton
                                  preset="delete"
                                  label="Delete"
                                  loading={deleteMutation.isPending}
                                  onClick={() => void handleDeleteFile(f)}
                                />
                              </div>
                            </AppSortableEntityListRow>
                          );
                        })}
                      </AppSortableEntityListFlatBody>
                    </AppSortableEntityList>
                  ) : (
                    <AppEmptyState
                      title="No files in this category"
                      description='Drag and drop files here or click "Upload file".'
                      className="border-0 bg-transparent p-0 py-6 shadow-none"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </AppCard>
      </div>

      <AppFormModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        title="Upload files"
        description="Pick one or more files. You can also drag and drop onto a category or the file area on this page."
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setShowUpload(false)}>
              Close
            </AppButton>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          {selectedCategory === 'all' && (
            <AppSelect
              label="Category"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              options={uploadCategoryOptions}
            />
          )}
          <AppFileUpload
            mode="multiple"
            value={[]}
            onChange={() => {}}
            onFilesSelected={async (added) => {
              if (added.length > 0) {
                setShowUpload(false);
                await uploadMultiple(added);
              }
            }}
            fieldHint="Files\n\nMultiple files supported. Drag onto the list or a category to upload without opening this dialog."
          />
        </div>
      </AppFormModal>

      {uploadQueue.length > 0 && (
        <AppCard
          className={uiCx('fixed bottom-4 right-4 z-50 w-80 max-h-96 overflow-hidden', uiShadows.elevated)}
          bodyClassName="!p-0"
        >
          <div className={uiCx(uiLayout.actionsRow, 'justify-between border-b px-3 py-2', uiBorders.subtle, uiColors.surfaceSubtle)}>
            <span className={uiTypography.sectionTitle}>Upload progress</span>
            <AppButton type="button" variant="ghost" size="sm" onClick={() => setUploadQueue([])}>
              Clear
            </AppButton>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {uploadQueue.map((u) => (
              <div key={u.id} className={uiCx('border-b px-3 py-2 last:border-0', uiBorders.subtle)}>
                <div className={uiCx(uiTypography.helper, 'truncate font-medium text-gray-900')} title={u.file.name}>
                  {u.file.name}
                </div>
                <div className={uiTypography.helper}>
                  {u.status === 'pending' && 'Waiting…'}
                  {u.status === 'uploading' && 'Uploading…'}
                  {u.status === 'success' && 'Done'}
                  {u.status === 'error' && (u.error || 'Error')}
                </div>
              </div>
            ))}
          </div>
        </AppCard>
      )}

      <AppModal
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
        title={previewImage?.name}
        size="lg"
        dialogClassName="!max-w-[95vw] !max-h-[95vh]"
        bodyClassName="!p-3 min-h-[50vh] flex items-center justify-center"
        bodyFill={false}
      >
        {previewImage ? (
          <img src={previewImage.url} alt={previewImage.name} className="max-h-[70vh] max-w-full object-contain" />
        ) : null}
      </AppModal>

      <AppModal
        open={!!previewPdf}
        onClose={() => setPreviewPdf(null)}
        title={previewPdf?.name}
        size="lg"
        dialogClassName="!max-w-[95vw] !max-h-[95vh]"
        bodyClassName="!p-0 min-h-[70vh]"
        bodyFill={false}
      >
        {previewPdf ? <iframe src={previewPdf.url} className="h-[70vh] w-full border-0" title={previewPdf.name} /> : null}
      </AppModal>

      <AppModal
        open={!!previewExcel}
        onClose={() => setPreviewExcel(null)}
        title={previewExcel?.name}
        size="lg"
        dialogClassName="!max-w-[95vw] !max-h-[95vh]"
        bodyClassName="!p-0 min-h-[70vh]"
        bodyFill={false}
      >
        {previewExcel ? (
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewExcel.url)}`}
            className="h-[70vh] w-full border-0"
            title={previewExcel.name}
            allow="fullscreen"
          />
        ) : null}
      </AppModal>
    </>
  );
}
