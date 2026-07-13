import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import toast from 'react-hot-toast';
import { api, withFileAccessToken } from '@/lib/api';
import ImageEditor from '@/components/ImageEditor';
import OverlayPortal from '@/components/OverlayPortal';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  FileImagePreviewModal,
  FilePdfPreviewModal,
  FileOfficePreviewModal,
  FileListSelectionBar,
  FileMoveLocationModal,
  FileListDropHint,
  dropTargetClass,
  fileDropTargetProps,
  invalidateQueriesInBackground,
  leaveContainerDragLeave,
  patchFilesInQueryCache,
  restoreQueryCache,
  getDraggedFileIds,
  isInternalFileDrag,
  isExternalFileDrop,
  setDraggedFileIds,
  useFileDropTarget,
  useFileImageGallery,
  useFileListSelection,
  usePersistedFileViewMode,
  FileViewModeToolbar,
  FileImageGrid,
  FileGridNonImageList,
  partitionGridFiles,
  toGridFileFromClientLike,
  isFileGridImage,
} from '@/components/files';
import { libraryFilesMoveCategoryQuickInfo } from '@/lib/formModalQuickInfo';
import { AppCard, AppSectionHeader, appSectionPresetProps, AppCheckboxControl, AppListRowIconButton, uiCx, uiSpacing } from '@/components/ui';

export type ClientFileForFiles = { id: string; file_object_id: string; is_image?: boolean; content_type?: string; category?: string; original_name?: string; uploaded_at?: string; site_id?: string };

type ClientDeletedFile = ClientFileForFiles & { deleted_at?: string | null; deleted_by_id?: string | null };

export function SubcontractorCompanyFilesTabEnhanced({
  companyId,
  files,
  onRefresh,
  hasEditPermission,
}: {
  companyId: string;
  files: ClientFileForFiles[];
  onRefresh: () => any;
  hasEditPermission?: boolean;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const canEditFiles = !!hasEditPermission;
  /** Admin-only: Library vs soft-deleted company files (same pattern as project Files tab). */
  const [filesSection, setFilesSection] = useState<'active' | 'deleted'>('active');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const { viewMode, tileSize, setViewMode, setTileSize } = usePersistedFileViewMode('subcontractor-company-files-view', {
    category:
      selectedCategory === 'all' || selectedCategory === 'uncategorized' ? undefined : selectedCategory,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const fileSelection = useFileListSelection();
  const { dropTarget, clearDropTarget, makeDropHandlers, isDropActive } = useFileDropTarget();
  const [showUpload, setShowUpload] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<Array<{ id: string; file: File; progress: number; status: 'pending' | 'uploading' | 'success' | 'error'; error?: string }>>([]);
  const imageGallery = useFileImageGallery();
  const [previewPdf, setPreviewPdf] = useState<{ url: string; name: string } | null>(null);
  const [previewExcel, setPreviewExcel] = useState<{ url: string; name: string } | null>(null);
  const [editingImage, setEditingImage] = useState<{ fileObjectId: string; name: string } | null>(null);
  const [sortBy, setSortBy] = useState<'uploaded_at' | 'name' | 'type'>('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [editingFileNameId, setEditingFileNameId] = useState<string | null>(null);
  const [editingFileNameValue, setEditingFileNameValue] = useState('');
  const [moveLocationFileId, setMoveLocationFileId] = useState<string | null>(null);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');

  const { data: deletedFiles = [], refetch: refetchDeletedFiles } = useQuery({
    queryKey: ['subcontractorCompanyDeletedFiles', companyId],
    queryFn: () => api<ClientDeletedFile[]>('GET', `/subcontractors/companies/${encodeURIComponent(companyId)}/files/deleted`),
    enabled: !!companyId && isAdmin && filesSection === 'deleted',
  });

  useEffect(() => {
    if (!isAdmin && filesSection === 'deleted') setFilesSection('active');
  }, [isAdmin, filesSection]);

  const { data: categories } = useQuery({
    queryKey: ['file-categories'],
    queryFn: () => api<any[]>('GET', '/clients/file-categories'),
  });

  const visibleCategories = useMemo(() => {
    return (categories || []).filter((c: any) => String(c?.id || '') !== 'photos');
  }, [categories]);

  const filesByCategory = useMemo(() => {
    const grouped: Record<string, ClientFileForFiles[]> = { all: [], uncategorized: [] };
    files.forEach((f) => {
      const cat = f.category || 'uncategorized';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(f);
      grouped['all'].push(f);
    });
    return grouped;
  }, [files]);

  useEffect(() => {
    if (selectedCategory === 'all' || selectedCategory === 'uncategorized') return;
    if (!visibleCategories.find((c: any) => c.id === selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [selectedCategory, visibleCategories]);

  const getFileTypeLabel = (f: ClientFileForFiles): string => {
    const name = String(f.original_name || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type || '').toLowerCase();
    if (f.is_image || ct.startsWith('image/')) return 'Image';
    if (ct.includes('pdf') || ext === 'pdf') return 'PDF';
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return 'Excel';
    if (['doc', 'docx'].includes(ext) || ct.includes('word')) return 'Word';
    if (['ppt', 'pptx'].includes(ext) || ct.includes('powerpoint')) return 'PowerPoint';
    return ext.toUpperCase() || 'File';
  };

  const currentFiles = useMemo(() => {
    const list = filesByCategory[selectedCategory] || [];
    return [...list].sort((a, b) => {
      let aVal: any, bVal: any;
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
  }, [filesByCategory, selectedCategory, sortBy, sortOrder]);

  const visibleFileIds = useMemo(() => currentFiles.map((f) => f.id), [currentFiles]);
  const { allSelected: allVisibleSelected } = fileSelection.getSelectionState(visibleFileIds);
  const canSelectInCurrentView = canEditFiles && filesSection === 'active';

  const isImageFile = (f: ClientFileForFiles) => isFileGridImage(f);
  const { imageFiles: gridImageFiles, nonImageFiles: gridNonImageFiles } = useMemo(
    () => partitionGridFiles(currentFiles, isImageFile, (f) => toGridFileFromClientLike(f)),
    [currentFiles],
  );
  const showGridToggle =
    filesSection === 'active' &&
    (selectedCategory === 'pictures' || currentFiles.some(isImageFile));
  const clientFileById = useMemo(() => {
    const map = new Map<string, ClientFileForFiles>();
    currentFiles.forEach((f) => map.set(f.id, f));
    return map;
  }, [currentFiles]);

  useEffect(() => {
    fileSelection.clear();
  }, [selectedCategory, filesSection]);

  const startFileDrag = (e: DragEvent, fileId: string) => {
    if (!canEditFiles) return;
    setDraggedFileIds(e.dataTransfer, fileSelection.resolveDragIds(fileId));
    setIsDragging(true);
  };

  const endFileDrag = () => {
    setIsDragging(false);
    clearDropTarget();
  };

  const moveFilesToCategory = async (fileIds: string[], newCategory: string, label?: string) => {
    const unique = [...new Set(fileIds.filter(Boolean))];
    if (unique.length === 0 || !canEditFiles) return;
    const categoryValue = newCategory === 'uncategorized' ? null : newCategory;
    const filesQueryKey = ['subcontractor-company-files', companyId] as const;
    const snapshot = patchFilesInQueryCache(
      queryClient,
      filesQueryKey,
      unique,
      { category: categoryValue ?? undefined },
    );
    fileSelection.clear();
    const results = await Promise.allSettled(
      unique.map((fileId) =>
        api('PUT', `/subcontractors/companies/${companyId}/files/${fileId}`, { category: categoryValue }),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok === 0) {
      restoreQueryCache(queryClient, filesQueryKey, snapshot);
    } else {
      invalidateQueriesInBackground(queryClient, [
        filesQueryKey,
        ['subcontractor-company', companyId],
        ['subcontractor-company-activity', companyId],
      ]);
    }
    if (ok === unique.length) {
      toast.success(unique.length === 1 ? 'File moved' : `Moved ${ok} files${label ? ` to ${label}` : ''}`);
    } else {
      toast.error(`Moved ${ok} of ${unique.length} files`);
    }
  };

  const handleDropFileIds = async (e: DragEvent, action: (ids: string[]) => void | Promise<void>) => {
    if (!isInternalFileDrag(e.dataTransfer)) return false;
    if (!isInternalFileDrag(e.dataTransfer)) return false;
    const ids = getDraggedFileIds(e.dataTransfer);
    if (ids.length === 0) return false;
    await action(ids);
    endFileDrag();
    return true;
  };

  const handleBulkDeleteSelected = async () => {
    const ids = [...fileSelection.selectedIds];
    if (ids.length === 0) return;
    const result = await confirm({
      title: 'Delete selected files',
      message: `Remove ${ids.length} file(s) from the company library?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    if (!canEditFiles) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        ids.map((fileId) => api('DELETE', `/subcontractors/companies/${companyId}/files/${fileId}`)),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      await queryClient.invalidateQueries({ queryKey: ['subcontractorCompanyDeletedFiles', companyId] });
      await onRefresh();
      fileSelection.clear();
      toast.success(ok === ids.length ? `Removed ${ok} file(s)` : `Removed ${ok} of ${ids.length} file(s)`);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleSort = (column: 'uploaded_at' | 'name' | 'type') => {
    if (sortBy === column) setSortOrder((s) => (s === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const iconFor = (f: ClientFileForFiles) => {
    const name = String(f.original_name || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type || '').toLowerCase();
    const is = (x: string) => ct.includes(x) || ext === x;
    if (is('pdf')) return { label: 'PDF', color: 'bg-red-500' };
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return { label: 'XLS', color: 'bg-green-600' };
    if (['doc', 'docx'].includes(ext) || ct.includes('word')) return { label: 'DOC', color: 'bg-blue-600' };
    if (['ppt', 'pptx'].includes(ext) || ct.includes('powerpoint')) return { label: 'PPT', color: 'bg-orange-500' };
    if (['zip', 'rar', '7z'].includes(ext) || ct.includes('zip')) return { label: 'ZIP', color: 'bg-gray-700' };
    if (is('txt')) return { label: 'TXT', color: 'bg-gray-500' };
    return { label: (ext || 'FILE').toUpperCase().slice(0, 4), color: 'bg-gray-600' };
  };

  const getFileType = (f: ClientFileForFiles): 'image' | 'pdf' | 'excel' | 'other' => {
    const name = String(f.original_name || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type || '').toLowerCase();
    const is = (x: string) => ct.includes(x) || ext === x;
    if (f.is_image || ct.startsWith('image/')) return 'image';
    if (is('pdf')) return 'pdf';
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return 'excel';
    return 'other';
  };

  const handleFilePreview = async (f: ClientFileForFiles) => {
    const fileType = getFileType(f);
    const name = f.original_name || f.file_object_id;
    try {
      const r: any = await api('GET', withFileAccessToken(`/files/${f.file_object_id}/download`));
      const url = r.download_url || '';
      if (!url) {
        toast.error('Preview not available');
        return;
      }
      if (fileType === 'image') {
        await imageGallery.openImage(
          f,
          currentFiles,
          (file) => getFileType(file) === 'image',
          (file) => file.file_object_id,
          (file) => file.original_name || file.file_object_id,
        );
        return;
      }
      if (fileType === 'pdf') setPreviewPdf({ url, name });
      else if (fileType === 'excel') setPreviewExcel({ url, name });
      else window.open(url, '_blank');
    } catch {
      toast.error('Preview not available');
    }
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

  const uploadMultiple = async (fileList: File[], targetCategory?: string) => {
    const category = targetCategory !== undefined ? (targetCategory === 'uncategorized' ? null : targetCategory) : selectedCategory === 'all' || selectedCategory === 'uncategorized' ? undefined : selectedCategory;
    if (!canEditFiles) return;

    const newQueue = Array.from(fileList).map((file, idx) => ({ id: `${Date.now()}-${idx}`, file, progress: 0, status: 'pending' as const }));
    setUploadQueue((prev) => [...prev, ...newQueue]);

    for (const item of newQueue) {
      try {
        setUploadQueue((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'uploading' } : u)));
        const up: any = await api('POST', '/files/upload', {
          project_id: null,
          client_id: null,
          employee_id: null,
          category_id: 'subcontractor-company-files',
          original_name: item.file.name,
          content_type: item.file.type || 'application/octet-stream',
        });
        await fetch(up.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': item.file.type || 'application/octet-stream', 'x-ms-blob-type': 'BlockBlob' },
          body: item.file,
        });
        const conf: any = await api('POST', '/files/confirm', {
          key: up.key,
          size_bytes: item.file.size,
          checksum_sha256: 'na',
          content_type: item.file.type || 'application/octet-stream',
        });
        await api(
          'POST',
          `/subcontractors/companies/${companyId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent(category || '')}&original_name=${encodeURIComponent(item.file.name)}`
        );
        setUploadQueue((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'success', progress: 100 } : u)));
      } catch (e: any) {
        setUploadQueue((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'error', error: e.message || 'Upload failed' } : u)));
      }
    }
    await onRefresh();
    setTimeout(() => setUploadQueue((prev) => prev.filter((u) => !newQueue.find((nq) => nq.id === u.id))), 2000);
  };

  const handleMoveFile = async (fileId: string, newCategory: string) => {
    await moveFilesToCategory([fileId], newCategory);
  };

  const handleDeleteFile = async (fileId: string) => {
    const result = await confirm({
      title: 'Delete file',
      message: 'Are you sure you want to remove this file from the library?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      if (!canEditFiles) return;
      await api('DELETE', `/subcontractors/companies/${companyId}/files/${fileId}`);
      await queryClient.invalidateQueries({ queryKey: ['subcontractorCompanyDeletedFiles', companyId] });
      await onRefresh();
      toast.success('Removed from library');
    } catch {
      toast.error('Failed to delete file');
    }
  };

  const handlePermanentDeleteFile = async (fileId: string) => {
    const result = await confirm({
      title: 'Delete permanently',
      message: 'Permanently delete this file from storage? This cannot be undone.',
      confirmText: 'Delete permanently',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/subcontractors/companies/${encodeURIComponent(companyId)}/files/deleted/${encodeURIComponent(fileId)}`);
      await refetchDeletedFiles();
      await onRefresh();
      toast.success('File permanently deleted');
    } catch {
      toast.error('Failed to delete file');
    }
  };

  const handleRestoreDeletedFile = async (fileId: string) => {
    try {
      await api('POST', `/subcontractors/companies/${encodeURIComponent(companyId)}/files/deleted/${encodeURIComponent(fileId)}/restore`);
      await refetchDeletedFiles();
      await onRefresh();
      toast.success('File restored to library');
    } catch {
      toast.error('Failed to restore file');
    }
  };

  const handleRenameFile = async (fileId: string, newName: string) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) {
      toast.error('File name cannot be empty');
      return;
    }
    if (trimmed.length > 255) {
      toast.error('File name is too long');
      return;
    }
    if (!canEditFiles) return;
    try {
      await api('PUT', `/subcontractors/companies/${companyId}/files/${fileId}`, { original_name: trimmed });
      setEditingFileNameId(null);
      setEditingFileNameValue('');
      await onRefresh();
      toast.success('File renamed');
    } catch {
      toast.error('Failed to rename file');
    }
  };

  const startEditingFileName = (f: ClientFileForFiles) => {
    setEditingFileNameId(f.id);
    setEditingFileNameValue(f.original_name || f.file_object_id || '');
  };

  const moveCategoryOptions = useMemo(
    () => [
      { value: 'uncategorized', label: 'Uncategorized' },
      ...visibleCategories.map((cat: { id: string; name: string }) => ({
        value: String(cat.id),
        label: String(cat.name),
      })),
    ],
    [visibleCategories],
  );

  const openMoveLocationModal = (fileId: string) => {
    setMoveLocationFileId(fileId);
  };

  const moveLocationFile = useMemo(
    () => (moveLocationFileId ? files.find((f) => f.id === moveLocationFileId) ?? null : null),
    [files, moveLocationFileId],
  );

  const moveLocationInitialCategory = useMemo(() => {
    const fileCat = moveLocationFile?.category;
    if (fileCat && visibleCategories.some((c: { id: string }) => c.id === fileCat)) return fileCat;
    if (selectedCategory !== 'all' && selectedCategory !== 'uncategorized') return selectedCategory;
    return 'uncategorized';
  }, [moveLocationFile, visibleCategories, selectedCategory]);

  const moveLocationSelectedCount = useMemo(() => {
    if (!moveLocationFileId) return 1;
    return fileSelection.resolveDragIds(moveLocationFileId).length;
  }, [moveLocationFileId, fileSelection]);

  const filesViewToggle = isAdmin ? (
    <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="tablist" aria-label="File views">
      <button
        type="button"
        role="tab"
        aria-selected={filesSection === 'active'}
        onClick={() => setFilesSection('active')}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          filesSection === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Library
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={filesSection === 'deleted'}
        onClick={() => setFilesSection('deleted')}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          filesSection === 'deleted' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Deleted files
      </button>
    </div>
  ) : undefined;

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Files"
        description="Document library for this subcontractor company. Upload and organize by category."
        {...appSectionPresetProps('files')}
        action={filesViewToggle}
      />
      <AppCard bodyClassName="p-4">
        {isAdmin && filesSection === 'deleted' ? (
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 overflow-hidden">
            <p className="text-xs text-amber-900 px-3 py-2 border-b border-amber-100/80">
              Same previews and downloads as the library. Restore returns the file to the company library, or delete permanently to remove it from storage.
            </p>
            <div className="flex h-[calc(100vh-400px)] bg-white">
              <div className="flex-1 overflow-y-auto p-4">
                {Array.isArray(deletedFiles) && deletedFiles.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 w-12" aria-hidden />
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700">Name</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700">Type</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700">Category</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700">Removed</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 w-52">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {deletedFiles.map((df) => {
                          const icon = iconFor(df);
                          const isImg = df.is_image || String(df.content_type || '').startsWith('image/');
                          const name = df.original_name || df.file_object_id;
                          const pf = df as ClientFileForFiles;
                          return (
                            <tr key={df.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                {isImg ? (
                                  <button
                                    type="button"
                                    className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 block"
                                    onClick={() => handleFilePreview(pf)}
                                    title="Preview"
                                  >
                                    <img
                                      src={withFileAccessToken(`/files/${df.file_object_id}/thumbnail?w=64`)}
                                      alt={name}
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className={`w-8 h-10 rounded-lg ${icon.color} text-white flex items-center justify-center text-[10px] font-extrabold`}
                                    onClick={() => handleFilePreview(pf)}
                                    title="Open / preview"
                                  >
                                    {icon.label}
                                  </button>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-left text-gray-900 truncate max-w-xs hover:text-brand-red"
                                  onClick={() => handleFilePreview(pf)}
                                >
                                  {name}
                                </button>
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600">{getFileTypeLabel(df)}</td>
                              <td className="px-3 py-2 text-xs text-gray-600">{df.category || '—'}</td>
                              <td className="px-3 py-2 text-xs text-gray-600">
                                {df.deleted_at ? new Date(df.deleted_at).toLocaleString() : '—'}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap items-center gap-1">
                                  <AppListRowIconButton
                                    preset="download"
                                    label="Download"
                                    onClick={async () => {
                                      const url = await fetchDownloadUrl(df.file_object_id);
                                      if (url) window.open(url, '_blank');
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreDeletedFile(df.id)}
                                    title="Restore to library"
                                    className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-medium hover:bg-emerald-700"
                                  >
                                    Restore
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePermanentDeleteFile(df.id)}
                                    title="Delete permanently"
                                    className="px-2 py-1 rounded border border-red-200 text-red-700 text-[10px] font-medium hover:bg-red-50"
                                  >
                                    Purge
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-500 text-sm">
                    <div className="text-2xl mb-2">📁</div>
                    <div>No deleted files for this subcontractor company.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {!(isAdmin && filesSection === 'deleted') && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="flex h-[calc(100vh-400px)]">
            <div className="w-64 border-r bg-gray-50 flex flex-col">
              <div className="p-3 border-b">
                <div className="text-xs font-semibold text-gray-700">File Categories</div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <button onClick={() => setSelectedCategory('all')} className={`w-full text-left px-3 py-2 border-b hover:bg-white transition-colors ${selectedCategory === 'all' ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs">📁</span>
                    <span className="text-xs">All Files</span>
                    <span className="ml-auto text-[10px] text-gray-500">({filesByCategory['all']?.length || 0})</span>
                  </div>
                </button>
                {visibleCategories.map((cat: any) => {
                  const count = filesByCategory[cat.id]?.length || 0;
                  const canEditCat = canEditFiles;
                  return (
                    <button
                      key={cat.id}
                      {...fileDropTargetProps('category')}
                      onClick={() => setSelectedCategory(cat.id)}
                      {...(canEditCat
                        ? makeDropHandlers('category', cat.id, cat.name, async (e) => {
                            if (isInternalFileDrag(e.dataTransfer)) {
                              await handleDropFileIds(e, (ids) => moveFilesToCategory(ids, cat.id, cat.name));
                              return;
                            }
                            if (isExternalFileDrop(e.dataTransfer)) {
                              await uploadMultiple(Array.from(e.dataTransfer.files), cat.id);
                            }
                          })
                        : {})}
                      className={uiCx(
                        'w-full text-left px-3 py-2 border-b hover:bg-white transition-colors',
                        selectedCategory === cat.id ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700',
                        dropTargetClass(isDropActive('category', cat.id), 'category'),
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs">{cat.icon || '📁'}</span>
                        <span className="text-xs">{cat.name}</span>
                        <span className="ml-auto text-[10px] text-gray-500">({count})</span>
                      </div>
                    </button>
                  );
                })}
                {filesByCategory['uncategorized']?.length > 0 && (
                  <button
                    {...fileDropTargetProps('category')}
                    onClick={() => setSelectedCategory('uncategorized')}
                    {...(canEditFiles
                      ? makeDropHandlers('category', 'uncategorized', 'Uncategorized', async (e) => {
                          if (isInternalFileDrag(e.dataTransfer)) {
                            await handleDropFileIds(e, (ids) => moveFilesToCategory(ids, 'uncategorized', 'Uncategorized'));
                            return;
                          }
                          if (isExternalFileDrop(e.dataTransfer)) {
                            await uploadMultiple(Array.from(e.dataTransfer.files), 'uncategorized');
                          }
                        })
                      : {})}
                    className={uiCx(
                      'w-full text-left px-3 py-2 border-b hover:bg-white transition-colors',
                      selectedCategory === 'uncategorized' ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700',
                      dropTargetClass(isDropActive('category', 'uncategorized'), 'category'),
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs">📦</span>
                      <span className="text-xs">Uncategorized</span>
                      <span className="ml-auto text-[10px] text-gray-500">({filesByCategory['uncategorized']?.length || 0})</span>
                    </div>
                  </button>
                )}
              </div>
            </div>
            <div
              className={uiCx('flex-1 overflow-y-auto p-4', isDragging && canEditFiles ? 'bg-blue-50/50' : '')}
              onDragOver={canEditFiles ? (e) => { e.preventDefault(); if (isInternalFileDrag(e.dataTransfer) || (e.dataTransfer.files?.length || 0) > 0) setIsDragging(true); } : undefined}
              onDragLeave={canEditFiles ? (e) => {
                leaveContainerDragLeave(e, () => {
                  setIsDragging(false);
                  clearDropTarget();
                });
              } : undefined}
              onDrop={canEditFiles ? async (e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                clearDropTarget();
                if (isInternalFileDrag(e.dataTransfer)) {
                  if (selectedCategory !== 'all' && selectedCategory !== 'uncategorized') {
                    await handleDropFileIds(e, (ids) => moveFilesToCategory(ids, selectedCategory));
                  }
                  return;
                }
                if (isExternalFileDrop(e.dataTransfer)) {
                  const category = selectedCategory === 'all' ? undefined : selectedCategory === 'uncategorized' ? null : selectedCategory;
                  await uploadMultiple(Array.from(e.dataTransfer.files), category);
                }
              } : undefined}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold">
                  {selectedCategory === 'all' ? 'All Files' : selectedCategory === 'uncategorized' ? 'Uncategorized Files' : visibleCategories.find((c: any) => c.id === selectedCategory)?.name || 'Files'}
                  <span className="ml-2 text-gray-500">({currentFiles.length})</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileViewModeToolbar
                    viewMode={viewMode}
                    tileSize={tileSize}
                    showGridToggle={showGridToggle}
                    onViewModeChange={setViewMode}
                    onTileSizeChange={setTileSize}
                  />
                {canEditFiles && (
                  <button onClick={() => setShowUpload(true)} className="px-2 py-1 rounded bg-brand-red text-white text-xs">
                    + Upload File
                  </button>
                )}
                </div>
              </div>
              <div className="rounded-lg border overflow-hidden bg-white">
                <FileListDropHint dropTarget={dropTarget} />
                {canSelectInCurrentView ? (
                  <FileListSelectionBar
                    selectedCount={fileSelection.selectedCount}
                    visibleCount={visibleFileIds.length}
                    onSelectAll={() => fileSelection.selectAll(visibleFileIds)}
                    onClear={() => fileSelection.clear()}
                    onDeleteSelected={handleBulkDeleteSelected}
                    deleting={bulkDeleting}
                    className="m-3 mb-0"
                  />
                ) : null}
                {currentFiles.length > 0 ? (
                  viewMode === 'grid' ? (
                    <FileImageGrid
                      files={gridImageFiles}
                      tileSize={tileSize}
                      selectedIds={fileSelection.selectedIds}
                      canSelect={canSelectInCurrentView}
                      canWrite={canEditFiles}
                      onPreviewFile={(file) => {
                        const original = clientFileById.get(file.id);
                        if (original) void handleFilePreview(original);
                      }}
                      onSelectFile={(fileId, shiftKey) => {
                        if (shiftKey) fileSelection.toggleRange(fileId, visibleFileIds);
                        else fileSelection.toggle(fileId);
                      }}
                      onFileDragStart={(e, fileId) => startFileDrag(e, fileId)}
                      onFileDragEnd={endFileDrag}
                      nonImageSection={
                        gridNonImageFiles.length > 0 ? (
                          <FileGridNonImageList>
                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                              <table className="w-full">
                                <tbody className="divide-y">
                                  {gridNonImageFiles.map((f) => {
                                    const icon = iconFor(f);
                                    const name = f.original_name || f.file_object_id;
                                    return (
                                      <tr key={f.id} className="hover:bg-gray-50">
                                        <td className="px-3 py-2">
                                          <div
                                            className={`w-8 h-10 rounded-lg ${icon.color} text-white flex items-center justify-center text-[10px] font-extrabold cursor-pointer`}
                                            onClick={() => handleFilePreview(f)}
                                          >
                                            {icon.label}
                                          </div>
                                        </td>
                                        <td className="px-3 py-2">
                                          <button type="button" className="text-xs font-semibold truncate max-w-xs text-left" onClick={() => handleFilePreview(f)}>
                                            {name}
                                          </button>
                                        </td>
                                        <td className="px-3 py-2 text-xs text-gray-600">{getFileTypeLabel(f)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </FileGridNonImageList>
                        ) : undefined
                      }
                      emptyMessage="No images in this view."
                    />
                  ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          {canSelectInCurrentView ? (
                            <th className="px-2 py-2 w-8">
                              <AppCheckboxControl
                                checked={allVisibleSelected}
                                aria-label={allVisibleSelected ? 'Deselect all files' : 'Select all files'}
                                onChange={(checked) => {
                                  if (checked) fileSelection.selectAll(visibleFileIds);
                                  else fileSelection.clear();
                                }}
                              />
                            </th>
                          ) : null}
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 w-12"></th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('name')}>
                            <div className="flex items-center gap-1">Name {sortBy === 'name' && <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>}</div>
                          </th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('type')}>
                            <div className="flex items-center gap-1">Type {sortBy === 'type' && <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>}</div>
                          </th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('uploaded_at')}>
                            <div className="flex items-center gap-1">Upload Date {sortBy === 'uploaded_at' && <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>}</div>
                          </th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 w-24">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {currentFiles.map((f) => {
                          const icon = iconFor(f);
                          const isImg = f.is_image || String(f.content_type || '').startsWith('image/');
                          const name = f.original_name || f.file_object_id;
                          return (
                            <tr
                              key={f.id}
                              draggable={canEditFiles}
                              onDragStart={(e) => startFileDrag(e, f.id)}
                              onDragEnd={endFileDrag}
                              className={uiCx(
                                'hover:bg-gray-50',
                                canEditFiles ? 'cursor-move' : '',
                                fileSelection.isSelected(f.id) ? 'bg-brand-red/5' : '',
                              )}
                            >
                              {canSelectInCurrentView ? (
                                <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                                  <AppCheckboxControl
                                    checked={fileSelection.isSelected(f.id)}
                                    aria-label={`Select ${name}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (e.shiftKey) fileSelection.toggleRange(f.id, visibleFileIds);
                                      else fileSelection.toggle(f.id);
                                    }}
                                  />
                                </td>
                              ) : null}
                              <td className="px-3 py-2">
                                {isImg ? (
                                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 cursor-pointer flex-shrink-0" onClick={() => handleFilePreview(f)}>
                                    <img src={withFileAccessToken(`/files/${f.file_object_id}/thumbnail?w=64`)} alt={name} className="w-full h-full object-cover" loading="lazy" />
                                  </div>
                                ) : (
                                  <div className={`w-8 h-10 rounded-lg ${icon.color} text-white flex items-center justify-center text-[10px] font-extrabold select-none flex-shrink-0 cursor-pointer`} onClick={() => handleFilePreview(f)}>
                                    {icon.label}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2" onClick={(e) => { if (editingFileNameId !== f.id) { e.stopPropagation(); handleFilePreview(f); } }}>
                                {editingFileNameId === f.id ? (
                                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      value={editingFileNameValue}
                                      onChange={(e) => setEditingFileNameValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleRenameFile(f.id, editingFileNameValue);
                                        if (e.key === 'Escape') { setEditingFileNameId(null); setEditingFileNameValue(''); }
                                      }}
                                      className="text-xs font-semibold border rounded px-2 py-1 max-w-xs flex-1"
                                      autoFocus
                                    />
                                    <button onClick={() => handleRenameFile(f.id, editingFileNameValue)} title="Save" className="p-1 rounded hover:bg-green-100 text-green-700 text-xs">✓</button>
                                    <button onClick={() => { setEditingFileNameId(null); setEditingFileNameValue(''); }} title="Cancel" className="p-1 rounded hover:bg-gray-100 text-xs">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <div className="text-xs font-semibold truncate max-w-xs cursor-pointer">{name}</div>
                                    {canEditFiles && (
                                      <button onClick={(e) => { e.stopPropagation(); startEditingFileName(f); }} title="Rename" className="p-1 rounded hover:bg-gray-100 text-xs flex-shrink-0">📝</button>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 cursor-pointer" onClick={() => handleFilePreview(f)}>
                                <div className="text-xs text-gray-600">{getFileTypeLabel(f)}</div>
                              </td>
                              <td className="px-3 py-2 cursor-pointer" onClick={() => handleFilePreview(f)}>
                                <div className="text-xs text-gray-600">{f.uploaded_at ? new Date(f.uploaded_at).toLocaleDateString('pt-BR') : '-'}</div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-end gap-0.5">
                                  <AppListRowIconButton
                                    preset="download"
                                    label="Download"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const url = await fetchDownloadUrl(f.file_object_id);
                                      if (url) window.open(url, '_blank');
                                    }}
                                  />
                                  {isImg && canEditFiles && (
                                    <button onClick={(e) => { e.stopPropagation(); setEditingImage({ fileObjectId: f.file_object_id, name: f.original_name || 'image' }); }} title="Edit" className="p-1 rounded hover:bg-blue-50 text-blue-600 text-xs">✏️</button>
                                  )}
                                  {canEditFiles && (
                                    <>
                                      <AppListRowIconButton
                                        preset="move"
                                        label="Move to…"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openMoveLocationModal(f.id);
                                        }}
                                      />
                                      <AppListRowIconButton
                                        preset="delete"
                                        label="Delete"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteFile(f.id);
                                        }}
                                      />
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  )
                ) : (
                  <div className="px-3 py-6 text-center text-gray-500">
                    <div className="text-2xl mb-2">📁</div>
                    <div className="text-xs">No files in this category</div>
                    {canEditFiles && <div className="text-[10px] mt-1">Drag and drop files here or click &quot;Upload File&quot;</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        )}
      </AppCard>
      {showUpload && (
        <OverlayPortal><div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-3">Upload Files</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1.5">Files (multiple files supported)</div>
                <input type="file" multiple onChange={async (e) => { const fileList = e.target.files; if (fileList?.length) { setShowUpload(false); await uploadMultiple(Array.from(fileList)); } }} className="w-full text-xs" />
              </div>
              <div className="text-[10px] text-gray-500">You can also drag and drop files directly onto the category area</div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowUpload(false)} className="px-3 py-1.5 rounded border text-xs">Cancel</button>
            </div>
          </div>
        </div></OverlayPortal>
      )}
      {moveLocationFileId ? (
        <FileMoveLocationModal
          open
          onClose={() => setMoveLocationFileId(null)}
          title="Move files"
          quickInfo={libraryFilesMoveCategoryQuickInfo}
          showFolderSelect={false}
          categoryOptions={moveCategoryOptions}
          folders={[]}
          initialCategory={moveLocationInitialCategory}
          selectedFileCount={moveLocationSelectedCount}
          onMove={async (destination) => {
            if (!moveLocationFileId) return;
            const ids = fileSelection.resolveDragIds(moveLocationFileId);
            const label =
              moveCategoryOptions.find((option) => option.value === destination.category)?.label ??
              destination.category;
            await moveFilesToCategory(ids, destination.category, label);
          }}
        />
      ) : null}
      {uploadQueue.length > 0 && (
        <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-2xl border w-80 max-h-96 overflow-hidden z-50">
          <div className="p-2.5 border-b bg-gray-50 flex items-center justify-between">
            <div className="font-semibold text-xs">Upload Progress</div>
            <button onClick={() => setUploadQueue([])} className="text-gray-500 hover:text-gray-700 text-[10px]">Clear</button>
          </div>
          <div className="overflow-y-auto max-h-80">
            {uploadQueue.map((u) => (
              <div key={u.id} className="p-2.5 border-b">
                <div className="flex items-start gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" title={u.file.name}>{u.file.name}</div>
                    <div className="text-[10px] text-gray-500">{(u.file.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                  <div className="text-xs">{u.status === 'pending' && '⏳'}{u.status === 'uploading' && '⏳'}{u.status === 'success' && '✅'}{u.status === 'error' && '❌'}</div>
                </div>
                {u.status === 'uploading' && <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1"><div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${u.progress}%` }} /></div>}
                {u.status === 'error' && <div className="text-[10px] text-red-600 mt-1" title={u.error}>{u.error || 'Upload failed'}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      <FileImagePreviewModal
        open={imageGallery.open}
        items={imageGallery.items}
        index={imageGallery.index}
        loading={imageGallery.loading}
        onClose={imageGallery.close}
        onPrev={imageGallery.goPrev}
        onNext={imageGallery.goNext}
        variant="legacy"
        legacyActions={(item) =>
          canEditFiles && item.fileObjectId ? (
            <button
              type="button"
              onClick={() => {
                setEditingImage({ fileObjectId: item.fileObjectId!, name: item.name });
                imageGallery.close();
              }}
              className="rounded border px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
              title="Edit"
            >
              ✏️ Edit
            </button>
          ) : null
        }
      />
      <FilePdfPreviewModal
        open={!!previewPdf}
        url={previewPdf?.url}
        name={previewPdf?.name}
        onClose={() => setPreviewPdf(null)}
      />
      <FileOfficePreviewModal
        open={!!previewExcel}
        url={previewExcel?.url}
        name={previewExcel?.name}
        onClose={() => setPreviewExcel(null)}
      />
      {editingImage && (
        <ImageEditor
          isOpen={!!editingImage}
          onClose={() => setEditingImage(null)}
          imageUrl={withFileAccessToken(`/files/${editingImage.fileObjectId}/thumbnail?w=1024`)}
          imageName={editingImage.name}
          fileObjectId={editingImage.fileObjectId}
          onSave={async (blob) => {
            try {
              const originalName = editingImage.name || 'image';
              const dot = originalName.lastIndexOf('.');
              const nameNoExt = dot > 0 ? originalName.slice(0, dot) : originalName.replace(/\.+$/, '');
              const ext = dot > 0 ? originalName.slice(dot) : '.png';
              const editedName = `${nameNoExt}_edited${ext}`;
              const up: any = await api('POST', '/files/upload', {
                project_id: null,
                client_id: null,
                employee_id: null,
                category_id: 'image-edited',
                original_name: editedName,
                content_type: 'image/png',
              });
              await fetch(up.upload_url, {
                method: 'PUT',
                headers: { 'Content-Type': 'image/png', 'x-ms-blob-type': 'BlockBlob' },
                body: blob,
              });
              const conf: any = await api('POST', '/files/confirm', {
                key: up.key,
                size_bytes: blob.size,
                checksum_sha256: 'na',
                content_type: 'image/png',
              });
              const originalFile = files.find((f) => f.file_object_id === editingImage.fileObjectId);
              await api(
                'POST',
                `/subcontractors/companies/${encodeURIComponent(companyId)}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent(originalFile?.category || 'image-edited')}&original_name=${encodeURIComponent(editedName)}`
              );
              toast.success('Image saved as edited copy');
              await onRefresh();
              setEditingImage(null);
            } catch (e: any) {
              console.error('Failed to save edited image:', e);
              toast.error('Failed to save edited image');
            }
          }}
        />
      )}
    </div>
  );
}
